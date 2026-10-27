import jsPDF from "jspdf";
import { simulatedModels, simulatedSupplyChainRisks } from "../../app/governanceScenarios";
import { canGenerateReportWithSections } from "../../app/reportPermissions";
import { loadDemandModelStatus, type DemandModelStatus } from "../../app/demandModelApi";
import { formatCurrency, formatDate, getReportPeriodData, type ReportPeriodData } from "../reportGenerator";
import { EVIDENCE_SECTION_GROUP, formatPeriodLabel, REPORT_SECTION_GROUPS, type ReportConfiguration, type ReportSection } from "../reportConfiguration";
import { apiRequest } from "../../app/apiClient";
import type { OperationalData } from "../operationalData";

export type ReportContentSection = {
  id: string;
  title: string;
  source: string;
  records: string[];
  simulated: boolean;
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

function scenarioRecords(scenarios: typeof simulatedSupplyChainRisks): string[] {
  return scenarios.map((risk) => `${risk.id} · ${risk.process} · ${risk.level} · ${risk.status} · ${risk.description} · Confianza simulada ${risk.confidence}% · ${risk.recommendation}`);
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

function sectionRows(sectionId: string, data: ReportPeriodData, events: StoredAccessEvent[], scenarios: typeof simulatedSupplyChainRisks, models: typeof simulatedModels, demandModel: DemandModelStatus | null, operationalData: OperationalData | null, startDate: string, endDate: string): { records: string[]; simulated: boolean; note?: string } {
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
    case "risk-summary": return { records: [`Escenarios conceptuales: ${scenarios.length}`, ...["Alto", "Medio", "Bajo"].map((level) => `Riesgo ${level}: ${scenarios.filter((risk) => risk.level === level).length}`)], simulated: true, note: "Resumen de escenarios existentes; no procede de evaluaciones ML reales." };
    case "risk-distribution": return { records: ["Alto", "Medio", "Bajo"].map((level) => `Riesgo ${level}: ${scenarios.filter((risk) => risk.level === level).length}`), simulated: true };
    case "risk-process": return { records: [...new Set(scenarios.map((risk) => risk.process))].map((process) => `${process}: ${scenarios.filter((risk) => risk.process === process).length} escenarios`), simulated: true };
    case "risk-details":
    case "risk-anomalies":
    case "risk-evidence": return { records: scenarioRecords(scenarios), simulated: true, note: "Escenarios conceptuales existentes; no proceden de evaluaciones ML reales." };
    case "risk-recommendations": return { records: scenarios.map((risk) => `${risk.id} · ${risk.recommendation}`), simulated: true };
    case "risk-sources": return { records: scenarios.map((risk) => `${risk.id} · ${risk.source}`), simulated: true };
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
    case "transport-alerts": return {
      records: simulatedSupplyChainRisks.filter((risk) => risk.process === "Transporte").map((risk) => `${risk.description} · ${risk.level} · ${risk.recommendation}`),
      simulated: true,
      note: "Alertas conceptuales; no existen registros fuente de incidentes o envíos operacionales.",
    };
    case "transport-incidents": return { records: [], simulated: true, note: "No existen incidencias de transporte en los CSV; no se generan eventos ficticios." };
    case "demand": return {
      records: demandModel?.status === "evaluated" && demandModel.metrics ? [
        `Objetivo observado: ventas mensuales de combustibles líquidos · unidad ${demandModel.unit}`,
        `Prueba cronológica: ${demandModel.evaluationPeriod?.from} a ${demandModel.evaluationPeriod?.to} · ${demandModel.testObservations} observaciones`,
        `MAE XGBoost: ${demandModel.metrics.xgboost.mae} ${demandModel.unit} · MAE baseline estacional: ${demandModel.metrics.baseline.mae} ${demandModel.unit}`,
        `RMSE XGBoost: ${demandModel.metrics.xgboost.rmse} ${demandModel.unit} · R²: ${demandModel.metrics.xgboost.r2}`,
        `${demandModel.metrics.xgboost.mape == null ? "WAPE" : "MAPE"} XGBoost: ${demandModel.metrics.xgboost.mape ?? demandModel.metrics.xgboost.wape}%`,
        `Reducción del error frente al baseline: ${demandModel.metrics.errorReductionPercent == null ? "no calculable (MAE baseline cero)" : `${demandModel.metrics.errorReductionPercent}% (positivo mejora MAE; negativo lo empeora)`}`,
        ...(demandModel.metrics.xgboost.mapeLimitation ? [demandModel.metrics.xgboost.mapeLimitation] : []),
        `Versión: ${demandModel.modelVersion} · entrenamiento: ${demandModel.trainedAt}`,
        `Pronóstico posterior al último dato: ${demandModel.forecast?.period} · ${demandModel.forecast?.value} ${demandModel.unit}`,
        ...(demandModel.explainability?.evaluation.featureImportance.map((feature) =>
          `SHAP ${feature.feature}: ${feature.meanAbsoluteShap}`,
        ) ?? []),
        ...(demandModel.warnings ?? []),
      ] : [],
      simulated: false,
      note: demandModel?.status === "evaluated"
        ? "Ventas observadas agregadas mensualmente; la validación es un holdout temporal. No equivale a consumo final ni a mejora operativa validada. El periodo seleccionado del reporte no altera el periodo de prueba del modelo."
        : demandModel?.message ?? "No hay una evaluación de demanda persistida; ejecutar entrenamiento y evaluación para incluir métricas.",
    };
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
    case "environmental-conditions":
    case "environmental-alerts": return { records: [], simulated: true, note: "No hay variables meteorológicas ni sensores en las fuentes disponibles; no se exportan mediciones ambientales inventadas." };
    case "compliance":
    case "compliance-indicators":
    case "norms":
    case "controls-done":
    case "controls-pending":
    case "regulatory-risks":
    case "compliance-history":
    case "related-audits":
    case "evidence-compliance":
    case "compliance-evidence":
    case "audits":
    case "audits-completed":
    case "audits-progress":
    case "audits-observed":
    case "audit-history":
    case "evidence-audit":
    case "audit-evidence": return {
      records: [], simulated: true,
      note: "La pantalla presenta contenido conceptual, pero no hay un dataset exportable de controles, normativas, auditorías ni evidencias adjuntas en los CSV.",
    };
    case "audit-events":
    case "access-logs": return { records: events.map((event) => `${new Date(event.timestamp).toLocaleString("es-PE")} · ${event.username} · ${event.role} · ${event.action} · ${event.resource} · ${event.result}`), simulated: false, note: "Registro local de accesos; no equivale a un registro de auditorías operativas." };
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
  const needsOperationalData = selectedIds.some((id) => ["general", "trends", "supply-history", "transport", "distribution-routes"].includes(id));
  const operationalData = needsOperationalData
    ? await apiRequest<OperationalData>("/api/datasets/operations")
    : null;
  const transportOnly = configuration.role === "Ingeniero de Campo"
    || ["Reporte de Transporte", "Reporte de Riesgos de Transporte", "Reporte de Alertas", "Reporte de Condiciones Ambientales"].includes(configuration.reportType);
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
  return selectedIds.map((id) => {
    const metadata = allSections().find((section) => section.id === id);
    const content = sectionRows(id, data, events, scenarios, models, demandModel, operationalData, configuration.startDate, configuration.endDate);
    return {
      id,
      title: metadata?.label ?? id,
      source: [metadata?.source, content.note].filter(Boolean).join(" · "),
      records: content.records,
      simulated: content.simulated,
    };
  });
}

export async function generateConfiguredPDF(configuration: ReportConfiguration): Promise<Blob> {
  const sections = await buildConfiguredReportSections(configuration);
  const doc = new jsPDF();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const bottom = pageHeight - 22;
  let y = margin;
  const title = configuration.reportType === "Dashboard Ejecutivo" ? "Dashboard Ejecutivo" : "Reporte AI TRiSM";

  const ensureSpace = (height = 8) => {
    if (y + height <= bottom) return;
    doc.addPage();
    y = margin;
  };
  const write = (text: string, size = 9, bold = false) => {
    doc.setFontSize(size);
    doc.setFont(undefined, bold ? "bold" : "normal");
    const lines = doc.splitTextToSize(text, 174);
    ensureSpace(lines.length * (size * 0.42) + 3);
    doc.text(lines, margin, y);
    y += lines.length * (size * 0.42) + 3;
  };

  write(title, 18, true);
  write(`Periodo: ${formatPeriodLabel(configuration.startDate, configuration.endDate)}`, 10);
  write(`Nivel de detalle: ${configuration.detailLevel === "executive" ? "Resumen ejecutivo" : configuration.detailLevel === "complete" ? "Completo" : "Detallado"}`, 9);
  write(`Generado: ${new Date().toLocaleString("es-PE")}`, 9);
  doc.setDrawColor(225, 223, 221);
  doc.line(margin, y, 192, y);
  y += 6;

  for (const section of sections) {
    write(section.title, 12, true);
    write(`Fuente: ${section.source || "CSV históricos"}${section.simulated ? " · Simulado / evaluación conceptual" : ""}`, 8);
    const records = configuration.detailLevel === "executive" ? section.records.slice(0, 4)
      : configuration.detailLevel === "detailed" ? section.records.slice(0, 100)
      : section.records;
    if (records.length === 0) write("Sin registros exportables para esta selección y periodo.", 8);
    else records.forEach((record) => write(`• ${record}`, configuration.detailLevel === "complete" ? 7 : 8));
    y += 3;
  }

  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setTextColor(128, 128, 128);
    doc.text("Los escenarios de IA y Supply Chain se identifican como simulados/conceptuales.", margin, pageHeight - 10);
    doc.text(`Página ${page} de ${doc.getNumberOfPages()}`, 192, pageHeight - 10, { align: "right" });
  }
  return doc.output("blob");
}

export async function generateConfiguredDashboardPreview(configuration: ReportConfiguration): Promise<string> {
  const sections = await buildConfiguredReportSections(configuration);
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
  const sectionHtml = sections.map((section) => `<section><h2>${escapeHtml(section.title)}${section.simulated ? " · Simulado" : ""}</h2><p>${escapeHtml(section.source)}</p><ul>${section.records.map((record) => `<li>${escapeHtml(record)}</li>`).join("") || "<li>Sin registros exportables para esta selección y periodo.</li>"}</ul></section>`).join("");
  return `<!doctype html><html lang="es"><meta charset="utf-8"><title>${escapeHtml(configuration.reportType)}</title><style>body{font:14px Segoe UI,sans-serif;color:#201f1e;background:#f3f2f1;margin:0;padding:24px}.page{max-width:960px;margin:auto;background:white;padding:28px;border:1px solid #e1dfdd}h1{font-size:22px}h2{font-size:15px;margin-bottom:4px}p{font-size:11px;color:#605e5c}li{font-size:11px;margin:5px 0}section{padding:12px 0;border-top:1px solid #e1dfdd}</style><main class="page"><h1>${escapeHtml(configuration.reportType)} · ${escapeHtml(formatPeriodLabel(configuration.startDate, configuration.endDate))}</h1><p>Vista previa web configurada · escenarios simulados identificados</p>${sectionHtml}</main></html>`;
}

export function reportConfigurationRecordCount(sections: ReportContentSection[]): number {
  return sections.reduce((count, section) => count + section.records.length, 0);
}

export function getReportSectionMetadata(configuration: ReportConfiguration): ReportSection[] {
  return allSections()
    .filter((section) => (configuration.reportType === "Evidencias Digitales" ? configuration.evidenceSections : configuration.sections).includes(section.id));
}