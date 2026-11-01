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

    def fit(self, features: pd.DataFrame, targets: pd.Series) -> "FakeRoadPipeline":
        self.fitted_feature_count = len(features)
        self.fitted_targets = targets
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
        self.assertEqual(metrics["testClasses"], ["INTERRUMPIDO", "RESTRINGIDO"])

    def test_prediction_maps_encoded_class_indexes_back_to_road_states(self) -> None:
        pipeline = FakeRoadPipeline()
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / risk_model.SOURCE_NAME
            source.touch()
            with patch.object(
                risk_model,
                "_fit",
                return_value=(pipeline, {"metrics": {}, "caveat": ""}, ["INTERRUMPIDO", "RESTRINGIDO"]),
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


if __name__ == "__main__":
    unittest.main()
