import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
import pandas as pd

from api import risk_model


class FakeRoadPipeline:
    def __init__(self) -> None:
        self.named_steps = {"classifier": SimpleNamespace(classes_=np.array([0, 1]))}
        self.fitted_targets: pd.Series | None = None
        self.fitted_feature_count = 0
        self.fitted_sample_weights: list[float] | None = None

    def fit(
        self,
        features: pd.DataFrame,
        targets: pd.Series,
        classifier__sample_weight: list[float] | None = None,
    ) -> "FakeRoadPipeline":
        self.fitted_feature_count = len(features)
        self.fitted_targets = targets
        self.fitted_sample_weights = classifier__sample_weight
        return self

    def predict(self, features: pd.DataFrame) -> np.ndarray:
        return np.resize(np.array([0, 1]), len(features))

    def predict_proba(self, features: pd.DataFrame) -> np.ndarray:
        return np.tile(np.array([0.1, 0.9]), (len(features), 1))


class RoadRiskModelTests(unittest.TestCase):
    def setUp(self) -> None:
        risk_model._fit.cache_clear()

    def tearDown(self) -> None:
        risk_model._fit.cache_clear()

    def test_fit_encodes_string_target_for_xgboost_and_decodes_predictions(self) -> None:
        labels = ["RESTRINGIDO", "INTERRUMPIDO"]
        rows = []
        for index, date in enumerate(pd.date_range("2026-01-01", periods=35)):
            row = {
                "DATE": date,
                risk_model.TARGET: labels[index % len(labels)],
            }
            row.update({feature: f"value-{index}" for feature in risk_model.CATEGORICAL_FEATURES})
            rows.append(row)
        data = pd.DataFrame(rows)
        pipeline = FakeRoadPipeline()

        with (
            patch.object(risk_model, "_prepare", return_value=data),
            patch.object(risk_model, "_build_pipeline", return_value=pipeline),
        ):
            fitted_pipeline, metrics, train_classes = risk_model._fit("fixture.csv", 1)

        self.assertIs(fitted_pipeline, pipeline)
        self.assertEqual(train_classes, ["INTERRUMPIDO", "RESTRINGIDO"])
        self.assertEqual(set(pipeline.fitted_targets.unique()), {0, 1})
        self.assertEqual(pipeline.fitted_feature_count, 28)
        self.assertEqual(len(pipeline.fitted_sample_weights or []), 28)
        self.assertEqual(metrics["testClasses"], ["INTERRUMPIDO", "RESTRINGIDO"])
        self.assertEqual(metrics["metrics"]["decisionThreshold"], 0.5)
        self.assertEqual(metrics["metrics"]["thresholdCalibrationRecords"], 0)

    def test_prediction_maps_encoded_class_indexes_back_to_road_states(self) -> None:
        pipeline = FakeRoadPipeline()
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / risk_model.SOURCE_NAME
            source.touch()
            with patch.object(
                risk_model,
                "_fit",
                return_value=(
                    pipeline,
                    {
                        "metrics": {
                            "decisionThreshold": 0.375,
                            "thresholdTargetClass": "RESTRINGIDO",
                        },
                        "caveat": "",
                    },
                    ["INTERRUMPIDO", "RESTRINGIDO"],
                ),
            ):
                result = risk_model.predict_road_state(
                    Path(directory),
                    {
                        "phenomenonClass": "class",
                        "phenomenon": "phenomenon",
                        "event": "event",
                        "department": "department",
                        "province": "",
                        "roadCode": "",
                        "roadSection": "",
                        "date": "2026-01-01",
                    },
                )

        self.assertEqual(result["prediction"], "RESTRINGIDO")
        self.assertEqual(result["probabilities"], {"RESTRINGIDO": 0.9, "INTERRUMPIDO": 0.1})

    def test_decision_threshold_selects_the_class_with_sufficient_probability(self) -> None:
        pipeline = FakeRoadPipeline()
        with patch.object(
            pipeline,
            "predict_proba",
            return_value=np.array([[0.7, 0.3], [0.1, 0.9]]),
        ):
            predictions = risk_model._predict_labels(
                pipeline,
                pd.DataFrame([{}, {}]),
                ["INTERRUMPIDO", "RESTRINGIDO"],
                threshold=0.375,
                threshold_target="RESTRINGIDO",
            )

        self.assertEqual(predictions, ["INTERRUMPIDO", "RESTRINGIDO"])


class TargetEncoderTests(unittest.TestCase):
    def test_training_encoding_is_out_of_fold_and_unseen_categories_get_the_prior(self) -> None:
        frame = pd.DataFrame({"zone": ["a", "a", "a", "a", "b", "b", "b", "b", "c", "c"]})
        target = np.array([1, 1, 1, 1, 0, 0, 0, 0, 1, 0])
        encoder = risk_model.SmoothedTargetEncoder(smoothing=1.0, folds=5)

        training = encoder.fit_transform(frame, target)

        self.assertEqual(training.shape, (10, 1))
        # Una fila no se codifica con su propio objetivo: la tasa en entrenamiento no es 0 ni 1 exactos.
        self.assertTrue(((training > 0) & (training < 1)).all())
        unseen = encoder.transform(pd.DataFrame({"zone": ["nueva"]}))
        self.assertAlmostEqual(float(unseen[0, 0]), float(target.mean()))
        known = encoder.transform(pd.DataFrame({"zone": ["a", "b"]}))
        self.assertGreater(known[0, 0], known[1, 0])


class RoadConfidenceTests(unittest.TestCase):
    def _predict(self, majority_probability: float, reliability: list[dict]) -> dict:
        class Pipeline(FakeRoadPipeline):
            def predict_proba(self, features: pd.DataFrame) -> np.ndarray:
                return np.tile(np.array([1 - majority_probability, majority_probability]), (len(features), 1))

        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / risk_model.SOURCE_NAME).touch()
            with patch.object(
                risk_model,
                "_fit",
                return_value=(
                    Pipeline(),
                    {
                        "metrics": {"decisionThreshold": 0.375, "thresholdTargetClass": "RESTRINGIDO"},
                        "caveat": "",
                        "reliability": reliability,
                    },
                    ["INTERRUMPIDO", "RESTRINGIDO"],
                ),
            ):
                return risk_model.predict_road_state(
                    Path(directory),
                    {"phenomenonClass": "c", "phenomenon": "p", "event": "e", "department": "d"},
                )

    def test_confidence_is_the_probability_of_the_class_actually_predicted(self) -> None:
        # Con umbral 0.375, P(RESTRINGIDO)=0.45 se predice RESTRINGIDO aunque INTERRUMPIDO tenga 0.55.
        result = self._predict(0.45, [])
        self.assertEqual(result["prediction"], "RESTRINGIDO")
        self.assertAlmostEqual(result["confidence"], 0.45)
        self.assertIsNone(result["confidenceLevel"])

    def test_confidence_level_comes_from_observed_validation_accuracy(self) -> None:
        bands = [
            {"from": 0.5, "to": 0.8, "cases": 40, "accuracy": 0.7},
            {"from": 0.8, "to": 1.0, "cases": 120, "accuracy": 0.95},
        ]
        high = self._predict(0.9, bands)
        self.assertEqual(high["confidenceLevel"], "Alta")
        self.assertEqual(high["reliability"]["cases"], 120)
        low = self._predict(0.6, bands)
        self.assertEqual(low["confidenceLevel"], "Baja")

    def test_validation_summary_reports_accuracy_per_band_and_hides_small_bands(self) -> None:
        points = [("RESTRINGIDO", 0.95)] * 20 + [("INTERRUMPIDO", 0.95)] * 0 + [("RESTRINGIDO", 0.55)] * 3
        reliability, summary = risk_model._validation_summary(points, "RESTRINGIDO", "INTERRUMPIDO", 0.375)
        top = next(band for band in reliability if band["from"] == 0.9)
        low = next(band for band in reliability if band["from"] == 0.5)
        self.assertEqual(top["cases"], 20)
        self.assertEqual(top["accuracy"], 1.0)
        self.assertEqual(low["cases"], 3)
        self.assertIsNone(low["accuracy"])
        self.assertEqual(summary["records"], 23)


class RoadHierarchyTests(unittest.TestCase):
    def test_model_status_exposes_location_and_phenomenon_hierarchies(self) -> None:
        risk_model._fit.cache_clear()
        labels = ["RESTRINGIDO", "INTERRUMPIDO"]
        rows = []
        for index, date in enumerate(pd.date_range("2026-01-01", periods=35)):
            row = {"DATE": date, risk_model.TARGET: labels[index % 2]}
            row.update({feature: f"v{index % 3}" for feature in risk_model.CATEGORICAL_FEATURES})
            row["DEPARTEMENTO"], row["PROVINCIA"] = "LIMA", "HUAROCHIRI"
            rows.append(row)
        with (
            patch.object(risk_model, "_prepare", return_value=pd.DataFrame(rows)),
            patch.object(risk_model, "_build_pipeline", return_value=FakeRoadPipeline()),
        ):
            _, metrics, _ = risk_model._fit("fixture.csv", 2)
        risk_model._fit.cache_clear()

        self.assertTrue(all(len(location) == 4 for location in metrics["locations"]))
        self.assertTrue(all(location[:2] == ("LIMA", "HUAROCHIRI") for location in metrics["locations"]))
        self.assertTrue(all(len(item) == 3 for item in metrics["phenomena"]))


if __name__ == "__main__":
    unittest.main()
