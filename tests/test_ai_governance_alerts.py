import unittest
from unittest.mock import patch

from fastapi import HTTPException

from api import main as api_main


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
        request = api_main.AIGovernanceRiskCreate(
            model_name="Modelo de prueba",
            category="Desempeño",
            description="Descripción suficientemente larga para la evaluación.",
            data_basis="observado",
            evidence="Evaluación persistida",
            likelihood=3,
            impact=4,
            owner="Responsable",
            treatment="Revisar el resultado con el equipo técnico.",
            source_alert_id="demand-r2-low-run-1",
        )
        user = {"permissions": ["riesgos"], "username": "reviewer"}
        expected = {"id": "risk-1"}

        with patch.object(api_main.database, "create_ai_governance_risk", return_value=expected) as create:
            result = api_main.create_ai_governance_risk(request, user)

        self.assertEqual(result, expected)
        create.assert_called_once()
        self.assertEqual(create.call_args.args[2], "demand-r2-low-run-1")

    def test_already_registered_alert_returns_conflict(self) -> None:
        request = api_main.AIGovernanceRiskCreate(
            model_name="Modelo de prueba",
            category="Desempeño",
            description="Descripción suficientemente larga para la evaluación.",
            data_basis="observado",
            evidence="Evaluación persistida",
            likelihood=3,
            impact=4,
            owner="Responsable",
            treatment="Revisar el resultado con el equipo técnico.",
            source_alert_id="demand-r2-low-run-1",
        )

        with patch.object(
            api_main.database,
            "create_ai_governance_risk",
            side_effect=ValueError("Esta alerta automática ya fue registrada."),
        ):
            with self.assertRaises(HTTPException) as raised:
                api_main.create_ai_governance_risk(
                    request,
                    {"permissions": ["riesgos"], "username": "reviewer"},
                )

        self.assertEqual(raised.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
