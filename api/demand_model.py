from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import time
import unicodedata
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


logger = logging.getLogger(__name__)
TARGET_SOURCE = "MNHL7-VentasCombustibles.xlsx"
TARGET_UNIT = "galones"
PRICE_STRUCTURE_SOURCE = "MNHL3-Estructura de precios combustibles.xlsx"
RETAIL_FUEL_PRICES_SOURCE = "MNHL6-Precios combustibles.xlsx"
EIA_GASOLINE_SOURCE = "EIA · precio minorista de gasolina regular EE. UU. (USD/gal; mensual)"
EIA_DIESEL_SOURCE = "EIA · precio minorista de diésel EE. UU. (USD/gal; mensual)"
EIA_FEATURE_SERIES = {
    EIA_GASOLINE_SOURCE: "EMM_EPMR_PTE_NUS_DPG",
    EIA_DIESEL_SOURCE: "EMD_EPD2D_PTE_NUS_DPG",
}
EIA_API_URL = "https://api.eia.gov/v2/petroleum/pri/gnd/data/"
EIA_CACHE_SECONDS = 6 * 60 * 60
_eia_response_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
MIN_MONTHS = 36
MAX_FORECAST_HORIZON = 12
TEST_MONTHS = 12
MIN_EXTERNAL_TRAIN_OBSERVATIONS = 24
MIN_EXTERNAL_TEST_OBSERVATIONS = 6
MAX_EXTERNAL_FEATURE_STALENESS_MONTHS = 2
LAGS = (1, 2, 3, 6, 12)
FEATURE_NAMES = (
    "lag_1", "lag_2", "lag_3", "lag_6", "lag_12",
    "rolling_mean_3", "rolling_mean_12", "month_sin", "month_cos", "trend_index",
)
PRICE_FEATURES = {
    PRICE_STRUCTURE_SOURCE: "previous_month_public_fuel_price",
    RETAIL_FUEL_PRICES_SOURCE: "previous_month_retail_fuel_price",
}
FEATURE_COLUMN_NAMES = {
    **PRICE_FEATURES,
    EIA_GASOLINE_SOURCE: "previous_month_eia_us_gasoline_price_usd_per_gallon",
    EIA_DIESEL_SOURCE: "previous_month_eia_us_diesel_price_usd_per_gallon",
}
MODEL_CONFIG: dict[str, Any] = {
    "objective": "reg:squarederror",
    "n_estimators": 180,
    "max_depth": 2,
    "learning_rate": 0.035,
    "min_child_weight": 3,
    "subsample": 0.85,
    "colsample_bytree": 0.9,
    "reg_lambda": 4,
    "random_state": 42,
    "n_jobs": 2,
    "verbosity": 0,
}


@dataclass
class TrainingResult:
    public_result: dict[str, Any]
    model_artifact: bytes


def _column_name(value: Any) -> str:
    return "".join(character for character in str(value).strip().upper() if character.isalnum())


def prepare_monthly_demand(frame: pd.DataFrame) -> tuple[pd.Series, dict[str, int]]:
    columns = {_column_name(column): column for column in frame.columns}
    date_column = columns.get("FCHADESPACHO")
    demand_column = columns.get("GALONES")
    if date_column is None or demand_column is None:
        raise ValueError("La fuente de demanda requiere las columnas FCHA_DESPACHO y GALONES.")

    original_rows = len(frame)
    normalized = frame.copy().drop_duplicates()
    duplicate_rows = original_rows - len(normalized)
    dates = pd.to_datetime(normalized[date_column], errors="coerce")
    values = pd.to_numeric(normalized[demand_column], errors="coerce")
    invalid_date_rows = int(dates.isna().sum())
    invalid_value_rows = int(values.isna().sum())
    negative_rows = int((values < 0).fillna(False).sum())
    valid = dates.notna() & values.notna() & (values >= 0)
    cleaned = pd.DataFrame({"period": dates.loc[valid].dt.to_period("M"), "demand": values.loc[valid]})
    if cleaned.empty:
        raise ValueError("La fuente no contiene ventas de combustible válidas.")

    monthly = cleaned.groupby("period", sort=True)["demand"].sum().astype(float)
    complete_periods = pd.period_range(monthly.index.min(), monthly.index.max(), freq="M")
    missing_periods = complete_periods.difference(monthly.index)
    if len(missing_periods):
        labels = ", ".join(str(period) for period in missing_periods[:5])
        raise ValueError(
            f"La serie de ventas tiene {len(missing_periods)} meses sin observaciones ({labels}); "
            "no se imputan como demanda cero."
        )
    monthly.index = pd.PeriodIndex(monthly.index, freq="M")
    quality = {
        "sourceRows": original_rows,
        "duplicateRowsRemoved": duplicate_rows,
        "invalidDateRows": invalid_date_rows,
        "invalidValueRows": invalid_value_rows,
        "negativeRowsRemoved": negative_rows,
        "validRows": int(valid.sum()),
        "months": len(monthly),
    }
    return monthly, quality


def load_monthly_demand(path: Path) -> tuple[pd.Series, dict[str, int], str]:
    if not path.is_file():
        raise FileNotFoundError(f"No se encontró la fuente de demanda observada: {path.name}.")
    raw_bytes = path.read_bytes()
    frame = pd.read_excel(path, sheet_name="MNHL7-Ventas Comb", engine="openpyxl")
    monthly, quality = prepare_monthly_demand(frame)
    return monthly, quality, hashlib.sha256(raw_bytes).hexdigest()


def _normalized_header(value: Any) -> str:
    decomposed = unicodedata.normalize("NFD", str(value or ""))
    without_accents = "".join(character for character in decomposed if unicodedata.category(character) != "Mn")
    return re.sub(r"[^A-Z0-9]", "", without_accents.upper())


def _read_price_feature(path: Path, *, source: str) -> pd.Series:
    if source == PRICE_STRUCTURE_SOURCE:
        frame = pd.read_excel(path, sheet_name="Estructura de precios", header=4, engine="openpyxl")
        columns = {_normalized_header(column): column for column in frame.columns}
        date_column = columns.get("FECHA")
        product_column = columns.get("COMBUSTIBLES")
        price_column = columns.get("PRECIOVENTAPUBLICO")
        if not all((date_column, product_column, price_column)):
            raise ValueError(f"{source} no contiene fecha, combustible y precio de venta público.")
        products = frame[product_column].astype(str).map(_normalized_header)
        liquid_fuels = ~products.str.contains("LICUADODEPETROLEO|GLP", regex=True)
        dates = pd.to_datetime(frame[date_column], errors="coerce")
        prices = pd.to_numeric(frame[price_column], errors="coerce")
        valid = liquid_fuels & dates.notna() & prices.gt(0) & np.isfinite(prices)
    elif source == RETAIL_FUEL_PRICES_SOURCE:
        frame = pd.read_excel(path, sheet_name="MNHL6-Precios Combustibles", engine="openpyxl")
        columns = {_normalized_header(column): column for column in frame.columns}
        date_column = columns.get("SEMANA")
        product_column = columns.get("COMBUSTIBLE")
        price_column = columns.get("PRECIOPROMEDIO")
        if not all((date_column, product_column, price_column)):
            raise ValueError(f"{source} no contiene semana, combustible y precio promedio.")
        date_text = frame[date_column].astype(str).str.extract(r"(\d{1,2}/\d{1,2}/\d{4})", expand=False)
        dates = pd.to_datetime(date_text, format="%d/%m/%Y", errors="coerce")
        products = frame[product_column].astype(str).map(_normalized_header)
        liquid_fuels = ~products.str.contains("GLP", regex=False)
        prices = pd.to_numeric(frame[price_column], errors="coerce")
        valid = liquid_fuels & dates.notna() & prices.gt(0) & np.isfinite(prices)
    else:
        raise ValueError(f"No hay un parser de variables de demanda para {source}.")

    observations = pd.DataFrame({
        "period": dates.loc[valid].dt.to_period("M"),
        "price": prices.loc[valid].astype(float),
    })
    if observations.empty:
        raise ValueError(f"{source} no contiene precios de combustibles líquidos válidos.")
    monthly_prices = observations.groupby("period", sort=True)["price"].mean().astype(float)
    monthly_prices.index = pd.PeriodIndex(monthly_prices.index, freq="M") + 1
    monthly_prices.index.name = "period"
    return monthly_prices


def _get_eia_api_key() -> str:
    configured = os.environ.get("EIA_API_KEY", "").strip()
    if configured:
        return configured.strip('"').strip("'")
    env_path = Path(__file__).resolve().parents[1] / ".env"
    try:
        for line in env_path.read_text(encoding="utf-8").splitlines():
            key, separator, value = line.partition("=")
            if separator and key.strip() == "EIA_API_KEY":
                return value.strip().strip('"').strip("'")
    except OSError:
        pass
    return ""


def _load_eia_monthly_series(series_id: str, api_key: str) -> tuple[pd.Series, str]:
    now = time.monotonic()
    cached = _eia_response_cache.get(series_id)
    if cached and now - cached[0] < EIA_CACHE_SECONDS:
        rows = cached[1]
    else:
        params = {
            "api_key": api_key,
            "frequency": "monthly",
            "data[0]": "value",
            "facets[series][]": series_id,
            "sort[0][column]": "period",
            "sort[0][direction]": "asc",
            "offset": "0",
            "length": "5000",
        }
        request = Request(
            f"{EIA_API_URL}?{urlencode(params)}",
            headers={"Accept": "application/json", "User-Agent": "GobernanzaIA/1.0"},
        )
        try:
            with urlopen(request, timeout=20) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            raise ValueError(f"EIA respondió HTTP {error.code} para la serie {series_id}.") from None
        except (URLError, TimeoutError, OSError):
            raise ValueError(f"No se pudo consultar EIA para la serie {series_id}; verifica la conexión del backend.") from None
        if payload.get("error"):
            raise ValueError(f"EIA rechazó la consulta de la serie {series_id}.")
        rows = payload.get("response", {}).get("data", [])
        if not rows:
            raise ValueError(f"EIA no devolvió observaciones para la serie {series_id}.")
        _eia_response_cache[series_id] = (now, rows)

    frame = pd.DataFrame(rows)
    if not {"period", "value"}.issubset(frame.columns):
        raise ValueError(f"La respuesta EIA de {series_id} no contiene periodo y valor.")
    dates = pd.to_datetime(frame["period"], format="%Y-%m", errors="coerce")
    values = pd.to_numeric(frame["value"], errors="coerce")
    valid = dates.notna() & values.notna() & np.isfinite(values) & values.gt(0)
    observations = pd.DataFrame({"period": dates.loc[valid].dt.to_period("M"), "price": values.loc[valid]})
    if observations.empty:
        raise ValueError(f"La serie EIA {series_id} no tiene precios mensuales válidos.")
    monthly = observations.groupby("period", sort=True)["price"].mean().astype(float)
    # A price observed in month t is made available only as a lagged feature for t+1.
    monthly.index = pd.PeriodIndex(monthly.index, freq="M") + 1
    monthly.index.name = "period"
    checksum = hashlib.sha256(
        frame[["period", "value"]].to_json(orient="records", date_format="iso").encode("utf-8")
    ).hexdigest()
    return monthly, checksum


def load_demand_price_features(
    imports_path: Path,
) -> tuple[dict[str, pd.Series], dict[str, str], dict[str, str]]:
    features: dict[str, pd.Series] = {}
    checksums: dict[str, str] = {}
    errors: dict[str, str] = {}
    eia_api_key = _get_eia_api_key()
    for source, series_id in EIA_FEATURE_SERIES.items():
        if not eia_api_key:
            errors[source] = "No está configurada EIA_API_KEY en el entorno del backend."
            continue
        try:
            feature, checksum = _load_eia_monthly_series(series_id, eia_api_key)
            features[source] = feature
            checksums[source] = checksum
        except (ValueError, KeyError, OSError) as error:
            errors[source] = str(error)
            logger.warning("Se excluyó fuente EIA %s: %s", series_id, error)
    return features, checksums, errors


def combined_source_checksum(
    target_checksum: str,
    feature_checksums: dict[str, str],
    imports_inventory: list[str] | None = None,
) -> str:
    payload = "|".join(
        [f"{TARGET_SOURCE}:{target_checksum}"]
        + [f"{source}:{feature_checksums[source]}" for source in sorted(feature_checksums)]
        + [f"imports:{name}" for name in sorted(imports_inventory or [])]
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def assess_import_sources(
    imports_path: Path,
    feature_evaluations: list[dict[str, Any]] | None = None,
    feature_errors: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    evaluations = {
        item["source"]: item
        for item in (feature_evaluations or [])
    }
    assessments = []
    for path in sorted(imports_path.iterdir(), key=lambda item: item.name.casefold()):
        if not path.is_file():
            continue
        if path.name == TARGET_SOURCE:
            status = "target"
            reason = "Serie objetivo mensual de ventas observadas en galones."
        elif path.name in PRICE_FEATURES:
            status = "excluded"
            reason = "Fuente local de precios excluida: el modelo está configurado para evaluar únicamente variables externas de EIA."
        elif path.name.startswith(("MNHL8-", "MNHL9-")):
            status = "excluded"
            reason = "Corresponde a GLP; tiene producto/unidad distintos del objetivo de ventas de combustibles líquidos."
        elif path.name.startswith("MNHL4-"):
            status = "excluded"
            reason = "Comercio exterior de petróleo; distinta variable y su cobertura termina antes del periodo reciente de validación."
        elif path.name.startswith(("MNGN",)):
            status = "excluded"
            reason = "Serie de gas natural; no corresponde al objetivo de ventas de combustibles líquidos."
        elif path.name.startswith("MNHL7-"):
            status = "excluded"
            reason = "Archivo de demanda objetivo; el otro archivo con el mismo prefijo no aporta una variable independiente."
        elif path.name.startswith(("MNHL3-", "MNHL6-")):
            status = "excluded"
            reason = "Fuente local de precios excluida: solo se evalúan variables externas de EIA."
        elif path.name.startswith("MNHL"):
            status = "excluded"
            reason = "Serie de otro producto o actividad; no es una variable compatible validada para este objetivo."
        elif path.suffix.casefold() == ".csv" and any(term in path.name.casefold() for term in (
            "transporte", "transportistas", "distribuidores", "instalaciones", "grifos", "gasocentro", "consumidor",
            "estaciones", "planta", "locales de venta", "redes de distribucion", "importador",
        )):
            status = "excluded"
            reason = "Registro administrativo/estático sin observaciones históricas mensuales de ventas."
        elif path.name.startswith(("MNHL2-", "MNHL1-")) or "Determin" in path.name:
            status = "excluded"
            reason = "Datos de supervisión, multas o determinaciones; no son observaciones mensuales de demanda de combustibles."
        elif path.name.startswith(("IPASH_", "DAG_")):
            status = "excluded"
            reason = "Muestreo/indicador ambiental histórico sin relación temporal y semántica validada con ventas mensuales."
        elif path.name.startswith(("Denuncias", "Expedientes", "Resoluciones")):
            status = "excluded"
            reason = "Registros administrativos sin variable mensual de demanda de combustibles."
        elif path.suffix.casefold() in {".pdf", ".docx", ".xls"}:
            status = "excluded"
            reason = "Documento de referencia o registro no normalizado para una serie de entrenamiento temporal."
        else:
            status = "excluded"
            reason = "No se ha validado una variable temporal y semánticamente compatible con el objetivo del modelo."
        assessment: dict[str, Any] = {"source": path.name, "status": status, "reason": reason}
        if path.name in evaluations:
            assessment.update(evaluations[path.name])
        assessments.append(assessment)
    for source, series_id in EIA_FEATURE_SERIES.items():
        evaluation = evaluations.get(source)
        if source in (feature_errors or {}):
            status = "unavailable"
            reason = (feature_errors or {})[source]
        elif evaluation is None:
            status = "candidate"
            reason = "Serie EIA descargada; falta evaluar su aporte al pronóstico."
        elif evaluation["status"] == "selected":
            status = "selected"
            reason = "La variable redujo el MAE de validación temporal frente al modelo sin esta fuente."
        else:
            status = "evaluated_not_selected"
            reason = str(evaluation["reason"])
        assessment = {
            "source": source,
            "status": status,
            "reason": reason,
            "provider": "U.S. Energy Information Administration",
            "seriesId": series_id,
            "units": "USD por galón",
            "geography": "Estados Unidos; referencia internacional, no precio peruano",
        }
        if evaluation:
            assessment.update(evaluation)
        assessments.append(assessment)
    return assessments


def _feature_row(history: list[float], target_period: pd.Period, trend_index: int) -> list[float]:
    if len(history) < max(LAGS):
        raise ValueError("Se requieren 12 meses anteriores para calcular rezagos sin fuga de información.")
    month_angle = 2 * np.pi * target_period.month / 12
    return [
        history[-1], history[-2], history[-3], history[-6], history[-12],
        float(np.mean(history[-3:])), float(np.mean(history[-12:])),
        float(np.sin(month_angle)), float(np.cos(month_angle)), float(trend_index),
    ]


def _feature_frame(
    series: pd.Series,
    target_indices: list[int],
    *,
    external_features: dict[str, pd.Series] | None = None,
    selected_source: str | None = None,
) -> pd.DataFrame:
    values = [float(value) for value in series.to_numpy()]
    records = [
        _feature_row(values[:index], series.index[index], index)
        for index in target_indices
    ]
    columns = list(FEATURE_NAMES)
    frame = pd.DataFrame(records, columns=FEATURE_NAMES, dtype=float)
    if selected_source is None:
        return frame
    feature_name = FEATURE_COLUMN_NAMES[selected_source]
    feature_series = (external_features or {}).get(selected_source)
    if feature_series is None:
        raise ValueError(f"No está disponible la fuente de la variable seleccionada: {selected_source}.")
    periods = pd.PeriodIndex([series.index[index] for index in target_indices], freq="M")
    aligned = feature_series.reindex(periods)
    frame[feature_name] = aligned.to_numpy(dtype=float)
    return frame[columns + [feature_name]]


def _forecast_feature_frame(
    series: pd.Series,
    target_period: pd.Period,
    history: list[float],
    *,
    external_features: dict[str, pd.Series] | None = None,
    selected_source: str | None = None,
    feature_cutoff: pd.Period | None = None,
) -> pd.DataFrame:
    columns = list(FEATURE_NAMES)
    frame = pd.DataFrame(
        [_feature_row(history, target_period, len(history))],
        columns=FEATURE_NAMES,
        dtype=float,
    )
    if selected_source is None:
        return frame

    feature_name = FEATURE_COLUMN_NAMES[selected_source]
    feature_series = (external_features or {}).get(selected_source)
    if feature_series is None:
        raise ValueError(f"No está disponible la fuente de la variable seleccionada: {selected_source}.")
    latest_allowed_period = min(target_period, feature_cutoff) if feature_cutoff is not None else target_period
    available = feature_series.loc[feature_series.index <= latest_allowed_period]
    if available.empty:
        raise ValueError(f"No hay precios previos disponibles para el periodo {target_period}.")
    frame[feature_name] = float(available.iloc[-1])
    return frame[columns + [feature_name]]


def _new_model() -> XGBRegressor:
    from xgboost import XGBRegressor

    return XGBRegressor(**MODEL_CONFIG)


def _metric_set(actual: np.ndarray, predicted: np.ndarray) -> dict[str, float | None]:
    errors = actual - predicted
    absolute_error = np.abs(errors)
    actual_total = float(np.sum(np.abs(actual)))
    has_zero_actual = bool(np.any(actual == 0))
    return {
        "mae": float(mean_absolute_error(actual, predicted)),
        "rmse": float(np.sqrt(mean_squared_error(actual, predicted))),
        "mape": (
            None
            if has_zero_actual
            else float(np.mean(absolute_error / np.abs(actual)) * 100)
        ),
        "wape": (
            None
            if actual_total == 0
            else float(np.sum(absolute_error) / actual_total * 100)
        ),
        "r2": float(r2_score(actual, predicted)) if len(actual) >= 2 else None,
        "mapeLimitation": (
            "MAPE no se calcula porque el conjunto de prueba contiene valores reales iguales a cero; "
            "se reporta WAPE."
            if has_zero_actual
            else None
        ),
    }


def _explain(model: XGBRegressor, features: pd.DataFrame) -> dict[str, Any]:
    try:
        import shap

        explainer = shap.TreeExplainer(model)
        shap_values = np.asarray(explainer.shap_values(features), dtype=float)
        if shap_values.ndim == 3:
            shap_values = shap_values[:, :, 0]
        if shap_values.shape != features.shape:
            raise ValueError("SHAP devolvió dimensiones distintas a las variables del modelo.")
        mean_absolute = np.mean(np.abs(shap_values), axis=0)
        importance = sorted(
            (
                {"feature": name, "meanAbsoluteShap": float(value)}
                for name, value in zip(features.columns, mean_absolute)
            ),
            key=lambda item: item["meanAbsoluteShap"],
            reverse=True,
        )
        return {
            "status": "available",
            "method": "SHAP TreeExplainer",
            "featureImportance": importance,
            "localValues": [
                {"feature": name, "contribution": float(value)}
                for name, value in zip(features.columns, shap_values[-1])
            ],
        }
    except Exception as error:
        logger.warning("SHAP no pudo explicar este modelo: %s", error, exc_info=True)
        return {
            "status": "unavailable",
            "method": "SHAP TreeExplainer",
            "reason": f"No se pudo calcular la explicación SHAP: {error}",
            "featureImportance": [],
            "localValues": [],
        }


def train_and_evaluate(
    series: pd.Series,
    *,
    source_checksum: str,
    quality: dict[str, int],
    external_features: dict[str, pd.Series] | None = None,
    feature_errors: dict[str, str] | None = None,
    imports_path: Path | None = None,
) -> TrainingResult:
    if len(series) < MIN_MONTHS:
        raise ValueError(
            f"Se requieren al menos {MIN_MONTHS} meses consecutivos de ventas observadas; "
            f"la fuente contiene {len(series)}."
        )
    split_index = max(24, len(series) - min(TEST_MONTHS, max(6, round(len(series) * 0.2))))
    train_indices = list(range(max(LAGS), split_index))
    test_indices = list(range(split_index, len(series)))
    if len(train_indices) < 12 or len(test_indices) < 2:
        raise ValueError("No hay suficientes meses para separar entrenamiento y prueba cronológicamente.")

    train_x = _feature_frame(series, train_indices)
    test_x = _feature_frame(series, test_indices)
    train_y = series.iloc[train_indices].to_numpy(dtype=float)
    test_y = series.iloc[test_indices].to_numpy(dtype=float)
    evaluation_model = _new_model()
    evaluation_model.fit(train_x, train_y)
    baseline_xgboost = np.maximum(0, evaluation_model.predict(test_x))
    baseline = np.asarray([series.iloc[index - 12] for index in test_indices], dtype=float)
    model_metrics = _metric_set(test_y, baseline_xgboost)
    baseline_metrics = _metric_set(test_y, baseline)
    candidate_evaluations: list[dict[str, Any]] = []
    selected_source: str | None = None
    best_candidate_improvement = 0.0
    latest_target_period = series.index[-1]

    for source, feature_series in (external_features or {}).items():
        feature_name = FEATURE_COLUMN_NAMES[source]
        train_periods = pd.PeriodIndex([series.index[index] for index in train_indices], freq="M")
        test_periods = pd.PeriodIndex([series.index[index] for index in test_indices], freq="M")
        train_values = feature_series.reindex(train_periods)
        test_values = feature_series.reindex(test_periods)
        train_observations = int(train_values.notna().sum())
        available_test_positions = np.flatnonzero(test_values.notna().to_numpy())
        test_observations = len(available_test_positions)
        forecast_feature_period = latest_target_period + 1
        usable_feature_periods = feature_series.loc[feature_series.index <= forecast_feature_period].index
        latest_feature_period = usable_feature_periods.max() if len(usable_feature_periods) else None
        staleness = (
            forecast_feature_period.ordinal - latest_feature_period.ordinal
            if latest_feature_period is not None
            else MAX_EXTERNAL_FEATURE_STALENESS_MONTHS + 1
        )
        evaluation: dict[str, Any] = {
            "source": source,
            "feature": feature_name,
            "status": "evaluated_not_selected",
            "trainingObservations": train_observations,
            "testObservations": test_observations,
            "latestFeaturePeriod": str(latest_feature_period) if latest_feature_period is not None else None,
            "mae": None,
            "baselineMae": None,
            "errorReductionPercent": None,
        }
        if train_observations < MIN_EXTERNAL_TRAIN_OBSERVATIONS:
            evaluation["reason"] = (
                f"Solo hay {train_observations} meses con precios en entrenamiento; "
                f"se requieren al menos {MIN_EXTERNAL_TRAIN_OBSERVATIONS}."
            )
        elif test_observations < MIN_EXTERNAL_TEST_OBSERVATIONS:
            evaluation["reason"] = (
                f"Solo hay {test_observations} meses con precios en la prueba; "
                f"se requieren al menos {MIN_EXTERNAL_TEST_OBSERVATIONS}."
            )
        else:
            candidate_test_indices = [test_indices[position] for position in available_test_positions]
            candidate_test_x = _feature_frame(
                series,
                candidate_test_indices,
                external_features=external_features,
                selected_source=source,
            )
            candidate_model = _new_model()
            candidate_model.fit(
                _feature_frame(
                    series,
                    train_indices,
                    external_features=external_features,
                    selected_source=source,
                ),
                train_y,
            )
            candidate_actual = series.iloc[candidate_test_indices].to_numpy(dtype=float)
            candidate_prediction = np.maximum(0, candidate_model.predict(candidate_test_x))
            matching_baseline = baseline_xgboost[available_test_positions]
            candidate_mae = float(mean_absolute_error(candidate_actual, candidate_prediction))
            no_feature_mae = float(mean_absolute_error(candidate_actual, matching_baseline))
            improvement = (
                (no_feature_mae - candidate_mae) / no_feature_mae * 100
                if no_feature_mae > 0
                else 0.0
            )
            evaluation.update({
                "mae": candidate_mae,
                "baselineMae": no_feature_mae,
                "errorReductionPercent": improvement,
            })
            if staleness > MAX_EXTERNAL_FEATURE_STALENESS_MONTHS:
                evaluation["reason"] = (
                    f"Los precios disponibles llegan hasta {latest_feature_period or 'ningún mes utilizable'}; "
                    f"el dato para el pronóstico está desactualizado por {staleness} meses."
                )
            elif candidate_mae >= no_feature_mae:
                evaluation["reason"] = "No redujo el MAE frente al XGBoost evaluado sin esta variable."
            else:
                evaluation["reason"] = "Redujo el MAE en la prueba temporal y cumple los requisitos de cobertura."
                if improvement > best_candidate_improvement:
                    best_candidate_improvement = improvement
                    selected_source = source
        candidate_evaluations.append(evaluation)

    if selected_source is not None:
        for evaluation in candidate_evaluations:
            if evaluation["source"] == selected_source:
                evaluation["status"] = "selected"
            elif evaluation["reason"].startswith("Redujo el MAE"):
                evaluation["reason"] = "Otra fuente obtuvo una mayor reducción de MAE y fue seleccionada."

    if selected_source is not None:
        selected_test_indices = [
            index for index in test_indices
            if pd.notna(external_features[selected_source].get(series.index[index]))
        ]
        test_x = _feature_frame(
            series,
            selected_test_indices,
            external_features=external_features,
            selected_source=selected_source,
        )
        test_y = series.iloc[selected_test_indices].to_numpy(dtype=float)
        evaluation_model = _new_model()
        evaluation_model.fit(
            _feature_frame(
                series,
                train_indices,
                external_features=external_features,
                selected_source=selected_source,
            ),
            train_y,
        )
        predicted = np.maximum(0, evaluation_model.predict(test_x))
        baseline = np.asarray([series.iloc[index - 12] for index in selected_test_indices], dtype=float)
        model_metrics = _metric_set(test_y, predicted)
        baseline_metrics = _metric_set(test_y, baseline)
        evaluation_periods = [str(series.index[index]) for index in selected_test_indices]
    else:
        predicted = baseline_xgboost
        evaluation_periods = [str(series.index[index]) for index in test_indices]

    baseline_mae = baseline_metrics["mae"]
    error_reduction = (
        None
        if baseline_mae in (None, 0)
        else float((baseline_mae - model_metrics["mae"]) / baseline_mae * 100)
    )

    model = _new_model()
    all_indices = list(range(max(LAGS), len(series)))
    model.fit(
        _feature_frame(
            series,
            all_indices,
            external_features=external_features,
            selected_source=selected_source,
        ),
        series.iloc[all_indices].to_numpy(dtype=float),
    )
    future_period = series.index[-1] + 1
    future_features = _forecast_feature_frame(
        series,
        future_period,
        series.to_list(),
        external_features=external_features,
        selected_source=selected_source,
    )
    forecast_value = max(0.0, float(model.predict(future_features)[0]))
    explainability = _explain(evaluation_model, test_x)
    forecast_explanation = _explain(model, future_features)
    run_id = str(uuid.uuid4())
    trained_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    if selected_source is None:
        periods = [str(series.index[index]) for index in test_indices]
    else:
        periods = evaluation_periods
    test_predictions = [
        {
            "period": period,
            "actual": float(actual),
            "xgboost": float(model_prediction),
            "baseline": float(baseline_prediction),
        }
        for period, actual, model_prediction, baseline_prediction in zip(periods, test_y, predicted, baseline)
    ]
    data_sources = (
        assess_import_sources(imports_path, candidate_evaluations, feature_errors)
        if imports_path is not None
        else []
    )
    forecast_warnings = []
    if selected_source is not None:
        available_prices = external_features[selected_source].loc[
            external_features[selected_source].index <= future_period
        ]
        latest_price_period = available_prices.index.max() - 1
        forecast_warnings.append(
            f"Pronóstico con {selected_source}: se mantiene constante el último precio observado "
            f"({latest_price_period}) para los periodos futuros."
        )
    import xgboost

    public_result = {
        "runId": run_id,
        "model": "XGBoost",
        "modelVersion": f"xgboost-{xgboost.__version__}-{run_id[:8]}",
        "xgboostVersion": xgboost.__version__,
        "status": "evaluated",
        "target": "Ventas mensuales observadas de combustibles líquidos",
        "source": TARGET_SOURCE,
        "sourceChecksum": source_checksum,
        "unit": TARGET_UNIT,
        "trainedAt": trained_at,
        "trainingPeriod": {"from": str(series.index[0]), "to": str(series.index[split_index - 1])},
        "evaluationPeriod": {"from": periods[0], "to": periods[-1]},
        "trainingObservations": len(train_indices),
        "testObservations": len(test_y),
        "coverage": {"months": len(series), "from": str(series.index[0]), "to": str(series.index[-1])},
        "dataQuality": quality,
        "dataSources": data_sources,
        "candidateEvaluations": candidate_evaluations,
        "selectedSources": [selected_source] if selected_source else [],
        "config": MODEL_CONFIG,
        "metrics": {
            "xgboost": model_metrics,
            "baseline": baseline_metrics,
            "errorReductionPercent": error_reduction,
            "comparisonMetric": "MAE",
        },
        "testPredictions": test_predictions,
        "forecast": {
            "period": str(future_period),
            "value": forecast_value,
            "unit": TARGET_UNIT,
        },
        "explainability": {
            "evaluation": explainability,
            "forecast": forecast_explanation,
        },
        "warnings": [
            "Las ventas despachadas se usan como indicador observado de demanda; no equivalen a consumo final.",
            *(
                ["La selección de fuentes y sus métricas se basan en una única ventana temporal; requieren validación independiente antes de uso operativo."]
                if candidate_evaluations
                else []
            ),
            *forecast_warnings,
            *(
                ["La fuente observada termina hace más de 90 días; el pronóstico corresponde al periodo posterior al último dato."]
                if (pd.Timestamp.now().to_period("M") - series.index[-1]).n >= 3
                else []
            ),
            *(
                [str(explainability["reason"])]
                if explainability["status"] != "available"
                else []
            ),
        ],
    }
    artifact = bytes(model.get_booster().save_raw(raw_format="json"))
    return TrainingResult(public_result=public_result, model_artifact=artifact)


def load_model(artifact: bytes) -> XGBRegressor:
    from xgboost import XGBRegressor

    model = XGBRegressor()
    model.load_model(bytearray(artifact))
    return model


def predict_horizon(
    model: XGBRegressor,
    series: pd.Series,
    horizon_months: int,
    *,
    external_features: dict[str, pd.Series] | None = None,
    selected_source: str | None = None,
) -> list[dict[str, Any]]:
    if not 1 <= horizon_months <= MAX_FORECAST_HORIZON:
        raise ValueError(f"El horizonte debe estar entre 1 y {MAX_FORECAST_HORIZON} meses.")
    history = [float(value) for value in series.to_list()]
    predictions: list[dict[str, Any]] = []
    next_period = series.index[-1] + 1
    latest_price_period = None
    if selected_source is not None:
        selected_features = (external_features or {}).get(selected_source)
        if selected_features is None:
            raise ValueError(f"No está disponible la fuente de la variable seleccionada: {selected_source}.")
        available_features = selected_features.loc[selected_features.index <= next_period]
        if available_features.empty:
            raise ValueError(f"No hay precios disponibles hasta el inicio del pronóstico {next_period}.")
        latest_price_period = available_features.index.max() - 1
    for offset in range(horizon_months):
        period = next_period + offset
        features = _forecast_feature_frame(
            series,
            period,
            history,
            external_features=external_features,
            selected_source=selected_source,
            feature_cutoff=next_period,
        )
        value = max(0.0, float(model.predict(features)[0]))
        explanation = _explain(model, features)
        prediction = {
            "period": str(period),
            "value": value,
            "unit": TARGET_UNIT,
            "explanation": explanation,
        }
        if selected_source is not None:
            prediction["warnings"] = [
                f"Para {period} se usa el último precio observado ({latest_price_period}); "
                "no se presupone un precio futuro."
            ]
        predictions.append(prediction)
        history.append(value)
    return predictions

