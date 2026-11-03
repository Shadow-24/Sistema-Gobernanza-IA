import jsPDF from "jspdf";
import { simulatedModels, simulatedSupplyChainRisks } from "../../app/governanceScenarios";
import { canGenerateReportWithSections } from "../../app/reportPermissions";
import { loadDemandModelStatus, type DemandModelStatus } from "../../app/demandModelApi";
import { formatCurrency, formatDate, getReportPeriodData, type ReportPeriodData } from "../reportGenerator";
import { EVIDENCE_SECTION_GROUP, formatPeriodLabel, REPORT_SECTION_GROUPS, type ReportConfiguration, type ReportSection } from "../reportConfiguration";
import { apiRequest } from "../../app/apiClient";
import { loadHydrocarbonData } from "../hydrocarbonData";
import { forecastHistoryContent, forecastSummaryContent, loadForecastBatches } from "./traceabilityReportData";
import { demandVisuals, hydrocarbonContent, inventoryKpis, sectorOperationsContent, type DashboardSectionContent } from "./dashboardReportData";
import { auditRows, complianceRows, loadGovernanceReportData, riskRows, visualsFor, type GovernanceReportData, type ReportChart, type ReportKpi } from "./governanceReportData";
import type { OperationalData } from "../operationalData";

export type ReportContentSection = {
  id: string;
  title: string;
  source: string;
  records: string[];
  simulated: boolean;
  baseSource: string;
  note?: string;
  kpis?: ReportKpi[];
  charts?: ReportChart[];
};

type StoredAccessEvent = { timestamp: string; username: string; role: string; action: string; resource: string; result: string };

async function readAccessEvents(startDate: string, endDate: string): Promise<StoredAccessEvent[]> {
  const values = await apiRequest<StoredAccessEvent[]>("/api/access-events");
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T23:59:59.999Z`).getTime();
  return values.filter((event) => {
    const timestamp = new Date(event.timestamp).getTime();
    return Number.isFinite(timestamp) && timestamp >= start && timestamp <= end;
  });
}

function formatCase(item: ReportPeriodData["cases"][number]): string {
  return `${formatDate(item.fecha)} · ${item.codigo} · ${item.sector} · ${item.departamento} · ${formatCurrency(item.monto ?? "")} · ${item.estado}`;
}

function formatResolution(item: ReportPeriodData["resolutions"][number]): string {
  return `${formatDate(item.fecha)} · ${item.id} · ${item.tipo} · ${item.sector} · ${item.departamento} · ${item.descripcion ?? ""}`;
}

function formatComplaint(item: ReportPeriodData["complaints"][number]): string {
  return `${formatDate(item.fecha)} · ${item.codigo} · ${item.departamento} · ${item.estado} · ${item.tipoImpacto}`;
}

function operationsForPeriod(operationalData: OperationalData, startDate: string, endDate: string): string[] {
  const startPeriod = startDate.slice(0, 7);
  const endPeriod = endDate.slice(0, 7);
  const inPeriod = (period: string) => period >= startPeriod && period <= endPeriod;
  const records = [
    ...operationalData.naturalGas.transport.filter((row) => inPeriod(row.period)).map((row) =>
      `${row.period} · Gas natural transportado: ${row.packedVolume.toLocaleString("es-PE")} MMPC empacados; ${row.injectedVolume.toLocaleString("es-PE")} MMPC inyectados`,
    ),
    ...operationalData.naturalGas.distribution.filter((row) => inPeriod(row.period)).map((row) =>
      `${row.period} · Distribución de gas ${row.concession}: ${row.volume.toLocaleString("es-PE")} · ${row.customers.toLocaleString("es-PE")} clientes`,
    ),
    ...operationalData.liquidFuels.fuelSales.filter((row) => inPeriod(row.period)).map((row) =>
      `${row.period} · Venta de ${row.product}: ${row.gallons.toLocaleString("es-PE")} gal`,
    ),
    ...operationalData.liquidFuels.glpSales.filter((row) => inPeriod(row.period)).map((row) =>
      `${row.period} · Venta de GLP ${row.product}: ${row.barrels.toLocaleString("es-PE")} barriles`,
    ),
    ...operationalData.liquidFuels.trade.filter((row) => inPeriod(row.period)).map((row) =>
      `${row.period} · Comercio exterior ${row.direction} de ${row.product}: ${row.volumeMbbl.toLocaleString("es-PE")} Mbbl`,
    ),
  ];
  return records.sort((left, right) => left.localeCompare(right, "es"));
}

function sectionRows(sectionId: string, data: ReportPeriodData, events: StoredAccessEvent[], scenarios: typeof simulatedSupplyChainRisks, models: typeof simulatedModels, demandModel: DemandModelStatus | null, operationalData: OperationalData | null, startDate: string, endDate: string, governance: GovernanceReportData | null): { records: string[]; simulated: boolean; note?: string } {
  const operationalRecords = operationalData ? operationsForPeriod(operationalData, startDate, endDate) : [];
  switch (sectionId) {
    case "general": return { records: [`Expedientes resueltos: ${data.cases.length}`, `Resoluciones: ${data.resolutions.length}`, `Denuncias SINADA: ${data.complaints.length}`, `Multas consignadas en expedientes: ${formatCurrency(data.totalFines)}`, ...operationalRecords.slice(-5)], simulated: false };
    case "complaints": return { records: data.complaints.map(formatComplaint), simulated: false };
    case "historical-data": return { records: [...data.complaints.map(formatComplaint), ...data.cases.map(formatCase), ...data.resolutions.map(formatResolution)], simulated: false };
    case "cases":
    case "case-evidence": return { records: data.cases.map(formatCase), simulated: false };
    case "complaint-evidence": return { records: data.complaints.map(formatComplaint), simulated: false };
    case "resolutions":
    case "related-resolutions":
    case "resolution-evidence": return { records: data.resolutions.map(formatResolution), simulated: false };
    case "inventory":
    case "inventory-trace": return {
      records: data.facilities.map((facility) => `${facility.nombre} · ${facility.departamento} · capacidad registrada ${facility.capacidad || "no consignada"} gl · existencias actuales no disponibles`),
      simulated: false,
      note: "Las instalaciones/capacidades provienen del CSV CDCLyOPDH (2017); no hay datos para calcular existencias o pronosticar inventario.",
    };
    case "risks":
    case "risk-summary":
    case "risk-distribution":
    case "risk-process":
    case "risk-details":
    case "risk-anomalies":
    case "risk-recommendations":
    case "risk-sources":
    case "risk-evidence": return {
      records: governance ? riskRows(sectionId, governance) : [],
      simulated: false,
      note: "Riesgos detectados con el mismo identificador (RSG), estado, nivel y responsable de la pestaña Riesgos. La fecha es la de registro en la aplicación.",
    };
    case "transport": return {
      records: operationalData?.naturalGas.transport
        .filter((row) => row.period >= startDate.slice(0, 7) && row.period <= endDate.slice(0, 7))
        .map((row) => `${row.period} · ${row.packedVolume.toLocaleString("es-PE")} MMPC empacados; ${row.injectedVolume.toLocaleString("es-PE")} MMPC inyectados`) ?? [],
      simulated: false,
      note: "Volúmenes mensuales observados de transporte de gas; no equivalen a rutas ni a incidencias de transporte.",
    };
    case "distribution-routes": return {
      records: operationalData?.naturalGas.distribution
        .filter((row) => row.period >= startDate.slice(0, 7) && row.period <= endDate.slice(0, 7))
        .map((row) => `${row.period} · ${row.concession}: ${row.volume.toLocaleString("es-PE")} · ${row.customers.toLocaleString("es-PE")} clientes`) ?? [],
      simulated: false,
      note: "Volúmenes observados agregados por concesión; no contienen rutas geográficas ni despachos.",
    };
    case "demand": {
      const metrics = demandModel?.metrics?.hybrid ?? demandModel?.metrics?.xgboost;
      const f = (value?: number | null, digits = 2) => value == null ? "no disponible" : value.toLocaleString("es-PE", { maximumFractionDigits: digits });
      return {
        records: demandModel?.status === "evaluated" && demandModel.metrics && metrics ? [
          `Objetivo observado: ventas mensuales de combustibles líquidos · unidad ${demandModel.unit}`,
          `Prueba cronológica: ${demandModel.evaluationPeriod?.from} a ${demandModel.evaluationPeriod?.to} · ${demandModel.testObservations} observaciones`,
          `Estrategia: ${demandModel.forecastStrategy ?? "XGBoost"}`,
          `MAE modelo: ${f(metrics.mae, 0)} ${demandModel.unit} · MAE baseline estacional: ${f(demandModel.metrics.baseline.mae, 0)} ${demandModel.unit}`,
          `RMSE modelo: ${f(metrics.rmse, 0)} ${demandModel.unit} · R²: ${f(metrics.r2)}`,
          `${metrics.mape == null ? "WAPE" : "MAPE"} modelo: ${f(metrics.mape ?? metrics.wape)}%`,
          `Reducción del error frente al baseline: ${demandModel.metrics.errorReductionPercent == null ? "no calculable (MAE baseline cero)" : `${f(demandModel.metrics.errorReductionPercent, 1)}% (positivo mejora MAE; negativo lo empeora)`}`,
          ...(metrics.mapeLimitation ? [metrics.mapeLimitation] : []),
          `Validación de selección: ${demandModel.selectionValidation?.method ?? "no disponible"} · MAE mezcla ${f(demandModel.selectionValidation?.hybridMae, 0)}`,
          `Versión: ${demandModel.modelVersion} · entrenamiento: ${demandModel.trainedAt?.slice(0, 16).replace("T", " ")}`,
          `Pronóstico posterior al último dato: ${demandModel.forecast?.period} · ${f(demandModel.forecast?.value, 0)} ${demandModel.unit}`,
          ...(demandModel.explainability?.evaluation.featureImportance.map((feature) =>
            `Importancia SHAP · ${feature.feature}: ${f(feature.meanAbsoluteShap, 0)}`,
          ) ?? []),
          ...(demandModel.warnings ?? []),
        ] : [],
        simulated: false,
        note: demandModel?.status === "evaluated"
          ? "Ventas observadas agregadas mensualmente; la validación es un holdout temporal y la mezcla se calibra en ventanas anteriores. No equivale a consumo final ni a mejora operativa validada. El periodo seleccionado del reporte no altera el periodo de prueba del modelo."
          : demandModel?.message ?? "No hay una evaluación de demanda persistida; ejecutar entrenamiento y evaluación para incluir métricas.",
      };
    }
    case "traceability":
    case "traced-decisions": return {
      records: scenarios.map((risk) => `${risk.id} · Datos recibidos → ${risk.model} (simulado) → evaluación conceptual AI TRiSM → riesgo ${risk.level} → evidencia demostrativa → revisión humana pendiente`),
      simulated: true,
    };
    case "ai-models": return {
      records: models.map((model) => `${model.name} · ${model.version} · proceso ${model.process} · riesgo ${model.risk} · confianza simulada ${model.confidence}% · ${model.status}`),
      simulated: true,
    };
    case "decision-flow": return {
      records: ["Datos recibidos → Modelo de IA → Evaluación conceptual AI TRiSM → Riesgo identificado → Evidencia generada → Reporte / Resolución"],
      simulated: true,
    };
    case "trends":
    case "supply-history": return {
      records: operationalRecords,
      simulated: false,
      note: operationalRecords.length
        ? "Series observadas de gas, distribución, ventas y comercio exterior; no representan existencias actuales de inventario."
        : "No hay observaciones operativas para el periodo seleccionado; las fuentes pueden tener coberturas diferentes.",
    };
    case "compliance":
    case "compliance-indicators":
    case "norms":
    case "controls-done":
    case "controls-pending":
    case "regulatory-risks":
    case "compliance-history":
    case "related-audits":
    case "evidence-compliance":
    case "compliance-evidence": return {
      records: governance ? complianceRows(sectionId, governance) : [],
      simulated: false,
      note: "Autoevaluación interna registrada en la pestaña Cumplimiento; las fechas son las de registro en la aplicación.",
    };
    case "audits":
    case "audit-summary":
    case "audits-pending":
    case "audits-completed":
    case "audits-progress":
    case "audits-observed":
    case "audit-history":
    case "evidence-audit":
    case "audit-evidence": return {
      records: governance ? auditRows(sectionId, governance) : [],
      simulated: false,
      note: "Auditorías con el estado, etapa y responsable de la pestaña Auditoría; la fecha es la de registro en la aplicación.",
    };
    case "access-logs": return { records: events.map((event) => `${new Date(event.timestamp).toLocaleString("es-PE")} · ${event.username} · ${event.role} · ${event.action} · ${event.resource.replace("|", " – ")} · ${event.result}`), simulated: false, note: "Registro local de accesos; no equivale a un registro de auditorías operativas." };
    case "evidence-traceability":
    case "trace-evidence": return { records: simulatedModels.map((model) => `${model.name} · ${model.version} · artefacto conceptual · confianza simulada ${model.confidence}%`), simulated: true };
    default: return { records: [], simulated: false, note: "No hay contenido disponible para la sección seleccionada." };
  }
}

function allSections(): ReportSection[] {
  return [...REPORT_SECTION_GROUPS.flatMap((group) => group.sections), ...EVIDENCE_SECTION_GROUP.sections];
}

export async function buildConfiguredReportSections(configuration: ReportConfiguration): Promise<ReportContentSection[]> {
  const selectedIds = configuration.reportType === "Evidencias Digitales" ? configuration.evidenceSections : configuration.sections;
  if (!canGenerateReportWithSections(configuration.role, configuration.reportType, selectedIds)) {
    throw new Error("UNAUTHORIZED_REPORT_TYPE");
  }
  const data = await getReportPeriodData(configuration.startDate, configuration.endDate);
  const events = await readAccessEvents(configuration.startDate, configuration.endDate);
  const demandModel = selectedIds.includes("demand") ? await loadDemandModelStatus() : null;
  const needsOperationalData = selectedIds.some((id) => ["general", "trends", "supply-history", "transport", "distribution-routes", "sector-operations"].includes(id));
  const operationalData = needsOperationalData
    ? await apiRequest<OperationalData>("/api/datasets/operations").catch(() => null)
    : null;
  const hydrocarbonData = selectedIds.includes("hydrocarbons") ? await loadHydrocarbonData().catch(() => null) : null;
  const governanceNeeds = {
    risks: selectedIds.some((id) => id === "risks" || id.startsWith("risk-")) && !selectedIds.every((id) => id === "risk-evidence"),
    compliance: selectedIds.some((id) => ["compliance", "compliance-indicators", "norms", "controls-done", "controls-pending", "regulatory-risks", "compliance-history", "evidence-compliance", "compliance-evidence"].includes(id)),
    audits: selectedIds.some((id) => ["audits", "audit-summary", "audits-pending", "audits-completed", "audits-progress", "audits-observed", "audit-history", "related-audits"].includes(id)),
    evidence: selectedIds.some((id) => ["risk-evidence", "evidence-audit", "audit-evidence", "evidence-compliance", "compliance-evidence"].includes(id)),
  };
  const governance = Object.values(governanceNeeds).some(Boolean) ? await loadGovernanceReportData(governanceNeeds) : null;
  const transportOnly = configuration.role === "Ingeniero de Campo"
    || configuration.reportType === "Reporte de Transporte";
  const inventoryOnly = configuration.reportType === "Reporte de Inventario";
  const demandOnly = configuration.reportType === "Reporte de Predicción de Demanda";
  const scenarios = simulatedSupplyChainRisks.filter((risk) => {
    if (transportOnly) return risk.process === "Transporte";
    if (inventoryOnly) return risk.process === "Inventario";
    if (demandOnly) return risk.process === "Demanda";
    return true;
  });
  const models = simulatedModels.filter((model) => {
    if (transportOnly) return model.process === "Transporte";
    if (inventoryOnly) return model.process === "Inventario";
    if (demandOnly) return false;
    return true;
  });
  const forecastBatches = selectedIds.some((id) => id === "forecast-summary" || id === "forecast-history") ? await loadForecastBatches() : null;
  const sections = selectedIds.map((id) => {
    const metadata = allSections().find((section) => section.id === id);
    const content = sectionRows(id, data, events, scenarios, models, demandModel, operationalData, configuration.startDate, configuration.endDate, governance);
    const dashboard: Partial<DashboardSectionContent> | null =
      id === "hydrocarbons" ? hydrocarbonContent(hydrocarbonData)
      : id === "sector-operations" ? sectorOperationsContent(operationalData)
      : id === "demand" ? demandVisuals(demandModel)
      : id === "inventory" ? { kpis: inventoryKpis(data.facilities.length) }
      : id === "forecast-summary" ? forecastSummaryContent(forecastBatches)
      : id === "forecast-history" ? forecastHistoryContent(forecastBatches)
      : null;
    if (dashboard && "records" in dashboard && dashboard.records) {
      content.records = dashboard.records;
      content.note = dashboard.note;
    }
    const visuals = { ...(governance ? visualsFor(id, governance) : {}), ...(dashboard?.kpis ? { kpis: dashboard.kpis } : {}), ...(dashboard?.charts ? { charts: dashboard.charts } : {}) };
    return {
      id,
      title: metadata?.label ?? id,
      source: [metadata?.source, content.note].filter(Boolean).join(" · "),
      baseSource: metadata?.source ?? "",
      note: content.note,
      // Los conteos de estas secciones ya se muestran en indicadores y gráficos.
      records: SUMMARY_ONLY_SECTIONS.has(id) && (visuals.charts?.length || visuals.kpis?.length) ? [] : content.records,
      simulated: content.simulated,
      ...visuals,
    };
  });

  // Un gráfico idéntico no se repite en el mismo reporte; si una sección queda vacía por eso, se omite.
  const shownCharts = new Set<string>();
  return sections.flatMap((section) => {
    const charts = section.charts?.filter((chart) => {
      const key = `${chart.title}|${chart.items.map((item) => `${item.label}:${item.value}`).join(",")}`;
      if (shownCharts.has(key)) return false;
      shownCharts.add(key);
      return true;
    });
    const hadCharts = !!section.charts?.length;
    if (hadCharts && !charts?.length && !section.kpis?.length && section.records.length === 0) return [];
    return [{ ...section, ...(hadCharts ? { charts } : {}) }];
  });
}

const SUMMARY_ONLY_SECTIONS = new Set(["risks", "risk-summary", "risk-distribution", "risk-process", "compliance", "compliance-indicators", "audits", "audit-summary"]);

// Resumen: solo gráficos e indicadores (o 4 registros si la sección no tiene gráficos).
// Detallado: añade los registros (máximo 40). Completo: añade además las notas de la fuente y todos los registros.
function visibleRecords(section: ReportContentSection, level: ReportConfiguration["detailLevel"]): string[] {
  const hasVisuals = !!section.kpis?.length || !!section.charts?.length;
  if (level === "executive") return hasVisuals ? [] : section.records.slice(0, 4);
  if (level === "detailed") return section.kpis?.length ? [] : section.records.slice(0, 40);
  return section.records;
}

function sourceText(section: ReportContentSection, level: ReportConfiguration["detailLevel"]): string {
  const base = section.baseSource || "CSV históricos";
  return level === "complete" && section.note ? `${base} · ${section.note}` : base;
}
const hexToRgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

export async function generateConfiguredPDF(configuration: ReportConfiguration): Promise<Blob> {
  const sections = await buildConfiguredReportSections(configuration);
  const doc = new jsPDF();
  // Helvetica solo cubre Latin-1: se reemplazan flechas y símbolos para evitar texto corrupto.
  const pdfSafe = <T extends string | string[]>(value: T): T => {
    const clean = (text: string) => text
      .replace(/[→➜⇒]/g, ">")
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, "-")
      .replace(/[^\u0000-\u00ff]/g, "?");
    return (Array.isArray(value) ? value.map(clean) : clean(value)) as T;
  };
  const rawText = doc.text.bind(doc) as (...params: unknown[]) => unknown;
  const rawSplit = doc.splitTextToSize.bind(doc) as (...params: unknown[]) => string[];
  doc.text = ((text: string | string[], ...args: unknown[]) => rawText(pdfSafe(text), ...args)) as typeof doc.text;
  doc.splitTextToSize = ((text: string, ...args: unknown[]) => rawSplit(pdfSafe(text), ...args)) as typeof doc.splitTextToSize;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const width = pageWidth - margin * 2;
  const bottom = pageHeight - 20;
  let y = margin;
  const title = configuration.reportType === "Dashboard Ejecutivo" ? "Dashboard Ejecutivo" : configuration.reportType;
  const detailLabel = configuration.detailLevel === "executive" ? "Resumen ejecutivo" : configuration.detailLevel === "complete" ? "Completo" : "Detallado";

  const ensureSpace = (height: number) => {
    if (y + height <= bottom) return;
    doc.addPage();
    y = margin;
  };
  const fill = (hex: string) => doc.setFillColor(...hexToRgb(hex));
  const ink = (hex: string) => doc.setTextColor(...hexToRgb(hex));
  const font = (size: number, bold = false) => {
    doc.setFontSize(size);
    doc.setFont(undefined, bold ? "bold" : "normal");
  };

  fill("#0f6cbd");
  doc.rect(0, 0, pageWidth, 40, "F");
  ink("#ffffff");
  font(22, true);
  doc.text(title, margin, 20);
  font(10);
  doc.text(`Sistema de Gobernanza de IA · Periodo ${formatPeriodLabel(configuration.startDate, configuration.endDate)}`, margin, 29);
  doc.text(`Nivel: ${detailLabel} · Generado ${new Date().toLocaleString("es-PE")}`, margin, 35);
  y = 52;

  const drawKpis = (kpis: ReportKpi[]) => {
    const gap = 4;
    const cardWidth = (width - gap * (kpis.length - 1)) / kpis.length;
    ensureSpace(24);
    kpis.forEach((kpi, index) => {
      const x = margin + index * (cardWidth + gap);
      fill("#f9f8f7");
      doc.setDrawColor(225, 223, 221);
      doc.roundedRect(x, y, cardWidth, 20, 2, 2, "FD");
      fill(kpi.color);
      doc.rect(x, y + 3, 1.6, 14, "F");
      ink(kpi.color);
      let valueSize = 16;
      font(valueSize, true);
      while (valueSize > 9 && doc.getTextWidth(kpi.value) > cardWidth - 7) font(--valueSize, true);
      doc.text(kpi.value, x + 5, y + 11);
      ink("#605e5c");
      font(8.5);
      doc.text(doc.splitTextToSize(kpi.label, cardWidth - 7).slice(0, 3), x + 5, y + 15.5);
    });
    y += 30;
  };

  const drawChart = (chart: ReportChart) => {
    const items = chart.items;
    const max = Math.max(1, ...items.map((item) => item.value));
    const labelWidth = 52;
    const valueWidth = 16;
    const trackWidth = width - labelWidth - valueWidth;
    ensureSpace(10 + items.length * 7);
    ink("#201f1e");
    font(10, true);
    doc.text(chart.title, margin, y + 3);
    y += 8;
    if (items.every((item) => item.value === 0)) {
      ink("#8a8886");
      font(9);
      doc.text("Sin datos para graficar.", margin, y + 3);
      y += 8;
      return;
    }
    items.forEach((item) => {
      ink("#201f1e");
      font(9);
      doc.text(doc.splitTextToSize(item.label, labelWidth - 3)[0], margin, y + 3.6);
      fill("#edebe9");
      doc.roundedRect(margin + labelWidth, y, trackWidth, 4.6, 1.2, 1.2, "F");
      const filled = (item.value / max) * trackWidth;
      if (filled > 0) {
        fill(item.color);
        doc.roundedRect(margin + labelWidth, y, Math.max(filled, 2.4), 4.6, 1.2, 1.2, "F");
      }
      ink(item.color);
      font(9, true);
      doc.text(`${item.value.toLocaleString("es-PE", { maximumFractionDigits: 1 })}${chart.unit ?? ""}`, margin + labelWidth + trackWidth + 3, y + 3.6);
      y += 7.5;
    });
    y += 3;
  };

  const drawRecord = (record: string, index: number) => {
    const [lead, ...rest] = record.split(" · ");
    const detail = rest.join(" · ");
    font(9);
    const lines = doc.splitTextToSize(detail || lead, width - 8);
    const hasLead = detail.length > 0;
    const height = lines.length * 4.5 + (hasLead ? 9 : 4.5);
    ensureSpace(height);
    if (index % 2 === 0) {
      fill("#f9f8f7");
      doc.rect(margin, y - 1, width, height, "F");
    }
    let textY = y + 3;
    if (hasLead) {
      ink("#0f6cbd");
      font(9, true);
      doc.text(lead, margin + 3, textY);
      textY += 4.6;
    }
    ink("#201f1e");
    font(9);
    doc.text(lines, margin + 3, textY);
    y += height;
  };

  for (const section of sections) {
    ensureSpace(24);
    fill(section.simulated ? "#ca5010" : "#0f6cbd");
    doc.rect(margin, y, 2.2, 8, "F");
    ink("#201f1e");
    font(13, true);
    doc.text(section.title, margin + 5, y + 6);
    if (section.simulated) {
      ink("#ca5010");
      font(7, true);
      doc.text("SIMULADO / CONCEPTUAL", pageWidth - margin, y + 6, { align: "right" });
    }
    y += 11;
    ink("#605e5c");
    font(8.5);
    const sourceLines = doc.splitTextToSize(`Fuente: ${sourceText(section, configuration.detailLevel)}`, width);
    doc.text(sourceLines, margin, y);
    y += sourceLines.length * 3.9 + 4;

    if (section.kpis?.length) drawKpis(section.kpis);
    section.charts?.forEach(drawChart);

    const records = visibleRecords(section, configuration.detailLevel);
    if (records.length === 0 && !section.kpis?.length && !section.charts?.length) {
      ink("#8a8886");
      font(9);
      doc.text("Sin registros exportables para esta selección y periodo.", margin, y + 2);
      y += 8;
    } else if (records.length > 0) {
      records.forEach(drawRecord);
      if (records.length < section.records.length && configuration.detailLevel !== "executive") {
        ink("#8a8886");
        font(8.5);
        doc.text(`Se muestran ${records.length} de ${section.records.length} registros según el nivel de detalle.`, margin, y + 4);
        y += 7;
      }
    }
    y += 8;
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(225, 223, 221);
    doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);
    ink("#8a8886");
    font(8);
    doc.text(sections.some((section) => section.simulated) ? "Las secciones marcadas como simuladas o conceptuales no representan resultados reales." : title, margin, pageHeight - 9);
    doc.text(`Página ${page} de ${pages}`, pageWidth - margin, pageHeight - 9, { align: "right" });
  }
  return doc.output("blob");
}

export async function generateConfiguredDashboardPreview(configuration: ReportConfiguration): Promise<string> {
  const sections = await buildConfiguredReportSections(configuration);
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
  const kpiHtml = (kpis: ReportKpi[]) => `<div class="kpis">${kpis.map((kpi) => `<div class="kpi" style="border-left:4px solid ${kpi.color}"><b style="color:${kpi.color}">${escapeHtml(kpi.value)}</b><span>${escapeHtml(kpi.label)}</span></div>`).join("")}</div>`;
  const chartHtml = (chart: ReportChart) => {
    const max = Math.max(1, ...chart.items.map((item) => item.value));
    const rows = chart.items.map((item) => `<div class="bar"><span>${escapeHtml(item.label)}</span><i><u style="width:${Math.round((item.value / max) * 100)}%;background:${item.color}"></u></i><b style="color:${item.color}">${item.value.toLocaleString("es-PE", { maximumFractionDigits: 1 })}${chart.unit ?? ""}</b></div>`).join("");
    return `<div class="chart"><h3>${escapeHtml(chart.title)}</h3>${chart.items.every((item) => item.value === 0) ? "<p>Sin datos para graficar.</p>" : rows}</div>`;
  };
  const sectionHtml = sections.map((section) => `<section><h2>${escapeHtml(section.title)}${section.simulated ? '<em>Simulado</em>' : ""}</h2><p>${escapeHtml(sourceText(section, configuration.detailLevel))}</p>${section.kpis?.length ? kpiHtml(section.kpis) : ""}<div class="charts">${(section.charts ?? []).map(chartHtml).join("")}</div>${visibleRecords(section, configuration.detailLevel).length ? `<ul>${visibleRecords(section, configuration.detailLevel).map((record) => `<li>${escapeHtml(record)}</li>`).join("")}</ul>` : section.kpis?.length || section.charts?.length ? "" : "<ul><li>Sin registros exportables para esta selección y periodo.</li></ul>"}</section>`).join("");
  const style = "body{font:14px Segoe UI,sans-serif;color:#201f1e;background:#f3f2f1;margin:0;padding:24px}.page{max-width:960px;margin:auto;background:white;border:1px solid #e1dfdd;overflow:hidden}header{background:#0f6cbd;color:white;padding:24px 28px}h1{font-size:22px;margin:0 0 4px}header p{color:#e6f0fa;margin:0}main section{padding:16px 28px;border-top:1px solid #e1dfdd}h2{font-size:15px;margin:0 0 4px}h2 em{font-size:10px;color:#ca5010;margin-left:8px}h3{font-size:12px;margin:0 0 8px}p{font-size:11px;color:#605e5c}li{font-size:11px;margin:5px 0}.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:10px 0}.kpi{background:#f9f8f7;border:1px solid #e1dfdd;padding:10px 12px}.kpi b{display:block;font-size:22px}.kpi span{font-size:11px;color:#605e5c}.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;margin:10px 0}.bar{display:grid;grid-template-columns:130px 1fr 44px;gap:8px;align-items:center;font-size:11px;margin:5px 0}.bar i{background:#edebe9;border-radius:4px;height:10px;display:block}.bar u{display:block;height:10px;border-radius:4px}.bar b{text-align:right}";
  return `<!doctype html><html lang="es"><meta charset="utf-8"><title>${escapeHtml(configuration.reportType)}</title><style>${style}</style><div class="page"><header><h1>${escapeHtml(configuration.reportType)}</h1><p>Periodo ${escapeHtml(formatPeriodLabel(configuration.startDate, configuration.endDate))}</p></header><main>${sectionHtml}</main></div></html>`;
}
export function reportConfigurationRecordCount(sections: ReportContentSection[]): number {
  return sections.reduce((count, section) => count + section.records.length, 0);
}

export function getReportSectionMetadata(configuration: ReportConfiguration): ReportSection[] {
  return allSections()
    .filter((section) => (configuration.reportType === "Evidencias Digitales" ? configuration.evidenceSections : configuration.sections).includes(section.id));
}