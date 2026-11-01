import json
import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from api import database, main as api_main


class DetectedRiskWorkflowTests(unittest.TestCase):
    def test_workflow_changes_are_saved_as_one_timeline_event(self) -> None:
        connection_context = MagicMock()
        connection = connection_context.__enter__.return_value
        current = {"status": "Activo", "phase": "Identificación", "responsible": "", "notes": ""}
        updated = {
            "risk_id": "RSK-007",
            "status": "En análisis",
            "phase": "Análisis",
            "responsible": "ana",
            "notes": "Revisar el expediente relacionado",
            "updated_by": "supervisor",
        }
        connection.execute.side_effect = [
            MagicMock(fetchone=MagicMock(return_value=current)),
            MagicMock(fetchone=MagicMock(return_value={"username": "ana"})),
            MagicMock(fetchone=MagicMock(return_value=updated)),
            MagicMock(),
        ]

        with patch.object(database, "connection", return_value=connection_context):
            result = database.update_detected_risk_workflow(
                "RSK-007",
                "En análisis",
                "Análisis",
                "ana",
                "Revisar el expediente relacionado",
                "supervisor",
            )

        self.assertEqual(result["status"], "En análisis")
        timeline_insert = connection.execute.call_args_list[-1]
        self.assertIn("INSERT INTO detected_risk_workflow_events", timeline_insert.args[0])
        self.assertEqual(timeline_insert.args[1][0], "RSK-007")
        changes = json.loads(timeline_insert.args[1][1])["changes"]
        self.assertEqual(
            [change["field"] for change in changes],
            ["status", "phase", "responsible", "notes"],
        )

    def test_rejects_assignee_without_risk_permission(self) -> None:
        connection_context = MagicMock()
        connection = connection_context.__enter__.return_value
        connection.execute.side_effect = [
            MagicMock(fetchone=MagicMock(return_value=None)),
            MagicMock(fetchone=MagicMock(return_value=None)),
        ]

        with patch.object(database, "connection", return_value=connection_context):
            with self.assertRaises(ValueError) as raised:
                database.update_detected_risk_workflow(
                    "RSK-007", "En análisis", "Análisis", "inactive", "Nota", "supervisor"
                )

        self.assertIn("permiso de Riesgos", str(raised.exception))

    def test_workflow_api_requires_responsible_and_note(self) -> None:
        request = api_main.DetectedRiskWorkflowUpdate(
            status="En análisis",
            phase="Análisis",
            responsible="  ",
            notes=" ",
        )

        with patch.object(api_main.database, "update_detected_risk_workflow") as update:
            with self.assertRaises(HTTPException) as raised:
                api_main.update_detected_risk_workflow(
                    "RSK-007",
                    request,
                    {"username": "supervisor", "role": "Supervisor de Cumplimiento", "permissions": ["riesgos"]},
                )

        self.assertEqual(raised.exception.status_code, 422)
        update.assert_not_called()

    def test_workflow_api_trims_values_and_persists_actor(self) -> None:
        request = api_main.DetectedRiskWorkflowUpdate(
            status="Mitigado",
            phase="Monitoreo y cierre",
            responsible=" ana ",
            notes=" Validación realizada ",
        )
        user = {"username": "supervisor", "role": "Supervisor de Cumplimiento", "permissions": ["riesgos"]}
        expected = {"risk_id": "RSK-007", "status": "Mitigado"}

        with patch.object(api_main.database, "update_detected_risk_workflow", return_value=expected) as update:
            result = api_main.update_detected_risk_workflow("RSK-007", request, user)

        self.assertEqual(result, expected)
        update.assert_called_once_with(
            "RSK-007", "Mitigado", "Monitoreo y cierre", "ana", "Validación realizada", "supervisor"
        )

    def test_only_supervisor_with_risk_permission_can_manage_workflow(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            api_main.get_detected_risk_manager({
                "role": "Analista de Datos",
                "permissions": ["riesgos"],
            })

        self.assertEqual(raised.exception.status_code, 403)

    def test_detected_risk_read_endpoints_require_risk_permission(self) -> None:
        with patch.object(api_main.database, "list_detected_risk_workflows") as list_workflows:
            with self.assertRaises(HTTPException) as raised:
                api_main.get_detected_risk_workflow({"permissions": ["dashboard"]})

        self.assertEqual(raised.exception.status_code, 403)
        list_workflows.assert_not_called()

    def test_uploaded_document_keeps_existing_initial_risk_status(self) -> None:
        connection_context = MagicMock()
        connection = connection_context.__enter__.return_value
        document = {"id": "doc-1", "risk_id": "RSK-008", "file_name": "evidence.pdf"}
        connection.execute.side_effect = [
            MagicMock(),
            MagicMock(fetchone=MagicMock(return_value=document)),
            MagicMock(),
        ]

        with patch.object(database, "connection", return_value=connection_context):
            saved = database.save_detected_risk_document(
                document_id="doc-1",
                risk_id="RSK-008",
                initial_status="En análisis",
                file_name="evidence.pdf",
                media_type="application/pdf",
                content=b"pdf",
                checksum="checksum",
                username="supervisor",
            )

        self.assertEqual(saved, document)
        initial_workflow_insert = connection.execute.call_args_list[0]
        self.assertIn("ON CONFLICT (risk_id) DO NOTHING", initial_workflow_insert.args[0])
        self.assertEqual(initial_workflow_insert.args[1], ("RSK-008", "En análisis"))


if __name__ == "__main__":
    unittest.main()
