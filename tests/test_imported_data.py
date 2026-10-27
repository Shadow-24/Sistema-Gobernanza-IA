import csv
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from openpyxl import Workbook

from api.imported_data import build_imported_data


class ImportedDataTests(unittest.TestCase):
    def test_builds_aggregates_without_treating_samples_as_live_alerts(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            registry_path = root / "CDCL y OPDH con Instalaciones Fijas_0.csv"
            with registry_path.open("w", encoding="utf-8", newline="") as output:
                writer = csv.DictWriter(output, fieldnames=["DEPARTAMENTO", "TIPO TRANSPORTE"])
                writer.writeheader()
                writer.writerow({"DEPARTAMENTO": "LIMA", "TIPO TRANSPORTE": "Terrestre"})
                writer.writerow({"DEPARTAMENTO": "CUSCO", "TIPO TRANSPORTE": "Terrestre"})

            workbook = Workbook()
            worksheet = workbook.active
            worksheet.append(["Componente ambiental", "Fecha", "Parámetro", "Unidad de medida"])
            worksheet.append(["Agua", datetime(2024, 3, 5), "Hidrocarburos", "mg/L"])
            workbook.save(root / "IPASH_Agua_0.xlsx")

            with (root / "precios_combustibles_anonimizados_20260301_part1 (2).csv").open(
                "w", encoding="utf-8", newline=""
            ) as output:
                writer = csv.DictWriter(output, fieldnames=["fe_eval", "g_premium"])
                writer.writeheader()
                writer.writerow({"fe_eval": "20240101", "g_premium": "15.0"})
                writer.writerow({"fe_eval": "20240102", "g_premium": "17.0"})
            with (root / "CL-Registro-precios-DMIN.csv").open("w", encoding="utf-8", newline="") as output:
                writer = csv.DictWriter(
                    output,
                    fieldnames=["FECHA_DE_REGISTRO", "PRODUCTO", "PRECIO_MIN_SOLES", "PRECIO_MAX_SOLES"],
                    delimiter=";",
                )
                writer.writeheader()
                writer.writerow({"FECHA_DE_REGISTRO": "2024/01/01 12:00:00.000", "PRODUCTO": "Diesel", "PRECIO_MIN_SOLES": "2,5", "PRECIO_MAX_SOLES": "4,5"})
                writer.writerow({"FECHA_DE_REGISTRO": "2024/01/02 12:00:00.000", "PRODUCTO": "Diesel", "PRECIO_MIN_SOLES": "4,5", "PRECIO_MAX_SOLES": "6,5"})

            result = build_imported_data(root)

        self.assertEqual(result["registryData"]["records"], 2)
        self.assertEqual(result["registryData"]["byDepartment"][0], {"name": "Lima", "records": 1})
        self.assertEqual(result["environmentalData"]["records"], 1)
        self.assertEqual(result["environmentalData"]["dateRange"]["from"], "2024-03-05")
        self.assertFalse(result["environmentalData"]["thresholdsConfigured"])
        latest_price = result["priceObservations"]["latestPrices"][0]
        self.assertEqual(latest_price["period"], "2024-01-02")
        self.assertEqual(latest_price["average"], 17)
        minorist = result["priceObservations"]["minoristRegistry"]
        self.assertEqual(minorist["records"], 2)
        self.assertEqual(minorist["dateRange"]["from"], "2024-01-01")
        self.assertEqual(minorist["byProduct"][0]["averageBandMidpoint"], 4.5)

    def test_missing_optional_files_produce_empty_summaries(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            result = build_imported_data(Path(temporary_directory))

        self.assertEqual(result["registryData"]["records"], 0)
        self.assertEqual(result["environmentalData"]["records"], 0)
        self.assertFalse(result["priceObservations"]["available"])


if __name__ == "__main__":
    unittest.main()
