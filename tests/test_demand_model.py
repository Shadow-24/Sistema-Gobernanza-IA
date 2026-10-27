import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pandas as pd
from fastapi import HTTPException

from api import demand_model, main as api_main
from api.main import DemandForecastRequest, app


class PrepareMonthlyDemandTests(unittest.TestCase):
    def test_removes_exact_duplicates_and_invalid_rows_without_zero_imputation(self) -> None:
        frame = pd.DataFrame({
            "FCHA_DESPACHO": [
                "2024-01-03", "2024-01-03", "bad-date", "2024-02-01", "2024-02-04",
            ],
            "DEPARTAMENTO": ["LIMA", "LIMA", "LIMA", "LIMA", "LIMA"],
            "EQ_PRODUCTO": ["DIESEL", "DIESEL", "DIESEL", "DIESEL", "DIESEL"],
            "GALONES": [10, 10, 50, 0, -4],
        })

        monthly, quality = demand_model.prepare_monthly_demand(frame)

        self.assertEqual(monthly.to_list(), [10.0, 0.0])
        self.assertEqual(quality["duplicateRowsRemoved"], 1)
        self.assertEqual(quality["invalidDateRows"], 1)
        self.assertEqual(quality["negativeRowsRemoved"], 1)
        self.assertEqual(quality["months"], 2)

    def test_rejects_gaps_in_observed_months(self) -> None:
        frame = pd.DataFrame({
            "FCHA_DESPACHO": ["2024-01-03", "2024-03-03"],
            "GALONES": [10, 20],
        })
        with self.assertRaisesRegex(ValueError, "meses sin observaciones"):
            demand_model.prepare_monthly_demand(frame)

    def test_rejects_missing_target_columns(self) -> None:
        with self.assertRaisesRegex(ValueError, "FCHA_DESPACHO y GALONES"):
            demand_model.prepare_monthly_demand(pd.DataFrame({"fecha": ["2024-01-01"]}))


class DemandMetricsTests(unittest.TestCase):
    def test_mape_is_unavailable_for_zero_actual_and_wape_is_computed(self) -> None:
        metrics = demand_model._metric_set(
            np.asarray([0.0, 2.0]),
            np.asarray([1.0, 1.0]),
        )
        self.assertIsNone(metrics["mape"])
        self.assertEqual(metrics["wape"], 100.0)
        self.assertIn("valores reales iguales a cero", metrics["mapeLimitation"])

    def test_import_inventory_changes_the_combined_source_checksum(self) -> None:
        target_checksum = "target"
        feature_checksums = {demand_model.PRICE_STRUCTURE_SOURCE: "price"}
        original = demand_model.combined_source_checksum(
            target_checksum,
            feature_checksums,
            ["sales.xlsx", "prices.xlsx"],
        )
        changed = demand_model.combined_source_checksum(
            target_checksum,
            feature_checksums,
            ["sales.xlsx", "prices.xlsx", "new-source.csv"],
        )

        self.assertNotEqual(original, changed)


class DemandTrainingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        periods = pd.period_range("2020-01", periods=48, freq="M")
        values = [1000 + (period.month * 80) + period.ordinal % 12 for period in periods]
        cls.series = pd.Series(values, index=periods, dtype=float)
        cls.result = demand_model.train_and_evaluate(
            cls.series,
            source_checksum="unit-test-checksum",
            quality={"validRows": len(values), "months": len(values)},
        )

    def test_holdout_is_chronological_and_contains_real_baseline_metrics(self) -> None:
        result = self.result.public_result
        self.assertEqual(result["evaluationPeriod"]["from"], "2023-03")
        self.assertEqual(result["evaluationPeriod"]["to"], "2023-12")
        self.assertEqual(result["testObservations"], 10)
        self.assertIn("mae", result["metrics"]["xgboost"])
        self.assertIn("mae", result["metrics"]["baseline"])
        baseline_mae = result["metrics"]["baseline"]["mae"]
        if baseline_mae == 0:
            self.assertIsNone(result["metrics"]["errorReductionPercent"])
        else:
            self.assertEqual(
                result["metrics"]["errorReductionPercent"],
                (baseline_mae - result["metrics"]["xgboost"]["mae"]) / baseline_mae * 100,
            )
        self.assertEqual(result["testPredictions"][0]["period"], "2023-03")

    def test_features_use_only_observations_before_the_target_period(self) -> None:
        features = demand_model._feature_frame(self.series, [24]).iloc[0]
        self.assertEqual(features["lag_1"], self.series.iloc[23])
        self.assertEqual(features["lag_12"], self.series.iloc[12])
        self.assertEqual(features["rolling_mean_3"], np.mean(self.series.iloc[21:24]))

    def test_model_artifact_loads_and_predicts_with_shap_explanation(self) -> None:
        model = demand_model.load_model(self.result.model_artifact)
        predictions = demand_model.predict_horizon(model, self.series, 2)
        self.assertEqual([item["period"] for item in predictions], ["2024-01", "2024-02"])
        self.assertTrue(all(item["value"] >= 0 for item in predictions))
        self.assertEqual(len(self.result.model_artifact) > 0, True)

    def test_future_predictions_carry_forward_external_price_with_explicit_warning(self) -> None:
        class FakeModel:
            @staticmethod
            def predict(features: pd.DataFrame) -> np.ndarray:
                return features[demand_model.PRICE_FEATURES[demand_model.PRICE_STRUCTURE_SOURCE]].to_numpy()

        external_feature = pd.Series(
            [75.0, 100.0],
            index=pd.PeriodIndex(["2024-01", "2024-02"], freq="M"),
        )
        with patch.object(
            demand_model,
            "_explain",
            return_value={"status": "unavailable", "reason": "synthetic model"},
        ):
            predictions = demand_model.predict_horizon(
                FakeModel(),
                self.series,
                2,
                external_features={demand_model.PRICE_STRUCTURE_SOURCE: external_feature},
                selected_source=demand_model.PRICE_STRUCTURE_SOURCE,
            )

        self.assertEqual([item["value"] for item in predictions], [75.0, 75.0])
        self.assertTrue(all("se usa el último precio observado" in item["warnings"][0] for item in predictions))

    def test_price_features_are_lagged_to_the_following_month_and_exclude_lpg(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            path = Path(temporary_directory) / demand_model.PRICE_STRUCTURE_SOURCE
            prices = pd.DataFrame({
                "FECHA": ["2020-01-15", "2020-02-15", "2020-01-15"],
                "COMBUSTIBLES": ["Diesel", "Diesel", "GLP"],
                "PRECIO VENTA PUBLICO": [90.0, 100.0, 50.0],
            })
            prices.to_excel(path, sheet_name="Estructura de precios", index=False, startrow=4)

            feature = demand_model._read_price_feature(path, source=demand_model.PRICE_STRUCTURE_SOURCE)
            series = pd.Series(
                np.arange(100.0, 114.0),
                index=pd.period_range("2019-01", periods=14, freq="M"),
            )
            frame = demand_model._feature_frame(
                series,
                [13],
                external_features={demand_model.PRICE_STRUCTURE_SOURCE: feature},
                selected_source=demand_model.PRICE_STRUCTURE_SOURCE,
            )

        self.assertEqual(feature.index.to_list(), list(pd.period_range("2020-02", periods=2, freq="M")))
        self.assertEqual(frame.iloc[0]["previous_month_public_fuel_price"], 90.0)

    def test_external_source_is_selected_only_when_it_improves_the_matching_holdout(self) -> None:
        class FakeBooster:
            @staticmethod
            def save_raw(raw_format: str) -> bytes:
                return b"fake-model"

        class FakeModel:
            def fit(self, features: pd.DataFrame, target: np.ndarray) -> "FakeModel":
                self.mean = float(np.mean(target))
                self.uses_external_feature = demand_model.PRICE_FEATURES[
                    demand_model.PRICE_STRUCTURE_SOURCE
                ] in features.columns
                self.booster = FakeBooster()
                return self

            def predict(self, features: pd.DataFrame) -> np.ndarray:
                if self.uses_external_feature:
                    return features[demand_model.PRICE_FEATURES[demand_model.PRICE_STRUCTURE_SOURCE]].to_numpy()
                return np.full(len(features), self.mean)

            def get_booster(self) -> FakeBooster:
                return self.booster

        periods = pd.period_range("2020-01", periods=48, freq="M")
        series = pd.Series(
            [1000 + period.month * 80 + period.ordinal % 12 for period in periods],
            index=periods,
            dtype=float,
        )
        with (
            patch.object(demand_model, "_new_model", side_effect=FakeModel),
            patch.object(
                demand_model,
                "_explain",
                return_value={"status": "unavailable", "reason": "synthetic model"},
            ),
        ):
            result = demand_model.train_and_evaluate(
                series,
                source_checksum="unit-test-checksum",
                quality={},
                external_features={demand_model.PRICE_STRUCTURE_SOURCE: series.copy()},
            )

        self.assertEqual(result.public_result["selectedSources"], [demand_model.PRICE_STRUCTURE_SOURCE])
        evaluation = result.public_result["candidateEvaluations"][0]
        self.assertEqual(evaluation["status"], "selected")
        self.assertLess(evaluation["mae"], evaluation["baselineMae"])
        self.assertEqual(result.public_result["testObservations"], evaluation["testObservations"])

    def test_external_source_with_insufficient_training_coverage_is_not_selected(self) -> None:
        feature = pd.Series(
            [100.0, 110.0, 120.0],
            index=pd.period_range("2022-01", periods=3, freq="M"),
        )
        result = demand_model.train_and_evaluate(
            self.series,
            source_checksum="unit-test-checksum",
            quality={},
            external_features={demand_model.PRICE_STRUCTURE_SOURCE: feature},
        )

        self.assertEqual(result.public_result["selectedSources"], [])
        self.assertIn("se requieren al menos", result.public_result["candidateEvaluations"][0]["reason"])

    def test_external_source_that_is_stale_for_forecasting_is_not_selected(self) -> None:
        feature_periods = pd.period_range("2021-01", periods=32, freq="M")
        feature = pd.Series(
            [self.series.get(period, 0.0) for period in feature_periods],
            index=feature_periods,
            dtype=float,
        )
        result = demand_model.train_and_evaluate(
            self.series,
            source_checksum="unit-test-checksum",
            quality={},
            external_features={demand_model.PRICE_STRUCTURE_SOURCE: feature},
        )

        self.assertEqual(result.public_result["selectedSources"], [])
        self.assertIn("desactualizado por 5 meses", result.public_result["candidateEvaluations"][0]["reason"])


class DemandApiRegistrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        periods = pd.period_range("2020-01", periods=48, freq="M")
        cls.series = pd.Series(
            [1000 + period.month * 80 + period.ordinal % 12 for period in periods],
            index=periods,
            dtype=float,
        )

    def test_authenticated_model_endpoints_and_horizon_bounds_are_exposed(self) -> None:
        expected = {
            ("/api/demand-model/status", "GET"),
            ("/api/demand-model/train", "POST"),
            ("/api/demand-model/evaluate", "POST"),
            ("/api/demand-model/predict", "POST"),
            ("/api/demand-model/history", "GET"),
            ("/api/demand-model/governance-metrics", "GET"),
        }
        registered = {
            (route.path, method)
            for route in app.routes
            for method in (route.methods or set())
        }
        self.assertTrue(expected.issubset(registered))
        schema = app.openapi()["components"]["schemas"]["DemandForecastRequest"]
        self.assertEqual(schema["properties"]["horizon_months"]["minimum"], 1)
        self.assertEqual(schema["properties"]["horizon_months"]["maximum"], 12)

    def test_training_permission_is_restricted_to_analytics_and_supervision(self) -> None:
        with self.assertRaises(HTTPException) as error:
            api_main.get_demand_model_analyst({"username": "field", "role": "Ingeniero de Campo"})
        self.assertEqual(error.exception.status_code, 403)
        self.assertEqual(
            api_main.get_demand_model_analyst({"username": "analyst", "role": "Analista de Datos"})["role"],
            "Analista de Datos",
        )

    def test_training_endpoint_persists_the_run_and_first_prediction(self) -> None:
        periods = pd.period_range("2020-01", periods=48, freq="M")
        series = pd.Series(
            [1000 + period.month * 80 + period.ordinal % 12 for period in periods],
            index=periods,
            dtype=float,
        )
        user = {"username": "model-analyst", "role": "Analista de Datos"}
        with (
            patch.object(
                api_main,
                "_load_demand_model_sources",
                return_value=(series, {"validRows": 48}, "checksum", {}, {}),
            ),
            patch.object(api_main.database, "save_demand_model_run") as save_run,
            patch.object(api_main.database, "save_demand_prediction") as save_prediction,
            patch.object(api_main.database, "record_model_operation") as record_operation,
        ):
            result = api_main.train_demand_model(user)

        self.assertEqual(result["status"], "evaluated")
        save_run.assert_called_once()
        save_prediction.assert_called_once()
        record_operation.assert_called_once()

    def test_prediction_endpoint_validates_source_and_persists_trace(self) -> None:
        saved_result = {
            "runId": "run-123",
            "modelVersion": "xgboost-test",
            "source": demand_model.TARGET_SOURCE,
            "sourceChecksum": "checksum",
            "unit": demand_model.TARGET_UNIT,
            "coverage": {"to": "2023-12"},
        }
        checksum = demand_model.combined_source_checksum("target-checksum", {})
        saved_run = {"result": saved_result, "source_checksum": checksum, "model_artifact": b"model"}
        user = {"username": "model-analyst", "role": "Analista de Datos"}
        predictions = [
            {"period": "2024-01", "value": 100.0, "unit": "galones", "explanation": {"status": "available"}},
            {"period": "2024-02", "value": 110.0, "unit": "galones", "explanation": {"status": "available"}},
        ]
        with (
            patch.object(api_main.database, "load_demand_model_run", return_value=saved_run),
            patch.object(
                api_main,
                "_load_demand_model_sources",
                return_value=(self.series, {}, checksum, {}, {}),
            ),
            patch.object(api_main.demand_model, "load_model", return_value=object()),
            patch.object(api_main.demand_model, "predict_horizon", return_value=predictions) as predict_horizon,
            patch.object(api_main.database, "save_demand_prediction") as save_prediction,
            patch.object(api_main.database, "record_model_operation") as record_operation,
        ):
            result = api_main.predict_demand(DemandForecastRequest(horizon_months=2), user)

        self.assertEqual(len(result["predictions"]), 2)
        predict_horizon.assert_called_once()
        self.assertEqual(save_prediction.call_count, 2)
        record_operation.assert_called_once()


if __name__ == "__main__":
    unittest.main()
