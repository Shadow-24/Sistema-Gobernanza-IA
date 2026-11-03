import json
import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from api import database, main as api_main


class ComplianceFollowupTests(unittest.TestCase):
    def test_followup_changes_are_saved_as_one_timeline_event(self) -> None:
        connection_context = MagicMock()
        connection = connection_context.__enter__.return_value
        expected = {
            "item_id": "NORM-03",
            "item_type": "normativa",
            "status": "En curso",
            "phase": "Plan de acción",
            "responsible": "ana",
            "notes": "Revisar los pendientes",
            "updated_by": "supervisor",
        }
        connection.execute.side_effect = [
            MagicMock(fetchone=MagicMock(return_value=None)),
            MagicMock(fetchone=MagicMock(return_value={"username": "ana"})),
            MagicMock(fetchone=MagicMock(return_value=expected)),
            MagicMock(),
        ]

        with patch.object(database, "connection", return_value=connection_context):
            result = database.update_compliance_followup(
                "NORM-03",
                "normativa",
                "En curso",
                "Plan de acción",
                "ana",
                "Revisar los pendientes",
                "supervisor",
            )

        self.assertEqual(result, expected)
        event_insert = connection.execute.call_args_list[-1]
        self.assertIn("INSERT INTO compliance_followup_events", event_insert.args[0])
        changes = json.loads(event_insert.args[1][1])["changes"]
        self.assertEqual(
            [change["field"] for change in changes],
            ["status", "phase", "responsible", "notes"],
        )

    def test_followup_rejects_assignee_without_compliance_permission(self) -> None:
        connection_context = MagicMock()
        connection = connection_context.__enter__.return_value
        connection.execute.side_effect = [
            MagicMock(fetchone=MagicMock(return_value=None)),
            MagicMock(fetchone=MagicMock(return_value=None)),
        ]

        with patch.object(database, "connection", return_value=connection_context):
            with self.assertRaises(ValueError) as raised:
                database.update_compliance_followup(
                    "RRG-001",
                    "riesgo",
                    "En curso",
                    "Evaluación",
                    "inactive",
                    "Validar el caso",
                    "supervisor",
                )

        self.assertIn("permiso de Cumplimiento", str(raised.exception))

    def test_followup_rejects_reusing_id_with_another_item_type(self) -> None:
        connection_context = MagicMock()
        connection = connection_context.__enter__.return_value
        connection.execute.return_value.fetchone.return_value = {"item_type": "riesgo"}

        with patch.object(database, "connection", return_value=connection_context):
            with self.assertRaises(ValueError):
                database.update_compliance_followup(
                    "NORM-03",
                    "normativa",
                    "En curso",
                    "Evaluación",
                    "ana",
                    "Validar el caso",
                    "supervisor",
                )

        connection.execute.assert_called_once()

    def test_read_requires_compliance_permission(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            api_main._require_compliance_read_access({"permissions": ["dashboard"]})

        self.assertEqual(raised.exception.status_code, 403)

    def test_only_compliance_supervisor_can_manage_followups(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            api_main.get_compliance_manager({
                "role": "Analista de Datos",
                "permissions": ["cumplimiento"],
            })

        self.assertEqual(raised.exception.status_code, 403)

    def test_followup_rejects_identifier_for_another_category(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            api_main._validate_compliance_item("normativa", "RRG-001")

        self.assertEqual(raised.exception.status_code, 422)


    def test_followup_rejects_status_that_does_not_fit_item_type(self) -> None:
        request = api_main.ComplianceFollowupUpdate(
            status="Cerrado", phase="Cierre", responsible="ana", notes="Nota"
        )
        with self.assertRaises(HTTPException) as raised:
            api_main.update_compliance_followup("normativa", "NORM-03", request, {"username": "sup"})

        self.assertEqual(raised.exception.status_code, 422)

    def test_closing_statuses_require_matching_phase(self) -> None:
        compliant = api_main.ComplianceFollowupUpdate(
            status="Conforme", phase="Evaluación", responsible="ana", notes="Nota"
        )
        with self.assertRaises(HTTPException) as raised:
            api_main.update_compliance_followup("normativa", "NORM-03", compliant, {"username": "sup"})
        self.assertEqual(raised.exception.status_code, 422)

        closed = api_main.ComplianceFollowupUpdate(
            status="Cerrado", phase="Verificación", responsible="ana", notes="Nota"
        )
        with self.assertRaises(HTTPException) as raised:
            api_main.update_compliance_followup("riesgo", "RRG-001", closed, {"username": "sup"})
        self.assertEqual(raised.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
