"""Matriz única de roles, permisos y acciones restringidas.

Es la fuente de verdad del control de acceso del backend. `api.main` y
`api.database` importan de aquí; ningún otro módulo debe redefinir roles,
permisos ni tipos de reporte permitidos. `src/app/reportPermissions.ts` replica
`REPORT_TYPES_BY_ROLE` para la interfaz y un test verifica que ambas coincidan.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

GERENTE = "Gerente de Operaciones"
ANALISTA = "Analista de Datos"
SUPERVISOR = "Supervisor de Cumplimiento"
INGENIERO = "Ingeniero de Campo"

ROLES = (GERENTE, ANALISTA, SUPERVISOR, INGENIERO)

PERMISSIONS_BY_ROLE: dict[str, list[str]] = {
    GERENTE: ["dashboard", "trazabilidad", "reportes", "fuentes"],
    ANALISTA: ["dashboard", "riesgos", "trazabilidad", "reportes", "fuentes"],
    SUPERVISOR: [
        "dashboard", "riesgos", "auditoria", "trazabilidad",
        "cumplimiento", "reportes", "supervision", "fuentes",
    ],
    INGENIERO: ["dashboard", "riesgos", "trazabilidad", "reportes", "fuentes"],
}

# Todos los permisos que se pueden asignar a una cuenta.
ALL_PERMISSIONS = frozenset(
    permission for permissions in PERMISSIONS_BY_ROLE.values() for permission in permissions
)

REPORT_TYPES_BY_ROLE: dict[str, list[str]] = {
    GERENTE: ["Dashboard Ejecutivo", "Reporte de Trazabilidad"],
    ANALISTA: ["Dashboard Ejecutivo", "Reporte de Riesgos", "Reporte de Trazabilidad"],
    SUPERVISOR: [
        "Dashboard Ejecutivo", "Reporte de Cumplimiento", "Reporte de Riesgos",
        "Reporte de Auditoría", "Reporte de Trazabilidad",
    ],
    INGENIERO: ["Dashboard Ejecutivo", "Reporte de Riesgos", "Reporte de Trazabilidad"],
}

# Permiso de módulo que exige cada tipo de reporte, además del rol y de `reportes`.
# `src/app/reportPermissions.ts` replica este mapa para la interfaz.
REPORT_PERMISSION_BY_TYPE: dict[str, str] = {
    "Dashboard Ejecutivo": "dashboard",
    "Reporte de Riesgos": "riesgos",
    "Reporte de Trazabilidad": "trazabilidad",
    "Reporte de Cumplimiento": "cumplimiento",
    "Reporte de Auditoría": "auditoria",
}


@dataclass(frozen=True)
class ActionRule:
    """Quién puede ejecutar una acción restringida.

    `roles`: roles permitidos (None = cualquiera). `permission`: permiso exigido
    además del rol (None = ninguno). `message`: detalle del HTTP 403.
    """

    roles: frozenset[str] | None
    permission: str | None
    message: str


ACTION_RULES: dict[str, ActionRule] = {
    "supervise": ActionRule(
        frozenset({SUPERVISOR}), "supervision",
        "Se requiere el rol Supervisor de Cumplimiento.",
    ),
    "audit.manage": ActionRule(
        frozenset({SUPERVISOR}), "auditoria",
        "Se requiere el rol Supervisor de Cumplimiento con permiso de auditoría.",
    ),
    "compliance.manage": ActionRule(
        frozenset({SUPERVISOR}), "cumplimiento",
        "Se requiere el rol Supervisor de Cumplimiento con permiso de Cumplimiento.",
    ),
    "demand_model.train": ActionRule(
        frozenset({ANALISTA, SUPERVISOR}), None,
        "Se requiere el rol Analista de Datos o Supervisor de Cumplimiento.",
    ),
}


def has_permission(user: dict[str, Any], permission: str) -> bool:
    return permission in user["permissions"]


def has_any_permission(user: dict[str, Any], permissions: set[str] | frozenset[str]) -> bool:
    return bool(set(permissions).intersection(user["permissions"]))


def is_allowed(user: dict[str, Any], action: str) -> bool:
    rule = ACTION_RULES[action]
    if rule.roles is not None and user["role"] not in rule.roles:
        return False
    return rule.permission is None or has_permission(user, rule.permission)
