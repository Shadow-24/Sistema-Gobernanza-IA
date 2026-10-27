export type ForecastPrediction = {
  key: string;
  label: string;
  source: string;
  unit: string;
  coverage: { months: number; rows: number; from: string; to: string };
  history: { period: string; count: number }[];
  forecast: { period: string; count: number };
  validation: {
    horizonMonths: number;
    maePerMonth: number | null;
    horizonDays?: number;
    maePerDay?: number;
  };
  warnings: string[];
};

export type UnavailablePrediction = {
  key: string;
  label: string;
  source: string | null;
  status: "insufficient_data" | "metadata_only" | "no_dataset";
  records?: number;
  fields?: string[];
  reason: string;
};

export type ForecastResponse = {
  model: string;
  status: string;
  predictions: ForecastPrediction[];
  unavailable: UnavailablePrediction[];
  warnings: string[];
  lastUpdated: string;
};

export async function loadForecasts(): Promise<ForecastResponse> {
  return apiRequest<ForecastResponse>("/api/forecasts");
}
import { apiRequest } from "./apiClient";
