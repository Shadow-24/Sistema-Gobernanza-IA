import { loadDemandPredictionHistory, type DemandPredictionRecord } from "../../app/demandModelApi";
import type { DashboardSectionContent } from "./dashboardReportData";

type Batch = { id: string; generatedAt: string; predictions: DemandPredictionRecord[] };

const number = (value: number, digits = 1) => value.toLocaleString("es-PE", { maximumFractionDigits: digits });
const monthLabel = (period: string) => {
  const match = period.match(/^(\d{4})-(\d{2})$/);
  if (!match) return period;
  const label = new Date(Number(match[1]), Number(match[2]) - 1).toLocaleDateString("es-PE", { month: "short", year: "numeric" }).replace(".", "");
  return label.charAt(0).toUpperCase() + label.slice(1);
};

export async function loadForecastBatches(): Promise<Batch[] | null> {
  try {
    const { predictions } = await loadDemandPredictionHistory();
    const batches = new Map<string, Batch>();
    predictions.forEach((prediction) => {
      const id = prediction.forecast_id ?? prediction.traceability.forecastId ?? `${prediction.run_id}:${prediction.traceability.generatedAt}`;
      const batch = batches.get(id) ?? { id, generatedAt: prediction.traceability.generatedAt, predictions: [] };
      batch.predictions.push(prediction);
      batches.set(id, batch);
    });
    return Array.from(batches.values())
      .map((batch) => ({ ...batch, predictions: batch.predictions.sort((a, b) => a.period.localeCompare(b.period)) }))
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  } catch {
    return null;
  }
}

export function forecastSummaryContent(batches: Batch[] | null): DashboardSectionContent {
  if (!batches) return { records: [], note: "No se pudo cargar el historial de pronósticos." };
  if (batches.length === 0) return { records: [], note: "Todavía no hay pronósticos guardados; se generan desde el Dashboard después de entrenar y evaluar el modelo." };
  const latest = batches[0];
  const unit = latest.predictions[0]?.unit ?? "galones";
  return {
    kpis: [
      { label: "Pronósticos generados", value: String(batches.length), color: "#0f6cbd" },
      { label: "Meses del último pronóstico", value: String(latest.predictions.length), color: "#8764b8" },
      { label: "Último pronóstico", value: new Date(latest.generatedAt).toLocaleDateString("es-PE"), color: "#107c10" },
      { label: "Versión del modelo", value: (latest.predictions[0]?.traceability.modelVersion || latest.predictions[0]?.model_version || "N/D").replace(/^xgboost-/, ""), color: "#ca5010" },
    ],
    charts: [{
      title: `Último pronóstico por mes · millones de ${unit}`,
      unit: " M",
      items: latest.predictions.map((prediction) => ({ label: monthLabel(prediction.period), value: Math.round((prediction.predicted_value / 1_000_000) * 10) / 10, color: "#0f6cbd" })),
    }],
    records: [],
    note: "Pronósticos de demanda observada de combustibles líquidos guardados con su trazabilidad.",
  };
}

export function forecastHistoryContent(batches: Batch[] | null): DashboardSectionContent {
  if (!batches) return { records: [], note: "No se pudo cargar el historial de pronósticos." };
  return {
    records: batches.map((batch) => {
      const first = batch.predictions[0];
      const trace = first?.traceability;
      return [
        new Date(batch.generatedAt).toLocaleString("es-PE"),
        `Pronóstico de ${batch.predictions.length} ${batch.predictions.length === 1 ? "mes" : "meses"}`,
        `Modelo ${trace?.modelVersion || first?.model_version || "N/D"}`,
        `Fuente: ${trace?.source || "N/D"}`,
        `Datos hasta ${trace?.sourcePeriod || "N/D"}`,
        `Generado por ${trace?.requestedBy || "N/D"}`,
        batch.predictions.map((prediction) => `${monthLabel(prediction.period)}: ${number(prediction.predicted_value, 0)} ${prediction.unit}`).join("; "),
      ].join(" · ");
    }),
    note: "Cada solicitud aparece una vez, con todos sus meses, igual que en la pestaña Trazabilidad.",
  };
}
