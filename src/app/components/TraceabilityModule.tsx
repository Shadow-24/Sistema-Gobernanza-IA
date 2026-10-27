import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, AlertTriangle, ArrowRight, BarChart2, CheckCircle, CloudRain, Cpu, Database, FileText, ShieldCheck, Truck } from "lucide-react";
import { useEffect, useState } from "react";
import { csvValue, useSectorData } from "../SectorDataContext";
import { loadForecasts, type ForecastResponse } from "../forecastApi";
import { loadDemandPredictionHistory, type DemandPredictionRecord } from "../demandModelApi";
import { UserStoryRefs } from "./UserStoryRefs";

function Card({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={`bg-white rounded ${className}`} style={{ border: "1px solid #e1dfdd", ...style }}>{children}</div>;
}

// ─── Decision flow definition ─────────────────────────────────────────────────

const flowSteps = [
  { id: 1, icon: Database,    label: "Datos Recibidos",     color: "#0f6cbd", bg: "#eff6ff" },
  { id: 2, icon: Cpu,         label: "Modelo de IA",        color: "#8764b8", bg: "#f5f0fb" },
  { id: 3, icon: ShieldCheck, label: "Revisión AI TRiSM", color: "#107c10", bg: "#f1faf1" },
  { id: 4, icon: AlertTriangle,label: "Riesgo Identificado",color: "#ca5010", bg: "#fff8f0" },
  { id: 5, icon: FileText,    label: "Evidencia Generada",  color: "#986f0b", bg: "#fffbf0" },
  { id: 6, icon: BarChart2,   label: "Reporte / Resolución",color: "#0f6cbd", bg: "#eff6ff" },
];

// ─── Trace records ────────────────────────────────────────────────────────────

const tracesByYear: Record<string, {
  id: string; decision: string; administrado: string; sector: string;
  fecha: string; estado: "Completado" | "En proceso" | "Pendiente";
  source?: string; simulated?: boolean; model?: string; confidence?: number;
  explanation?: { name: string; percent: number }[];
  steps: {
    stepId: number; timestamp: string; descripcion: string; metadata: string; ok: boolean;
  }[];
}[]> = {
  "2024": [
    {
      id: "TRZ-2024-091", decision: "Evaluación de cumplimiento PLUSPETROL Lote 192", administrado: "PLUSPETROL NORTE S.A.", sector: "Hidrocarburos Mayores", fecha: "15/12/2024", estado: "Completado",
      steps: [
        { stepId: 1, timestamp: "15/12 08:00", descripcion: "Consulta de referencias SINADA + CDCLy", metadata: "Datasets históricos · escenario conceptual", ok: true },
        { stepId: 2, timestamp: "15/12 08:12", descripcion: "Clasificación de incidentes (simulación)", metadata: "Versión simulada 2.3 · confianza de escenario 91.2%", ok: true },
        { stepId: 3, timestamp: "15/12 08:15", descripcion: "Evaluación pilares AI TRiSM completada", metadata: "5/6 pilares: OK · Gestión Riesgo: WARN", ok: true },
        { stepId: 4, timestamp: "15/12 08:16", descripcion: "Sesgo en predicción de incidentes detectado", metadata: "Score: 0.73 · Umbral: 0.80 · RSK-001 activado", ok: false },
        { stepId: 5, timestamp: "15/12 08:20", descripcion: "Evidencia demostrativa: AUD-2024-041 + RSK-001", metadata: "Artefactos conceptuales · sin firma digital real", ok: true },
        { stepId: 6, timestamp: "15/12 09:05", descripcion: "RD 0389-2024-OEFA/DFAI emitida con Med. Correctiva", metadata: "Expediente referenciado · 2 resoluciones", ok: true },
      ],
    },
    {
      id: "TRZ-2024-068", decision: "Validación multa TFA OLYMPIC PERU Lote XIII-A", administrado: "OLYMPIC PERU INC SUC. DEL PERU", sector: "Hidrocarburos Mayores", fecha: "27/03/2024", estado: "Completado",
      steps: [
        { stepId: 1, timestamp: "27/03 09:00", descripcion: "Datos expediente 1036-2023 cargados al sistema", metadata: "Historial completo 2022–2024", ok: true },
        { stepId: 2, timestamp: "27/03 09:08", descripcion: "Evaluación conceptual de expediente", metadata: "Puntaje de escenario simulado: 8.4/10", ok: true },
        { stepId: 3, timestamp: "27/03 09:11", descripcion: "Revisión AI TRiSM: Transparencia y Cumplimiento OK", metadata: "6/6 pilares verificados", ok: true },
        { stepId: 4, timestamp: "27/03 09:12", descripcion: "Riesgo alto en escenario conceptual", metadata: "Puntaje demostrativo; no constituye cálculo oficial de multa", ok: true },
        { stepId: 5, timestamp: "27/03 09:15", descripcion: "Referencia de expediente para trazabilidad", metadata: "239-2024-OEFA/TFA-SE · firma no representada", ok: true },
        { stepId: 6, timestamp: "27/03 10:00", descripcion: "Resolución consultable en el dataset de expedientes", metadata: "Referencia histórica · fuente: expedientes resueltos", ok: true },
      ],
    },
    {
      id: "TRZ-2024-044", decision: "Clasificación denuncia SINADA sector HC Lima", administrado: "Sistema SINADA – HC Lima", sector: "Comercialización HC", fecha: "01/09/2024", estado: "En proceso",
      steps: [
        { stepId: 1, timestamp: "01/09 11:00", descripcion: "Consulta conceptual de denuncias de Lima", metadata: "Fuente: dataset histórico SINADA", ok: true },
        { stepId: 2, timestamp: "01/09 11:05", descripcion: "Clasificación de denuncias (simulación)", metadata: "Confianza de escenario: 74.1% · valor simulado", ok: false },
        { stepId: 3, timestamp: "01/09 11:06", descripcion: "Evaluación conceptual AI TRiSM", metadata: "Riesgo asociado RSK-004 · análisis demostrativo", ok: false },
        { stepId: 4, timestamp: "Pendiente", descripcion: "Riesgo Medio activo – pendiente resolución", metadata: "AUD-2024-028 asociada", ok: false },
        { stepId: 5, timestamp: "Pendiente", descripcion: "Evidencia parcial – requiere etiquetado manual", metadata: "9 artefactos registrados", ok: false },
        { stepId: 6, timestamp: "Pendiente", descripcion: "Reporte pendiente de validación", metadata: "En revisión Compliance Officer", ok: false },
      ],
    },
    {
      id: "TRZ-2024-103", decision: "Evaluación conceptual de inventario en instalación fija", administrado: "Instalación de referencia CDCLyOPDH", sector: "Cadena de suministro · Inventario", fecha: "Escenario Q4 2024", estado: "En proceso", source: "CDCLyOPDH: registro histórico de instalación/capacidad; nivel de inventario simulado", simulated: true, model: "Detección de Anomalías de Inventario · sim. 1.0", confidence: 91,
      explanation: [{ name: "Nivel de escenario", percent: 42 }, { name: "Capacidad registrada", percent: 31 }, { name: "Variación simulada", percent: 18 }, { name: "Otros factores", percent: 9 }],
      steps: [
        { stepId: 1, timestamp: "CSV 2017", descripcion: "Instalación y capacidad registrada consultadas", metadata: "CDCLyOPDH · no contiene existencias actuales", ok: true },
        { stepId: 2, timestamp: "Simulado", descripcion: "Evaluación de nivel de inventario", metadata: "Modelo conceptual · sim. 1.0", ok: true },
        { stepId: 3, timestamp: "Simulado", descripcion: "Evaluación AI TRiSM", metadata: "Explicabilidad y revisión humana", ok: true },
        { stepId: 4, timestamp: "Simulado", descripcion: "Nivel fuera del patrón de escenario", metadata: "Riesgo Alto · confianza simulada 91%", ok: false },
        { stepId: 5, timestamp: "Simulado", descripcion: "Evidencia conceptual vinculada", metadata: "No constituye medición operacional", ok: true },
        { stepId: 6, timestamp: "Pendiente", descripcion: "Reporte sujeto a validación", metadata: "Requiere existencias verificadas", ok: false },
      ],
    },
    {
      id: "TRZ-2024-104", decision: "Traslado conceptual de distribución Lima - Callao", administrado: "Escenario académico de distribución", sector: "Cadena de suministro · Distribución", fecha: "Escenario Q4 2024", estado: "En proceso", source: "Ruta, envío y estado simulados; no existen en los CSV", simulated: true, model: "Detección de Anomalías de Transporte · sim. 1.0", confidence: 86,
      explanation: [{ name: "Historial simulado", percent: 42 }, { name: "Estado de ruta simulado", percent: 31 }, { name: "Ventana de traslado", percent: 18 }, { name: "Otros factores", percent: 9 }],
      steps: [
        { stepId: 1, timestamp: "Escenario", descripcion: "Origen, destino y envío conceptual", metadata: "Lima → Callao · no proviene de registro real", ok: true },
        { stepId: 2, timestamp: "Simulado", descripcion: "Evaluación de anomalía de transporte", metadata: "Modelo conceptual · sim. 1.0", ok: true },
        { stepId: 3, timestamp: "Simulado", descripcion: "Evaluación AI TRiSM", metadata: "Transparencia, riesgo y supervisión humana", ok: true },
        { stepId: 4, timestamp: "Simulado", descripcion: "Posible retraso identificado", metadata: "Riesgo Medio · resultado no operacional", ok: false },
        { stepId: 5, timestamp: "Simulado", descripcion: "Evidencia explicable del escenario", metadata: "Factores demostrativos", ok: true },
        { stepId: 6, timestamp: "Pendiente", descripcion: "Reporte para revisión humana", metadata: "Sin conexión a sistemas de transporte", ok: false },
      ],
    },
    {
      id: "TRZ-2024-101", decision: "Evaluación de riesgo de transporte Lima - Callao", administrado: "Escenario académico de transporte", sector: "Cadena de suministro · Transporte", fecha: "Escenario Q4 2024", estado: "En proceso", source: "CDCLyOPDH (instalaciones) + escenario de ruta simulado", simulated: true, model: "Evaluación de Riesgo de Ruta · sim. 1.0", confidence: 91,
      explanation: [{ name: "Historial de escenario", percent: 42 }, { name: "Condición de ruta simulada", percent: 31 }, { name: "Volumen de escenario", percent: 18 }, { name: "Otros factores", percent: 9 }],
      steps: [
        { stepId: 1, timestamp: "Escenario", descripcion: "Datos de instalaciones + ruta conceptual", metadata: "Fuente CDCLyOPDH; ruta no incluida en el dataset", ok: true },
        { stepId: 2, timestamp: "Simulado", descripcion: "Evaluación de riesgo de ruta", metadata: "Modelo de IA simulado · versión 1.0", ok: true },
        { stepId: 3, timestamp: "Simulado", descripcion: "Evaluación AI TRiSM conceptual", metadata: "Transparencia, riesgo y supervisión humana", ok: true },
        { stepId: 4, timestamp: "Simulado", descripcion: "Riesgo alto identificado", metadata: "SIM-TRN-002 · resultado demostrativo, no operacional", ok: false },
        { stepId: 5, timestamp: "Simulado", descripcion: "Evidencia conceptual", metadata: "AUD-2024-055 · factores explicables en este prototipo", ok: true },
        { stepId: 6, timestamp: "Pendiente", descripcion: "Recomendación para revisión humana", metadata: "Sin conexión a sistemas de transporte", ok: false },
      ],
    },
  ],
  "2025": [
    {
      id: "TRZ-2025-008", decision: "Revisión conceptual de referencias PLUSPETROL Lote 192 – Q1 2025", administrado: "PLUSPETROL NORTE S.A.", sector: "Hidrocarburos Mayores", fecha: "31/03/2025", estado: "En proceso", source: "Datasets históricos SINADA + CDCLyOPDH", simulated: true,
      steps: [
        { stepId: 1, timestamp: "31/03", descripcion: "Consulta conceptual de referencias CDCLy + SINADA", metadata: "Datasets históricos; sin actualización automática", ok: true },
        { stepId: 2, timestamp: "Simulado", descripcion: "Evaluación de recurrencia (simulación)", metadata: "Escenario demostrativo · no modelo de producción", ok: true },
        { stepId: 3, timestamp: "Simulado", descripcion: "Evaluación conceptual AI TRiSM", metadata: "Riesgo asociado RSK-007 · dato demostrativo", ok: false },
        { stepId: 4, timestamp: "Simulado", descripcion: "Escenario de recurrencia identificado", metadata: "Resultado conceptual; sujeto a revisión humana", ok: false },
        { stepId: 5, timestamp: "Simulado", descripcion: "Referencias de evidencia administrativa", metadata: "AUD-2025-004 · registro demostrativo", ok: true },
        { stepId: 6, timestamp: "Pendiente", descripcion: "Reporte ejecutivo de escenario", metadata: "No representa una actividad real", ok: false },
      ],
    },
  ],
};

const latestTraceYear = Object.keys(tracesByYear).sort((a, b) => Number(b) - Number(a))[0];

export function TraceabilityModule() {
  const yearTraces = tracesByYear[latestTraceYear];
  const supplyChainExamples = latestTraceYear === "2024" ? [] : tracesByYear["2024"].filter((trace) => trace.id === "TRZ-2024-103" || trace.id === "TRZ-2024-104").map((trace) => ({
    ...trace,
    id: trace.id.replace("2024", latestTraceYear),
    fecha: `Escenario Q4 ${latestTraceYear}`,
  }));
  const traces = [...yearTraces, ...supplyChainExamples];
  const { datasets, operationalData, operationalLoading, operationalError } = useSectorData();
  const latestTransport = operationalData?.naturalGas.transport.slice(-1)[0];
  const fuelSalesByMonth = new Map<string, number>();
  operationalData?.liquidFuels.fuelSales.forEach((row) => fuelSalesByMonth.set(row.period, (fuelSalesByMonth.get(row.period) ?? 0) + row.gallons));
  const latestFuelSalesPeriod = Array.from(fuelSalesByMonth.keys()).sort().slice(-1)[0];
  const latestFuelSales = latestFuelSalesPeriod ? { period: latestFuelSalesPeriod, gallons: fuelSalesByMonth.get(latestFuelSalesPeriod) ?? 0 } : undefined;
  const glpSalesByMonth = new Map<string, number>();
  operationalData?.liquidFuels.glpSales.forEach((row) => glpSalesByMonth.set(row.period, (glpSalesByMonth.get(row.period) ?? 0) + row.barrels));
  const latestGlpSalesPeriod = Array.from(glpSalesByMonth.keys()).sort().slice(-1)[0];
  const latestGlpSales = latestGlpSalesPeriod ? { period: latestGlpSalesPeriod, barrels: glpSalesByMonth.get(latestGlpSalesPeriod) ?? 0 } : undefined;
  const latestTrade = operationalData?.liquidFuels.trade.slice(-1)[0];
  const latestFine = operationalData?.liquidFuels.fines.slice(-1)[0];
  const [selectedPeriod, setSelectedPeriod] = useState("Q4");
  const [selectedPredictionKey, setSelectedPredictionKey] = useState("complaints");
  const [centerSort, setCenterSort] = useState("desc");
  const [forecastResponse, setForecastResponse] = useState<ForecastResponse | null>(null);
  const [forecastError, setForecastError] = useState("");
  const [demandPredictionHistory, setDemandPredictionHistory] = useState<DemandPredictionRecord[]>([]);
  const [demandTraceError, setDemandTraceError] = useState("");
  const [predictionHistorySearch, setPredictionHistorySearch] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "forecasts" | "predictions" | "examples">("overview");

  useEffect(() => {
    let active = true;
    loadForecasts()
      .then((response) => {
        if (active) setForecastResponse(response);
      })
      .catch((error: unknown) => {
        if (active) setForecastError(error instanceof Error ? error.message : "Error inesperado al cargar XGBoost.");
      });
    loadDemandPredictionHistory()
      .then((history) => {
        if (active) setDemandPredictionHistory(history.predictions);
      })
      .catch((error: unknown) => {
        if (active) setDemandTraceError(error instanceof Error ? error.message : "No se pudo cargar la trazabilidad de las predicciones.");
      });

    return () => { active = false; };
  }, []);

  const installations = datasets.facilities.slice(0, 3).map((row, index) => ({
    name: csvValue(row, "RAZON SOCIAL") || `Instalación ${index + 1}`,
    department: csvValue(row, "DEPARTAMENTO") || "No especificado",
    capacity: Number(csvValue(row, "CAP.TOTAL CL").replace(/[^0-9.-]/g, "")) || 0,
  }));
  const routes = [
    { name: "Ruta conceptual Lima - Callao", origin: "Lima", destination: "Callao", time: 2.4, risk: "Medio", compliance: 94, incidents: 2, state: "En tránsito" },
    { name: "Ruta conceptual Callao - Ica", origin: "Callao", destination: "Ica", time: 5.8, risk: "Alto", compliance: 87, incidents: 5, state: "Retrasado" },
  ];
  const periods = ["Q1", "Q2", "Q3", "Q4"];
  const sortedInstallations = [...installations].sort((a, b) => centerSort === "desc" ? b.capacity - a.capacity : a.capacity - b.capacity);
  const filteredDemandPredictionHistory = demandPredictionHistory.filter((prediction) => (
    [
      prediction.period,
      prediction.model_version,
      prediction.traceability.requestedBy,
      prediction.traceability.source,
      prediction.traceability.runId,
    ].some((value) => value.toLocaleLowerCase("es-PE").includes(predictionHistorySearch.trim().toLocaleLowerCase("es-PE")))
  ));
  const selectedPrediction = forecastResponse?.predictions.find((prediction) => prediction.key === selectedPredictionKey)
    ?? forecastResponse?.predictions[0];
  const predictionChartData = selectedPrediction
    ? [
        ...selectedPrediction.history.map((month) => ({
          period: month.period,
          historica: month.count,
          predicha: null as number | null,
        })),
        {
          period: selectedPrediction.forecast.period,
          historica: null,
          predicha: selectedPrediction.forecast.count,
        },
      ]
    : [];
  const historyRows = forecastResponse?.predictions.flatMap((prediction) => [
    ...prediction.history.map((item) => ({
      period: item.period,
      process: prediction.label,
      count: item.count,
      unit: prediction.unit,
      status: "Histórico",
      source: prediction.source,
    })),
    {
      period: prediction.forecast.period,
      process: prediction.label,
      count: prediction.forecast.count,
      unit: prediction.unit,
      status: "Pronóstico",
      source: prediction.source,
    },
  ]) ?? [];
  const statusColor = (status: string) => status === "Normal" || status === "Entregado" || status === "Mitigada" ? "#107c10" : status === "Crítico" || status === "Retrasado" ? "#a4262c" : "#ca5010";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[16px] font-semibold" style={{ color: "#201f1e" }}>Trazabilidad</h1>
        <p className="text-[11px] mt-1" style={{ color: "#605e5c" }}>Consulta fuentes operativas, pronósticos y trazas técnicas. Los casos demostrativos se identifican como simulados.</p>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Secciones de trazabilidad">
        {[
          { id: "overview", label: "Resumen operativo", stories: ["HU-001", "HU-002", "HU-003", "HU-004"] },
          { id: "forecasts", label: "Series y pronósticos", stories: [] },
          { id: "predictions", label: "Trazabilidad del modelo", stories: ["HU-009", "HU-010", "HU-016", "HU-017"] },
          { id: "examples", label: "Escenarios de demostración", stories: ["HU-005", "HU-006", "HU-007", "HU-008", "HU-021", "HU-022", "HU-023", "HU-024", "HU-025", "HU-026"] },
        ].map(({ id: tab, label, stories }) => <button
          key={tab}
          type="button"
          aria-pressed={activeTab === tab}
          onClick={() => setActiveTab(tab as typeof activeTab)}
          className="rounded px-3 py-2 text-[11px] font-medium transition-colors"
          style={{ background: activeTab === tab ? "#0f6cbd" : "#ffffff", color: activeTab === tab ? "#ffffff" : "#605e5c", border: `1px solid ${activeTab === tab ? "#0f6cbd" : "#e1dfdd"}` }}
        ><span className="flex flex-col items-start gap-1"><span>{label}</span><UserStoryRefs ids={stories} note={tab === "overview" ? "Datos históricos de contexto; no demuestran inventarios o envíos actuales." : tab === "forecasts" ? "Pronósticos de series administrativas, sin HU directa de demanda de hidrocarburos." : undefined} /></span></button>)}
      </nav>

      {/* Decision Flow Diagram */}
      {activeTab === "examples" && <Card className="p-5">
        <div className="mb-1 flex flex-wrap items-center gap-2"><h2 className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>Flujo de referencia AI TRiSM</h2><span className="rounded px-2 py-0.5 text-[9px]" style={{ background: "#eff6ff", color: "#0f6cbd" }}>Conceptual</span></div>
        <p className="mb-4 text-[9px]" style={{ color: "#8a8886" }}>Etapas de referencia; el flujo no está conectado como proceso ejecutable.</p>
        <div className="overflow-x-auto">
        <div className="flex items-center justify-between gap-1 min-w-[680px]">
          {flowSteps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.id} className="flex items-center gap-1 flex-1">
                <div className="flex-1 flex flex-col items-center">
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-2" style={{ background: step.bg, border: `1.5px solid ${step.color}30` }}>
                    <Icon className="w-5 h-5" style={{ color: step.color }} />
                  </div>
                  <div className="text-center text-[9.5px] font-medium leading-snug" style={{ color: "#201f1e" }}>{step.label}</div>
                  <div className="text-[9px] mt-0.5" style={{ color: "#8a8886" }}>Paso {step.id}</div>
                </div>
                {i < flowSteps.length - 1 && (
                  <ArrowRight className="w-4 h-4 flex-shrink-0 mb-5" style={{ color: "#c8c6c4" }} />
                )}
              </div>
            );
          })}
        </div>
        </div>
      </Card>}

      {activeTab === "forecasts" && <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>Pronóstico experimental de series administrativas</div>
          <span className="rounded px-1.5 py-0.5 text-[9px] font-medium" style={{ background: "#f5f0fb", color: "#8764b8" }}>
            XGBoost
          </span>
        </div>
        <p className="text-[9px] mb-3" style={{ color: "#8a8886" }}>
          Denuncias, expedientes y resoluciones son series administrativas separadas; no se usan como demanda de hidrocarburos.
        </p>
        {forecastError ? (
          <p className="text-[10px]" role="alert" style={{ color: "#a4262c" }}>{forecastError}</p>
        ) : forecastResponse ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
              {forecastResponse.predictions.map((prediction) => (
                <button
                  key={prediction.key}
                  type="button"
                  onClick={() => setSelectedPredictionKey(prediction.key)}
                  className="p-3 rounded text-left"
                  style={{
                    background: selectedPredictionKey === prediction.key ? "#f5f0fb" : "#f9f8f7",
                    border: `1px solid ${selectedPredictionKey === prediction.key ? "#8764b8" : "#e1dfdd"}`,
                  }}
                >
                  <div className="text-[10px] font-semibold" style={{ color: "#201f1e" }}>{prediction.label}</div>
                  <div className="text-[9px] mt-1" style={{ color: "#605e5c" }}>
                    {prediction.forecast.period}: {prediction.forecast.count.toLocaleString("es-PE")} {prediction.unit}
                  </div>
                  <div className="text-[9px] mt-1" style={{ color: "#8a8886" }}>
                    {prediction.coverage.months} meses · {prediction.source}
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-1">
              {forecastResponse.unavailable.map((item) => (
                <p key={item.key} className="text-[9px]" style={{ color: "#605e5c" }}>
                  {item.label}: no pronosticable con el archivo disponible · {item.reason}
                </p>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[10px]" style={{ color: "#605e5c" }}>Calculando pronósticos desde los CSV históricos…</p>
        )}
      </Card>}

      {activeTab === "predictions" && <Card className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>Trazabilidad de predicciones de demanda</div>
          <span className="rounded px-1.5 py-0.5 text-[9px] font-medium" style={{ background: "#f5f0fb", color: "#8764b8" }}>XGBoost</span>
        </div>
        <p className="text-[9px] mb-3" style={{ color: "#8a8886" }}>
          Registros persistidos con versión, periodo objetivo, fuente, periodo de origen, usuario y explicación disponible.
        </p>
        {demandTraceError ? (
          <p className="text-[10px]" role="alert" style={{ color: "#a4262c" }}>{demandTraceError}</p>
        ) : demandPredictionHistory.length ? (
          <div className="space-y-2">
            <label className="block text-[9px]" style={{ color: "#605e5c" }}>
              Filtrar por periodo, versión, usuario, fuente o ejecución
              <input
                type="search"
                value={predictionHistorySearch}
                onChange={(event) => setPredictionHistorySearch(event.target.value)}
                placeholder="Buscar en el historial"
                className="mt-1 w-full rounded border px-2 py-1.5 text-[10px]"
                style={{ borderColor: "#e1dfdd" }}
              />
            </label>
            {filteredDemandPredictionHistory.length ? filteredDemandPredictionHistory.map((prediction) => (
              <div key={prediction.id} className="rounded p-2.5" style={{ background: "#f9f8f7" }}>
                <div className="flex flex-wrap justify-between gap-2 text-[10px]">
                  <span className="font-semibold" style={{ color: "#201f1e" }}>
                    {prediction.period} · {prediction.predicted_value.toLocaleString("es-PE", { maximumFractionDigits: 0 })} {prediction.unit}
                  </span>
                  <span style={{ color: "#605e5c" }}>{prediction.model_version} · SHAP {prediction.explanation.status === "available" ? "disponible" : "no disponible"}</span>
                </div>
                <details className="mt-2 text-[9px]">
                  <summary className="cursor-pointer font-medium" style={{ color: "#0f6cbd" }}>Ver procedencia y explicación técnica</summary>
                  <div className="mt-2" style={{ color: "#8a8886" }}>
                    Fuente: {prediction.traceability.source} · datos hasta {prediction.traceability.sourcePeriod}
                    {" · "}generado {new Date(prediction.traceability.generatedAt).toLocaleString("es-PE")}
                    {" · "}por {prediction.traceability.requestedBy} · ejecución {prediction.traceability.runId}
                  </div>
                  {prediction.explanation.status === "available" && prediction.explanation.localValues?.length ? (
                    <>
                      <p className="mt-2" style={{ color: "#8a8886" }}>Contribuciones SHAP para esta predicción; no implican causalidad.</p>
                      <div className="mt-1 space-y-1">
                        {prediction.explanation.localValues.map(({ feature, contribution }) => (
                          <div key={feature} className="flex justify-between gap-2" style={{ color: "#605e5c" }}>
                            <span>{feature}</span>
                            <span>{contribution > 0 ? "+" : ""}{contribution.toLocaleString("es-PE", { maximumFractionDigits: 2 })} {prediction.unit}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : prediction.explanation.status === "available" ? (
                    <p className="mt-2" style={{ color: "#8a8886" }}>No hay contribuciones SHAP individuales persistidas para esta predicción.</p>
                  ) : (
                    <p className="mt-2" style={{ color: "#8a8886" }}>Explicación individual no disponible{prediction.explanation.reason ? `: ${prediction.explanation.reason}` : "."}</p>
                  )}
                </details>
              </div>
            )) : (
              <p className="py-4 text-center text-[10px]" style={{ color: "#8a8886" }}>
                No se encontraron decisiones que coincidan con el filtro.
              </p>
            )}
          </div>
        ) : (
          <p className="text-[10px]" style={{ color: "#605e5c" }}>Aún no hay predicciones persistidas; entrena el modelo desde el Dashboard para crear el primer registro.</p>
        )}
      </Card>}

      {activeTab === "overview" && <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
            <div>
              <div className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>Capacidad registrada por instalación</div>
              <div className="text-[9px] mt-1" style={{ color: "#8a8886" }}>CDCLyOPDH 2017 · la capacidad no representa existencias actuales ni niveles de inventario</div>
            </div>
            <span className="px-2 py-0.5 rounded text-[9px]" style={{ background: "#eff6ff", color: "#0f6cbd" }}>Registro histórico</span>
          </div>
          <div className="space-y-2">
            {sortedInstallations.slice(0, 3).map((installation) => {
              return <div key={installation.name} className="p-2.5 rounded" style={{ background: "#f9f8f7" }}>
                <div className="flex justify-between gap-2 text-[10px]"><span className="font-medium truncate" style={{ color: "#201f1e" }}>{installation.name} · {installation.department}</span><span className="font-medium flex-shrink-0" style={{ color: "#0f6cbd" }}>{installation.capacity.toLocaleString("es-PE")} gl</span></div>
              </div>;
            })}
          </div>
          <div className="mt-3 p-3 rounded" style={{ background: "#fff8f0", border: "1px solid #f7e0cc" }}>
            <div className="flex items-center gap-2 text-[10px] font-semibold" style={{ color: "#201f1e" }}><Cpu className="w-3.5 h-3.5" style={{ color: "#ca5010" }} />Predicción de inventario no disponible</div>
            <p className="text-[9px] mt-1" style={{ color: "#605e5c" }}>El CSV aporta capacidad e instalaciones, pero no inventarios medidos en fechas sucesivas; no es posible entrenar ni validar un modelo de existencias.</p>
          </div>
      </Card>}

      {activeTab === "forecasts" && <Card className="p-4">
        <div className="text-[12px] font-semibold mb-2" style={{ color: "#201f1e" }}>Datos faltantes para otros pronósticos</div>
          <div className="space-y-3">
            {(forecastResponse?.unavailable ?? []).map((item) => (
              <div key={item.key} className="p-2.5 rounded" style={{ background: "#f9f8f7" }}>
                <div className="text-[10px] font-semibold" style={{ color: "#201f1e" }}>{item.label}</div>
                <div className="text-[9px] mt-1" style={{ color: "#605e5c" }}>{item.reason}</div>
                {item.source && <div className="text-[8px] mt-1" style={{ color: "#8a8886" }}>Fuente revisada: {item.source}</div>}
              </div>
            ))}
            {!forecastResponse && !forecastError && <p className="text-[9px]" style={{ color: "#8a8886" }}>Cargando estado de los datasets…</p>}
          </div>
      </Card>}

      {activeTab === "overview" && <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div><h2 className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>Operación observada</h2><p className="mt-1 text-[9px]" style={{ color: "#8a8886" }}>Último periodo disponible por fuente. Las series son agregadas y no representan rutas o envíos.</p></div>
          <span className="rounded px-2 py-1 text-[9px]" style={{ background: "#f1faf1", color: "#107c10" }}>Datos de fuente</span>
        </div>
        {operationalLoading ? (
          <p className="text-[10px]" style={{ color: "#605e5c" }}>Cargando series desde PostgreSQL…</p>
        ) : operationalError ? (
          <p className="text-[10px]" role="alert" style={{ color: "#a4262c" }}>{operationalError}</p>
        ) : operationalData ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            {[
              {
                label: "Volumen TGP",
                value: latestTransport ? `${latestTransport.packedVolume.toLocaleString("es-PE", { maximumFractionDigits: 0 })} MMPC` : "s/d",
                period: latestTransport?.period ?? "sin periodo",
              },
              {
                label: "Ventas de combustibles",
                value: latestFuelSales ? `${latestFuelSales.gallons.toLocaleString("es-PE", { maximumFractionDigits: 0 })} gal` : "s/d",
                period: latestFuelSales?.period ?? "sin periodo",
              },
              {
                label: "Ventas de GLP",
                value: latestGlpSales ? `${latestGlpSales.barrels.toLocaleString("es-PE", { maximumFractionDigits: 0 })} barriles` : "s/d",
                period: latestGlpSales?.period ?? "sin periodo",
              },
              {
                label: "Comercio exterior",
                value: latestTrade ? `${latestTrade.direction} · ${latestTrade.volumeMbbl.toLocaleString("es-PE", { maximumFractionDigits: 1 })} MBLS` : "s/d",
                period: latestTrade?.period ?? "sin periodo",
              },
              {
                label: "Multas operativas",
                value: latestFine ? `${latestFine.count.toLocaleString("es-PE")} · ${latestFine.uit.toLocaleString("es-PE", { maximumFractionDigits: 0 })} UIT` : "s/d",
                period: latestFine?.period ?? "sin periodo",
              },
            ].map((item) => (
              <div key={item.label} className="p-3 rounded" style={{ background: "#f9f8f7" }}>
                <div className="text-[11px] font-medium" style={{ color: "#201f1e" }}>{item.label}</div>
                <div className="text-[13px] font-semibold mt-1" style={{ color: "#0f6cbd" }}>{item.value}</div>
                <div className="text-[10px] mt-1" style={{ color: "#8a8886" }}>Periodo: {item.period}</div>
              </div>
            ))}
          </div>
        ) : null}
      </Card>}

      {activeTab === "examples" && <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><Truck className="h-3.5 w-3.5" style={{ color: "#0f6cbd" }} /><h2 className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>Comparación ilustrativa de rutas</h2></div>
            <select aria-label="Periodo del escenario" value={selectedPeriod} onChange={(event) => setSelectedPeriod(event.target.value)} className="rounded border px-2 py-1 text-[9px]" style={{ borderColor: "#e1dfdd" }}>{periods.map((period) => <option key={period} value={period}>{period} {latestTraceYear}</option>)}</select>
          </div>
          <p className="text-[9px] mb-3" style={{ color: "#8a8886" }}>Valores simulados para ilustrar la comparación; no hay registros de envíos ni rutas en las fuentes.</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {routes.map((route) => <div key={route.name} className="p-2.5 rounded" style={{ background: "#f9f8f7", border: "1px solid #e1dfdd" }}>
              <div className="text-[10px] font-semibold" style={{ color: "#201f1e" }}>{route.name}</div>
              <div className="text-[9px] mt-1" style={{ color: "#605e5c" }}>{route.origin} → {route.destination} · traslado de combustible</div>
              <div className="grid grid-cols-2 gap-1 mt-2 text-[9px" style={{ color: "#605e5c" }}>
                <span>Tiempo: {route.time} h (sim.)</span><span>Riesgo: {route.risk}</span><span>Cumpl.: {route.compliance}% (sim.)</span><span>Incidencias: {route.incidents} (sim.)</span>
              </div>
              <div className="mt-1 text-[9px] font-medium" style={{ color: statusColor(route.state) }}>Estado: {route.state} · {selectedPeriod} {latestTraceYear} (simulado)</div>
            </div>)}
          </div>
          <div className="flex items-center justify-between text-[9px] px-1" style={{ color: "#605e5c" }}><span>Origen · inventario</span><ArrowRight className="w-3 h-3" /><span>Transporte · evaluación de riesgo</span><ArrowRight className="w-3 h-3" /><span>Destino · distribución</span></div>
          <div className="mt-3 pt-3" style={{ borderTop: "1px solid #f3f2f1" }}>
            <div className="text-[10px] font-semibold mb-2" style={{ color: "#201f1e" }}>Envíos conceptuales</div>
            {routes.map((route, index) => <div key={route.name} className="flex flex-wrap justify-between gap-2 py-1 text-[9px]" style={{ color: "#605e5c" }}><span>{route.origin} → {route.destination} · {index === 0 ? "Entregado" : route.state}</span><span>{selectedPeriod} {latestTraceYear} · riesgo {route.risk} · Simulación</span></div>)}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-[12px] font-semibold mb-1" style={{ color: "#201f1e" }}>Instalaciones y capacidad registrada</div>
          <div className="flex items-center justify-between gap-2 mb-3"><p className="text-[9px]" style={{ color: "#8a8886" }}>Fuente CDCLyOPDH 2017 · no hay mediciones actuales de inventario, incidentes ni cumplimiento</p><select aria-label="Ordenar instalaciones por capacidad" value={centerSort} onChange={(event) => setCenterSort(event.target.value)} className="px-2 py-1 rounded text-[9px] border" style={{ borderColor: "#e1dfdd" }}><option value="desc">Mayor capacidad</option><option value="asc">Menor capacidad</option></select></div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[9px]">
              <thead style={{ color: "#8a8886" }}><tr><th className="pb-2 pr-2">Instalación</th><th className="pb-2 pr-2">Departamento</th><th className="pb-2">Capacidad registrada (gl)</th></tr></thead>
              <tbody>{sortedInstallations.map((installation) => <tr key={installation.name} style={{ borderTop: "1px solid #f3f2f1", color: "#605e5c" }}><td className="py-2 pr-2">{installation.name}</td><td className="py-2 pr-2">{installation.department}</td><td className="py-2">{installation.capacity.toLocaleString("es-PE")}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="text-[8px] mt-2" style={{ color: "#8a8886" }}>La capacidad de almacenamiento no equivale a volumen disponible ni permite pronosticar inventario.</div>
        </Card>
      </div>}

      {activeTab === "forecasts" && <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2"><Activity className="w-3.5 h-3.5" style={{ color: "#8764b8" }} /><div className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>Pronósticos de actividad · XGBoost</div></div>
            {forecastResponse && (
              <select
                aria-label="Serie para el pronóstico"
                value={selectedPrediction?.key ?? ""}
                onChange={(event) => setSelectedPredictionKey(event.target.value)}
                className="px-2 py-1 rounded text-[9px] border"
                style={{ borderColor: "#e1dfdd" }}
              >
                {forecastResponse.predictions.map((prediction) => (
                  <option key={prediction.key} value={prediction.key}>{prediction.label}</option>
                ))}
              </select>
            )}
          </div>
          <p className="text-[9px] mb-2" style={{ color: "#8a8886" }}>
            {selectedPrediction
              ? `${selectedPrediction.label} · fuente ${selectedPrediction.source} · último periodo observado ${selectedPrediction.coverage.to}.`
              : "Estimaciones sobre las series temporales observadas; los pronósticos no sustituyen datos operativos actuales."}
          </p>
          {forecastError ? (
            <div className="py-5 text-[10px]" role="alert" style={{ color: "#a4262c" }}>
              <div>No se pudieron cargar los pronósticos: {forecastError}</div>
              <div className="mt-2" style={{ color: "#605e5c" }}>Inicia el servicio Python con <code>python -m uvicorn api.main:app --reload --port 8000</code>.</div>
            </div>
          ) : selectedPrediction ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={predictionChartData} margin={{ left: 0, right: 8, top: 5, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="#f3f2f1" />
                  <XAxis dataKey="period" tick={{ fontSize: 9, fill: "#8a8886" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "#8a8886" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 10, border: "1px solid #e1dfdd", borderRadius: 4 }} />
                  <Line name={`${selectedPrediction.label} históricos`} dataKey="historica" stroke="#0f6cbd" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                  <Line name="Pronóstico XGBoost" dataKey="predicha" stroke="#ca5010" strokeWidth={2} strokeDasharray="4 3" connectNulls dot={{ r: 4 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
              <div className="text-[9px] mt-1" style={{ color: "#605e5c" }}>
                {selectedPrediction.forecast.period}: ~{selectedPrediction.forecast.count.toLocaleString("es-PE")} {selectedPrediction.unit} ·
                {selectedPrediction.validation.maePerDay !== undefined
                  ? ` validación de ${selectedPrediction.validation.horizonDays} días: MAE ${selectedPrediction.validation.maePerDay} ${selectedPrediction.unit}/día.`
                  : ` validación de ${selectedPrediction.validation.horizonMonths} meses: MAE ${selectedPrediction.validation.maePerMonth} ${selectedPrediction.unit}/mes.`}
                {" "}Cobertura: {selectedPrediction.coverage.from} a {selectedPrediction.coverage.to} ({selectedPrediction.coverage.months} meses).
              </div>
              {selectedPrediction.warnings.map((warning) => (
                <div key={warning} className="text-[9px] mt-2" role="note" style={{ color: "#986f0b" }}>{warning}</div>
              ))}
            </>
          ) : (
            <div className="py-8 text-center text-[10px]" style={{ color: "#605e5c" }}>Calculando pronósticos con XGBoost…</div>
          )}
        </Card>

      </div>}

      {activeTab === "overview" && <Card className="p-4">
        <div className="mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4" style={{ color: "#ca5010" }} /><h2 className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>Cobertura pendiente para monitoreo en ruta</h2></div>
        <div className="grid gap-3 sm:grid-cols-3 text-[10px]" style={{ color: "#605e5c" }}>
          <div><strong className="block" style={{ color: "#201f1e" }}>Envíos y rutas</strong>No hay registros individualizados de envíos, trayectos ni tiempos de traslado.</div>
          <div><strong className="block" style={{ color: "#201f1e" }}>Incidentes y alertas</strong>Sin eventos conectados no se pueden detectar fallas ni emitir alertas operativas.</div>
          <div><strong className="block" style={{ color: "#201f1e" }}>Ambiente</strong>Los muestreos IPASH son históricos; no hay sensores de ruta ni umbrales configurados.</div>
        </div>
      </Card>}

      {activeTab === "forecasts" && <details className="rounded bg-white p-4" style={{ border: "1px solid #e1dfdd" }}>
        <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "#201f1e" }}>Abrir tabla histórica completa</summary>
        <p className="mb-3 mt-1 text-[9px]" style={{ color: "#8a8886" }}>Conteos administrativos y volúmenes de ventas; cada resultado conserva su unidad y cobertura.</p>
        <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-[9px]"><thead style={{ color: "#8a8886" }}><tr><th className="pb-2">Periodo</th><th className="pb-2">Serie</th><th className="pb-2">Valor</th><th className="pb-2">Tipo</th><th className="pb-2">Fuente</th></tr></thead><tbody>{historyRows.map((row, index) => <tr key={`${row.period}-${row.process}-${index}`} style={{ borderTop: "1px solid #f3f2f1", color: "#605e5c" }}><td className="py-2">{row.period}</td><td className="py-2">{row.process}</td><td className="py-2">{row.count.toLocaleString("es-PE")} {row.unit}</td><td className="py-2 font-medium" style={{ color: row.status === "Pronóstico" ? "#ca5010" : "#0f6cbd" }}>{row.status}</td><td className="py-2">{row.source}</td></tr>)}</tbody></table>
          {historyRows.length === 0 && <div className="py-4 text-center text-[10px]" style={{ color: "#8a8886" }}>{forecastError || "Cargando series temporales…"}</div>}
        </div>
      </details>}

      {/* Trace Records */}
      {activeTab === "examples" && <div className="space-y-4">
        <div>
          <h2 className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>Trazas técnicas de ejemplo</h2>
          <p className="mt-1 text-[9px]" style={{ color: "#8a8886" }}>Ilustran los pasos y artefactos que tendría una evaluación; no son ejecuciones reales guardadas en PostgreSQL.</p>
        </div>
        {traces.map(trace => {
          const stateColor = trace.estado === "Completado" ? "#107c10" : trace.estado === "En proceso" ? "#ca5010" : "#8764b8";
          const stateBg = trace.estado === "Completado" ? "#f1faf1" : trace.estado === "En proceso" ? "#fff8f0" : "#f5f0fb";
          return (
            <Card key={trace.id} className="p-5">
              {/* Trace header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono" style={{ color: "#8a8886" }}>{trace.id}</span>
                    <span className="px-2 py-0.5 rounded-full text-[9px]" style={{ background: "#eff6ff", color: "#0f6cbd" }}>Demostración</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: stateBg, color: stateColor }}>
                      {trace.estado}
                    </span>
                  </div>
                  <div className="text-[13px] font-semibold" style={{ color: "#201f1e" }}>{trace.decision}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: "#605e5c" }}>{trace.administrado} · {trace.sector}</div>
                  {trace.source && <div className="text-[9px] mt-1" style={{ color: "#8a8886" }}>Fuente: {trace.source}</div>}
                  {trace.model && <div className="text-[9px] mt-1" style={{ color: "#8a8886" }}>Modelo: {trace.model} · confianza simulada {trace.confidence}%</div>}
                </div>
                <div className="text-[11px] flex-shrink-0" style={{ color: "#8a8886" }}>{trace.fecha}</div>
              </div>

              <details className="mt-3">
                <summary className="cursor-pointer text-[10px] font-medium" style={{ color: "#0f6cbd" }}>Ver secuencia técnica y factores del escenario</summary>
              {/* Step-by-step timeline */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-2">
                {trace.steps.map((step, si) => {
                  const flowStep = flowSteps[si];
                  const Icon = flowStep.icon;
                  return (
                    <div key={step.stepId} className="relative">
                      {/* Connector */}
                      {si < trace.steps.length - 1 && (
                        <div className="absolute top-4 left-full w-full h-px z-0" style={{ background: step.ok ? "#e1dfdd" : "#f3f2f1" }} />
                      )}
                      <div className={`relative z-10 rounded p-2.5 ${step.ok ? "" : "opacity-50"}`}
                        style={{ background: step.ok ? flowStep.bg : "#f3f2f1", border: `1px solid ${step.ok ? flowStep.color + "30" : "#e1dfdd"}` }}>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Icon className="w-3 h-3" style={{ color: step.ok ? flowStep.color : "#8a8886" }} />
                          {step.ok
                            ? <CheckCircle className="w-2.5 h-2.5" style={{ color: "#107c10" }} />
                            : <AlertTriangle className="w-2.5 h-2.5" style={{ color: "#ca5010" }} />
                          }
                        </div>
                        <div className="text-[9px] font-medium leading-snug mb-1" style={{ color: step.ok ? "#201f1e" : "#8a8886" }}>{step.descripcion}</div>
                        <div className="text-[8.5px] leading-snug" style={{ color: "#8a8886" }}>{step.metadata}</div>
                        <div className="text-[8px] mt-1.5" style={{ color: "#c8c6c4" }}>{step.timestamp}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {trace.explanation && (
                <div className="mt-3 text-[10px]">
                  <div className="font-medium" style={{ color: "#201f1e" }}>Factores de demostración</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2" style={{ color: "#605e5c" }}>
                    {trace.explanation.map((factor) => <span key={factor.name}>{factor.name}: {factor.percent}%</span>)}
                  </div>
                  <p className="mt-1" style={{ color: "#8a8886" }}>Explicación y ponderaciones simuladas; no generadas por un modelo real.</p>
                </div>
              )}
              </details>
            </Card>
          );
        })}
      </div>}
    </div>
  );
}
