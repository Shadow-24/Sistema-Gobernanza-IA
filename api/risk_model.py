"""Experimental road-impact classifier built only from MTC emergency records.

This predicts the initial road condition conditional on an already reported
road emergency. It does not estimate the probability of an incident per trip.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


SOURCE_NAME = "3. Reporte Emergencias 01.01 al 20.08.2026 COES-MTC.csv"
CATEGORICAL_FEATURES = [
    "CLASE_FENOMENO",
    "FENOMENO",
    "EVENTO",
    "DEPARTEMENTO",
    "PROVINCIA",
    "RED_AFECTADA",
    "TRAMO_AFECADO",
    "MONTH",
]
MODEL_FEATURES = [column for column in CATEGORICAL_FEATURES if column != "MONTH"]
TARGET = "ESTADO_INICIAL"
MIN_CATEGORY_FREQUENCY = 8
MINORITY_CLASS_WEIGHT = 1.5
DECISION_THRESHOLDS = tuple(0.35 + index * 0.025 for index in range(19))


def _prepare(path: Path) -> pd.DataFrame:
    try:
        data = pd.read_csv(path, sep=";", encoding="utf-8-sig", dtype=str)
    except UnicodeDecodeError:
        # El reporte COES-MTC se descarga en Windows-1252 en algunas versiones.
        data = pd.read_csv(path, sep=";", encoding="cp1252", dtype=str)
    source_features = [column for column in CATEGORICAL_FEATURES if column != "MONTH"]
    required = set(source_features + [TARGET, "FECHA_OCURRENCIA"])
    missing = required - set(data.columns)
    if missing:
        raise ValueError(f"El CSV MTC no contiene las columnas requeridas: {', '.join(sorted(missing))}")
    data["DATE"] = pd.to_datetime(data["FECHA_OCURRENCIA"], dayfirst=True, errors="coerce")
    data["MONTH"] = data["DATE"].dt.month.fillna(0).astype(int).astype(str)
    for column in CATEGORICAL_FEATURES:
        data[column] = data[column].fillna("No informado").astype(str).str.strip()
        data.loc[data[column] == "", column] = "No informado"
    data[TARGET] = data[TARGET].fillna("").str.strip()
    return data.dropna(subset=["DATE"]).loc[lambda frame: frame[TARGET] != ""].sort_values("DATE").reset_index(drop=True)


def _build_pipeline() -> Pipeline:
    from xgboost import XGBClassifier

    preprocess = ColumnTransformer(
        [("categorical", OneHotEncoder(handle_unknown="ignore", min_frequency=MIN_CATEGORY_FREQUENCY), MODEL_FEATURES)],
        remainder="drop",
    )
    model = XGBClassifier(
        n_estimators=250,
        max_depth=3,
        learning_rate=0.05,
        subsample=0.85,
        colsample_bytree=0.85,
        reg_lambda=2,
        eval_metric="logloss",
        random_state=42,
        n_jobs=2,
    )
    return Pipeline([("features", preprocess), ("classifier", model)])


def _class_roles(labels: pd.Series) -> tuple[str, str]:
    counts = labels.value_counts()
    ordered = counts.sort_values(ascending=False, kind="stable").index.tolist()
    majority = ordered[0]
    minority = next(label for label in ordered if label != majority)
    return majority, minority


def _fit_pipeline(train: pd.DataFrame, train_classes: list[str]) -> Pipeline:
    target_indexes = {label: index for index, label in enumerate(train_classes)}
    train_targets = train[TARGET].map(target_indexes).astype(int)
    sample_weights = [1.0] * len(train)
    if len(train_classes) == 2:
        _, minority = _class_roles(train[TARGET])
        sample_weights = [
            MINORITY_CLASS_WEIGHT if label == minority else 1.0
            for label in train[TARGET]
        ]
    pipeline = _build_pipeline()
    pipeline.fit(
        train[MODEL_FEATURES],
        train_targets,
        classifier__sample_weight=sample_weights,
    )
    return pipeline


def _calibrate_threshold(
    data: pd.DataFrame,
    date_cutoff_index: int,
    majority_class: str,
    minority_class: str,
) -> tuple[float, int, float]:
    dates = sorted(data["DATE"].unique())
    boundaries = [int(len(dates) * fraction) for fraction in (0.5, 0.6, 0.7, 0.8)]
    if date_cutoff_index != boundaries[-1] or len(set(boundaries)) != len(boundaries):
        return 0.5, 0, 0.0

    actual: list[str] = []
    majority_probabilities: list[float] = []
    for start_index, end_index in zip(boundaries, boundaries[1:]):
        train = data[data["DATE"] < dates[start_index]]
        validation = data[
            (data["DATE"] >= dates[start_index])
            & (data["DATE"] < dates[end_index])
        ]
        if (
            len(train) < 30
            or validation.empty
            or set(train[TARGET].unique()) != {majority_class, minority_class}
            or not set(validation[TARGET].unique()).issubset(set(train[TARGET].unique()))
        ):
            continue

        train_classes = sorted(train[TARGET].unique().tolist())
        pipeline = _fit_pipeline(train, train_classes)
        class_indexes = list(pipeline.named_steps["classifier"].classes_)
        majority_index = class_indexes.index(train_classes.index(majority_class))
        probabilities = pipeline.predict_proba(validation[MODEL_FEATURES])
        actual.extend(validation[TARGET].tolist())
        majority_probabilities.extend(probabilities[:, majority_index].tolist())

    if not actual or minority_class not in actual:
        return 0.5, len(actual), 0.0

    best_threshold = 0.5
    best_score = (-1.0, -1.0)
    for threshold in DECISION_THRESHOLDS:
        predictions = [
            minority_class if probability < threshold else majority_class
            for probability in majority_probabilities
        ]
        score = (
            f1_score(
                actual,
                predictions,
                labels=[minority_class, majority_class],
                average="macro",
                zero_division=0,
            ),
            balanced_accuracy_score(actual, predictions),
        )
        if score > best_score:
            best_score = score
            best_threshold = threshold
    return best_threshold, len(actual), best_score[0]


def _predict_labels(
    pipeline: Pipeline,
    features: pd.DataFrame,
    train_classes: list[str],
    *,
    threshold: float,
    threshold_target: str | None,
) -> list[str]:
    if len(train_classes) == 2 and threshold_target is not None:
        class_indexes = list(pipeline.named_steps["classifier"].classes_)
        target_index = train_classes.index(threshold_target)
        target_column = class_indexes.index(target_index)
        other_class = next(label for label in train_classes if label != threshold_target)
        probabilities = pipeline.predict_proba(features)
        return [
            threshold_target if probability >= threshold else other_class
            for probability in probabilities[:, target_column]
        ]
    predicted_indexes = pipeline.predict(features)
    return [train_classes[int(index)] for index in predicted_indexes]


@lru_cache(maxsize=2)
def _fit(source_path: str, mtime_ns: int) -> tuple[Pipeline, dict[str, Any], list[str]]:
    del mtime_ns  # included in the cache key to reload after source updates
    data = _prepare(Path(source_path))
    if len(data) < 30:
        raise ValueError("Se requieren al menos 30 registros válidos para evaluar el clasificador.")
    date_cutoff_index = max(1, min(data["DATE"].nunique() - 1, int(data["DATE"].nunique() * 0.8)))
    cutoff_date = sorted(data["DATE"].unique())[date_cutoff_index]
    train, test = data[data["DATE"] < cutoff_date], data[data["DATE"] >= cutoff_date]
    if train.empty or test.empty:
        raise ValueError("No se pudo crear una partición temporal válida con las fechas disponibles.")
    if train[TARGET].nunique() < 2:
        raise ValueError("El tramo de entrenamiento no contiene al menos dos estados viales.")

    train_classes = sorted(train[TARGET].unique().tolist())
    pipeline = _fit_pipeline(train, train_classes)
    majority, minority = _class_roles(train[TARGET])
    threshold, calibration_records, calibration_macro_f1 = (0.5, 0, 0.0)
    if len(train_classes) == 2:
        threshold, calibration_records, calibration_macro_f1 = _calibrate_threshold(
            data,
            date_cutoff_index,
            majority,
            minority,
        )
    predictions = _predict_labels(
        pipeline,
        test[MODEL_FEATURES],
        train_classes,
        threshold=threshold,
        threshold_target=majority if len(train_classes) == 2 else None,
    )
    labels = sorted(data[TARGET].unique().tolist())
    metrics = {
        "source": SOURCE_NAME,
        "target": TARGET,
        "task": "Clasificar estado inicial de la vía, dado que ya existe una emergencia reportada",
        "records": int(len(data)),
        "trainRecords": int(len(train)),
        "testRecords": int(len(test)),
        "dateFrom": data["DATE"].min().date().isoformat(),
        "dateTo": data["DATE"].max().date().isoformat(),
        "split": "holdout temporal 80/20; umbral calibrado en ventanas temporales anteriores",
        "classes": {str(k): int(v) for k, v in data[TARGET].value_counts().sort_index().items()},
        "categories": {
            column: data[column].value_counts().head(100).index.tolist()
            for column in ["CLASE_FENOMENO", "FENOMENO", "EVENTO", "DEPARTEMENTO", "PROVINCIA", "RED_AFECTADA", "TRAMO_AFECADO"]
        },
        "metrics": {
            "accuracy": float(accuracy_score(test[TARGET], predictions)),
            "balancedAccuracy": float(balanced_accuracy_score(test[TARGET], predictions)),
            "macroF1": float(f1_score(test[TARGET], predictions, average="macro", zero_division=0)),
            "majorityBaselineAccuracy": float(accuracy_score(test[TARGET], [majority] * len(test))),
            "minorityClass": minority,
            "minorityRecall": float(
                sum(
                    actual == minority and predicted == minority
                    for actual, predicted in zip(test[TARGET], predictions)
                )
                / sum(actual == minority for actual in test[TARGET])
            ) if (test[TARGET] == minority).any() else None,
            "decisionThreshold": threshold,
            "thresholdTargetClass": majority if len(train_classes) == 2 else None,
            "thresholdCalibrationRecords": calibration_records,
            "thresholdCalibrationMacroF1": calibration_macro_f1,
        },
        "testClasses": sorted(test[TARGET].unique().tolist()),
        "labels": labels,
        "caveat": "No estima probabilidad de accidente ni riesgo por viaje: el archivo contiene emergencias, sin viajes sin incidentes ni identificación de cisternas.",
    }
    return pipeline, metrics, train_classes


def model_status(imports_path: Path) -> dict[str, Any]:
    source = imports_path / SOURCE_NAME
    if not source.is_file():
        return {"available": False, "reason": f"No se encontró {SOURCE_NAME} en imports."}
    try:
        _, metrics, _ = _fit(str(source.resolve()), source.stat().st_mtime_ns)
        return {"available": True, "model": "XGBoost", "modelStatus": "experimental", **metrics}
    except Exception as error:
        return {"available": False, "reason": str(error), "source": SOURCE_NAME}


def predict_road_state(imports_path: Path, scenario: dict[str, Any]) -> dict[str, Any]:
    source = imports_path / SOURCE_NAME
    if not source.is_file():
        raise FileNotFoundError(SOURCE_NAME)
    pipeline, metrics, train_classes = _fit(str(source.resolve()), source.stat().st_mtime_ns)
    date = pd.to_datetime(scenario.get("date"), errors="coerce")
    row = {
        "CLASE_FENOMENO": scenario["phenomenonClass"],
        "FENOMENO": scenario["phenomenon"],
        "EVENTO": scenario["event"],
        "DEPARTEMENTO": scenario["department"],
        "PROVINCIA": scenario.get("province") or "No informado",
        "RED_AFECTADA": scenario.get("roadCode") or "No informado",
        "TRAMO_AFECADO": scenario.get("roadSection") or "No informado",
        "MONTH": str(int(date.month)) if not pd.isna(date) else "0",
    }
    probabilities = pipeline.predict_proba(pd.DataFrame([row])[MODEL_FEATURES])[0]
    classes = pipeline.named_steps["classifier"].classes_
    order = probabilities.argsort()[::-1]
    class_labels = [train_classes[int(index)] for index in classes]
    threshold = metrics["metrics"].get("decisionThreshold", 0.5)
    threshold_target = metrics["metrics"].get("thresholdTargetClass")
    if len(train_classes) == 2 and threshold_target is not None:
        target_index = class_labels.index(threshold_target)
        other_class = next(label for label in train_classes if label != threshold_target)
        prediction = (
            threshold_target
            if probabilities[target_index] >= threshold
            else other_class
        )
    else:
        prediction = class_labels[order[0]]
    return {
        "prediction": prediction,
        "confidence": float(probabilities[order[0]]),
        "probabilities": {class_labels[index]: float(probabilities[index]) for index in order},
        "model": "XGBoost experimental",
        "evaluation": metrics["metrics"],
        "limitations": metrics["caveat"],
    }
