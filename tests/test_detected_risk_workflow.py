import json
import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from pydantic import ValidationError

from api import database, main as api_main


class DetectedRiskWorkflowTests(unittest.TestCase):
    def test_workflow_changes_are_saved_as_one_timeline_event(self) -> None:
        connection_context = MagicMock()
        connection = connection_context.__enter__.return_value
        current = {
            "status": None,
            "risk_level": None,
            "phase": "Identificación",
            "responsible": "",
            "notes": "",
        }
        updated = {
            "risk_id": "RSK-007",
            "status": "En análisis",
            "risk_level": "Alto",
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
                "Alto",
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
            ["status", "risk_level", "phase", "responsible", "notes"],
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
                    "RSK-007", "En análisis", "Alto", "Análisis", "inactive", "Nota", "supervisor"
                )

        self.assertIn("permiso de Riesgos", str(raised.exception))

    def test_workflow_api_requires_responsible_and_note(self) -> None:
        request = api_main.DetectedRiskWorkflowUpdate(
            status="En análisis",
            risk_level="Alto",
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

    def test_workflow_api_requires_explicit_status_and_risk_level(self) -> None:
        with self.assertRaises(ValidationError):
            api_main.DetectedRiskWorkflowUpdate(
                status="",
                risk_level="",
                phase="Identificación",
                responsible="ana",
                notes="Revisar el hallazgo",
            )

    def test_workflow_api_trims_values_and_persists_actor(self) -> None:
        request = api_main.DetectedRiskWorkflowUpdate(
            status="Mitigado",
            risk_level="Medio",
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
            "RSK-007", "Mitigado", "Medio", "Monitoreo y cierre", "ana", "Validación realizada", "supervisor"
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

    def test_road_evaluation_api_predicts_and_persists_result(self) -> None:
        request = api_main.RoadImpactRequest(
            phenomenonClass="HIDROMETEOROLÓGICO",
            phenomenon="Inundación",
            event="Desborde",
            department="LORETO",
        )
        prediction = {"prediction": "INTERRUMPIDO", "confidence": 0.9}
        saved = {
            "risk_id": "SIM-TRN-001",
            "inputs": request.model_dump(by_alias=True),
            "result": prediction,
            "evaluated_by": "supervisor",
        }
        user = {"username": "analyst", "role": "Analista de Datos", "permissions": ["riesgos"]}

        with (
            patch.object(api_main.risk_model, "predict_road_state", return_value=prediction) as predict,
            patch.object(api_main.database, "save_detected_risk_road_evaluation", return_value=saved) as save,
        ):
            result = api_main.evaluate_detected_risk_road_impact("SIM-TRN-001", request, user)

        self.assertEqual(result, saved)
        predict.assert_called_once_with(api_main.IMPORTS_PATH, request.model_dump(by_alias=True))
        save.assert_called_once_with("SIM-TRN-001", request.model_dump(by_alias=True, exclude_none=True), prediction, "analyst")

    def test_road_evaluation_save_replaces_previous_evaluation_for_risk(self) -> None:
        connection_context = MagicMock()
        connection = connection_context.__enter__.return_value
        saved = {
            "risk_id": "SIM-TRN-001",
            "inputs": {"phenomenonClass": "HIDROMETEOROLÓGICO"},
            "result": {"prediction": "INTERRUMPIDO"},
            "evaluated_by": "supervisor",
        }
        connection.execute.return_value.fetchone.return_value = saved

        with patch.object(database, "connection", return_value=connection_context):
            result = database.save_detected_risk_road_evaluation(
                "SIM-TRN-001",
                {"phenomenonClass": "HIDROMETEOROLÓGICO"},
                {"prediction": "INTERRUMPIDO"},
                "supervisor",
            )

        self.assertEqual(result, saved)
        statement, parameters = connection.execute.call_args.args
        self.assertIn("ON CONFLICT (risk_id) DO UPDATE", statement)
        self.assertEqual(parameters[0], "SIM-TRN-001")
        self.assertEqual(parameters[1].obj, {"phenomenonClass": "HIDROMETEOROLÓGICO"})
        self.assertEqual(parameters[2].obj, {"prediction": "INTERRUMPIDO"})

    def test_road_evaluation_read_requires_risk_permission(self) -> None:
        with patch.object(api_main.database, "get_detected_risk_road_evaluation") as get_evaluation:
            with self.assertRaises(HTTPException) as raised:
                api_main.get_detected_risk_road_evaluation("SIM-TRN-001", {"permissions": ["dashboard"]})

        self.assertEqual(raised.exception.status_code, 403)
        get_evaluation.assert_not_called()

    def test_uploaded_document_does_not_assign_initial_status(self) -> None:
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
                file_name="evidence.pdf",
                media_type="application/pdf",
                content=b"pdf",
                checksum="checksum",
                username="supervisor",
            )

        self.assertEqual(saved, document)
        initial_workflow_insert = connection.execute.call_args_list[0]
        self.assertIn("ON CONFLICT (risk_id) DO NOTHING", initial_workflow_insert.args[0])
        self.assertNotIn("status", initial_workflow_insert.args[0])
        self.assertEqual(initial_workflow_insert.args[1], ("RSK-008",))


if __name__ == "__main__":
    unittest.main()
