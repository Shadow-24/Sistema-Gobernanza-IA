import { useEffect, useState } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Building2 } from "lucide-react";
import { useAuth } from "../AuthContext";
import { UserStoryRefs } from "./UserStoryRefs";
import { ModelGovernancePanel } from "./ModelGovernancePanel";
import { csvValue, groupCount, useSectorData } from "../SectorDataContext";
import {
  loadDemandModelStatus,
  predictDemandModel,
  trainDemandModel,
  type DemandForecastResponse,
  type DemandModelStatus,
} from "../demandModelApi";

// ─── Shared primitives ──────────────────────────────────────────────────────

function Card({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`bg-white rounded ${className}`} style={{ border: "1px solid #e1dfdd", ...style }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[15px] font-semibold mb-4" style={{ color: "#201f1e" }}>{children}</h2>;
}

function formatMetric(value: number | null | undefined, suffix = ""): string {
  return value == null ? "No disponible" : `${value.toLocaleString("es-PE", { maximumFractionDigits: 2 })}${suffix}`;
}

// ─── Data ────────────────────────────────────────────────────────────────────

// ─── Component ───────────────────────────────────────────────────────────────

export function ExecutiveDashboard() {
  const { user } = useAuth();
  const [dashboardTab, setDashboardTab] = useState<"operacion" | "hidrocarburos" | "demanda">("demanda");
  const {
    datasets,
    loading,
    hydrocarbonData,
    hydrocarbonLoading,
    hydrocarbonError,
    operationalData,
    operationalLoading,
    operationalError,
  } = useSectorData();
  const [demandModelStatus, setDemandModelStatus] = useState<DemandModelStatus | null>(null);
  const [demandModelError, setDemandModelError] = useState<string | null>(null);
  const [demandTraining, setDemandTraining] = useState(false);
  const [demandPredictionLoading, setDemandPredictionLoading] = useState(false);
  const [demandHorizon, setDemandHorizon] = useState(1);
  const [demandPredictions, setDemandPredictions] = useState<DemandForecastResponse["predictions"]>([]);
  useEffect(() => {
    let active = true;
    loadDemandModelStatus()
      .then((status) => {
        if (!active) return;
        setDemandModelStatus(status);
        if (status.forecast) {
          setDemandPredictions([{
            ...status.forecast,
            explanation: { status: status.explainability?.evaluation.status ?? "unavailable" },
          }]);
        }
      })
      .catch((error: unknown) => {
        if (active) setDemandModelError(error instanceof Error ? error.message : "No se pudo consultar el modelo de demanda.");
      });
    return () => { active = false; };
  }, []);

  const runDemandTraining = async () => {
    setDemandTraining(true);
    setDemandModelError(null);
    try {
      const result = await trainDemandModel();
      setDemandModelStatus(result);
      if (result.forecast) {
        setDemandPredictions([{
          ...result.forecast,
          explanation: { status: result.explainability?.evaluation.status ?? "unavailable" },
        }]);
      }
    } catch (error) {
      setDemandModelError(error instanceof Error ? error.message : "No se pudo entrenar y evaluar el modelo.");
    } finally {
      setDemandTraining(false);
    }
  };

  const runDemandPrediction = async () => {
    setDemandPredictionLoading(true);
    setDemandModelError(null);
    try {
      const forecast = await predictDemandModel(demandHorizon);
      setDemandPredictions(forecast.predictions);
    } catch (error) {
      setDemandModelError(error instanceof Error ? error.message : "No se pudo generar el pronóstico de demanda.");
    } finally {
      setDemandPredictionLoading(false);
    }
  };

  const facilitiesByDepartment = groupCount(datasets.facilities, ["DEPARTAMENTO"]).slice(0, 10);
  const inventoryFacilities = datasets.facilities.slice(0, 3).map((row, index) => ({
    name: csvValue(row, "RAZON SOCIAL") || `Instalación ${index + 1}`,
    department: csvValue(row, "DEPARTAMENTO") || "No especificado",
    registeredCapacity: csvValue(row, "CAP.TOTAL CL"),
  }));
  const kpis = [
    { icon: Building2, label: "Instalaciones registradas", value: loading ? "…" : datasets.facilities.length.toLocaleString("es-PE"), accent: "#0f6cbd" },
  ];
  const determinationMonths = hydrocarbonData?.determinations ?? [];
  const supervisionMonths = hydrocarbonData?.supervision ?? [];
  const latestDetermination = determinationMonths[determinationMonths.length - 1];
  const latestSupervision = supervisionMonths[supervisionMonths.length - 1];
  const determinationTrend = determinationMonths.slice(-12).map((month) => ({
    ...month,
    periodLabel: `${month.label} ${month.year}`,
    productionValue: month.productionValueUsd / 1_000_000,
    canonAndParticipation: month.canonAndParticipationUsd / 1_000_000,
  }));
  const supervisionTrend = supervisionMonths.slice(-12).map((month) => ({
    ...month,
    periodLabel: `${month.label} ${month.year}`,
  }));
  const gasTransport = operationalData?.naturalGas.transport ?? [];
  const fuelSales = operationalData?.liquidFuels.fuelSales ?? [];
  const glpSales = operationalData?.liquidFuels.glpSales ?? [];
  const monthlyFuelSales = Array.from(fuelSales.reduce((totals, row) => {
    totals.set(row.period, (totals.get(row.period) ?? 0) + row.gallons);
    return totals;
  }, new Map<string, number>()), ([period, gallons]) => ({ period, gallons }))
    .sort((a, b) => a.period.localeCompare(b.period)).slice(-12);
  const monthlyGlpSales = Array.from(glpSales.reduce((totals, row) => {
    totals.set(row.period, (totals.get(row.period) ?? 0) + row.barrels);
    return totals;
  }, new Map<string, number>()), ([period, barrels]) => ({ period, barrels }))
    .sort((a, b) => a.period.localeCompare(b.period)).slice(-12);
  const latestFuelPeriod = monthlyFuelSales[monthlyFuelSales.length - 1];
  const latestGlpPeriod = monthlyGlpSales[monthlyGlpSales.length - 1];
  const latestTransport = gasTransport[gasTransport.length - 1];
  const gasProduction = operationalData?.naturalGas.production ?? [];
  const latestProductionPeriod = gasProduction[gasProduction.length - 1]?.period;
  const latestProduction = gasProduction.filter((row) => row.period === latestProductionPeriod);
  const gasExports = operationalData?.naturalGas.exports ?? [];
  const latestGasExports = gasExports[gasExports.length - 1];
  const latestFuelPrices = (operationalData?.liquidFuels.fuelPrices ?? [])
    .filter((row) => row.period === (operationalData?.liquidFuels.fuelPrices ?? []).slice(-1)[0]?.period)
    .slice(0, 8);
  const latestDistribution = (operationalData?.naturalGas.distribution ?? [])
    .filter((row) => row.period === (operationalData?.naturalGas.distribution ?? []).slice(-1)[0]?.period);
  const latestNetwork = (operationalData?.naturalGas.network ?? [])
    .filter((row) => row.period === (operationalData?.naturalGas.network ?? []).slice(-1)[0]?.period);
  const latestTradePeriod = (operationalData?.liquidFuels.trade ?? []).slice(-1)[0]?.period;
  const latestTrade = (operationalData?.liquidFuels.trade ?? [])
    .filter((row) => row.period === latestTradePeriod);
  const latestFines = operationalData?.liquidFuels.fines.slice(-1)[0];
  const latestPriceStructure = (operationalData?.liquidFuels.priceStructure ?? [])
    .filter((row) => row.period === (operationalData?.liquidFuels.priceStructure ?? []).slice(-1)[0]?.period)
    .slice(0, 6);
  const canTrainDemandModel = user?.role === "Analista de Datos" || user?.role === "Supervisor de Cumplimiento";
  const demandMetrics = demandModelStatus?.metrics?.hybrid ?? demandModelStatus?.metrics?.xgboost;
  const selectedDemandSources = (demandModelStatus?.dataSources ?? []).filter(
    (source) => source.provider === "U.S. Energy Information Administration" && source.status === "selected",
  );

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between" style={{ order: -2 }}>
        <div>
          <h1 className="text-lg font-semibold" style={{ color: "#201f1e" }}>Dashboard</h1>
        </div>
      </div>

      <div role="tablist" aria-label="Secciones del resumen" className="flex flex-wrap gap-2 border-b" style={{ borderColor: "#e1dfdd" }}>
        {([
          { id: "demanda", label: "Demanda y modelo IA", stories: ["HU-009", "HU-010"] },
          { id: "hidrocarburos", label: "Hidrocarburos", stories: ["HU-003", "HU-004"] },
          { id: "operacion", label: "Operación sectorial", stories: ["HU-001", "HU-002", "HU-003", "HU-004"] },
        ] as const).map(({ id: tab, label, stories }) => (
          <button key={tab} type="button" role="tab" aria-selected={dashboardTab === tab} onClick={() => setDashboardTab(tab)}
            className="px-3 py-2 text-[13px] font-medium border-b-2 transition-colors"
            style={{ color: dashboardTab === tab ? "#0f6cbd" : "#605e5c", borderColor: dashboardTab === tab ? "#0f6cbd" : "transparent" }}>
            <span className="flex flex-col items-start gap-1"><span>{label}</span><UserStoryRefs ids={[...stories]} note={tab === "operacion" ? "Series sectoriales históricas relacionadas con las historias de consulta y tendencias; no representan inventarios o envíos en tiempo real." : undefined} /></span>
          </button>
        ))}
      </div>

      {dashboardTab === "operacion" && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {kpis.map((kpi, i) => {
            const Icon = kpi.icon;
            return (
              <Card key={i} className="p-3 sm:p-4">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: `${kpi.accent}18` }}>
                    <Icon className="w-3.5 h-3.5" style={{ color: kpi.accent }} />
                  </div>
                  <div>
                    <div className="text-xl font-semibold leading-none" style={{ color: "#201f1e" }}>{kpi.value}</div>
                    <div className="text-xs font-medium mt-1" style={{ color: "#605e5c" }}>{kpi.label}</div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {dashboardTab === "hidrocarburos" && <>
      <section aria-labelledby="hydrocarbon-data-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <SectionTitle>
            <span id="hydrocarbon-data-title">Hidrocarburos · series históricas</span>
          </SectionTitle>
          {latestDetermination && latestSupervision && (
            <span className="text-[12px]" style={{ color: "#8a8886" }}>
              Últimos datos: determinación {latestDetermination.label} {latestDetermination.year} · supervisiones/PAS {latestSupervision.label} {latestSupervision.year}
            </span>
          )}
        </div>
        {hydrocarbonLoading ? (
          <Card className="p-3 text-xs" style={{ color: "#605e5c" }}>Cargando datos de hidrocarburos…</Card>
        ) : hydrocarbonError ? (
          <Card className="p-3 text-xs" role="alert" style={{ color: "#a4262c" }}>{hydrocarbonError}</Card>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-3">
              {[
                {
                  label: `Valor de producción · ${latestDetermination.label} ${latestDetermination.year}`,
                  value: latestDetermination.productionValueUsd,
                  accent: "#0f6cbd",
                },
                {
                  label: `Canon, sobrecanon y participación · ${latestDetermination.label} ${latestDetermination.year}`,
                  value: latestDetermination.canonAndParticipationUsd,
                  accent: "#107c10",
                },
                {
                  label: `Supervisiones · ${latestSupervision.label} ${latestSupervision.year}`,
                  value: latestSupervision.supervisions,
                  accent: "#8764b8",
                },
                {
                  label: `Procedimientos PAS · ${latestSupervision.label} ${latestSupervision.year}`,
                  value: latestSupervision.pas,
                  accent: "#ca5010",
                },
              ].map((metric) => (
                <Card key={metric.label} className="p-3">
                  <div className="text-lg font-semibold" style={{ color: metric.accent }}>
                    {metric.label.startsWith("Valor de producción") || metric.label.startsWith("Canon,")
                      ? `US$ ${metric.value.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`
                      : metric.value.toLocaleString("es-PE")}
                  </div>
                  <div className="text-[13px] mt-1" style={{ color: "#605e5c" }}>{metric.label}</div>
                </Card>
              ))}
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <Card className="p-4">
                <div className="text-[14px] font-semibold mb-3" style={{ color: "#201f1e" }}>
                  Valor de producción y canon · US$ millones
                </div>
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart
                    data={determinationTrend}
                    margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="2 2" stroke="#f3f2f1" />
                    <XAxis dataKey="periodLabel" tick={{ fontSize: 11, fill: "#8a8886" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#8a8886" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(value, name) => [`US$ ${Number(value).toFixed(1)} M`, name]}
                      contentStyle={{ fontSize: 13, border: "1px solid #e1dfdd", borderRadius: 4 }}
                    />
                    <Bar name="Valor de producción" dataKey="productionValue" fill="#0f6cbd" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    <Bar name="Canon y participación" dataKey="canonAndParticipation" fill="#107c10" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
              <Card className="p-4">
                <div className="text-[14px] font-semibold mb-3" style={{ color: "#201f1e" }}>
                  Supervisiones y procedimientos PAS
                </div>
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={supervisionTrend} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#f3f2f1" />
                    <XAxis dataKey="periodLabel" tick={{ fontSize: 11, fill: "#8a8886" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#8a8886" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ fontSize: 13, border: "1px solid #e1dfdd", borderRadius: 4 }} />
                    <Bar name="Supervisiones" dataKey="supervisions" fill="#8764b8" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    <Bar name="Procedimientos PAS" dataKey="pas" fill="#ca5010" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>
          </>
        )}
      </section>
      </>}

      {dashboardTab === "operacion" && <>
      <section aria-labelledby="operational-data-title">
        <div className="mb-3">
          <SectionTitle>
            <span id="operational-data-title">Operación de gas y combustibles</span>
          </SectionTitle>
          <p className="text-[12px] -mt-3" style={{ color: "#8a8886" }}>
            Indicadores construidos con volúmenes, precios y periodos de los registros sectoriales disponibles. Cada serie conserva su propia fecha de actualización.
          </p>
        </div>
        {operationalLoading ? (
          <Card className="p-3 text-xs" style={{ color: "#605e5c" }}>Cargando indicadores sectoriales…</Card>
        ) : operationalError ? (
          <Card className="p-3 text-xs" role="alert" style={{ color: "#a4262c" }}>{operationalError}</Card>
        ) : operationalData ? (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-3 mb-3">
              {[
                {
                  label: `Producción de gas · ${latestProductionPeriod ?? "s/d"}`,
                  value: latestProduction.length
                    ? `${latestProduction.reduce((sum, row) => sum + row.volume, 0).toLocaleString("es-PE", { maximumFractionDigits: 0 })} miles m³`
                    : "s/d",
                  color: "#0f6cbd",
                },
                {
                  label: `Gas transportado · ${latestTransport?.period ?? "s/d"}`,
                  value: latestTransport ? `${latestTransport.packedVolume.toLocaleString("es-PE", { maximumFractionDigits: 0 })} MMPC` : "s/d",
                  color: "#ca5010",
                },
                {
                  label: `Exportación de gas · ${latestGasExports?.period ?? "s/d"}`,
                  value: latestGasExports ? `${(latestGasExports.volumeCubicMeters / 1_000_000).toLocaleString("es-PE", { maximumFractionDigits: 1 })} MM m³` : "s/d",
                  color: "#8764b8",
                },
                {
                  label: `Ventas combustibles · ${latestFuelPeriod?.period ?? "s/d"}`,
                  value: latestFuelPeriod ? `${(latestFuelPeriod.gallons / 1_000_000).toLocaleString("es-PE", { maximumFractionDigits: 1 })} M gal` : "s/d",
                  color: "#107c10",
                },
                {
                  label: `Ventas GLP · ${latestGlpPeriod?.period ?? "s/d"}`,
                  value: latestGlpPeriod ? `${(latestGlpPeriod.barrels / 1_000).toLocaleString("es-PE", { maximumFractionDigits: 1 })} mil barriles` : "s/d",
                  color: "#8764b8",
                },
                {
                  label: `Multas · ${latestFines?.period ?? "s/d"}`,
                  value: latestFines ? latestFines.count.toLocaleString("es-PE") : "s/d",
                  color: "#a4262c",
                },
              ].map((metric) => (
                <Card key={metric.label} className="p-3">
                  <div className="text-[17px] font-semibold" style={{ color: metric.color }}>{metric.value}</div>
                  <div className="text-[12px] mt-1" style={{ color: "#605e5c" }}>{metric.label}</div>
                </Card>
              ))}
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mb-3">
              <Card className="p-4">
                <div className="text-[13px] font-semibold mb-2" style={{ color: "#201f1e" }}>Transporte por ducto · MMPC mensuales</div>
                <ResponsiveContainer width="100%" height={170}>
                  <LineChart data={gasTransport.slice(-12)} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#f3f2f1" />
                    <XAxis dataKey="period" tick={{ fontSize: 10, fill: "#8a8886" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#8a8886" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #e1dfdd", borderRadius: 4 }} />
                    <Line name="Volumen empacado TGP" dataKey="packedVolume" stroke="#0f6cbd" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line name="Volumen inyectado" dataKey="injectedVolume" stroke="#107c10" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
              <Card className="p-4">
                <div className="text-[13px] font-semibold mb-2" style={{ color: "#201f1e" }}>Ventas de combustibles · millones de galones</div>
                <ResponsiveContainer width="100%" height={170}>
                  <LineChart data={monthlyFuelSales.map((row) => ({ ...row, millionGallons: row.gallons / 1_000_000 }))} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#f3f2f1" />
                    <XAxis dataKey="period" tick={{ fontSize: 10, fill: "#8a8886" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#8a8886" }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(value) => Number(value).toLocaleString("es-PE", { maximumFractionDigits: 2 })} contentStyle={{ fontSize: 12, border: "1px solid #e1dfdd", borderRadius: 4 }} />
                    <Line name="Galones" dataKey="millionGallons" stroke="#ca5010" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
              <Card className="p-4">
                <div className="text-[13px] font-semibold mb-2" style={{ color: "#201f1e" }}>Ventas de GLP · miles de barriles</div>
                <ResponsiveContainer width="100%" height={170}>
                  <LineChart data={monthlyGlpSales.map((row) => ({ ...row, thousandBarrels: row.barrels / 1_000 }))} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#f3f2f1" />
                    <XAxis dataKey="period" tick={{ fontSize: 10, fill: "#8a8886" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#8a8886" }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(value) => Number(value).toLocaleString("es-PE", { maximumFractionDigits: 2 })} contentStyle={{ fontSize: 12, border: "1px solid #e1dfdd", borderRadius: 4 }} />
                    <Line name="Barriles" dataKey="thousandBarrels" stroke="#8764b8" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
              <Card className="p-4">
                <div className="text-[13px] font-semibold mb-2" style={{ color: "#201f1e" }}>Precios de combustibles · promedio por producto</div>
                <p className="text-[11px] mb-2" style={{ color: "#8a8886" }}>Periodo más reciente: {latestFuelPrices[0]?.period ?? "sin datos"} · S/ por unidad publicada</p>
                <div className="space-y-1.5">
                  {latestFuelPrices.map((item) => (
                    <div key={item.product} className="flex justify-between gap-2 text-[12px]">
                      <span className="truncate" style={{ color: "#605e5c" }}>{item.product}</span>
                      <span className="font-medium" style={{ color: "#201f1e" }}>S/ {item.averagePrice.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="pt-2 mt-2" style={{ borderTop: "1px solid #f3f2f1" }}>
                    <p className="text-[11px] mb-1 font-medium" style={{ color: "#605e5c" }}>Precio público MINEM · {latestPriceStructure[0]?.period ?? "sin datos"}</p>
                    {latestPriceStructure.slice(0, 4).map((item) => (
                      <div key={item.product} className="flex justify-between gap-2 text-[11px]">
                        <span className="truncate" style={{ color: "#8a8886" }}>{item.product}</span>
                        <span style={{ color: "#201f1e" }}>S/ {item.publicPrice.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-[13px] font-semibold mb-2" style={{ color: "#201f1e" }}>Comercio exterior de hidrocarburos · MBLS</div>
                <p className="text-[11px] mb-2" style={{ color: "#8a8886" }}>Periodo más reciente: {latestTradePeriod ?? "sin datos"}</p>
                <div className="space-y-1.5">
                  {latestTrade.slice(0, 8).map((item) => (
                    <div key={`${item.direction}-${item.product}`} className="flex justify-between gap-2 text-[12px]">
                      <span className="truncate" style={{ color: "#605e5c" }}>{item.direction} · {item.product}</span>
                      <span className="font-medium" style={{ color: "#201f1e" }}>{item.volumeMbbl.toLocaleString("es-PE", { maximumFractionDigits: 1 })}</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-[13px] font-semibold mb-2" style={{ color: "#201f1e" }}>Distribución de gas natural</div>
                <p className="text-[11px] mb-2" style={{ color: "#8a8886" }}>Volumen y clientes · periodo {latestDistribution[0]?.period ?? "sin datos"}</p>
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {latestDistribution.map((item) => (
                    <div key={item.concession} className="flex justify-between gap-2 text-[12px]">
                      <span className="truncate" style={{ color: "#605e5c" }}>{item.concession}</span>
                      <span className="text-right" style={{ color: "#201f1e" }}>{item.volume.toLocaleString("es-PE", { maximumFractionDigits: 0 })} · {item.customers.toLocaleString("es-PE")} clientes</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] mt-3 mb-1" style={{ color: "#8a8886" }}>Redes reportadas · {latestNetwork[0]?.period ?? "sin datos"}</p>
                <div className="space-y-1">
                  {latestNetwork.slice(0, 5).map((item) => (
                    <div key={item.concession} className="flex justify-between gap-2 text-[11px]">
                      <span className="truncate" style={{ color: "#8a8886" }}>{item.concession}</span>
                      <span style={{ color: "#605e5c" }}>{item.kilometers.toLocaleString("es-PE", { maximumFractionDigits: 1 })} km</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] mt-3 mb-1" style={{ color: "#8a8886" }}>Tarifas de distribución vigentes reportadas</p>
                <div className="space-y-1">
                  {operationalData.naturalGas.tariffs.map((item) => (
                    <div key={item.concession} className="text-[11px] py-1">
                      <div className="flex justify-between gap-2 py-1 font-medium">
                        <span className="truncate" style={{ color: "#8a8886" }}>{item.concession} · {item.period}</span>
                        <span style={{ color: "#605e5c" }}>{item.categories.length} categorías</span>
                      </div>
                      <div className="pl-2 space-y-1">
                        {item.categories.slice(0, 3).map((category) => (
                          <div key={`${item.concession}-${category.category}`}>
                            <div style={{ color: "#605e5c" }}>{category.category} · {category.range}</div>
                            {category.rates.slice(0, 3).map((rate) => (
                              <span key={rate.label} className="mr-2" style={{ color: "#8a8886" }}>{rate.label}: {rate.value}</span>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px]" style={{ color: "#8a8886" }}>
                  Multas: {latestFines?.count.toLocaleString("es-PE") ?? "s/d"} · {latestFines?.uit.toLocaleString("es-PE", { maximumFractionDigits: 0 }) ?? "s/d"} UIT · periodo {latestFines?.period ?? "s/d"}
                </p>
              </Card>
            </div>
          </>
        ) : null}
      </section>
      </>}

      {dashboardTab === "demanda" && <>
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold" style={{ color: "#201f1e" }}>Demanda observada de combustibles líquidos</h2>
              <UserStoryRefs ids={["HU-009", "HU-010"]} />
              <span className="rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ background: "#f5f0fb", color: "#8764b8" }}>XGBoost</span>
            </div>
            <p className="text-[12px] mt-1" style={{ color: "#605e5c" }}>
              Objetivo: ventas mensuales observadas (galones); se usan como indicador de demanda, no como consumo final.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {demandModelStatus?.status === "evaluated" && (
              <>
                <label className="text-[11px]" style={{ color: "#605e5c" }}>
                  Horizonte
                  <select
                    value={demandHorizon}
                    onChange={(event) => setDemandHorizon(Number(event.target.value))}
                    className="ml-1 rounded border px-1.5 py-1 text-[11px]"
                    style={{ borderColor: "#e1dfdd" }}
                  >
                    {[1, 3, 6, 12].map((months) => <option key={months} value={months}>{months} mes{months > 1 ? "es" : ""}</option>)}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={runDemandPrediction}
                  disabled={demandPredictionLoading || demandModelStatus?.sourceIsCurrent === false}
                  className="rounded px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-60"
                  style={{ background: "#0f6cbd" }}
                >
                  {demandPredictionLoading ? "Calculando…" : "Generar pronóstico"}
                </button>
              </>
            )}
            {canTrainDemandModel && (
              <button
                type="button"
                onClick={runDemandTraining}
                disabled={demandTraining}
                className="rounded px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-60"
                style={{ background: "#8764b8" }}
              >
                {demandTraining ? "Entrenando y evaluando…" : "Entrenar y evaluar"}
              </button>
            )}
          </div>
        </div>

        {demandModelError && (
          <div className="mt-3 rounded p-2 text-[12px]" role="alert" style={{ color: "#a4262c", background: "#fdf3f4" }}>
            {demandModelError}
          </div>
        )}
        {!demandModelStatus && !demandModelError && (
          <p className="mt-3 text-[12px]" style={{ color: "#605e5c" }}>Cargando estado de evaluación…</p>
        )}
        {demandModelStatus && demandModelStatus.status !== "evaluated" && (
          <p className="mt-3 text-[12px]" style={{ color: "#605e5c" }}>
            {demandModelStatus.message ?? "La evaluación está pendiente."}
          </p>
        )}
        {demandModelStatus?.status === "evaluated" && demandModelStatus.metrics && (
          <div className="mt-4 space-y-4">
            {demandModelStatus.sourceIsCurrent === false && (
              <div role="status" className="rounded p-2 text-[12px]" style={{ background: "#fff8f0", color: "#8a4b08" }}>
                Estas métricas pertenecen al último modelo guardado y sus fuentes cambiaron después de esa evaluación. Pulsa <strong>Entrenar y evaluar</strong> antes de interpretar la comparación actual de fuentes EIA.
              </div>
            )}
            {demandPredictions.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded p-2" style={{ background: "#f5f0fb" }}>
                <span className="text-[11px] font-semibold" style={{ color: "#8764b8" }}>Pronóstico:</span>
                {demandPredictions.map((prediction) => (
                  <span key={prediction.period} className="flex flex-col text-[11px]" style={{ color: "#201f1e" }}>
                    <span>{prediction.period} · {prediction.value.toLocaleString("es-PE", { maximumFractionDigits: 0 })} {prediction.unit}</span>
                  </span>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="rounded p-3" style={{ background: "#f9f8f7" }}>
                <div className="text-[11px]" style={{ color: "#8a8886" }}>Error promedio (MAE)</div>
                <div className="text-[15px] font-semibold mt-1" style={{ color: "#201f1e" }}>
                  {formatMetric(demandMetrics?.mae, ` ${demandModelStatus.unit}`)}
                </div>
              </div>
              <div className="rounded p-3" style={{ background: "#f9f8f7" }}>
                <div className="text-[11px]" style={{ color: "#8a8886" }}>Error relativo (WAPE)</div>
                <div className="text-[15px] font-semibold mt-1" style={{ color: "#201f1e" }}>
                  {formatMetric(demandMetrics?.wape, "%")}
                </div>
              </div>
            </div>
            {demandModelStatus.testPredictions && demandModelStatus.testPredictions.length > 0 && (
              <div>
                <div className="text-[12px] font-semibold mb-2" style={{ color: "#201f1e" }}>Demanda real y estimada</div>
                <ResponsiveContainer width="100%" height={210}>
                  <LineChart data={demandModelStatus.testPredictions}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#edebe9" />
                    <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#8a8886" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#8a8886" }} tickFormatter={(value: number) => `${(value / 1_000_000).toFixed(0)}M`} />
                    <Tooltip formatter={(value: number) => value.toLocaleString("es-PE", { maximumFractionDigits: 0 })} />
                    <Line name="Real" dataKey="actual" stroke="#107c10" strokeWidth={2} dot={false} />
                    <Line
                      name="Modelo"
                      dataKey={demandModelStatus.metrics.hybrid ? "hybrid" : "xgboost"}
                      stroke="#8764b8"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line name="Referencia estacional" dataKey="baseline" stroke="#0f6cbd" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <details className="rounded p-3" style={{ border: "1px solid #e1dfdd" }}>
              <summary className="cursor-pointer text-[12px] font-medium" style={{ color: "#201f1e" }}>
                Ver detalles de evaluación, fuentes y gobernanza
              </summary>
              <div className="mt-4 space-y-3">
                <div className="text-[11px]" style={{ color: "#605e5c" }}>
                  <span className="font-medium">Periodo evaluado: </span>
                  {demandModelStatus.evaluationPeriod?.from ?? "—"} a {demandModelStatus.evaluationPeriod?.to ?? "—"}
                  {demandModelStatus.testObservations != null && ` · ${demandModelStatus.testObservations} meses`}
                </div>
                <div className="rounded p-2 text-[11px]" style={{ background: "#f9f8f7", color: "#605e5c" }}>
                  <span className="font-medium">Frente a la referencia estacional: </span>
                  {demandModelStatus.metrics.errorReductionPercent == null
                    ? "comparación no disponible."
                    : demandModelStatus.metrics.errorReductionPercent > 0
                      ? `el error se redujo ${formatMetric(demandModelStatus.metrics.errorReductionPercent, "%")} en la prueba.`
                      : demandModelStatus.metrics.errorReductionPercent < 0
                        ? `el error aumentó ${formatMetric(Math.abs(demandModelStatus.metrics.errorReductionPercent), "%")} en la prueba.`
                        : "el error fue igual en la prueba."}
                  {" "}Esta comparación no implica una mejora operativa validada.
                </div>
                <div>
                  <div className="text-[11px] font-medium mb-1" style={{ color: "#605e5c" }}>Fuentes externas consideradas</div>
                  {selectedDemandSources.length > 0 ? (
                    <ul className="list-disc pl-5 text-[11px]" style={{ color: "#605e5c" }}>
                      {selectedDemandSources.map((source) => <li key={source.seriesId ?? source.source}>{source.source}</li>)}
                    </ul>
                  ) : (
                    <p className="text-[11px]" style={{ color: "#8a8886" }}>No se seleccionaron fuentes EIA para este pronóstico.</p>
                  )}
                </div>
                <ModelGovernancePanel scope="demanda" modelName="XGBoost · Predicción de demanda de combustibles líquidos" />
              </div>
            </details>
          </div>
        )}
      </Card>
      </>}

      {dashboardTab === "operacion" && <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div>
            <div className="text-[14px] font-semibold" style={{ color: "#201f1e" }}>Capacidad registrada</div>
          </div>
          <span className="px-2 py-0.5 rounded text-[11px] font-medium" style={{ background: "#eff6ff", color: "#0f6cbd" }}>Histórico · 2017</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {inventoryFacilities.map((facility) => {
            return (
              <div key={`${facility.name}-${facility.department}`} className="p-3 rounded" style={{ background: "#f9f8f7", border: "1px solid #e1dfdd" }}>
                <div className="text-[12px] font-semibold truncate" style={{ color: "#201f1e" }}>{facility.name}</div>
                <div className="text-[11px] mt-0.5" style={{ color: "#8a8886" }}>{facility.department}{facility.registeredCapacity ? ` · Cap. registrada ${Number(facility.registeredCapacity).toLocaleString("es-PE")} gl` : ""}</div>
              </div>
            );
          })}
          {!loading && inventoryFacilities.length === 0 && <p className="text-[12px]" style={{ color: "#8a8886" }}>No hay instalaciones disponibles en el CSV.</p>}
        </div>
      </Card>}

    </div>
  );
}
