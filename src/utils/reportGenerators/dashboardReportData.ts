import type { DemandModelStatus } from "../../app/demandModelApi";
import type { HydrocarbonData } from "../hydrocarbonData";
import type { OperationalData } from "../operationalData";
import type { ReportChart, ReportKpi } from "./governanceReportData";

export type DashboardSectionContent = { records: string[]; note?: string; kpis?: ReportKpi[]; charts?: ReportChart[] };

export const DASHBOARD_SECTION_IDS = ["demand", "hydrocarbons", "sector-operations", "inventory"];

const number = (value: number, digits = 1) => value.toLocaleString("es-PE", { maximumFractionDigits: digits });
const usd = (value: number) => `US$ ${number(value, 0)}`;
const lastMonths = <T,>(rows: T[], count = 12) => rows.slice(-count);

function monthlyTotals<T extends { period: string }>(rows: T[], valueOf: (row: T) => number) {
  const totals = new Map<string, number>();
  rows.forEach((row) => totals.set(row.period, (totals.get(row.period) ?? 0) + valueOf(row)));
  return Array.from(totals, ([period, value]) => ({ period, value })).sort((a, b) => a.period.localeCompare(b.period));
}

function chart(title: string, rows: { label: string; value: number }[], color: string, unit: string): ReportChart {
  return { title, unit, items: rows.map((row) => ({ label: row.label, value: Math.round(row.value * 10) / 10, color })) };
}

export function hydrocarbonContent(data: HydrocarbonData | null): DashboardSectionContent {
  if (!data) return { records: [], note: "No se pudieron cargar los archivos de hidrocarburos (Determinación 2026 y supervisiones/PAS)." };
  const determinations = data.determinations;
  const supervisions = data.supervision;
  const latestDetermination = determinations[determinations.length - 1];
  const latestSupervision = supervisions[supervisions.length - 1];
  const label = (row: { label: string; year?: number }) => (row.year ? `${row.label} ${row.year}` : `${row.label} 2026`);
  return {
    kpis: [
      { label: `Valor de producción · ${label(latestDetermination)}`, value: `US$ ${number(latestDetermination.productionValueUsd / 1_000_000)} M`, color: "#0f6cbd" },
      { label: `Canon y participación · ${label(latestDetermination)}`, value: `US$ ${number(latestDetermination.canonAndParticipationUsd / 1_000_000)} M`, color: "#107c10" },
      { label: `Supervisiones · ${label(latestSupervision)}`, value: number(latestSupervision.supervisions, 0), color: "#8764b8" },
      { label: `Procedimientos PAS · ${label(latestSupervision)}`, value: number(latestSupervision.pas, 0), color: "#ca5010" },
    ],
    charts: [
      chart("Valor de producción · US$ millones", lastMonths(determinations).map((row) => ({ label: label(row), value: row.productionValueUsd / 1_000_000 })), "#0f6cbd", " M"),
      chart("Canon, sobrecanon y participación · US$ millones", lastMonths(determinations).map((row) => ({ label: label(row), value: row.canonAndParticipationUsd / 1_000_000 })), "#107c10", " M"),
      chart("Supervisiones por mes", lastMonths(supervisions).map((row) => ({ label: label(row), value: row.supervisions })), "#8764b8", ""),
      chart("Procedimientos PAS por mes", lastMonths(supervisions).map((row) => ({ label: label(row), value: row.pas })), "#ca5010", ""),
    ],
    records: [
      ...determinations.map((row) => `${label(row)} · Determinación · Valor de producción ${usd(row.productionValueUsd)} · Canon y participación ${usd(row.canonAndParticipationUsd)}`),
      ...supervisions.map((row) => `${label(row)} · Supervisión · ${number(row.supervisions, 0)} supervisiones · ${number(row.pas, 0)} procedimientos PAS`),
    ],
    note: "Series mensuales históricas de la pestaña Dashboard > Hidrocarburos; no se filtran por el periodo del reporte.",
  };
}

export function sectorOperationsContent(operations: OperationalData | null): DashboardSectionContent {
  if (!operations) return { records: [], note: "No se pudieron cargar los indicadores sectoriales." };
  const { naturalGas, liquidFuels } = operations;
  const latestPeriod = <T extends { period: string }>(rows: T[]) => rows[rows.length - 1]?.period;
  const latestRows = <T extends { period: string }>(rows: T[]) => rows.filter((row) => row.period === latestPeriod(rows));

  const productionPeriod = latestPeriod(naturalGas.production);
  const production = latestRows(naturalGas.production).reduce((sum, row) => sum + row.volume, 0);
  const transport = naturalGas.transport[naturalGas.transport.length - 1];
  const exportsRow = naturalGas.exports[naturalGas.exports.length - 1];
  const fuelSales = monthlyTotals(liquidFuels.fuelSales, (row) => row.gallons);
  const glpSales = monthlyTotals(liquidFuels.glpSales, (row) => row.barrels);
  const fines = liquidFuels.fines[liquidFuels.fines.length - 1];
  const latestFuel = fuelSales[fuelSales.length - 1];
  const latestGlp = glpSales[glpSales.length - 1];

  return {
    kpis: [
      { label: `Producción de gas · ${productionPeriod ?? "s/d"}`, value: productionPeriod ? `${number(production / 1_000)} M m³` : "s/d", color: "#0f6cbd" },
      { label: `Gas transportado · ${transport?.period ?? "s/d"}`, value: transport ? `${number(transport.packedVolume, 0)} MMPC` : "s/d", color: "#ca5010" },
      { label: `Exportación de gas · ${exportsRow?.period ?? "s/d"}`, value: exportsRow ? `${number(exportsRow.volumeCubicMeters / 1_000_000, 2)} MM m³` : "s/d", color: "#8764b8" },
      { label: `Ventas de combustibles · ${latestFuel?.period ?? "s/d"}`, value: latestFuel ? `${number(latestFuel.value / 1_000_000)} M gal` : "s/d", color: "#107c10" },
      { label: `Ventas de GLP · ${latestGlp?.period ?? "s/d"}`, value: latestGlp ? `${number(latestGlp.value / 1_000)} mil bbl` : "s/d", color: "#8764b8" },
      { label: `Multas · ${fines?.period ?? "s/d"}`, value: fines ? number(fines.count, 0) : "s/d", color: "#a4262c" },
    ],
    charts: [
      chart("Transporte por ducto · MMPC empacados", lastMonths(naturalGas.transport).map((row) => ({ label: row.period, value: row.packedVolume })), "#0f6cbd", ""),
      chart("Ventas de combustibles · millones de galones", lastMonths(fuelSales).map((row) => ({ label: row.period, value: row.value / 1_000_000 })), "#ca5010", " M"),
      chart("Ventas de GLP · miles de barriles", lastMonths(glpSales).map((row) => ({ label: row.period, value: row.value / 1_000 })), "#8764b8", " mil"),
    ],
    records: [
      ...latestRows(liquidFuels.fuelPrices).slice(0, 8).map((row) => `${row.period} · Precio promedio ${row.product}: S/ ${row.averagePrice.toFixed(2)}`),
      ...latestRows(liquidFuels.priceStructure).slice(0, 6).map((row) => `${row.period} · Precio público MINEM ${row.product}: S/ ${row.publicPrice.toFixed(2)}`),
      ...latestRows(liquidFuels.trade).slice(0, 8).map((row) => `${row.period} · Comercio exterior ${row.direction} · ${row.product}: ${number(row.volumeMbbl)} MBLS`),
      ...latestRows(naturalGas.distribution).map((row) => `${row.period} · Distribución de gas ${row.concession}: ${number(row.volume, 0)} · ${number(row.customers, 0)} clientes`),
      ...latestRows(naturalGas.network).map((row) => `${row.period} · Red de ${row.concession}: ${number(row.kilometers)} km`),
      ...(fines ? [`${fines.period} · Multas: ${number(fines.count, 0)} · ${number(fines.uit, 0)} UIT`] : []),
    ],
    note: "Series sectoriales de la pestaña Dashboard > Operación sectorial; cada serie conserva su propia fecha de actualización y no representa inventarios ni envíos en tiempo real.",
  };
}

export function demandVisuals(model: DemandModelStatus | null): Pick<DashboardSectionContent, "kpis" | "charts"> {
  const metrics = model?.metrics?.hybrid ?? model?.metrics?.xgboost;
  if (!model || model.status !== "evaluated" || !model.metrics || !metrics) return {};
  const reduction = model.metrics.errorReductionPercent;
  const predictions = lastMonths(model.testPredictions ?? []);
  return {
    kpis: [
      { label: "Error promedio (MAE)", value: `${number(metrics.mae / 1_000_000)} M ${model.unit}`, color: "#0f6cbd" },
      { label: "Error relativo (WAPE)", value: `${number(metrics.wape ?? metrics.mape ?? 0, 2)}%`, color: "#8764b8" },
      { label: "Cambio del error vs. referencia", value: reduction == null ? "N/D" : `${reduction > 0 ? "-" : "+"}${number(Math.abs(reduction), 1)}%`, color: reduction != null && reduction > 0 ? "#107c10" : "#a4262c" },
      { label: model.forecast ? `Pronóstico · ${model.forecast.period}` : "Pronóstico", value: model.forecast ? `${number(model.forecast.value / 1_000_000)} M` : "N/D", color: "#ca5010" },
    ],
    charts: predictions.length ? [
      chart("Demanda real · millones", predictions.map((row) => ({ label: row.period, value: row.actual / 1_000_000 })), "#107c10", " M"),
      chart("Demanda estimada por el modelo · millones", predictions.map((row) => ({ label: row.period, value: (row.hybrid ?? row.xgboost) / 1_000_000 })), "#8764b8", " M"),
    ] : undefined,
  };
}

export function inventoryKpis(facilityCount: number): ReportKpi[] {
  return [{ label: "Instalaciones registradas", value: number(facilityCount, 0), color: "#0f6cbd" }];
}
