import type { GeneratedReportType } from "./generatedReports";
import type { UserRole } from "../app/AuthContext";

export type ReportDetailLevel = "executive" | "detailed" | "complete";

export type ReportConfiguration = {
  role: UserRole;
  reportType: GeneratedReportType;
  startDate: string;
  endDate: string;
  detailLevel: ReportDetailLevel;
  sections: string[];
  evidenceSections: string[];
};

export type ReportSection = { id: string; label: string; source: string; dateFilterable?: boolean };
export type ReportSectionGroup = { id: string; label: string; sections: ReportSection[] };

export const REPORT_SECTION_GROUPS: ReportSectionGroup[] = [
  {
    id: "dashboard", label: "Dashboard Ejecutivo", sections: [
      { id: "demand", label: "Evaluación XGBoost de demanda observada", source: "Ventas mensuales observadas de combustibles líquidos; MAE, RMSE, MAPE/WAPE, R², baseline y SHAP", dateFilterable: false },
      { id: "general", label: "Indicadores generales", source: "CSV históricos y observaciones operativas del periodo" },
      { id: "risks", label: "Riesgos", source: "Escenarios conceptuales" },
      { id: "compliance", label: "Cumplimiento normativo", source: "Evaluación conceptual; sin registros normativos exportables" },
      { id: "audits", label: "Auditorías", source: "No hay dataset de auditorías exportable" },
      { id: "traceability", label: "Trazabilidad", source: "Modelos y escenarios simulados" },
      { id: "complaints", label: "Denuncias", source: "CSV SINADA", dateFilterable: true },
      { id: "cases", label: "Expedientes resueltos", source: "CSV de expedientes", dateFilterable: true },
      { id: "resolutions", label: "Resoluciones", source: "CSV de resoluciones", dateFilterable: true },
      { id: "inventory", label: "Instalaciones y capacidad registrada", source: "CSV CDCLyOPDH 2017; no incluye existencias actuales", dateFilterable: false },
      { id: "transport", label: "Transporte de gas natural", source: "Volúmenes mensuales observados", dateFilterable: true },
    ],
  },
  {
    id: "risks", label: "Gestión de Riesgos", sections: [
      { id: "risk-summary", label: "Resumen de riesgos", source: "Escenarios conceptuales" },
      { id: "risk-distribution", label: "Distribución por nivel de riesgo", source: "Escenarios conceptuales" },
      { id: "risk-process", label: "Riesgos por proceso", source: "Escenarios conceptuales" },
      { id: "risk-details", label: "Detalle de riesgos", source: "Escenarios conceptuales" },
      { id: "risk-anomalies", label: "Anomalías simuladas", source: "Resultados conceptuales de modelos" },
      { id: "risk-recommendations", label: "Recomendaciones de mitigación", source: "Escenarios conceptuales" },
      { id: "risk-sources", label: "Fuentes de riesgo", source: "Escenarios conceptuales" },
    ],
  },
  {
    id: "compliance", label: "Cumplimiento", sections: [
      { id: "compliance-indicators", label: "Indicadores de cumplimiento", source: "Evaluación conceptual; sin registros normativos exportables" },
      { id: "norms", label: "Normativas evaluadas", source: "Evaluación conceptual; no constituye certificación" },
      { id: "controls-done", label: "Controles realizados", source: "No hay registro de controles exportable" },
      { id: "controls-pending", label: "Controles pendientes", source: "No hay registro de controles exportable" },
      { id: "regulatory-risks", label: "Riesgos regulatorios", source: "Evaluación conceptual" },
      { id: "compliance-history", label: "Evolución histórica", source: "Evaluación conceptual; sin fechas fuente" },
      { id: "related-audits", label: "Auditorías relacionadas", source: "No hay dataset de auditorías exportable" },
      { id: "evidence-compliance", label: "Evidencias", source: "No hay archivos de evidencia de cumplimiento exportables" },
    ],
  },
  {
    id: "audit", label: "Auditoría", sections: [
      { id: "audits-completed", label: "Auditorías completadas", source: "No hay dataset de auditorías exportable" },
      { id: "audits-progress", label: "Auditorías en curso", source: "No hay dataset de auditorías exportable" },
      { id: "audits-observed", label: "Auditorías observadas", source: "No hay dataset de auditorías exportable" },
      { id: "audit-history", label: "Historial de auditorías", source: "No hay dataset de auditorías exportable" },
      { id: "audit-events", label: "Eventos de auditoría", source: "Registro de acceso local", dateFilterable: true },
      { id: "evidence-audit", label: "Evidencias", source: "No hay archivos de evidencia de auditoría exportables" },
      { id: "related-resolutions", label: "Resoluciones relacionadas", source: "CSV de resoluciones", dateFilterable: true },
      { id: "access-logs", label: "Registros de acceso", source: "Registro de acceso local", dateFilterable: true },
    ],
  },
  {
    id: "traceability", label: "Trazabilidad", sections: [
      { id: "decision-flow", label: "Flujo de decisión AI TRiSM", source: "Flujo conceptual" },
      { id: "ai-models", label: "Modelos de IA representados", source: "Modelos simulados" },
      { id: "inventory-trace", label: "Capacidad de instalaciones", source: "CSV CDCLyOPDH 2017; no incluye existencias actuales", dateFilterable: false },
      { id: "trends", label: "Tendencias operativas", source: "Series observadas de gas, distribución y ventas", dateFilterable: true },
      { id: "distribution-routes", label: "Distribución de gas por concesión", source: "Volúmenes y clientes observados por periodo", dateFilterable: true },
      { id: "environmental-conditions", label: "Condiciones ambientales", source: "Escenario simulado sin sensores" },
      { id: "transport-alerts", label: "Alertas de transporte", source: "Escenario simulado" },
      { id: "transport-incidents", label: "Incidencias de transporte", source: "No hay registros de incidencias de transporte en los CSV" },
      { id: "environmental-alerts", label: "Alertas ambientales", source: "Escenario simulado" },
      { id: "supply-history", label: "Histórico de operación y distribución", source: "Series observadas; no incluye existencias de inventario", dateFilterable: true },
      { id: "traced-decisions", label: "Decisiones trazadas", source: "Recorridos demostrativos sin registros CSV" },
      { id: "historical-data", label: "Datos históricos", source: "CSV de SINADA, expedientes y resoluciones", dateFilterable: true },
    ],
  },
];

export const EVIDENCE_SECTION_GROUP: ReportSectionGroup = {
  id: "evidences", label: "Evidencias Digitales", sections: [
    { id: "audit-evidence", label: "Evidencias de auditoría", source: "No hay archivos de auditoría exportables" },
    { id: "trace-evidence", label: "Evidencias de trazabilidad", source: "Modelos representados; evidencia conceptual" },
    { id: "risk-evidence", label: "Evidencias relacionadas con riesgos", source: "Escenarios de riesgo simulados" },
    { id: "compliance-evidence", label: "Evidencias de cumplimiento", source: "No hay archivos de cumplimiento exportables" },
    { id: "resolution-evidence", label: "Resoluciones relacionadas", source: "CSV de resoluciones", dateFilterable: true },
    { id: "case-evidence", label: "Expedientes resueltos", source: "CSV de expedientes", dateFilterable: true },
    { id: "complaint-evidence", label: "Denuncias SINADA", source: "CSV SINADA", dateFilterable: true },
  ],
};

const DASHBOARD_SECTIONS = REPORT_SECTION_GROUPS[0].sections.map((section) => section.id);
const RISK_SECTIONS = REPORT_SECTION_GROUPS.find((group) => group.id === "risks")!.sections.map((section) => section.id);
const COMPLIANCE_SECTIONS = REPORT_SECTION_GROUPS.find((group) => group.id === "compliance")!.sections.map((section) => section.id);
const AUDIT_SECTIONS = REPORT_SECTION_GROUPS.find((group) => group.id === "audit")!.sections.map((section) => section.id);
const TRACE_SECTIONS = REPORT_SECTION_GROUPS.find((group) => group.id === "traceability")!.sections.map((section) => section.id);
const EVIDENCE_SECTIONS = EVIDENCE_SECTION_GROUP.sections.map((section) => section.id);
const ALL_SECTIONS = [...DASHBOARD_SECTIONS, ...RISK_SECTIONS, ...COMPLIANCE_SECTIONS, ...AUDIT_SECTIONS, ...TRACE_SECTIONS, ...EVIDENCE_SECTIONS];

const REPORT_SECTIONS_BY_TYPE: Record<GeneratedReportType, string[]> = {
  "Dashboard Ejecutivo": DASHBOARD_SECTIONS,
  "Reporte de Riesgos": RISK_SECTIONS,
  "Reporte de Trazabilidad": ["decision-flow", "ai-models", "inventory-trace", "trends", "distribution-routes", "transport-alerts", "environmental-conditions", "environmental-alerts", "supply-history", "traced-decisions", "historical-data"],
  "Reporte Ejecutivo": ["general", "risks", "risk-summary", "compliance", "compliance-indicators", "audits", "audits-completed", "traceability", "decision-flow", "inventory", "transport"],
  "Reporte de Inventario": ["inventory", "inventory-trace", "supply-history"],
  "Reporte de Transporte": ["transport", "distribution-routes", "transport-alerts", "transport-incidents"],
  "Reporte de Predicción de Demanda": ["demand", "trends", "ai-models"],
  "Reportes Analíticos": ["historical-data", "general", "risk-details", "risk-anomalies", "inventory", "inventory-trace", "transport", "distribution-routes", "demand", "trends", "ai-models", "complaints", "cases", "resolutions"],
  "Reporte de Cumplimiento": [...COMPLIANCE_SECTIONS, "traceability", "decision-flow", "ai-models", "traced-decisions"],
  "Reporte de Auditoría": AUDIT_SECTIONS,
  "Reporte de Riesgos de Transporte": [...RISK_SECTIONS, "distribution-routes", "transport-alerts", "transport-incidents"],
  "Reporte de Condiciones Ambientales": ["environmental-conditions", "environmental-alerts", "distribution-routes"],
  "Reporte de Alertas": ["transport-alerts", "environmental-alerts"],
  "Reporte PDF": ALL_SECTIONS,
  "Exportación Excel": ALL_SECTIONS,
  "Evidencias Digitales": EVIDENCE_SECTIONS,
};

const REPORT_SECTIONS_BY_ROLE: Record<UserRole, string[]> = {
  "Gerente de Operaciones": ["general", "risks", ...RISK_SECTIONS, "compliance", "compliance-indicators", "audits", "audits-completed", "traceability", "decision-flow", "traced-decisions", "inventory", "transport", "distribution-routes"],
  "Analista de Datos": ["general", "historical-data", ...RISK_SECTIONS, "inventory", "inventory-trace", "supply-history", "transport", "distribution-routes", "transport-alerts", "transport-incidents", "demand", "trends", "ai-models", "complaints", "cases", "resolutions", "decision-flow", "traced-decisions"],
  "Supervisor de Cumplimiento": ["general", "risks", ...RISK_SECTIONS, "compliance", ...COMPLIANCE_SECTIONS, "audits", ...AUDIT_SECTIONS, "traceability", "decision-flow", "ai-models", "traced-decisions", "complaints", "cases", "resolutions", ...EVIDENCE_SECTIONS],
  "Ingeniero de Campo": ["traceability", "decision-flow", "ai-models", "traced-decisions", "transport", "distribution-routes", "transport-incidents", "transport-alerts", "environmental-conditions", "environmental-alerts", "risk-summary", "risk-distribution", "risk-process", "risk-details", "risk-anomalies", "risk-recommendations", "risk-sources"],
};

export function getReportSectionGroups(reportType: GeneratedReportType, role: UserRole): ReportSectionGroup[] {
  const reportIds = REPORT_SECTIONS_BY_TYPE[reportType];
  const roleIds = REPORT_SECTIONS_BY_ROLE[role];
  const allowedIds = new Set(reportIds.filter((id) => roleIds.includes(id)));
  return [...REPORT_SECTION_GROUPS, EVIDENCE_SECTION_GROUP]
    .map((group) => ({ ...group, sections: group.sections.filter((section) => allowedIds.has(section.id)) }))
    .filter((group) => group.sections.length > 0);
}

export function getDefaultSections(reportType: GeneratedReportType, role: UserRole): string[] {
  return getReportSectionGroups(reportType, role).flatMap((group) => group.sections.map((section) => section.id));
}

export function canSelectReportSections(role: UserRole, reportType: GeneratedReportType, sectionIds: string[]): boolean {
  if (sectionIds.length === 0) return false;
  const allowedIds = new Set(getReportSectionGroups(reportType, role).flatMap((group) => group.sections.map((section) => section.id)));
  return sectionIds.every((sectionId) => allowedIds.has(sectionId));
}

export function formatPeriodLabel(startDate: string, endDate: string): string {
  const format = (value: string) => {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  };
  return `${format(startDate)} – ${format(endDate)}`;
}