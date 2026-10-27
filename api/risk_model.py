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
from xgboost import XGBClassifier


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
TARGET = "ESTADO_INICIAL"


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
    preprocess = ColumnTransformer(
        [("categorical", OneHotEncoder(handle_unknown="ignore", min_frequency=3), CATEGORICAL_FEATURES)],
        remainder="drop",
    )
    model = XGBClassifier(
        n_estimators=250,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.85,
        colsample_bytree=0.85,
        reg_lambda=2,
        eval_metric="logloss",
        random_state=42,
        n_jobs=2,
    )
    return Pipeline([("features", preprocess), ("classifier", model)])


@lru_cache(maxsize=2)
def _fit(source_path: str, mtime_ns: int) -> tuple[Pipeline, dict[str, Any]]:
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

    pipeline = _build_pipeline()
    pipeline.fit(train[CATEGORICAL_FEATURES], train[TARGET])
    predictions = pipeline.predict(test[CATEGORICAL_FEATURES])
    majority = train[TARGET].value_counts().idxmax()
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
        "split": "temporal 80/20; entrenamiento con fechas anteriores a prueba",
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
        },
        "testClasses": sorted(test[TARGET].unique().tolist()),
        "labels": labels,
        "caveat": "No estima probabilidad de accidente ni riesgo por viaje: el archivo contiene emergencias, sin viajes sin incidentes ni identificación de cisternas.",
    }
    return pipeline, metrics


def model_status(imports_path: Path) -> dict[str, Any]:
    source = imports_path / SOURCE_NAME
    if not source.is_file():
        return {"available": False, "reason": f"No se encontró {SOURCE_NAME} en imports."}
    try:
        _, metrics = _fit(str(source.resolve()), source.stat().st_mtime_ns)
        return {"available": True, "model": "XGBoost", "modelStatus": "experimental", **metrics}
    except Exception as error:
        return {"available": False, "reason": str(error), "source": SOURCE_NAME}


def predict_road_state(imports_path: Path, scenario: dict[str, Any]) -> dict[str, Any]:
    source = imports_path / SOURCE_NAME
    if not source.is_file():
        raise FileNotFoundError(SOURCE_NAME)
    pipeline, metrics = _fit(str(source.resolve()), source.stat().st_mtime_ns)
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
    probabilities = pipeline.predict_proba(pd.DataFrame([row])[CATEGORICAL_FEATURES])[0]
    classes = pipeline.named_steps["classifier"].classes_
    order = probabilities.argsort()[::-1]
    return {
        "prediction": str(classes[order[0]]),
        "confidence": float(probabilities[order[0]]),
        "probabilities": {str(classes[index]): float(probabilities[index]) for index in order},
        "model": "XGBoost experimental",
        "evaluation": metrics["metrics"],
        "limitations": metrics["caveat"],
    }
