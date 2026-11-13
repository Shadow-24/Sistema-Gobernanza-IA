import json
import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from pydantic import ValidationError

from api import database, main as api_main


class DetectedRiskWorkflowTests(unittest.TestCase):
    def test_registration_date_is_created_once_and_returned(self) -> None:
        connection_context = MagicMock()
        connection = connection_context.__enter__.return_value
        expected = [{"risk_id": "RSK-007", "registered_at": "2026-11-01T00:00:00Z"}]
        connection.execute.return_value.fetchall.return_value = expected

        with patch.object(database, "connection", return_value=connection_context):
            result = database.register_detected_risks(["RSK-007", "SIM-INV-001"])

        self.assertEqual(result, expected)
        insert_sql = connection.execute.call_args_list[0].args[0]
        self.assertIn("ON CONFLICT (risk_id) DO NOTHING", insert_sql)
        self.assertEqual(connection.execute.call_args_list[0].args[1], ("RSK-007",))

    def test_registration_endpoint_requires_risk_permission(self) -> None:
        request = api_main.DetectedRiskRegistrationRequest(risk_ids=["RSK-007"])

        with patch.object(api_main.database, "register_detected_risks") as register:
            with self.assertRaises(HTTPException) as raised:
                api_main.register_detected_risks(request, {"permissions": ["dashboard"]})

        self.assertEqual(raised.exception.status_code, 403)
        register.assert_not_called()

    def test_workflow_list_includes_registration_timestamp(self) -> None:
        connection_context = MagicMock()
        connection = connection_context.__enter__.return_value
        expected = [{
            "risk_id": "RSK-007",
            "created_at": "2026-11-01T00:00:00Z",
        }]
        connection.execute.return_value.fetchall.return_value = expected

        with patch.object(database, "connection", return_value=connection_context):
            result = database.list_detected_risk_workflows()

        self.assertEqual(result, expected)
        self.assertIn("created_at", connection.execute.call_args.args[0])

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
            "created_at": "2026-11-01T00:00:00Z",
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

    def test_any_user_with_risk_permission_can_manage_workflow(self) -> None:
        analyst = {"username": "analyst", "role": "Analista de Datos", "permissions": ["riesgos"]}
        self.assertIs(api_main.get_detected_risk_manager(analyst), analyst)

    def test_workflow_requires_risk_permission(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            api_main.get_detected_risk_manager({
                "role": "Supervisor de Cumplimiento",
                "permissions": ["dashboard", "supervision"],
            })

        self.assertEqual(raised.exception.status_code, 403)

    def test_assignees_endpoint_returns_only_active_users_with_risk_permission(self) -> None:
        connection_context = MagicMock()
        connection = connection_context.__enter__.return_value
        connection.execute.return_value.fetchall.return_value = [{
            "username": "ana",
            "display_name": "Ana",
            "role": "Analista de Datos",
            "permissions": ["riesgos"],
            "active": True,
        }]

        with patch.object(database, "connection", return_value=connection_context):
            result = database.list_detected_risk_assignees()

        self.assertEqual(result, [{
            "username": "ana",
            "name": "Ana",
            "role": "Analista de Datos",
            "permissions": ["riesgos"],
            "active": True,
        }])
        sql = connection.execute.call_args.args[0]
        self.assertIn("active", sql)
        self.assertIn("permissions ? %s", sql)
        self.assertEqual(connection.execute.call_args.args[1], ("riesgos",))

    def test_generic_assignees_endpoint_validates_permission_and_access(self) -> None:
        with patch.object(api_main.database, "list_assignees_with_permission", return_value=[{"username": "ana"}]) as list_assignees:
            with self.assertRaises(HTTPException) as invalid:
                api_main.get_assignees("admin", {"permissions": ["admin"]})
            self.assertEqual(invalid.exception.status_code, 400)

            with self.assertRaises(HTTPException) as forbidden:
                api_main.get_assignees("auditoria", {"permissions": ["cumplimiento"]})
            self.assertEqual(forbidden.exception.status_code, 403)
            list_assignees.assert_not_called()

            result = api_main.get_assignees("auditoria", {"permissions": ["auditoria"]})
        self.assertEqual(result, [{"username": "ana"}])
        list_assignees.assert_called_once_with("auditoria")

    def test_assignees_endpoint_requires_risk_permission(self) -> None:
        with patch.object(api_main.database, "list_detected_risk_assignees") as list_assignees:
            with self.assertRaises(HTTPException) as raised:
                api_main.get_detected_risk_assignees({"permissions": ["dashboard"]})

        self.assertEqual(raised.exception.status_code, 403)
        list_assignees.assert_not_called()

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

    def test_road_evaluation_save_updates_latest_and_appends_to_history(self) -> None:
        connection_context = MagicMock()
        connection = connection_context.__enter__.return_value
        row = {
            "id": 7, "risk_id": "SIM-TRN-001", "inputs": {"phenomenonClass": "HIDROMETEOROLÓGICO"},
            "result": {"prediction": "INTERRUMPIDO"}, "evaluated_by": "supervisor",
            "review_decision": None, "review_comment": None, "review_by": None, "review_at": None,
        }
        connection.execute.return_value.fetchone.side_effect = [{"id": 7}, row]

        with patch.object(database, "connection", return_value=connection_context):
            result = database.save_detected_risk_road_evaluation(
                "SIM-TRN-001", {"phenomenonClass": "HIDROMETEOROLÓGICO"}, {"prediction": "INTERRUMPIDO"}, "supervisor",
            )

        statements = [call.args[0] for call in connection.execute.call_args_list]
        self.assertIn("ON CONFLICT (risk_id) DO UPDATE", statements[0])
        self.assertIn("INSERT INTO detected_risk_road_evaluation_history", statements[1])
        self.assertEqual(connection.execute.call_args_list[0].args[1][1].obj, {"phenomenonClass": "HIDROMETEOROLÓGICO"})
        self.assertEqual(result["id"], 7)
        self.assertEqual(result["review"]["status"], "pendiente")
        self.assertNotIn("review_decision", result)

    def test_road_evaluation_review_requires_supervisor_and_a_reason_to_reject(self) -> None:
        supervisor = {"username": "sup", "role": "Supervisor de Cumplimiento", "permissions": ["supervision"]}
        with self.assertRaises(HTTPException) as denied:
            api_main.get_supervisor({"username": "a", "role": "Analista de Datos", "permissions": ["riesgos", "supervision"]})
        self.assertEqual(denied.exception.status_code, 403)

        with patch.object(api_main.database, "review_detected_risk_road_evaluation") as review:
            with self.assertRaises(HTTPException) as error:
                api_main.review_detected_risk_road_evaluation(
                    5, api_main.RoadEvaluationReviewRequest(decision="rechazada", comment=" "), supervisor,
                )
            review.assert_not_called()
        self.assertEqual(error.exception.status_code, 422)

    def test_road_evaluation_review_records_decision_and_blocks_a_second_review(self) -> None:
        supervisor = {"username": "sup", "role": "Supervisor de Cumplimiento", "permissions": ["supervision"]}
        reviewed = {"id": 5, "review": {"status": "validada", "reviewedBy": "sup"}}
        with patch.object(api_main.database, "review_detected_risk_road_evaluation", return_value=reviewed) as review:
            result = api_main.review_detected_risk_road_evaluation(
                5, api_main.RoadEvaluationReviewRequest(decision="validada", comment="ok"), supervisor,
            )
        review.assert_called_once_with(5, "validada", "ok", "sup")
        self.assertEqual(result, reviewed)

        with patch.object(api_main.database, "review_detected_risk_road_evaluation", side_effect=ValueError("ya revisada")):
            with self.assertRaises(HTTPException) as error:
                api_main.review_detected_risk_road_evaluation(
                    5, api_main.RoadEvaluationReviewRequest(decision="validada"), supervisor,
                )
        self.assertEqual(error.exception.status_code, 409)

        with patch.object(api_main.database, "review_detected_risk_road_evaluation", return_value=None):
            with self.assertRaises(HTTPException) as missing:
                api_main.review_detected_risk_road_evaluation(
                    99, api_main.RoadEvaluationReviewRequest(decision="validada"), supervisor,
                )
        self.assertEqual(missing.exception.status_code, 404)

    def test_standalone_road_prediction_endpoint_is_removed(self) -> None:
        paths = {getattr(route, "path", "") for route in api_main.app.routes}
        self.assertNotIn("/api/risk-model/road-impact/predict", paths)

    def test_road_evaluation_history_requires_risk_permission_and_lists_rows(self) -> None:
        with patch.object(api_main.database, "list_detected_risk_road_evaluations") as listing:
            with self.assertRaises(HTTPException) as raised:
                api_main.list_detected_risk_road_evaluations("SIM-TRN-001", 20, {"permissions": ["dashboard"]})
            listing.assert_not_called()
        self.assertEqual(raised.exception.status_code, 403)

        rows = [{"risk_id": "SIM-TRN-001", "evaluated_by": "analyst"}]
        with patch.object(api_main.database, "list_detected_risk_road_evaluations", return_value=rows) as listing:
            result = api_main.list_detected_risk_road_evaluations("SIM-TRN-001", 20, {"permissions": ["riesgos"]})
        self.assertEqual(result, rows)
        listing.assert_called_once_with("SIM-TRN-001", 20)

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
