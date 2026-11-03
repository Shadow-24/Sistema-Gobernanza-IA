import { useEffect, useState } from "react";
import { loadDemandPredictionHistory, type DemandPredictionRecord } from "../demandModelApi";
import { UserStoryRefs } from "./UserStoryRefs";

type DemandPredictionBatch = {
  id: string;
  generatedAt: string;
  predictions: DemandPredictionRecord[];
};

function formatForecastPeriod(period: string): string {
  const match = period.match(/^(\d{4})-(\d{2})$/);
  if (!match) return period;
  return new Date(Number(match[1]), Number(match[2]) - 1).toLocaleDateString("es-PE", {
    month: "long",
    year: "numeric",
  });
}

function normalizeForecastSearch(value: string): string {
  return value
    .toLocaleLowerCase("es-PE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function Card({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={`bg-white rounded ${className}`} style={{ border: "1px solid #e1dfdd", ...style }}>{children}</div>;
}

export function TraceabilityModule() {
  const [demandPredictionHistory, setDemandPredictionHistory] = useState<DemandPredictionRecord[]>([]);
  const [demandTraceLoading, setDemandTraceLoading] = useState(true);
  const [demandTraceError, setDemandTraceError] = useState("");
  const [predictionHistorySearch, setPredictionHistorySearch] = useState("");

  useEffect(() => {
    let active = true;
    loadDemandPredictionHistory()
      .then((history) => {
        if (active) setDemandPredictionHistory(history.predictions);
      })
      .catch((error: unknown) => {
        if (active) setDemandTraceError(error instanceof Error ? error.message : "No se pudo cargar la trazabilidad de las predicciones.");
      })
      .finally(() => {
        if (active) setDemandTraceLoading(false);
      });

    return () => { active = false; };
  }, []);

  const predictionBatches = Array.from(demandPredictionHistory.reduce((batches, prediction) => {
    const id = prediction.forecast_id
      ?? prediction.traceability.forecastId
      ?? `${prediction.run_id}:${prediction.traceability.generatedAt}`;
    const batch = batches.get(id) ?? {
      id,
      generatedAt: prediction.traceability.generatedAt,
      predictions: [],
    };
    batch.predictions.push(prediction);
    batches.set(id, batch);
    return batches;
  }, new Map<string, DemandPredictionBatch>()).values())
    .map((batch) => ({
      ...batch,
      predictions: batch.predictions.sort((a, b) => a.period.localeCompare(b.period)),
    }))
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  const filteredPredictionBatches = predictionBatches.filter((batch) => (
    batch.predictions.some((prediction) => (
      normalizeForecastSearch(`${formatForecastPeriod(prediction.period)} ${prediction.period}`)
        .includes(normalizeForecastSearch(predictionHistorySearch))
    ))
  ));
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[18px] font-semibold" style={{ color: "#201f1e" }}>Trazabilidad</h1>
        <p className="text-[13px] mt-1" style={{ color: "#605e5c" }}>Consulta el historial de predicciones de demanda generadas.</p>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-[14px] font-semibold" style={{ color: "#201f1e" }}>Pronósticos generados</div>
          <UserStoryRefs ids={["HU-009", "HU-010", "HU-017"]} />
        </div>
        <p className="text-[11px] mb-3" style={{ color: "#8a8886" }}>
          Cada solicitud aparece una vez, con todos los meses incluidos.
        </p>
        {demandTraceError ? (
          <p className="text-[12px]" role="alert" style={{ color: "#a4262c" }}>{demandTraceError}</p>
        ) : demandTraceLoading ? (
          <p className="text-[12px]" style={{ color: "#605e5c" }}>Cargando pronósticos…</p>
        ) : demandPredictionHistory.length ? (
          <div className="space-y-2">
            <label className="block text-[11px]" style={{ color: "#605e5c" }}>
              Buscar por mes o año
              <input
                type="search"
                value={predictionHistorySearch}
                onChange={(event) => setPredictionHistorySearch(event.target.value)}
                placeholder="Ej.: junio, 2025 o 2025-06"
                className="mt-1 w-full rounded border px-2 py-1.5 text-[12px]"
                style={{ borderColor: "#e1dfdd" }}
              />
            </label>
            {filteredPredictionBatches.length ? filteredPredictionBatches.map((batch) => (
              <div key={batch.id} className="rounded p-3" style={{ background: "#f9f8f7" }}>
                <div className="flex flex-wrap justify-between gap-2 mb-2">
                  <span className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>
                    Pronóstico de {batch.predictions.length} {batch.predictions.length === 1 ? "mes" : "meses"}
                  </span>
                  <span className="text-[11px]" style={{ color: "#605e5c" }}>
                    {new Date(batch.generatedAt).toLocaleString("es-PE")}
                  </span>
                </div>
                <details className="mb-2">
                  <summary className="cursor-pointer text-[11px] font-medium" style={{ color: "#605e5c" }}>
                    Ver datos de trazabilidad
                  </summary>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mt-2 text-[11px]" style={{ color: "#605e5c" }}>
                    <div><dt className="inline font-medium">Versión del modelo: </dt><dd className="inline">{batch.predictions[0].traceability.modelVersion || "No disponible"}</dd></div>
                    <div><dt className="inline font-medium">Fuente de datos: </dt><dd className="inline">{batch.predictions[0].traceability.source || "No disponible"}</dd></div>
                    <div><dt className="inline font-medium">Datos hasta: </dt><dd className="inline">{batch.predictions[0].traceability.sourcePeriod || "No disponible"}</dd></div>
                    <div><dt className="inline font-medium">Generado por: </dt><dd className="inline">{batch.predictions[0].traceability.requestedBy || "No disponible"}</dd></div>
                  </dl>
                </details>
                <div className="space-y-1">
                  {batch.predictions.map((prediction) => (
                    <div key={prediction.id} className="flex flex-wrap justify-between gap-2 text-[12px]" style={{ color: "#323130" }}>
                      <span className="capitalize">{formatForecastPeriod(prediction.period)}</span>
                      <span className="font-medium">{prediction.predicted_value.toLocaleString("es-PE", { maximumFractionDigits: 0 })} {prediction.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            )) : (
              <p className="py-4 text-center text-[12px]" style={{ color: "#8a8886" }}>
                No se encontraron pronósticos que coincidan con la búsqueda.
              </p>
            )}
          </div>
        ) : (
          <p className="text-[12px]" style={{ color: "#605e5c" }}>Todavía no hay pronósticos guardados. Primero entrena y evalúa el modelo en el Dashboard; después genera un pronóstico para que aparezca aquí.</p>
        )}
      </Card>

    </div>
  );
}
