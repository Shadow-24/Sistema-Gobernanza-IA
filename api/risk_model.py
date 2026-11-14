"""Experimental road-impact classifier built only from MTC emergency records.

This predicts the initial road condition conditional on an already reported
road emergency. It does not estimate the probability of an incident per trip.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.compose import ColumnTransformer
from sklearn.metrics import accuracy_score, balanced_accuracy_score, brier_score_loss, f1_score, fbeta_score, roc_auc_score
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
# Umbral sobre la probabilidad de la clase mayoritaria: por debajo se declara la clase minoritaria
# (interrupción). El rango llega hasta 0,90 porque priorizar la sensibilidad exige umbrales altos.
DECISION_THRESHOLDS = tuple(0.35 + index * 0.025 for index in range(23))
# Perder una interrupción cuesta más que una falsa alarma: el umbral maximiza el F2 de la clase
# minoritaria (la sensibilidad pesa el doble que la precisión).
THRESHOLD_BETA = 2.0
THRESHOLD_CRITERION = "F2 de la clase minoritaria (prioriza detectar interrupciones sobre evitar falsas alarmas)"
# Columnas de baja frecuencia por categoría (provincia, vía, tramo): se codifican con la tasa histórica
# suavizada de cada valor en lugar de una columna one-hot casi vacía.
ONE_HOT_FEATURES = ["CLASE_FENOMENO", "FENOMENO", "EVENTO", "DEPARTEMENTO"]
TARGET_ENCODED_FEATURES = ["DEPARTEMENTO", "PROVINCIA", "RED_AFECTADA", "TRAMO_AFECADO", "EVENTO"]
TARGET_ENCODING_SMOOTHING = 10.0
TARGET_ENCODING_FOLDS = 5
# Franjas de probabilidad de la clase predicha para medir la fiabilidad histórica.
RELIABILITY_BANDS = ((0.0, 0.4), (0.4, 0.6), (0.6, 0.8), (0.8, 0.9), (0.9, 1.0001))
MIN_BAND_CASES = 15


class SmoothedTargetEncoder(BaseEstimator, TransformerMixin):
    """Codifica cada categoría con la tasa suavizada de la clase positiva.

    En entrenamiento usa codificación fuera de pliegue (cada fila se codifica con
    estadísticos calculados sin ella), de modo que el modelo no memoriza su propio
    objetivo. Las categorías nunca vistas reciben la tasa global.
    """

    def __init__(self, smoothing: float = TARGET_ENCODING_SMOOTHING, folds: int = TARGET_ENCODING_FOLDS) -> None:
        self.smoothing = smoothing
        self.folds = folds

    @staticmethod
    def _positive(y: Any) -> np.ndarray:
        values = np.asarray(y)
        return (values == values.max()).astype(float) if values.size else values.astype(float)

    def _statistics(self, X: pd.DataFrame, positive: np.ndarray) -> tuple[float, dict[str, dict[Any, tuple[float, int]]]]:
        prior = float(positive.mean()) if len(positive) else 0.0
        tables: dict[str, dict[Any, tuple[float, int]]] = {}
        for column in X.columns:
            grouped = pd.DataFrame({"key": X[column].to_numpy(), "y": positive}).groupby("key")["y"].agg(["sum", "count"])
            tables[column] = {key: (float(row["sum"]), int(row["count"])) for key, row in grouped.iterrows()}
        return prior, tables

    def _encode(self, X: pd.DataFrame, prior: float, tables: dict[str, dict[Any, tuple[float, int]]]) -> np.ndarray:
        encoded = np.empty((len(X), len(X.columns)), dtype=float)
        for position, column in enumerate(X.columns):
            table = tables[column]
            encoded[:, position] = [
                (table[key][0] + self.smoothing * prior) / (table[key][1] + self.smoothing) if key in table else prior
                for key in X[column].to_numpy()
            ]
        return encoded

    def fit(self, X: pd.DataFrame, y: Any = None) -> "SmoothedTargetEncoder":
        X = pd.DataFrame(X)
        self.columns_ = list(X.columns)
        self.prior_, self.tables_ = self._statistics(X, self._positive(y))
        return self

    def fit_transform(self, X: pd.DataFrame, y: Any = None, **fit_params: Any) -> np.ndarray:
        X = pd.DataFrame(X).reset_index(drop=True)
        positive = self._positive(y)
        self.fit(X, y)
        encoded = np.empty((len(X), len(X.columns)), dtype=float)
        # Los registros llegan ordenados por fecha: pliegues contiguos evitan mezclar el futuro con el pasado inmediato.
        for fold in np.array_split(np.arange(len(X)), min(self.folds, max(len(X), 1))):
            if not len(fold):
                continue
            rest = np.setdiff1d(np.arange(len(X)), fold)
            prior, tables = self._statistics(X.iloc[rest], positive[rest])
            encoded[fold] = self._encode(X.iloc[fold], prior, tables)
        return encoded

    def transform(self, X: pd.DataFrame) -> np.ndarray:
        return self._encode(pd.DataFrame(X), self.prior_, self.tables_)


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
        [
            ("categorical", OneHotEncoder(handle_unknown="ignore", min_frequency=MIN_CATEGORY_FREQUENCY), ONE_HOT_FEATURES),
            ("target_rate", SmoothedTargetEncoder(), TARGET_ENCODED_FEATURES),
        ],
        remainder="drop",
    )
    model = XGBClassifier(
        n_estimators=200,
        max_depth=3,
        learning_rate=0.05,
        min_child_weight=3,
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
) -> tuple[float, int, float, list[tuple[str, float]]]:
    dates = sorted(data["DATE"].unique())
    boundaries = [int(len(dates) * fraction) for fraction in (0.5, 0.6, 0.7, 0.8)]
    if date_cutoff_index != boundaries[-1] or len(set(boundaries)) != len(boundaries):
        return 0.5, 0, 0.0, []

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

    points = list(zip(actual, majority_probabilities))
    if not actual or minority_class not in actual:
        return 0.5, len(actual), 0.0, points

    best_threshold = 0.5
    best_score = (-1.0, -1.0)
    for threshold in DECISION_THRESHOLDS:
        predictions = [
            minority_class if probability < threshold else majority_class
            for probability in majority_probabilities
        ]
        score = (
            fbeta_score(
                actual,
                predictions,
                beta=THRESHOLD_BETA,
                pos_label=minority_class,
                average="binary",
                zero_division=0,
            ),
            balanced_accuracy_score(actual, predictions),
        )
        if score > best_score:
            best_score = score
            best_threshold = threshold
    best_predictions = [
        minority_class if probability < best_threshold else majority_class
        for probability in majority_probabilities
    ]
    macro_f1 = f1_score(
        actual, best_predictions, labels=[minority_class, majority_class], average="macro", zero_division=0,
    )
    return best_threshold, len(actual), float(macro_f1), points


def _validation_summary(
    points: list[tuple[str, float]],
    majority_class: str,
    minority_class: str,
    threshold: float,
) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    """Fiabilidad histórica por franja de probabilidad y calidad probabilística en validación temporal."""
    if not points:
        return [], None
    actual = np.asarray([label for label, _ in points])
    majority_probability = np.asarray([probability for _, probability in points], dtype=float)
    predicted_majority = majority_probability >= threshold
    predicted = np.where(predicted_majority, majority_class, minority_class)
    predicted_probability = np.where(predicted_majority, majority_probability, 1 - majority_probability)
    correct = predicted == actual
    reliability = []
    for label in (majority_class, minority_class):
        for lower, upper in RELIABILITY_BANDS:
            in_band = (predicted == label) & (predicted_probability >= lower) & (predicted_probability < upper)
            cases = int(in_band.sum())
            if not cases:
                continue
            reliability.append({
                "class": label,
                "from": lower,
                "to": min(upper, 1.0),
                "cases": cases,
                "accuracy": float(correct[in_band].mean()) if cases >= MIN_BAND_CASES else None,
            })
    summary: dict[str, Any] = {"records": int(len(points))}
    positives = (actual == minority_class).astype(int)
    if 0 < positives.sum() < len(positives):
        summary["auc"] = float(roc_auc_score(positives, 1 - majority_probability))
        summary["brierScore"] = float(brier_score_loss(positives, 1 - majority_probability))
    return reliability, summary


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
    calibration_points: list[tuple[str, float]] = []
    if len(train_classes) == 2:
        threshold, calibration_records, calibration_macro_f1, calibration_points = _calibrate_threshold(
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
    reliability, validation = (
        _validation_summary(calibration_points, majority, minority, threshold)
        if len(train_classes) == 2
        else ([], None)
    )
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
        "locations": sorted(
            data[["DEPARTEMENTO", "PROVINCIA", "RED_AFECTADA", "TRAMO_AFECADO"]]
            .drop_duplicates()
            .itertuples(index=False, name=None)
        ),
        "phenomena": sorted(
            data[["CLASE_FENOMENO", "FENOMENO", "EVENTO"]].drop_duplicates().itertuples(index=False, name=None)
        ),
        "reliability": reliability,
        "validation": validation,
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
            "thresholdCriterion": THRESHOLD_CRITERION,
            "minorityPrecision": float(
                sum(
                    actual == minority and predicted == minority
                    for actual, predicted in zip(test[TARGET], predictions)
                )
                / max(sum(predicted == minority for predicted in predictions), 1)
            ),
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
    probability_by_class = {class_labels[index]: float(probabilities[index]) for index in order}
    # La confianza es la probabilidad de la clase que realmente se predice (con el umbral calibrado
    # puede no ser la de mayor probabilidad), no la máxima entre clases.
    confidence = probability_by_class[prediction]
    reliability_band = next(
        (
            band for band in metrics.get("reliability", [])
            if band.get("class", prediction) == prediction
            and band["from"] <= confidence < band["to"] + (1e-9 if band["to"] >= 1.0 else 0)
        ),
        None,
    )
    observed_accuracy = reliability_band["accuracy"] if reliability_band else None
    confidence_level = (
        None if observed_accuracy is None
        else "Alta" if observed_accuracy >= 0.9
        else "Media" if observed_accuracy >= 0.75
        else "Baja"
    )
    return {
        "prediction": prediction,
        "confidence": confidence,
        "confidenceLevel": confidence_level,
        "reliability": (
            {
                "observedAccuracy": observed_accuracy,
                "cases": reliability_band["cases"],
                "from": reliability_band["from"],
                "to": reliability_band["to"],
            }
            if reliability_band and observed_accuracy is not None
            else None
        ),
        "probabilities": probability_by_class,
        "model": "XGBoost experimental",
        "evaluation": metrics["metrics"],
        "limitations": metrics["caveat"],
    }
