from __future__ import annotations

import json
import hashlib
import logging
import os
import threading
import time
import unicodedata
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal
from urllib.parse import quote

from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from psycopg.types.json import Jsonb

from api import database, demand_model, risk_model


IMPORTS_PATH = Path(__file__).resolve().parents[1] / "public" / "imports"
COMPLAINTS_PATH = IMPORTS_PATH / "DenunciasSINADA20192025_2944631782350634676.csv"
CASES_PATH = IMPORTS_PATH / "Expedientesresueltos20212025_2944571782350726004.csv"
RESOLUTIONS_PATH = IMPORTS_PATH / "Resolucionesdirectorales20182025_2944601782350740761.csv"
FACILITIES_PATH = IMPORTS_PATH / "CDCLyOPDHconInstalacionesFijas.csv"
FUEL_SALES_PATH = IMPORTS_PATH / "MNHL7-VentasCombustibles.xlsx"
DATE_FORMATS = ("%m/%d/%Y", "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%Y-%m")
MAX_AI_EVIDENCE_BYTES = 10 * 1024 * 1024
AI_EVIDENCE_MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}
LAG_DAYS = 28
VALIDATION_DAYS = 14
MIN_DAILY_POINTS = 60
LAG_MONTHS = 3

logger = logging.getLogger(__name__)
app = FastAPI(title="Gobernanza de datos sectoriales")
database_initialized = threading.Event()
INITIALIZATION_EXEMPT_PATHS = {"/api/health/database", "/api/health/ready"}


@app.middleware("http")
async def require_initialized_database(request: Request, call_next: Any) -> Response:
    if (
        request.url.path.startswith("/api/")
        and request.url.path not in INITIALIZATION_EXEMPT_PATHS
        and not database_initialized.is_set()
    ):
        return JSONResponse(
            status_code=503,
            content={"detail": "Los datos iniciales todavía se están preparando. Intenta de nuevo en unos minutos."},
        )
    return await call_next(request)


class DemandForecastRequest(BaseModel):
    horizon_months: int = Field(default=1, ge=1, le=demand_model.MAX_FORECAST_HORIZON)


class RoadImpactRequest(BaseModel):
    phenomenon_class: str = Field(min_length=1, max_length=100, alias="phenomenonClass")
    phenomenon: str = Field(min_length=1, max_length=120)
    event: str = Field(min_length=1, max_length=160)
    department: str = Field(min_length=1, max_length=100)
    province: str | None = Field(default=None, max_length=100)
    road_code: str | None = Field(default=None, max_length=40, alias="roadCode")
    road_section: str | None = Field(default=None, max_length=160, alias="roadSection")
    date: str | None = None


def _load_demand_model_sources() -> tuple[
    Any,
    dict[str, int],
    str,
    dict[str, Any],
    dict[str, str],
]:
    monthly, quality, target_checksum = demand_model.load_monthly_demand(FUEL_SALES_PATH)
    external_features, feature_checksums, feature_errors = demand_model.load_demand_price_features(IMPORTS_PATH)
    imports_inventory = [path.name for path in IMPORTS_PATH.iterdir() if path.is_file()]
    checksum = demand_model.combined_source_checksum(
        target_checksum,
        feature_checksums,
        imports_inventory,
    )
    return monthly, quality, checksum, external_features, feature_errors


@app.on_event("startup")
def initialize_postgresql() -> None:
    database_initialized.clear()
    if not os.environ.get("DATABASE_URL", "").strip():
        logger.warning("PostgreSQL no está configurado; endpoints de datos y operación responderán con HTTP 503.")
        return

    def initialize_in_background() -> None:
        try:
            database.initialize_database()
        except Exception:
            logger.exception("No se pudo inicializar PostgreSQL ni importar las fuentes sectoriales.")
        else:
            database_initialized.set()

    threading.Thread(
        target=initialize_in_background,
        name="postgresql-initialization",
        daemon=True,
    ).start()


def get_current_user(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Autenticación requerida.")
    try:
        user = database.lookup_session(authorization.removeprefix("Bearer ").strip())
    except Exception as error:
        logger.exception("No se pudo validar la sesión de usuario.")
        raise HTTPException(status_code=503, detail="No se pudo consultar la sesión en PostgreSQL.") from error
    if not user:
        raise HTTPException(status_code=401, detail="La sesión expiró o fue revocada.")
    return user


def get_supervisor(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if user["role"] != "Supervisor de Cumplimiento" or "supervision" not in user["permissions"]:
        raise HTTPException(status_code=403, detail="Se requiere el rol Supervisor de Cumplimiento.")
    return user


def get_demand_model_analyst(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if user["role"] not in {"Analista de Datos", "Supervisor de Cumplimiento"}:
        raise HTTPException(status_code=403, detail="Se requiere el rol Analista de Datos o Supervisor de Cumplimiento.")
    return user


def _record_demand_model_operation(
    operation: str,
    succeeded: bool,
    started_at: float,
    username: str,
) -> None:
    try:
        database.record_model_operation(
            operation,
            succeeded,
            (time.perf_counter() - started_at) * 1000,
            username,
        )
    except Exception:
        logger.exception("No se pudo persistir la métrica de operación del modelo.")


def _persist_forecast_prediction(
    *,
    run: dict[str, Any],
    period: str,
    value: float,
    explanation: dict[str, Any],
    username: str,
) -> None:
    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    traceability = {
        "runId": run["runId"],
        "modelVersion": run["modelVersion"],
        "targetPeriod": period,
        "source": run["source"],
        "sourcePeriod": run["coverage"]["to"],
        "generatedAt": generated_at,
        "requestedBy": username,
        "unit": run["unit"],
    }
    database.save_demand_prediction(
        prediction_id=str(uuid.uuid4()),
        run_id=run["runId"],
        period=period,
        value=value,
        unit=run["unit"],
        traceability=traceability,
        explanation=explanation,
    )


def _append_access_event(
    *,
    username: str,
    role: str,
    action: str,
    resource: str,
    result: str,
) -> None:
    with database.connection() as conn:
        conn.execute(
            """
            INSERT INTO access_events (username, role, action, resource, result)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (username, role, action, resource, result),
        )


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=1024)


class NewUserRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_.-]+$")
    name: str = Field(min_length=1, max_length=200)
    role: Literal[
        "Gerente de Operaciones",
        "Analista de Datos",
        "Supervisor de Cumplimiento",
        "Ingeniero de Campo",
    ]
    password: str = Field(min_length=12, max_length=1024)


class UserUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    role: Literal[
        "Gerente de Operaciones",
        "Analista de Datos",
        "Supervisor de Cumplimiento",
        "Ingeniero de Campo",
    ] | None = None
    permissions: list[str] | None = None
    active: bool | None = None


class AccessEventRequest(BaseModel):
    action: str = Field(min_length=1, max_length=200)
    resource: str = Field(min_length=1, max_length=500)
    result: Literal["Permitido", "Denegado"] = "Permitido"


class RiskSimulationRequest(BaseModel):
    scenario_name: str = Field(min_length=3, max_length=120)
    delay_hours: float = Field(default=0, ge=0, le=168)
    incident_count: int = Field(default=0, ge=0, le=100)
    environmental_alert: bool = False


class AIGovernanceControlUpdate(BaseModel):
    status: Literal["no_evaluado", "en_revision", "conforme", "brecha"]
    evidence: str = Field(default="", max_length=5000)


class AIGovernanceRiskCreate(BaseModel):
    model_name: str = Field(min_length=2, max_length=160)
    category: str = Field(min_length=2, max_length=120)
    description: str = Field(min_length=10, max_length=2000)
    data_basis: Literal["observado", "sintetico", "conceptual"]
    evidence: str = Field(default="", max_length=5000)
    likelihood: int = Field(ge=1, le=5)
    impact: int = Field(ge=1, le=5)
    owner: str = Field(min_length=2, max_length=160)
    treatment: str = Field(min_length=5, max_length=3000)


class AIGovernanceRiskUpdate(BaseModel):
    status: Literal["identificado", "en_tratamiento", "aceptado", "cerrado"]
    treatment: str = Field(min_length=5, max_length=3000)


def _public_report(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "nombre": row["name"],
        "tipo": row["report_type"],
        "generado": row["created_at"].isoformat(),
        "estado": "Generado",
        "sizeBytes": row["size_bytes"],
        "fileName": row["file_name"],
        "path": row["file_name"],
        "periodo": row["period"],
        "usuario": row["username"],
    }


def _parse_date(value: str) -> date | None:
    for date_format in DATE_FORMATS:
        try:
            return datetime.strptime(value.strip(), date_format).date()
        except ValueError:
            continue
    return None


def _load_daily_counts(rows: list[dict[str, Any]]) -> tuple[date, list[int]]:
    counts: dict[date, int] = {}
    if rows and "FECHA DE REGISTRO" not in rows[0]:
        raise HTTPException(status_code=422, detail="El dataset de denuncias debe incluir FECHA DE REGISTRO.")
    for row in rows:
        registered = _parse_date(row.get("FECHA DE REGISTRO", ""))
        if registered is not None:
            counts[registered] = counts.get(registered, 0) + 1

    if not counts:
        raise HTTPException(status_code=422, detail="El dataset de denuncias no contiene fechas de registro válidas.")

    first_day = min(counts)
    last_day = max(counts)
    daily_counts = [
        counts.get(first_day + timedelta(days=offset), 0)
        for offset in range((last_day - first_day).days + 1)
    ]
    return first_day, daily_counts


def _normalize_header(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    without_accents = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    return " ".join(without_accents.strip().upper().split())


def _load_monthly_counts(
    rows: list[dict[str, Any]],
    source_name: str,
    date_column: str,
    value_column: str | None = None,
) -> tuple[date, list[float], int]:
    counts: dict[tuple[int, int], float] = {}
    headers = rows[0].keys() if rows else ()
    header_by_normalized_name = {
        _normalize_header(name): name for name in headers
    }
    actual_date_column = header_by_normalized_name.get(_normalize_header(date_column))
    actual_value_column = header_by_normalized_name.get(_normalize_header(value_column)) if value_column else None
    if actual_date_column is None:
        raise HTTPException(
            status_code=422,
            detail=f"El dataset {source_name} debe incluir la columna {date_column}.",
        )
    if value_column and actual_value_column is None:
        raise HTTPException(
            status_code=422,
            detail=f"El dataset {source_name} debe incluir la columna {value_column}.",
        )

    for row in rows:
        registered = _parse_date(row.get(actual_date_column, "") or "")
        if registered is not None:
            month_key = (registered.year, registered.month)
            if actual_value_column:
                try:
                    value = float(str(row.get(actual_value_column, "0")).replace(",", "").strip() or 0)
                except ValueError:
                    value = 0
            else:
                value = 1
            counts[month_key] = counts.get(month_key, 0) + value

    if not counts:
        raise HTTPException(status_code=422, detail=f"El dataset {source_name} no contiene fechas válidas.")

    first_year, first_month = min(counts)
    last_year, last_month = max(counts)
    first_day = date(first_year, first_month, 1)
    month_count = (last_year - first_year) * 12 + last_month - first_month + 1
    monthly_counts = [
        counts.get(
            (
                first_year + (first_month - 1 + offset) // 12,
                (first_month - 1 + offset) % 12 + 1,
            ),
            0,
        )
        for offset in range(month_count)
    ]
    return first_day, monthly_counts, len(rows)


def _monthly_features(history: list[float], target_month: date) -> list[float]:
    return [
        history[-1],
        history[-2],
        history[-3],
        sum(history[-3:]) / 3,
        target_month.month,
        float(len(history)),
    ]


def _month_at_offset(start_month: date, offset: int) -> date:
    month_index = start_month.year * 12 + start_month.month - 1 + offset
    return date(month_index // 12, month_index % 12 + 1, 1)


def _month_forecast(
    *,
    key: str,
    label: str,
    path: Path,
    rows: list[dict[str, Any]],
    date_column: str,
    value_column: str | None = None,
    unit: str = "registros",
) -> dict[str, Any]:
    first_month, monthly_counts, row_count = _load_monthly_counts(rows, path.name, date_column, value_column)
    if len(monthly_counts) < 8:
        return {
            "unavailable": {
                "key": key,
                "label": label,
                "source": path.name,
                "status": "insufficient_data",
                "records": row_count,
                "reason": (
                    f"Se necesitan al menos 8 meses consecutivos para pronosticar {label}; "
                    f"la fuente solo cubre {len(monthly_counts)} meses."
                ),
            }
        }

    features = [
        _monthly_features(
            [float(value) for value in monthly_counts[:month_index]],
            _month_at_offset(first_month, month_index),
        )
        for month_index in range(LAG_MONTHS, len(monthly_counts))
    ]
    targets = [float(value) for value in monthly_counts[LAG_MONTHS:]]
    validation_months = min(3, max(1, len(features) // 4))
    split_index = len(features) - validation_months
    if split_index < 4:
        return {
            "unavailable": {
                "key": key,
                "label": label,
                "source": path.name,
                "status": "insufficient_data",
                "records": row_count,
                "reason": f"No hay suficientes meses para entrenar y validar el pronóstico de {label}.",
            }
        }

    model = _make_model()
    model.fit(features[:split_index], targets[:split_index])
    validation_start = LAG_MONTHS + split_index
    validation_history = [float(value) for value in monthly_counts[:validation_start]]
    absolute_errors = []
    for month_index in range(validation_start, len(monthly_counts)):
        target_month = _month_at_offset(first_month, month_index)
        prediction = _predict(model, _monthly_features(validation_history, target_month))
        absolute_errors.append(abs(prediction - monthly_counts[month_index]))
        validation_history.append(prediction)

    final_model = _make_model()
    final_model.fit(features, targets)
    last_observed_month = _month_at_offset(first_month, len(monthly_counts) - 1)
    forecast_month = _month_at_offset(first_month, len(monthly_counts))
    forecast = _predict(
        final_model,
        _monthly_features([float(value) for value in monthly_counts], forecast_month),
    )
    warnings = []
    if len(monthly_counts) < 24:
        warnings.append(
            f"El historial cubre {len(monthly_counts)} meses; el pronóstico es experimental "
            "y no permite validar estacionalidad anual."
        )
    if last_observed_month < date.today().replace(day=1) - timedelta(days=35):
        warnings.append(
            f"El último dato es de {_month_label(last_observed_month.year, last_observed_month.month)}; "
            f"el resultado corresponde a {_month_label(forecast_month.year, forecast_month.month)}, "
            "no al periodo actual."
        )

    return {
        "key": key,
        "label": label,
        "source": path.name,
        "unit": unit,
        "coverage": {
            "months": len(monthly_counts),
            "rows": row_count,
            "from": first_month.isoformat(),
            "to": last_observed_month.isoformat(),
        },
        "history": [
            {
                "period": _month_label(
                    first_month.year + (first_month.month - 1 + index) // 12,
                    (first_month.month - 1 + index) % 12 + 1,
                ),
                "count": count,
            }
            for index, count in enumerate(monthly_counts)
        ],
        "forecast": {"period": _month_label(forecast_month.year, forecast_month.month), "count": round(forecast)},
        "validation": {
            "horizonMonths": len(absolute_errors),
            "maePerMonth": round(sum(absolute_errors) / len(absolute_errors), 2),
        },
        "warnings": warnings,
    }


def _features(history: list[float], target_date: date) -> list[float]:
    return [
        history[-1],
        history[-7],
        history[-14],
        history[-28],
        sum(history[-7:]) / 7,
        sum(history[-28:]) / 28,
        target_date.weekday(),
        target_date.month,
        target_date.day,
    ]


def _make_model() -> XGBRegressor:
    from xgboost import XGBRegressor

    return XGBRegressor(
        objective="reg:squarederror",
        n_estimators=120,
        max_depth=2,
        learning_rate=0.04,
        min_child_weight=3,
        subsample=0.85,
        colsample_bytree=0.9,
        reg_lambda=4,
        random_state=42,
        n_jobs=2,
        verbosity=0,
    )


def _month_label(year: int, month: int) -> str:
    spanish_months = (
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    )
    return f"{spanish_months[month - 1].capitalize()} {year}"


def _next_month(year: int, month: int) -> tuple[int, int]:
    return (year + 1, 1) if month == 12 else (year, month + 1)


def _predict(model: XGBRegressor, features: list[float]) -> float:
    return max(0.0, float(model.predict([features])[0]))


def build_forecast(
    datasets: dict[str, list[dict[str, Any]]] | None = None,
    source_name: str | None = None,
) -> dict[str, Any]:
    if datasets is None:
        try:
            stored = database.load_datasets()
            datasets = {key: value["rows"] for key, value in stored.items()}
            complaint_sources = stored.get("complaints", {}).get("sourceFiles", [])
            if complaint_sources:
                source_name = " + ".join(complaint_sources)
        except Exception as error:
            logger.exception("No se pudieron cargar los datasets para el pronóstico.")
            raise HTTPException(status_code=503, detail="No se pudieron cargar datos de PostgreSQL para el pronóstico.") from error
    first_day, daily_counts = _load_daily_counts(datasets.get("complaints", []))
    if len(daily_counts) < MIN_DAILY_POINTS:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Se necesitan al menos {MIN_DAILY_POINTS} días consecutivos de datos; "
                f"el CSV solo cubre {len(daily_counts)} días."
            ),
        )

    features = [
        _features([float(value) for value in daily_counts[:day_index]], first_day + timedelta(days=day_index))
        for day_index in range(LAG_DAYS, len(daily_counts))
    ]
    targets = [float(value) for value in daily_counts[LAG_DAYS:]]
    split_index = len(features) - VALIDATION_DAYS
    if split_index < 20:
        raise HTTPException(
            status_code=422,
            detail="No hay suficientes días para entrenar y validar el prototipo. Aporta más historial.",
        )

    validation_model = _make_model()
    validation_model.fit(features[:split_index], targets[:split_index])
    validation_start = LAG_DAYS + split_index
    validation_history = [float(value) for value in daily_counts[:validation_start]]
    absolute_errors = []
    for day_index in range(validation_start, len(daily_counts)):
        target_date = first_day + timedelta(days=day_index)
        prediction = _predict(validation_model, _features(validation_history, target_date))
        absolute_errors.append(abs(prediction - daily_counts[day_index]))
        validation_history.append(prediction)

    model = _make_model()
    model.fit(features, targets)

    last_day = first_day + timedelta(days=len(daily_counts) - 1)
    forecast_year, forecast_month = _next_month(last_day.year, last_day.month)
    forecast_history = [float(value) for value in daily_counts]
    forecast_day = date(forecast_year, forecast_month, 1)
    forecast_total = 0.0
    while forecast_day.month == forecast_month:
        prediction = _predict(model, _features(forecast_history, forecast_day))
        forecast_total += prediction
        forecast_history.append(prediction)
        forecast_day += timedelta(days=1)

    monthly_totals: dict[tuple[int, int], int] = {}
    for day_offset, count in enumerate(daily_counts):
        current_day = first_day + timedelta(days=day_offset)
        month_key = (current_day.year, current_day.month)
        monthly_totals[month_key] = monthly_totals.get(month_key, 0) + count

    warnings = []
    if len(monthly_totals) < 24:
        warnings.append(
            f"El historial cubre solo {len(monthly_totals)} meses; el pronóstico es experimental "
            "y no captura estacionalidad anual."
        )
    if last_day < date.today() - timedelta(days=35):
        warnings.append(
            f"El CSV termina el {last_day.isoformat()}; el resultado corresponde a "
            f"{_month_label(forecast_year, forecast_month)}, no al mes actual."
        )
    warnings.append("El error de validación usa los últimos 14 días y no representa una garantía de precisión.")

    result = {
        "model": "XGBoost",
        "target": "Denuncias SINADA por mes",
        "source": source_name or COMPLAINTS_PATH.name,
        "coverage": {
            "months": len(monthly_totals),
            "dailyPoints": len(daily_counts),
            "from": first_day.isoformat(),
            "to": last_day.isoformat(),
        },
        "history": [
            {"period": _month_label(year, month), "count": count}
            for (year, month), count in sorted(monthly_totals.items())
        ],
        "forecast": {
            "period": _month_label(forecast_year, forecast_month),
            "count": round(forecast_total),
        },
        "validation": {
            "horizonDays": len(absolute_errors),
            "maePerDay": round(sum(absolute_errors) / len(absolute_errors), 2),
        },
        "warnings": warnings,
    }
    return result


def build_predictions() -> dict[str, Any]:
    try:
        stored = database.load_datasets()
        datasets = {key: value["rows"] for key, value in stored.items()}
    except Exception as error:
        logger.exception("No se pudieron cargar los datasets para los pronósticos.")
        raise HTTPException(status_code=503, detail="No se pudieron cargar datos de PostgreSQL para los pronósticos.") from error
    complaint_sources = stored.get("complaints", {}).get("sourceFiles", [])
    complaints_source = " + ".join(complaint_sources) if complaint_sources else COMPLAINTS_PATH.name
    complaints = build_forecast(datasets, complaints_source)
    predictions = [
        {
            "key": "complaints",
            "label": "Denuncias SINADA",
            "source": complaints["source"],
            "unit": "registros",
            "coverage": {
                "months": complaints["coverage"]["months"],
                "rows": sum(item["count"] for item in complaints["history"]),
                "from": complaints["coverage"]["from"],
                "to": complaints["coverage"]["to"],
            },
            "history": complaints["history"],
            "forecast": complaints["forecast"],
            "validation": {
                "horizonMonths": 0,
                "maePerMonth": None,
                "horizonDays": complaints["validation"]["horizonDays"],
                "maePerDay": complaints["validation"]["maePerDay"],
            },
            "warnings": complaints["warnings"],
        },
    ]
    unavailable = []
    for key, label, path, date_column in (
        ("cases", "Expedientes resueltos", CASES_PATH, "FECHA DE RESOLUCIÓN"),
        ("resolutions", "Resoluciones directorales", RESOLUTIONS_PATH, "FECHA RD"),
    ):
        result = _month_forecast(
            key=key,
            label=label,
            path=path,
            rows=datasets.get(key, []),
            date_column=date_column,
        )
        if "unavailable" in result:
            unavailable.append(result["unavailable"])
        else:
            predictions.append(result)

    operational_data = datasets.get("operationalData", {})
    liquid_fuels = operational_data.get("liquidFuels", {}) if isinstance(operational_data, dict) else {}
    fuel_sales_totals: dict[str, float] = {}
    for row in liquid_fuels.get("fuelSales", []):
        period = row.get("period")
        if isinstance(period, str):
            fuel_sales_totals[period] = fuel_sales_totals.get(period, 0) + float(row.get("gallons", 0))
    fuel_sales_rows = [
        {"period": period, "gallons": gallons}
        for period, gallons in sorted(fuel_sales_totals.items())
    ]
    fuel_forecast = _month_forecast(
        key="fuel-sales",
        label="Ventas de combustibles",
        path=FUEL_SALES_PATH,
        rows=fuel_sales_rows,
        date_column="period",
        value_column="gallons",
        unit="galones",
    )
    if "unavailable" in fuel_forecast:
        unavailable.append(fuel_forecast["unavailable"])
    else:
        predictions.append(fuel_forecast)

    facility_rows = datasets.get("facilities", [])
    facility_header = next(
        (key for key in (facility_rows[0].keys() if facility_rows else ()) if _normalize_header(key) == "NO"),
        None,
    )
    if facility_header is None:
        raise HTTPException(status_code=422, detail="El dataset de instalaciones no contiene la cabecera No.")
    facility_row_count = sum(
        1 for row in facility_rows if row.get(facility_header, "").strip().isdigit()
    )

    return {
        "model": "XGBoost",
        "status": "experimental",
        "predictions": predictions,
        "unavailable": [
            {
                "key": "inventory",
                "label": "Inventario de combustibles",
                "source": FACILITIES_PATH.name,
                "status": "insufficient_data",
                "records": facility_row_count,
                "reason": (
                    "El archivo contiene instalaciones, tanques y capacidad registrada histórica, "
                    "pero no existencias medidas a lo largo del tiempo."
                ),
            },
            {
                "key": "transport",
                "label": "Rutas, envíos y condiciones ambientales",
                "source": None,
                "status": "no_dataset",
                "reason": "Hay series de volumen de gas y combustibles, pero no registros de envíos individualizados, trazados de rutas, tiempos de traslado ni mediciones ambientales.",
            },
            *unavailable,
        ],
        "warnings": [
            "Las predicciones corresponden a los periodos posteriores a la última fecha observada de cada fuente; no son necesariamente predicciones para la fecha actual.",
            "Los conjuntos disponibles son cortos o están desactualizados; no usar estos resultados para decisiones operativas.",
        ],
        "lastUpdated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


@app.get("/api/health/database")
def get_database_health() -> dict[str, str]:
    try:
        with database.connection() as conn:
            conn.execute("SELECT 1")
    except Exception as error:
        logger.exception("La comprobación de conexión PostgreSQL falló.")
        raise HTTPException(status_code=503, detail="PostgreSQL no está disponible.") from error
    return {"status": "ok", "database": "postgresql"}


@app.get("/api/health/ready")
def get_application_readiness() -> dict[str, str]:
    if not database_initialized.is_set():
        raise HTTPException(status_code=503, detail="Los datos iniciales todavía se están preparando.")
    return {"status": "ready"}


@app.get("/api/datasets")
def get_datasets(_: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    try:
        datasets = database.load_datasets()
    except Exception as error:
        logger.exception("No se pudieron consultar los datasets de PostgreSQL.")
        raise HTTPException(status_code=503, detail="No se pudieron consultar los datasets de PostgreSQL.") from error
    return {key: value["rows"] for key, value in datasets.items()}


@app.get("/api/datasets/hydrocarbons")
def get_hydrocarbon_datasets(_: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    try:
        datasets = database.load_datasets()
        hydrocarbon_data = datasets.get("hydrocarbonData")
        if not hydrocarbon_data:
            raise HTTPException(status_code=404, detail="No hay datos de hidrocarburos importados.")
        return hydrocarbon_data["rows"]
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("No se pudieron consultar los datos de hidrocarburos.")
        raise HTTPException(status_code=503, detail="No se pudieron consultar los datos de hidrocarburos.") from error


@app.get("/api/datasets/operations")
def get_operational_datasets(_: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    try:
        datasets = database.load_datasets()
        operational_data = datasets.get("operationalData")
        if not operational_data:
            raise HTTPException(status_code=404, detail="No hay datos operativos sectoriales importados.")
        return operational_data["rows"]
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("No se pudieron consultar los datos operativos sectoriales.")
        raise HTTPException(status_code=503, detail="No se pudieron consultar los datos operativos sectoriales.") from error


@app.get("/api/datasets/imported")
def get_imported_datasets(_: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    try:
        datasets = database.load_imported_data()
        return {
            "registries": datasets.get("registryData"),
            "environmental": datasets.get("environmentalData"),
            "prices": datasets.get("priceObservations"),
        }
    except Exception as error:
        logger.exception("No se pudieron consultar los nuevos conjuntos de datos importados.")
        raise HTTPException(status_code=503, detail="No se pudieron consultar los conjuntos de datos importados.") from error


@app.get("/api/source-files")
def get_source_files(_: dict[str, Any] = Depends(get_current_user)) -> list[dict[str, Any]]:
    try:
        return database.list_source_files()
    except Exception as error:
        logger.exception("No se pudo consultar el catálogo de fuentes en PostgreSQL.")
        raise HTTPException(status_code=503, detail="No se pudo consultar el catálogo de fuentes.") from error


@app.get("/api/source-files/{file_name}")
def download_source_file(
    file_name: str,
    user: dict[str, Any] = Depends(get_current_user),
) -> Response:
    try:
        source = database.get_source_file(file_name)
        if not source:
            raise HTTPException(status_code=404, detail="No se encontró el archivo fuente solicitado.")
        _append_access_event(
            username=user["username"],
            role=user["role"],
            action="Consulta de fuente",
            resource=file_name,
            result="Permitido",
        )
        disposition = "inline" if source["fileType"] == "pdf" else "attachment"
        headers = {
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(source['fileName'])}",
            "Content-Length": str(source["sizeBytes"]),
            "X-Content-Type-Options": "nosniff",
        }
        return Response(
            content=source["content"],
            media_type=source["mediaType"],
            headers=headers,
        )
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("No se pudo entregar el archivo fuente desde PostgreSQL.")
        raise HTTPException(status_code=503, detail="No se pudo consultar el archivo fuente.") from error


@app.get("/api/source-files/{file_name}/preview")
def preview_source_file(
    file_name: str,
    sheet: str | None = Query(default=None, max_length=128),
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    try:
        preview = database.preview_source_file(file_name, sheet)
        if preview is None:
            raise HTTPException(status_code=404, detail="No se encontró el archivo fuente solicitado.")
        _append_access_event(
            username=user["username"],
            role=user["role"],
            action="Vista previa de fuente",
            resource=file_name,
            result="Permitido",
        )
        return preview
    except HTTPException:
        raise
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        logger.exception("No se pudo generar la vista previa de la fuente.")
        raise HTTPException(status_code=503, detail="No se pudo consultar la vista previa de la fuente.") from error


@app.post("/api/auth/login")
def login(credentials: LoginRequest) -> dict[str, Any]:
    username = credentials.username.strip().lower()
    try:
        login_failed = False
        with database.connection() as conn:
            account = conn.execute(
                "SELECT * FROM managed_users WHERE username = %s",
                (username,),
            ).fetchone()
            if not account or not account["active"] or not database.verify_password(credentials.password, account["password_hash"]):
                conn.execute(
                    """
                    INSERT INTO access_events (username, role, action, resource, result)
                    VALUES (%s, %s, 'Inicio de sesión', 'Autenticación', 'Denegado')
                    """,
                    (username or "desconocido", account["role"] if account else "No autenticado"),
                )
                login_failed = True
            else:
                token = uuid.uuid4().hex + uuid.uuid4().hex
                conn.execute("DELETE FROM auth_sessions WHERE expires_at <= now()")
                conn.execute(
                    "INSERT INTO auth_sessions (token_hash, username, expires_at) VALUES (%s, %s, %s)",
                    (
                        database.token_digest(token),
                        username,
                        datetime.now(timezone.utc) + database.SESSION_TTL,
                    ),
                )
                conn.execute(
                    """
                    INSERT INTO access_events (username, role, action, resource, result)
                    VALUES (%s, %s, 'Inicio de sesión', 'Autenticación', 'Permitido')
                    """,
                    (username, account["role"]),
                )
        if login_failed:
            raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")
        return {"token": token, "user": database.public_user(account)}
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("No se pudo completar el inicio de sesión.")
        raise HTTPException(status_code=503, detail="No se pudo completar el inicio de sesión.") from error


@app.get("/api/auth/session")
def get_session(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    return {"user": database.public_user(user)}


@app.post("/api/auth/logout")
def logout(
    authorization: str | None = Header(default=None),
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, bool]:
    token = authorization.removeprefix("Bearer ").strip() if authorization else ""
    try:
        with database.connection() as conn:
            conn.execute("DELETE FROM auth_sessions WHERE token_hash = %s", (database.token_digest(token),))
            conn.execute(
                """
                INSERT INTO access_events (username, role, action, resource, result)
                VALUES (%s, %s, 'Cierre de sesión', 'Autenticación', 'Permitido')
                """,
                (user["username"], user["role"]),
            )
    except Exception as error:
        logger.exception("No se pudo cerrar la sesión en PostgreSQL.")
        raise HTTPException(status_code=503, detail="No se pudo cerrar la sesión.") from error
    return {"ok": True}


@app.get("/api/users")
def get_users(_: dict[str, Any] = Depends(get_supervisor)) -> list[dict[str, Any]]:
    try:
        with database.connection() as conn:
            rows = conn.execute("SELECT * FROM managed_users ORDER BY username").fetchall()
        return [database.public_user(row) for row in rows]
    except Exception as error:
        logger.exception("No se pudieron consultar los usuarios.")
        raise HTTPException(status_code=503, detail="No se pudieron consultar los usuarios.") from error


@app.post("/api/users", status_code=201)
def create_user(
    request: NewUserRequest,
    current_user: dict[str, Any] = Depends(get_supervisor),
) -> dict[str, Any]:
    username = request.username.strip().lower()
    try:
        with database.connection() as conn:
            row = conn.execute(
                """
                INSERT INTO managed_users (username, display_name, password_hash, role, permissions)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (username) DO NOTHING
                RETURNING *
                """,
                (
                    username,
                    request.name.strip(),
                    database.hash_password(request.password),
                    request.role,
                    Jsonb(database.PERMISSIONS_BY_ROLE[request.role]),
                ),
            ).fetchone()
            if not row:
                raise HTTPException(status_code=409, detail="El usuario ya existe.")
            conn.execute(
                """
                INSERT INTO access_events (username, role, action, resource, result)
                VALUES (%s, %s, 'Creación de usuario', %s, 'Permitido')
                """,
                (current_user["username"], current_user["role"], username),
            )
        return database.public_user(row)
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("No se pudo crear el usuario.")
        raise HTTPException(status_code=503, detail="No se pudo crear el usuario.") from error


@app.patch("/api/users/{username}")
def update_user(
    username: str,
    request: UserUpdateRequest,
    current_user: dict[str, Any] = Depends(get_supervisor),
) -> dict[str, Any]:
    updates = request.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=422, detail="No se enviaron campos para actualizar.")
    if "name" in updates:
        updates["display_name"] = updates.pop("name").strip()
        if not updates["display_name"]:
            raise HTTPException(status_code=422, detail="El nombre no puede estar vacío.")
    if "role" in updates and "permissions" not in updates:
        updates["permissions"] = database.PERMISSIONS_BY_ROLE[updates["role"]]
    if "permissions" in updates:
        allowed_permissions = {"dashboard", "riesgos", "auditoria", "trazabilidad", "cumplimiento", "reportes", "supervision"}
        if not set(updates["permissions"]).issubset(allowed_permissions):
            raise HTTPException(status_code=422, detail="La lista contiene permisos desconocidos.")
        updates["permissions"] = list(dict.fromkeys(updates["permissions"]))
    if updates.get("role") == "Supervisor de Cumplimiento":
        updates["permissions"] = list(dict.fromkeys([*updates.get("permissions", []), "supervision"]))

    column_names = {"display_name": "display_name", "role": "role", "permissions": "permissions", "active": "active"}
    try:
        with database.connection() as conn:
            conn.execute("SELECT pg_advisory_xact_lock(684257139)")
            current = conn.execute(
                "SELECT role, permissions FROM managed_users WHERE username = %s FOR UPDATE",
                (username,),
            ).fetchone()
            if not current:
                raise HTTPException(status_code=404, detail="No se encontró el usuario.")
            if updates.get("role", current["role"]) == "Supervisor de Cumplimiento":
                permissions = updates.get("permissions", current["permissions"])
                updates["permissions"] = list(dict.fromkeys([*permissions, "supervision"]))
            fields = [(column_names[key], value) for key, value in updates.items()]
            assignments = ", ".join(f"{column} = %s" for column, _ in fields)
            values = [Jsonb(value) if column == "permissions" else value for column, value in fields]
            row = conn.execute(
                f"UPDATE managed_users SET {assignments} WHERE username = %s RETURNING *",
                (*values, username),
            ).fetchone()
            if not row["active"] or row["role"] != "Supervisor de Cumplimiento":
                active_supervisor = conn.execute(
                    """
                    SELECT 1 FROM managed_users
                    WHERE active AND role = 'Supervisor de Cumplimiento'
                        AND permissions @> '["supervision"]'::jsonb
                    LIMIT 1
                    """
                ).fetchone()
                if not active_supervisor:
                    raise HTTPException(status_code=409, detail="Debe permanecer al menos un supervisor activo.")
            if not row["active"]:
                conn.execute("DELETE FROM auth_sessions WHERE username = %s", (username,))
            conn.execute(
                """
                INSERT INTO access_events (username, role, action, resource, result)
                VALUES (%s, %s, 'Actualización de usuario', %s, 'Permitido')
                """,
                (current_user["username"], current_user["role"], username),
            )
        return database.public_user(row)
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("No se pudo actualizar el usuario.")
        raise HTTPException(status_code=503, detail="No se pudo actualizar el usuario.") from error


@app.get("/api/access-events")
def get_access_events(user: dict[str, Any] = Depends(get_current_user)) -> list[dict[str, Any]]:
    try:
        with database.connection() as conn:
            if user["role"] == "Supervisor de Cumplimiento" and "supervision" in user["permissions"]:
                rows = conn.execute(
                    """
                    SELECT occurred_at, username, role, action, resource, result
                    FROM access_events ORDER BY occurred_at DESC, id DESC LIMIT 200
                    """
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT occurred_at, username, role, action, resource, result
                    FROM access_events WHERE username = %s
                    ORDER BY occurred_at DESC, id DESC LIMIT 200
                    """,
                    (user["username"],),
                ).fetchall()
        return [
            {
                "timestamp": row["occurred_at"].isoformat(),
                "username": row["username"],
                "role": row["role"],
                "action": row["action"],
                "resource": row["resource"],
                "result": row["result"],
            }
            for row in rows
        ]
    except Exception as error:
        logger.exception("No se pudieron consultar los eventos de acceso.")
        raise HTTPException(status_code=503, detail="No se pudieron consultar los eventos de acceso.") from error


@app.post("/api/access-events", status_code=201)
def create_access_event(
    request: AccessEventRequest,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, bool]:
    try:
        _append_access_event(
            username=user["username"],
            role=user["role"],
            action=request.action,
            resource=request.resource,
            result=request.result,
        )
    except Exception as error:
        logger.exception("No se pudo guardar el evento de acceso.")
        raise HTTPException(status_code=503, detail="No se pudo guardar el evento de acceso.") from error
    return {"ok": True}


@app.delete("/api/access-events", status_code=204)
def clear_access_events(_: dict[str, Any] = Depends(get_supervisor)) -> None:
    try:
        with database.connection() as conn:
            conn.execute("DELETE FROM access_events")
    except Exception as error:
        logger.exception("No se pudieron limpiar los eventos de acceso.")
        raise HTTPException(status_code=503, detail="No se pudieron limpiar los eventos de acceso.") from error


def _classify_route_simulation(request: RiskSimulationRequest) -> dict[str, Any]:
    delay_points = 35 if request.delay_hours > 8 else 25 if request.delay_hours > 4 else 15 if request.delay_hours > 2 else 5 if request.delay_hours > 0 else 0
    incident_points = min(request.incident_count * 15, 30)
    environmental_points = 35 if request.environmental_alert else 0
    score = min(delay_points + incident_points + environmental_points, 100)
    risk_level = "Crítico" if score >= 75 else "Alto" if score >= 50 else "Medio" if score >= 25 else "Bajo"
    factors = [
        {"name": "Retraso simulado", "observation": f"{request.delay_hours:g} horas", "points": delay_points},
        {"name": "Incidentes reportados", "observation": str(request.incident_count), "points": incident_points},
        {"name": "Alerta ambiental", "observation": "Sí" if request.environmental_alert else "No", "points": environmental_points},
    ]
    return {"score": score, "riskLevel": risk_level, "factors": factors}


@app.get("/api/ai-governance/controls")
def get_ai_governance_controls(
    scope: Literal["todos", "demanda", "vial"] = Query(default="todos"),
    user: dict[str, Any] = Depends(get_current_user),
) -> list[dict[str, Any]]:
    if not {"cumplimiento", "dashboard", "riesgos"}.intersection(user["permissions"]):
        raise HTTPException(status_code=403, detail="No tienes permiso para consultar los controles de gobernanza de IA.")
    try:
        return database.list_ai_governance_controls(scope)
    except Exception as error:
        logger.exception("No se pudieron consultar los controles de gobernanza de IA.")
        raise HTTPException(status_code=503, detail="No se pudieron consultar los controles en PostgreSQL.") from error


@app.patch("/api/ai-governance/controls/{control_id}")
def update_ai_governance_control(
    control_id: str,
    request: AIGovernanceControlUpdate,
    user: dict[str, Any] = Depends(get_supervisor),
) -> dict[str, Any]:
    evidence = request.evidence.strip()
    if request.status == "conforme" and not evidence:
        raise HTTPException(status_code=422, detail="Registra evidencia antes de marcar un control como conforme.")
    try:
        control = database.update_ai_governance_control(
            control_id, request.status, evidence, user["username"]
        )
    except Exception as error:
        logger.exception("No se pudo guardar la evaluaciÃ³n del control de gobernanza %s.", control_id)
        raise HTTPException(status_code=503, detail="No se pudo guardar la evaluaciÃ³n del control.") from error
    if not control:
        raise HTTPException(status_code=404, detail="No se encontrÃ³ el control de gobernanza solicitado.")
    return control


def _require_ai_evidence_read_access(user: dict[str, Any]) -> None:
    if not {"cumplimiento", "dashboard", "riesgos"}.intersection(user["permissions"]):
        raise HTTPException(status_code=403, detail="No tienes permiso para consultar las evidencias de gobernanza.")


@app.get("/api/ai-governance/evidence")
def get_ai_governance_evidence(
    control_id: str | None = Query(default=None, max_length=120),
    user: dict[str, Any] = Depends(get_current_user),
) -> list[dict[str, Any]]:
    _require_ai_evidence_read_access(user)
    try:
        return database.list_ai_governance_evidence_files(control_id)
    except Exception as error:
        logger.exception("No se pudieron consultar los archivos de evidencia AI TRiSM.")
        raise HTTPException(status_code=503, detail="No se pudieron consultar los archivos de evidencia.") from error


@app.post("/api/ai-governance/controls/{control_id}/evidence", status_code=201)
async def upload_ai_governance_evidence(
    control_id: str,
    file: UploadFile = File(...),
    user: dict[str, Any] = Depends(get_supervisor),
) -> dict[str, Any]:
    original_name = (file.filename or "").replace("\\", "/").rsplit("/", 1)[-1].strip()
    extension = Path(original_name).suffix.lower()
    media_type = AI_EVIDENCE_MEDIA_TYPES.get(extension)
    if not original_name or len(original_name) > 255 or not media_type:
        await file.close()
        raise HTTPException(status_code=415, detail="Formato de evidencia no admitido. Usa PDF, Word, Excel, CSV, TXT, PNG o JPG.")
    content = await file.read(MAX_AI_EVIDENCE_BYTES + 1)
    await file.close()
    if not content:
        raise HTTPException(status_code=422, detail="El archivo está vacío.")
    if len(content) > MAX_AI_EVIDENCE_BYTES:
        raise HTTPException(status_code=413, detail="El tamaño máximo por archivo es 10 MB.")
    checksum = hashlib.sha256(content).hexdigest()
    try:
        saved = database.save_ai_governance_evidence_file(
            evidence_id=str(uuid.uuid4()),
            control_id=control_id,
            file_name=original_name,
            media_type=media_type,
            content=content,
            checksum=checksum,
            username=user["username"],
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        logger.exception("No se pudo guardar el archivo de evidencia para el control %s.", control_id)
        raise HTTPException(status_code=503, detail="No se pudo guardar el archivo de evidencia en PostgreSQL.") from error
    if not saved:
        raise HTTPException(status_code=404, detail="No se encontró el control de gobernanza solicitado.")
    return saved


@app.get("/api/ai-governance/evidence/{evidence_id}/download")
def download_ai_governance_evidence(
    evidence_id: str,
    user: dict[str, Any] = Depends(get_current_user),
) -> Response:
    _require_ai_evidence_read_access(user)
    try:
        evidence = database.get_ai_governance_evidence_file(evidence_id)
    except Exception as error:
        logger.exception("No se pudo leer el archivo de evidencia %s.", evidence_id)
        raise HTTPException(status_code=503, detail="No se pudo consultar el archivo de evidencia.") from error
    if not evidence:
        raise HTTPException(status_code=404, detail="No se encontró el archivo de evidencia solicitado.")
    _append_access_event(
        username=user["username"],
        role=user["role"],
        action="Descarga de evidencia AI TRiSM",
        resource=f"{evidence['control_id']}/{evidence['file_name']}",
        result="Permitido",
    )
    headers = {
        "Content-Disposition": f"attachment; filename=\"evidence\"; filename*=UTF-8''{quote(evidence['file_name'])}",
        "Content-Length": str(evidence["size_bytes"]),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
    }
    return Response(content=evidence["content"], media_type=evidence["media_type"], headers=headers)


def _ai_governance_alerts() -> list[dict[str, Any]]:
    """Derive technical review alerts from persisted model evidence; never persist a risk automatically."""
    alerts: list[dict[str, Any]] = []
    demand_model_name = "XGBoost · Predicción de demanda de combustibles líquidos"
    latest = database.load_demand_model_run()
    if not latest:
        return [{
            "id": "demand-evaluation-pending",
            "modelName": demand_model_name,
            "category": "Evaluación pendiente",
            "description": "No hay una evaluación persistida del modelo de demanda para revisar su desempeño y controles.",
            "evidence": "PostgreSQL: demand_model_runs no contiene una evaluación disponible.",
            "likelihood": 3,
            "impact": 3,
            "treatment": "Entrenar y evaluar el modelo con la fuente vigente antes de utilizar pronósticos.",
        }]

    result = latest["result"]
    metrics = result.get("metrics") or {}
    xgboost_metrics = metrics.get("xgboost") or {}
    baseline_metrics = metrics.get("baseline") or {}
    run_id = result.get("runId", latest["id"])
    evaluated_at = result.get("trainedAt", "fecha no disponible")
    evidence_prefix = f"Evaluación {run_id} · {evaluated_at}."

    try:
        _, _, current_checksum, _, _ = _load_demand_model_sources()
        if current_checksum != latest["source_checksum"]:
            alerts.append({
                "id": f"demand-source-changed-{run_id}",
                "modelName": demand_model_name,
                "category": "Cambio de fuente",
                "description": "La fuente actual cambió después de la evaluación guardada; las métricas y pronósticos requieren reentrenamiento.",
                "evidence": f"{evidence_prefix} Checksum de evaluación distinto al checksum actual de las fuentes.",
                "likelihood": 4,
                "impact": 4,
                "treatment": "Revisar cambios en las fuentes, entrenar de nuevo y comparar las métricas con el baseline.",
            })
    except (FileNotFoundError, ValueError) as error:
        alerts.append({
            "id": f"demand-source-verification-{run_id}",
            "modelName": demand_model_name,
            "category": "Verificación de fuente",
            "description": "No se pudo verificar si las fuentes usadas por el modelo siguen vigentes.",
            "evidence": f"{evidence_prefix} Error al verificar fuentes: {error}",
            "likelihood": 3,
            "impact": 3,
            "treatment": "Corregir la disponibilidad o formato de la fuente y repetir la evaluación.",
        })

    r2 = xgboost_metrics.get("r2")
    if isinstance(r2, (int, float)) and r2 < 0.6:
        alerts.append({
            "id": f"demand-r2-low-{run_id}",
            "modelName": demand_model_name,
            "category": "Desempeño predictivo",
            "description": f"El R² de la evaluación temporal es {r2:.3f}, por debajo de la referencia inicial de 0.60.",
            "evidence": f"{evidence_prefix} R² XGBoost={r2:.6f}; periodo de prueba={result.get('evaluationPeriod')}.",
            "likelihood": 4,
            "impact": 4,
            "treatment": "Revisar cobertura, variables, partición temporal y desempeño frente al baseline antes de usar el pronóstico.",
        })

    reduction = metrics.get("errorReductionPercent")
    if isinstance(reduction, (int, float)) and reduction <= 0:
        alerts.append({
            "id": f"demand-baseline-not-improved-{run_id}",
            "modelName": demand_model_name,
            "category": "Comparación con baseline",
            "description": "XGBoost no redujo el MAE frente al baseline estacional en la evaluación temporal.",
            "evidence": f"{evidence_prefix} MAE XGBoost={xgboost_metrics.get('mae')}; MAE baseline={baseline_metrics.get('mae')}; reducción={reduction:.4f}%.",
            "likelihood": 4,
            "impact": 3,
            "treatment": "Revisar variables y configuración; conservar el baseline como referencia hasta demostrar una mejora reproducible.",
        })

    explanation = ((result.get("explainability") or {}).get("evaluation") or {})
    if explanation.get("status") != "available":
        alerts.append({
            "id": f"demand-explainability-{run_id}",
            "modelName": demand_model_name,
            "category": "Explicabilidad",
            "description": "La evaluación guardada no tiene una explicación SHAP disponible.",
            "evidence": f"{evidence_prefix} Estado de explicabilidad={explanation.get('status', 'no registrado')}; motivo={explanation.get('reason', 'no disponible')}.",
            "likelihood": 3,
            "impact": 3,
            "treatment": "Corregir el cálculo de explicabilidad y repetir la evaluación antes de presentar factores como explicaciones del modelo.",
        })
    return alerts


@app.get("/api/ai-governance/alerts")
def get_ai_governance_alerts(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if "riesgos" not in user["permissions"]:
        raise HTTPException(status_code=403, detail="No tienes permiso para consultar alertas de riesgos de IA.")
    try:
        alerts = _ai_governance_alerts()
        return {"alerts": alerts, "generatedAt": datetime.now(timezone.utc).isoformat()}
    except Exception as error:
        logger.exception("No se pudieron generar las alertas de gobernanza de IA.")
        raise HTTPException(status_code=503, detail="No se pudieron generar las alertas técnicas de los modelos.") from error


@app.get("/api/ai-governance/risks")
def get_ai_governance_risks(user: dict[str, Any] = Depends(get_current_user)) -> list[dict[str, Any]]:
    if "riesgos" not in user["permissions"]:
        raise HTTPException(status_code=403, detail="No tienes permiso para consultar el registro de riesgos de IA.")
    try:
        return database.list_ai_governance_risks()
    except Exception as error:
        logger.exception("No se pudo consultar el registro de riesgos de gobernanza de IA.")
        raise HTTPException(status_code=503, detail="No se pudo consultar el registro en PostgreSQL.") from error


@app.post("/api/ai-governance/risks", status_code=201)
def create_ai_governance_risk(
    request: AIGovernanceRiskCreate,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    if "riesgos" not in user["permissions"]:
        raise HTTPException(status_code=403, detail="No tienes permiso para registrar riesgos de IA.")
    if request.data_basis == "observado" and not request.evidence.strip():
        raise HTTPException(status_code=422, detail="Un riesgo con base observada requiere registrar la fuente de evidencia.")
    risk = {
        "id": str(uuid.uuid4()),
        "modelName": request.model_name.strip(),
        "category": request.category.strip(),
        "description": request.description.strip(),
        "dataBasis": request.data_basis,
        "evidence": request.evidence.strip(),
        "likelihood": request.likelihood,
        "impact": request.impact,
        "owner": request.owner.strip(),
        "treatment": request.treatment.strip(),
    }
    try:
        return database.create_ai_governance_risk(risk, user["username"])
    except Exception as error:
        logger.exception("No se pudo registrar el riesgo de gobernanza de IA.")
        raise HTTPException(status_code=503, detail="No se pudo registrar el riesgo en PostgreSQL.") from error


@app.patch("/api/ai-governance/risks/{risk_id}")
def update_ai_governance_risk(
    risk_id: str,
    request: AIGovernanceRiskUpdate,
    user: dict[str, Any] = Depends(get_supervisor),
) -> dict[str, Any]:
    try:
        risk = database.update_ai_governance_risk(risk_id, request.status, request.treatment.strip(), user["username"])
    except Exception as error:
        logger.exception("No se pudo actualizar el riesgo de gobernanza %s.", risk_id)
        raise HTTPException(status_code=503, detail="No se pudo actualizar el riesgo en PostgreSQL.") from error
    if not risk:
        raise HTTPException(status_code=404, detail="No se encontró el riesgo solicitado.")
    return risk


@app.get("/api/risk-assessments")
def get_risk_assessments(user: dict[str, Any] = Depends(get_current_user)) -> list[dict[str, Any]]:
    if "riesgos" not in user["permissions"]:
        raise HTTPException(status_code=403, detail="No tienes permiso para consultar evaluaciones de riesgo.")
    try:
        return database.list_risk_assessments()
    except Exception as error:
        logger.exception("No se pudieron consultar las evaluaciones de riesgo.")
        raise HTTPException(status_code=503, detail="No se pudieron consultar las evaluaciones de riesgo en PostgreSQL.") from error


@app.post("/api/risk-assessments/simulations", status_code=201)
def create_risk_simulation(
    request: RiskSimulationRequest,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    if "riesgos" not in user["permissions"]:
        raise HTTPException(status_code=403, detail="No tienes permiso para registrar evaluaciones de riesgo.")
    scenario_name = request.scenario_name.strip()
    if len(scenario_name) < 3:
        raise HTTPException(status_code=422, detail="El nombre del escenario debe tener al menos 3 caracteres.")
    result = _classify_route_simulation(request)
    assessment = {
        "id": str(uuid.uuid4()),
        "scenarioName": scenario_name,
        "inputs": {
            "delayHours": request.delay_hours,
            "incidentCount": request.incident_count,
            "environmentalAlert": request.environmental_alert,
        },
        **result,
        "createdBy": user["username"],
        "createdByRole": user["role"],
    }
    try:
        return database.save_risk_assessment(assessment)
    except Exception as error:
        logger.exception("No se pudo registrar la simulación de riesgo.")
        raise HTTPException(status_code=503, detail="No se pudo guardar la evaluación en PostgreSQL.") from error


@app.get("/api/risk-model/road-impact")
def get_road_impact_model(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if "riesgos" not in user["permissions"]:
        raise HTTPException(status_code=403, detail="No tienes permiso para consultar el modelo de riesgo.")
    return risk_model.model_status(IMPORTS_PATH)


@app.post("/api/risk-model/road-impact/predict")
def predict_road_impact(
    request: RoadImpactRequest,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    if "riesgos" not in user["permissions"]:
        raise HTTPException(status_code=403, detail="No tienes permiso para evaluar el impacto vial.")
    try:
        return risk_model.predict_road_state(IMPORTS_PATH, request.model_dump(by_alias=True))
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="No se encontró el CSV MTC requerido en imports.") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        logger.exception("No se pudo evaluar el impacto vial con XGBoost.")
        raise HTTPException(status_code=503, detail="No se pudo evaluar el impacto vial con XGBoost.") from error


@app.get("/api/generated-reports")
def get_generated_reports(user: dict[str, Any] = Depends(get_current_user)) -> list[dict[str, Any]]:
    if "reportes" not in user["permissions"]:
        raise HTTPException(status_code=403, detail="No tienes permiso para consultar reportes.")
    try:
        with database.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM generated_reports ORDER BY created_at DESC LIMIT 500"
            ).fetchall()
        return [_public_report(row) for row in rows]
    except Exception as error:
        logger.exception("No se pudo consultar el historial de reportes.")
        raise HTTPException(status_code=503, detail="No se pudo consultar el historial de reportes.") from error


@app.post("/api/generated-reports", status_code=201)
async def save_generated_report(
    request: Request,
    name: str = Query(min_length=1, max_length=200, alias="nombre"),
    report_type: str = Query(min_length=1, max_length=100, alias="tipo"),
    period: str = Query(min_length=1, max_length=100, alias="periodo"),
    sections: str = Query(default="[]", max_length=10000, alias="secciones"),
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    if report_type not in database.REPORT_TYPES_BY_ROLE.get(user["role"], []):
        raise HTTPException(status_code=403, detail="No tienes permiso para generar este tipo de reporte.")
    if "reportes" not in user["permissions"]:
        raise HTTPException(status_code=403, detail="No tienes permiso para generar reportes.")
    try:
        section_list = json.loads(sections)
        if not isinstance(section_list, list) or not all(isinstance(section, str) for section in section_list):
            raise ValueError("Las secciones deben ser una lista de texto.")
    except (json.JSONDecodeError, ValueError) as error:
        raise HTTPException(status_code=422, detail="El formato de secciones es inválido.") from error

    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    extensions = {"application/pdf": ".pdf", "application/zip": ".zip", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx"}
    extension = extensions.get(content_type)
    if extension is None:
        raise HTTPException(status_code=415, detail="Formato de reporte no compatible.")
    body = await request.body()
    if not body:
        raise HTTPException(status_code=422, detail="El archivo de reporte está vacío.")

    report_id = str(uuid.uuid4())
    file_name = f"{report_id}{extension}"
    file_path = database.REPORTS_PATH / file_name
    try:
        file_path.write_bytes(body)
        with database.connection() as conn:
            row = conn.execute(
                """
                INSERT INTO generated_reports
                    (id, file_name, name, report_type, period, username, role, sections, size_bytes)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    report_id, file_name, name, report_type, period, user["username"], user["role"],
                    Jsonb(section_list), len(body),
                ),
            ).fetchone()
            conn.execute(
                """
                INSERT INTO access_events (username, role, action, resource, result)
                VALUES (%s, %s, 'Generación de reporte', %s, 'Permitido')
                """,
                (user["username"], user["role"], f"{report_type} · {period}"),
            )
        return _public_report(row)
    except Exception as error:
        file_path.unlink(missing_ok=True)
        logger.exception("No se pudo persistir el reporte generado.")
        raise HTTPException(status_code=503, detail="No se pudo guardar el reporte en PostgreSQL.") from error


@app.get("/api/generated-reports/{report_id}")
def download_generated_report(
    report_id: str,
    download: bool = False,
    user: dict[str, Any] = Depends(get_current_user),
) -> FileResponse:
    if "reportes" not in user["permissions"]:
        raise HTTPException(status_code=403, detail="No tienes permiso para consultar reportes.")
    try:
        with database.connection() as conn:
            report = conn.execute("SELECT * FROM generated_reports WHERE id = %s", (report_id,)).fetchone()
        if not report:
            raise HTTPException(status_code=404, detail="No se encontró el reporte solicitado.")
        file_path = database.REPORTS_PATH / report["file_name"]
        if not file_path.is_file():
            raise HTTPException(status_code=404, detail="El archivo del reporte ya no está disponible.")
        disposition = "attachment" if download else "inline"
        return FileResponse(file_path, filename=report["file_name"], content_disposition_type=disposition)
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("No se pudo consultar el archivo del reporte.")
        raise HTTPException(status_code=503, detail="No se pudo consultar el archivo del reporte.") from error


def _run_demand_model(user: dict[str, Any], operation: str) -> dict[str, Any]:
    started_at = time.perf_counter()
    succeeded = False
    try:
        monthly, quality, checksum, external_features, feature_errors = _load_demand_model_sources()
        trained = demand_model.train_and_evaluate(
            monthly,
            source_checksum=checksum,
            quality=quality,
            external_features=external_features,
            feature_errors=feature_errors,
            imports_path=IMPORTS_PATH,
        )
        result = trained.public_result
        database.save_demand_model_run(result, trained.model_artifact, user["username"])
        _persist_forecast_prediction(
            run=result,
            period=result["forecast"]["period"],
            value=result["forecast"]["value"],
            explanation=result["explainability"]["forecast"],
            username=user["username"],
        )
        succeeded = True
        return result
    except FileNotFoundError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("No se pudo completar la operación del modelo de demanda.")
        raise HTTPException(status_code=503, detail="No se pudo completar la operación del modelo de demanda.") from error
    finally:
        _record_demand_model_operation(operation, succeeded, started_at, user["username"])


@app.get("/api/demand-model/status")
def get_demand_model_status(_: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    try:
        latest = database.load_demand_model_run()
        if latest:
            result = dict(latest["result"])
            try:
                _, _, source_checksum, _, _ = _load_demand_model_sources()
                result["sourceIsCurrent"] = source_checksum == latest["source_checksum"]
                if not result["sourceIsCurrent"]:
                    result["warnings"] = [
                        *(result.get("warnings") or []),
                        "La fuente cambió después de la evaluación; entrena de nuevo antes de generar predicciones.",
                    ]
            except (FileNotFoundError, ValueError) as error:
                result["sourceIsCurrent"] = False
                result["warnings"] = [
                    *(result.get("warnings") or []),
                    f"No se pudo validar la fuente actual: {error}",
                ]
            return result
        try:
            monthly, quality, _, _, feature_errors = _load_demand_model_sources()
            return {
                "status": "training_pending",
                "model": "XGBoost",
                "target": "Ventas mensuales observadas de combustibles líquidos",
                "source": demand_model.TARGET_SOURCE,
                "unit": demand_model.TARGET_UNIT,
                "coverage": {
                    "months": len(monthly),
                    "from": str(monthly.index[0]),
                    "to": str(monthly.index[-1]),
                },
                "dataQuality": quality,
                "dataSources": demand_model.assess_import_sources(
                    IMPORTS_PATH,
                    feature_errors=feature_errors,
                ),
                "metrics": None,
                "message": "Hay datos observados; falta ejecutar entrenamiento y evaluación.",
            }
        except (FileNotFoundError, ValueError) as error:
            return {
                "status": "data_unavailable",
                "model": "XGBoost",
                "target": "Ventas mensuales observadas de combustibles líquidos",
                "source": demand_model.TARGET_SOURCE,
                "unit": demand_model.TARGET_UNIT,
                "metrics": None,
                "message": str(error),
            }
    except Exception as error:
        logger.exception("No se pudo consultar el estado del modelo de demanda.")
        raise HTTPException(status_code=503, detail="No se pudo consultar el estado del modelo de demanda.") from error


@app.post("/api/demand-model/train")
def train_demand_model(user: dict[str, Any] = Depends(get_demand_model_analyst)) -> dict[str, Any]:
    return _run_demand_model(user, "train_and_evaluate")


@app.post("/api/demand-model/evaluate")
def evaluate_demand_model(user: dict[str, Any] = Depends(get_demand_model_analyst)) -> dict[str, Any]:
    return _run_demand_model(user, "evaluate")


@app.post("/api/demand-model/predict")
def predict_demand(
    request: DemandForecastRequest,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    started_at = time.perf_counter()
    succeeded = False
    try:
        saved_run = database.load_demand_model_run()
        if not saved_run:
            raise HTTPException(status_code=409, detail="Entrena y evalúa el modelo antes de generar predicciones.")
        monthly, _, checksum, external_features, _ = _load_demand_model_sources()
        if checksum != saved_run["source_checksum"]:
            raise HTTPException(
                status_code=409,
                detail="Las fuentes de demanda o los archivos importados cambiaron desde el entrenamiento; vuelve a entrenar antes de predecir.",
            )
        result = saved_run["result"]
        model = demand_model.load_model(saved_run["model_artifact"])
        selected_sources = result.get("selectedSources") or []
        if len(selected_sources) > 1:
            raise HTTPException(status_code=503, detail="El modelo guardado contiene una selección de fuentes no compatible.")
        selected_source = selected_sources[0] if selected_sources else None
        predictions = demand_model.predict_horizon(
            model,
            monthly,
            request.horizon_months,
            external_features=external_features,
            selected_source=selected_source,
        )
        for prediction in predictions:
            _persist_forecast_prediction(
                run=result,
                period=prediction["period"],
                value=prediction["value"],
                explanation=prediction["explanation"],
                username=user["username"],
            )
        succeeded = True
        return {
            "runId": result["runId"],
            "modelVersion": result["modelVersion"],
            "source": result["source"],
            "sourcePeriod": result["coverage"]["to"],
            "predictions": predictions,
            "warnings": sorted({
                warning
                for prediction in predictions
                for warning in prediction.get("warnings", [])
            }),
        }
    except HTTPException:
        raise
    except (FileNotFoundError, ValueError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        logger.exception("No se pudo generar el pronóstico de demanda.")
        raise HTTPException(status_code=503, detail="No se pudo generar el pronóstico de demanda.") from error
    finally:
        _record_demand_model_operation("predict", succeeded, started_at, user["username"])


@app.get("/api/demand-model/history")
def get_demand_model_history(
    run_limit: int = Query(default=20, ge=1, le=100),
    prediction_limit: int = Query(default=100, ge=1, le=500),
    _: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    try:
        runs = [row["result"] for row in database.list_demand_model_runs(run_limit)]
        predictions = database.list_demand_model_predictions(prediction_limit)
        return {"runs": runs, "predictions": predictions}
    except Exception as error:
        logger.exception("No se pudo consultar el historial del modelo de demanda.")
        raise HTTPException(status_code=503, detail="No se pudo consultar el historial del modelo de demanda.") from error


@app.get("/api/demand-model/governance-metrics")
def get_demand_model_governance_metrics(_: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    try:
        latest = database.load_demand_model_run()
        governance_metrics = database.get_model_operation_metrics()
        predictive_metrics = latest["result"]["metrics"] if latest else None
        comparison_indicators = [
            {
                "metric": "MAE",
                "unit": latest["result"]["unit"] if latest else demand_model.TARGET_UNIT,
                "asIs": None,
                "toBe": predictive_metrics["xgboost"]["mae"] if predictive_metrics else None,
                "toBeStatus": "measured" if predictive_metrics else "pending",
            },
            {
                "metric": "Trazabilidad de predicciones",
                "unit": "%",
                "asIs": None,
                "toBe": governance_metrics["predictionTraceability"]["percent"],
                "toBeStatus": governance_metrics["predictionTraceability"]["status"],
            },
            {
                "metric": "Cumplimiento de controles",
                "unit": "%",
                "asIs": None,
                "toBe": governance_metrics["governanceControlsCompliance"]["percent"],
                "toBeStatus": governance_metrics["governanceControlsCompliance"]["status"],
            },
            {
                "metric": "Tiempo de detección de riesgos",
                "unit": "min",
                "asIs": None,
                "toBe": governance_metrics["riskDetectionTime"]["meanMinutes"],
                "toBeStatus": governance_metrics["riskDetectionTime"]["status"],
            },
            {
                "metric": "Cobertura de explicabilidad",
                "unit": "%",
                "asIs": None,
                "toBe": governance_metrics["explainabilityCoverage"]["percent"],
                "toBeStatus": governance_metrics["explainabilityCoverage"]["status"],
            },
        ]
        return {
            "predictiveMetrics": predictive_metrics,
            "evaluationPeriod": latest["result"]["evaluationPeriod"] if latest else None,
            "governanceAndSystem": governance_metrics,
            "comparison": {
                "status": "not_validated",
                "indicators": comparison_indicators,
                "reason": "No hay mediciones AS-IS verificables; los controles registrados son una autoevaluación y no acreditan certificación.",
            },
        }
    except Exception as error:
        logger.exception("No se pudieron consultar las métricas de gobernanza del modelo.")
        raise HTTPException(status_code=503, detail="No se pudieron consultar las métricas de gobernanza del modelo.") from error


@app.get("/api/forecasts")
def get_predictions(_: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    return build_predictions()


@app.get("/api/forecast")
def get_forecast(_: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    return build_forecast()


@app.get("/api/model-status")
def get_model_status(_: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    forecast = build_forecast()
    return {
        "model": forecast["model"],
        "status": "experimental",
        "target": forecast["target"],
        "source": forecast["source"],
        "coverage": forecast["coverage"],
        "forecast": forecast["forecast"],
        "validation": forecast["validation"],
        "warnings": forecast["warnings"],
        "lastUpdated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


# En Render, la misma API entrega el frontend ya compilado. En desarrollo local
# Vite continúa sirviendo la interfaz y esta ruta no se monta.
frontend_dist = os.environ.get("FRONTEND_DIST", "").strip()
if frontend_dist:
    frontend_path = Path(frontend_dist)
    if frontend_path.is_dir():
        app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
    else:
        logger.warning("FRONTEND_DIST no existe; la API se iniciarÃ¡ sin archivos estÃ¡ticos: %s", frontend_path)
