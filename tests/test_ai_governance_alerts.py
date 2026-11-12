import asyncio
import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException, UploadFile

from api import database, main as api_main


def _risk_payload(**overrides: object) -> str:
    values = {
        "model_name": "Modelo de prueba",
        "category": "Desempeño",
        "description": "Descripción suficientemente larga para la evaluación.",
        "data_basis": "observado",
        "evidence": "Evaluación persistida",
        "likelihood": 3,
        "impact": 4,
        "owner": "Responsable",
        "treatment": "Revisar el resultado con el equipo técnico.",
        "source_alert_id": "demand-r2-low-run-1",
    }
    values.update(overrides)
    return api_main.AIGovernanceRiskCreate(**values).model_dump_json()


def _upload(name: str, content: bytes) -> UploadFile:
    import io

    return UploadFile(file=io.BytesIO(content), filename=name)


class AIGovernanceAlertTests(unittest.TestCase):
    def test_registered_automatic_alert_is_removed_from_alert_list(self) -> None:
        alert = {"id": "demand-r2-low-run-1", "category": "Desempeño predictivo"}
        user = {"permissions": ["riesgos"]}

        with (
            patch.object(api_main, "_ai_governance_alerts", return_value=[alert]),
            patch.object(api_main.database, "list_reviewed_ai_governance_alert_ids", return_value={alert["id"]}),
        ):
            result = api_main.get_ai_governance_alerts(user)

        self.assertEqual(result["alerts"], [])

    def test_unreviewed_automatic_alert_remains_visible(self) -> None:
        alert = {"id": "demand-r2-low-run-1", "category": "Desempeño predictivo"}
        user = {"permissions": ["riesgos"]}

        with (
            patch.object(api_main, "_ai_governance_alerts", return_value=[alert]),
            patch.object(api_main.database, "list_reviewed_ai_governance_alert_ids", return_value=set()),
        ):
            result = api_main.get_ai_governance_alerts(user)

        self.assertEqual(result["alerts"], [alert])

    def test_risk_created_from_alert_persists_source_alert_id(self) -> None:
        user = {"permissions": ["riesgos"], "username": "reviewer"}
        expected = {"id": "risk-1"}

        with patch.object(api_main.database, "create_ai_governance_risk", return_value=expected) as create:
            result = asyncio.run(api_main.create_ai_governance_risk(_risk_payload(), [], user))

        self.assertEqual(result, expected)
        create.assert_called_once()
        self.assertEqual(create.call_args.args[2], "demand-r2-low-run-1")
        self.assertEqual(create.call_args.args[3], [])

    def test_observed_risk_accepts_attached_file_without_text(self) -> None:
        user = {"permissions": ["riesgos"], "username": "reviewer"}
        expected = {"id": "risk-2"}
        payload = _risk_payload(evidence="", source_alert_id=None)

        with patch.object(api_main.database, "create_ai_governance_risk", return_value=expected) as create:
            result = asyncio.run(
                api_main.create_ai_governance_risk(payload, [_upload("reporte.csv", b"a,b\n1,2\n")], user)
            )

        self.assertEqual(result, expected)
        uploads = create.call_args.args[3]
        self.assertEqual(len(uploads), 1)
        self.assertEqual(uploads[0]["file_name"], "reporte.csv")
        self.assertEqual(uploads[0]["media_type"], "text/csv")
        self.assertEqual(uploads[0]["size_bytes"], 8)

    def test_observed_risk_without_text_or_file_is_rejected(self) -> None:
        user = {"permissions": ["riesgos"], "username": "reviewer"}
        payload = _risk_payload(evidence="", source_alert_id=None)

        with patch.object(api_main.database, "create_ai_governance_risk") as create:
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(api_main.create_ai_governance_risk(payload, [], user))

        self.assertEqual(raised.exception.status_code, 422)
        create.assert_not_called()

    def test_already_registered_alert_returns_conflict(self) -> None:
        payload = _risk_payload()

        with patch.object(
            api_main.database,
            "create_ai_governance_risk",
            side_effect=ValueError("Esta alerta automática ya fue registrada."),
        ):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(
                    api_main.create_ai_governance_risk(
                        payload,
                        [],
                        {"permissions": ["riesgos"], "username": "reviewer"},
                    )
                )

        self.assertEqual(raised.exception.status_code, 409)

    def test_risk_history_cleanup_runs_only_for_a_new_migration(self) -> None:
        connection = MagicMock()
        connection.__enter__.return_value = connection
        connection.execute.return_value.fetchone.return_value = {"migration_id": "clear-ai-governance-risk-history-2026-11"}

        with patch.object(database, "connection", return_value=connection):
            database.clear_ai_governance_risk_history_once()

        self.assertEqual(connection.execute.call_count, 2)
        self.assertIn("DELETE FROM ai_governance_risks", connection.execute.call_args_list[1].args[0])

    def test_risk_history_cleanup_is_skipped_after_migration_was_applied(self) -> None:
        connection = MagicMock()
        connection.__enter__.return_value = connection
        connection.execute.return_value.fetchone.return_value = None

        with patch.object(database, "connection", return_value=connection):
            database.clear_ai_governance_risk_history_once()

        connection.execute.assert_called_once()


if __name__ == "__main__":
    unittest.main()
