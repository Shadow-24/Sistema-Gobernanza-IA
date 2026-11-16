import re
import unittest
from pathlib import Path

from api import access_policy as policy, database, main as api_main

FRONTEND_REPORT_PERMISSIONS = Path(__file__).resolve().parents[1] / "src" / "app" / "reportPermissions.ts"


def user(role: str, permissions: list[str] | None = None) -> dict:
    return {"username": "u", "role": role, "permissions": permissions or policy.PERMISSIONS_BY_ROLE[role]}


class RoleMatrixTests(unittest.TestCase):
    def test_every_role_has_permissions_and_report_types(self) -> None:
        for role in policy.ROLES:
            self.assertTrue(policy.PERMISSIONS_BY_ROLE[role], role)
            self.assertTrue(policy.REPORT_TYPES_BY_ROLE[role], role)
        self.assertEqual(set(policy.PERMISSIONS_BY_ROLE), set(policy.ROLES))
        self.assertEqual(set(policy.REPORT_TYPES_BY_ROLE), set(policy.ROLES))

    def test_backend_modules_use_the_single_matrix(self) -> None:
        self.assertIs(database.PERMISSIONS_BY_ROLE, policy.PERMISSIONS_BY_ROLE)
        self.assertIs(database.REPORT_TYPES_BY_ROLE, policy.REPORT_TYPES_BY_ROLE)

    def test_every_report_type_requires_a_module_permission_its_roles_have_by_default(self) -> None:
        for role, report_types in policy.REPORT_TYPES_BY_ROLE.items():
            for report_type in report_types:
                permission = policy.REPORT_PERMISSION_BY_TYPE[report_type]
                self.assertIn(permission, policy.PERMISSIONS_BY_ROLE[role], f"{role} · {report_type}")

    def test_every_role_permission_is_assignable(self) -> None:
        # Cambiar el rol de una cuenta asigna los permisos del rol; no deben rechazarse.
        for role, permissions in policy.PERMISSIONS_BY_ROLE.items():
            self.assertTrue(set(permissions).issubset(policy.ALL_PERMISSIONS), role)

    def test_only_the_supervisor_can_supervise_and_manage_audit_and_compliance(self) -> None:
        for role in policy.ROLES:
            expected = role == policy.SUPERVISOR
            for action in ("supervise", "audit.manage", "compliance.manage"):
                self.assertEqual(policy.is_allowed(user(role), action), expected, (role, action))

    def test_supervisor_without_the_specific_permission_is_denied(self) -> None:
        limited = user(policy.SUPERVISOR, ["dashboard", "supervision"])
        self.assertTrue(policy.is_allowed(limited, "supervise"))
        self.assertFalse(policy.is_allowed(limited, "audit.manage"))
        self.assertFalse(policy.is_allowed(limited, "compliance.manage"))

    def test_only_analyst_and_supervisor_can_train_the_demand_model(self) -> None:
        allowed = {role for role in policy.ROLES if policy.is_allowed(user(role), "demand_model.train")}
        self.assertEqual(allowed, {policy.ANALISTA, policy.SUPERVISOR})

    def test_role_gated_actions_reference_known_roles_and_permissions(self) -> None:
        for name, rule in policy.ACTION_RULES.items():
            self.assertTrue((rule.roles or set()).issubset(policy.ROLES), name)
            if rule.permission:
                self.assertIn(rule.permission, policy.ALL_PERMISSIONS, name)

    def test_api_dependencies_deny_with_403(self) -> None:
        from fastapi import HTTPException

        with self.assertRaises(HTTPException) as error:
            api_main.get_audit_manager(user(policy.INGENIERO))
        self.assertEqual(error.exception.status_code, 403)
        self.assertEqual(api_main.get_supervisor(user(policy.SUPERVISOR))["role"], policy.SUPERVISOR)


class FrontendMatrixSyncTests(unittest.TestCase):
    @unittest.skipUnless(FRONTEND_REPORT_PERMISSIONS.is_file(), "reportPermissions.ts no está disponible.")
    def test_frontend_report_types_match_the_backend_matrix(self) -> None:
        source = FRONTEND_REPORT_PERMISSIONS.read_text(encoding="utf-8")
        block = source[source.index("REPORT_TYPES_BY_ROLE"):source.index("export function canGenerateReport(")]
        parsed: dict[str, list[str]] = {}
        for role_match in re.finditer(r'"([^"]+)":\s*\[(.*?)\]', block, re.S):
            parsed[role_match.group(1)] = re.findall(r'"([^"]+)"', role_match.group(2))
        self.assertEqual(parsed, policy.REPORT_TYPES_BY_ROLE)

    @unittest.skipUnless(FRONTEND_REPORT_PERMISSIONS.is_file(), "reportPermissions.ts no está disponible.")
    def test_frontend_report_module_permissions_match_the_backend(self) -> None:
        source = FRONTEND_REPORT_PERMISSIONS.read_text(encoding="utf-8")
        block = source[source.index("REPORT_PERMISSION_BY_TYPE"):source.index("export function canGenerateReportWithPermissions(")]
        parsed = dict(re.findall(r'"([^"]+)":\s*"([^"]+)"', block))
        self.assertEqual(parsed, policy.REPORT_PERMISSION_BY_TYPE)
