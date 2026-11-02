import { useEffect, useState } from "react";
import { csvValue, useSectorData } from "../SectorDataContext";
import { loadDemandPredictionHistory, type DemandPredictionRecord } from "../demandModelApi";
import { UserStoryRefs } from "./UserStoryRefs";

type LinkedCaseFlow = {
  key: string;
  expediente: string;
  administrator: string;
  sector: string;
  caseResolution: string;
  caseResolutionDate: string;
  caseOutcome: string;
  directoralResolution: string;
  directoralDate: string;
  directoralType: string;
};

type DemandPredictionBatch = {
  id: string;
  generatedAt: string;
  source: string;
  sourcePeriod: string;
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
  const { datasets, loading: datasetsLoading, dataError } = useSectorData();
  const [centerSort, setCenterSort] = useState("desc");
  const [demandPredictionHistory, setDemandPredictionHistory] = useState<DemandPredictionRecord[]>([]);
  const [demandTraceLoading, setDemandTraceLoading] = useState(true);
  const [demandTraceError, setDemandTraceError] = useState("");
  const [predictionHistorySearch, setPredictionHistorySearch] = useState("");
  const [flowSearch, setFlowSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"predictions" | "cases">("predictions");

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

  const resolutionByCase = new Map<string, typeof datasets.resolutions>();
  datasets.resolutions.forEach((resolution) => {
    const expediente = csvValue(resolution, "EXPEDIENTE").trim().toLocaleUpperCase("es-PE");
    if (!expediente) return;
    const related = resolutionByCase.get(expediente) ?? [];
    related.push(resolution);
    resolutionByCase.set(expediente, related);
  });
  const linkedCaseFlows: LinkedCaseFlow[] = datasets.cases.flatMap((caseRecord) => {
    const expediente = csvValue(caseRecord, "NRO EXPEDIENTE", "N° EXPEDIENTE").trim();
    const relatedResolutions = resolutionByCase.get(expediente.toLocaleUpperCase("es-PE")) ?? [];
    return relatedResolutions.map((resolution) => ({
      key: `${expediente}-${csvValue(resolution, "NRO RESOLUCIÓN")}`,
      expediente,
      administrator: csvValue(caseRecord, "ADMINISTRADO"),
      sector: csvValue(caseRecord, "SECTOR"),
      caseResolution: csvValue(caseRecord, "RESOLUCION TFA"),
      caseResolutionDate: csvValue(caseRecord, "FECHA DE RESOLUCIÓN"),
      caseOutcome: csvValue(caseRecord, "SENTIDO DE LA RESOLUCIÓN"),
      directoralResolution: csvValue(resolution, "NRO RESOLUCIÓN"),
      directoralDate: csvValue(resolution, "FECHA RD"),
      directoralType: csvValue(resolution, "TIPO DE RD"),
    }));
  });
  const installations = datasets.facilities.slice(0, 3).map((row, index) => ({
    name: csvValue(row, "RAZON SOCIAL") || `Instalación ${index + 1}`,
    department: csvValue(row, "DEPARTAMENTO") || "No especificado",
    capacity: Number(csvValue(row, "CAP.TOTAL CL").replace(/[^0-9.-]/g, "")) || 0,
  }));
  const sortedInstallations = [...installations].sort((a, b) => centerSort === "desc" ? b.capacity - a.capacity : a.capacity - b.capacity);
  const filteredCaseFlows = linkedCaseFlows.filter((flow) => (
    [
      flow.expediente,
      flow.administrator,
      flow.sector,
      flow.caseResolution,
      flow.directoralResolution,
      flow.directoralType,
    ].some((value) => value.toLocaleLowerCase("es-PE").includes(flowSearch.trim().toLocaleLowerCase("es-PE")))
  ));
  const predictionBatches = Array.from(demandPredictionHistory.reduce((batches, prediction) => {
    const id = prediction.forecast_id
      ?? prediction.traceability.forecastId
      ?? `${prediction.run_id}:${prediction.traceability.generatedAt}`;
    const batch = batches.get(id) ?? {
      id,
      generatedAt: prediction.traceability.generatedAt,
      source: prediction.traceability.source,
      sourcePeriod: prediction.traceability.sourcePeriod,
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
        <p className="text-[13px] mt-1" style={{ color: "#605e5c" }}>Consulta las predicciones registradas y las relaciones entre expedientes y resoluciones.</p>
      </div>

      <nav role="tablist" className="flex flex-wrap gap-2 border-b" aria-label="Secciones de trazabilidad" style={{ borderColor: "#e1dfdd" }}>
        {[
          { id: "predictions", label: "Predicciones de demanda", stories: ["HU-009", "HU-010", "HU-016", "HU-017"] },
          { id: "cases", label: "Flujos de expedientes", stories: ["HU-005", "HU-006", "HU-007", "HU-008", "HU-021", "HU-022", "HU-023", "HU-024", "HU-025", "HU-026"] },
        ].map(({ id: tab, label, stories }) => <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={activeTab === tab}
          onClick={() => setActiveTab(tab as typeof activeTab)}
          className="px-3 py-2 text-[14px] font-medium border-b-2 transition-colors"
          style={{ color: activeTab === tab ? "#0f6cbd" : "#605e5c", borderColor: activeTab === tab ? "#0f6cbd" : "transparent" }}
        ><span className="flex flex-col items-start gap-1"><span>{label}</span><UserStoryRefs ids={stories} /></span></button>)}
      </nav>

      {activeTab === "predictions" && <Card className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-[14px] font-semibold" style={{ color: "#201f1e" }}>Pronósticos generados</div>
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
      </Card>}

      {activeTab === "cases" && <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div>
            <h2 className="text-[14px] font-semibold" style={{ color: "#201f1e" }}>Expedientes y resoluciones relacionadas</h2>
            <p className="text-[11px] mt-1" style={{ color: "#8a8886" }}>Relación por número de expediente entre los registros importados de Expedientes resueltos y Resoluciones directorales.</p>
          </div>
          <span className="rounded px-2 py-1 text-[11px]" style={{ background: "#eff6ff", color: "#0f6cbd" }}>
            {dataError ? "Datos no disponibles" : datasetsLoading ? "Cargando…" : `${linkedCaseFlows.length} relaciones encontradas`}
          </span>
        </div>
        {dataError ? (
          <p className="text-[12px]" role="alert" style={{ color: "#a4262c" }}>{dataError}</p>
        ) : datasetsLoading ? (
          <p className="text-[12px]" style={{ color: "#605e5c" }}>Cargando expedientes y resoluciones…</p>
        ) : linkedCaseFlows.length ? (
          <>
            <label className="block text-[11px] mb-3" style={{ color: "#605e5c" }}>
              Buscar por expediente, administrado o resolución
              <input
                type="search"
                value={flowSearch}
                onChange={(event) => setFlowSearch(event.target.value)}
                placeholder="Buscar en los flujos"
                className="mt-1 w-full rounded border px-2 py-1.5 text-[12px]"
                style={{ borderColor: "#e1dfdd" }}
              />
            </label>
            {filteredCaseFlows.length ? (
              <div className="space-y-2">
                {filteredCaseFlows.map((flow) => (
                  <details key={flow.key} className="rounded border p-3" style={{ borderColor: "#e1dfdd" }}>
                    <summary className="cursor-pointer">
                      <span className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>{flow.expediente}</span>
                      <span className="text-[11px] ml-2" style={{ color: "#605e5c" }}>{flow.administrator || flow.sector}</span>
                    </summary>
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-stretch gap-2 mt-3">
                      <div className="rounded p-3" style={{ background: "#f9f8f7" }}>
                        <div className="text-[11px] font-semibold mb-2" style={{ color: "#0f6cbd" }}>Resolución del TFA</div>
                        <div className="text-[12px]" style={{ color: "#201f1e" }}>{flow.caseResolution || "Sin número de resolución"}</div>
                        <div className="text-[11px] mt-1" style={{ color: "#605e5c" }}>{flow.caseResolutionDate || "Fecha no disponible"}</div>
                        {flow.caseOutcome && <div className="text-[11px] mt-1" style={{ color: "#605e5c" }}>Sentido: {flow.caseOutcome}</div>}
                      </div>
                      <div className="flex items-center justify-center text-[10px] font-medium px-2" style={{ color: "#605e5c" }}>Mismo expediente</div>
                      <div className="rounded p-3" style={{ background: "#f9f8f7" }}>
                        <div className="text-[11px] font-semibold mb-2" style={{ color: "#0f6cbd" }}>Resolución directoral</div>
                        <div className="text-[12px]" style={{ color: "#201f1e" }}>{flow.directoralResolution || "Sin número de resolución"}</div>
                        <div className="text-[11px] mt-1" style={{ color: "#605e5c" }}>{flow.directoralDate || "Fecha no disponible"}{flow.directoralType ? ` · ${flow.directoralType}` : ""}</div>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-[12px]" style={{ color: "#8a8886" }}>No se encontraron relaciones con esos criterios.</p>
            )}
          </>
        ) : (
          <p className="text-[12px]" style={{ color: "#605e5c" }}>No se encontraron expedientes vinculados a resoluciones directorales en las fuentes cargadas.</p>
        )}
      </Card>}

      {activeTab === "cases" && <Card className="p-4">
        <div className="text-[14px] font-semibold mb-1" style={{ color: "#201f1e" }}>Instalaciones y capacidad registrada</div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-[11px]" style={{ color: "#8a8886" }}>Fuente CDCLyOPDH 2017 · capacidad registrada por instalación</p>
          <select
            aria-label="Ordenar instalaciones por capacidad"
            value={centerSort}
            onChange={(event) => setCenterSort(event.target.value)}
            className="px-2 py-1 rounded text-[11px] border"
            style={{ borderColor: "#e1dfdd" }}
          >
            <option value="desc">Mayor capacidad</option>
            <option value="asc">Menor capacidad</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead style={{ color: "#8a8886" }}>
              <tr><th className="pb-2 pr-2">Instalación</th><th className="pb-2 pr-2">Departamento</th><th className="pb-2">Capacidad registrada (gl)</th></tr>
            </thead>
            <tbody>
              {sortedInstallations.map((installation) => (
                <tr key={installation.name} style={{ borderTop: "1px solid #f3f2f1", color: "#605e5c" }}>
                  <td className="py-2 pr-2">{installation.name}</td>
                  <td className="py-2 pr-2">{installation.department}</td>
                  <td className="py-2">{installation.capacity.toLocaleString("es-PE")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>}
    </div>
  );
}
