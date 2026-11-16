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
};

export type ReportSection = { id: string; label: string; source: string; dateFilterable?: boolean };
export type ReportSectionGroup = { id: string; label: string; sections: ReportSection[] };

export const REPORT_SECTION_GROUPS: ReportSectionGroup[] = [
  {
    id: "dashboard", label: "Dashboard Ejecutivo", sections: [
      { id: "demand", label: "Evaluación XGBoost de demanda observada", source: "Ventas mensuales observadas de combustibles líquidos; MAE, RMSE, MAPE/WAPE, R², baseline y SHAP", dateFilterable: false },
      { id: "hydrocarbons", label: "Hidrocarburos: producción, canon y supervisiones", source: "Determinación 2026 y supervisiones/PAS (pestaña Dashboard > Hidrocarburos)", dateFilterable: false },
      { id: "sector-operations", label: "Operación sectorial de gas y combustibles", source: "Producción, transporte, exportación, ventas y multas (pestaña Dashboard > Operación sectorial)", dateFilterable: false },
      { id: "inventory", label: "Instalaciones y capacidad registrada", source: "CSV CDCLyOPDH 2017; no incluye existencias actuales", dateFilterable: false },
    ],
  },
  {
    id: "risks", label: "Gestión de Riesgos", sections: [
      { id: "risk-summary", label: "Resumen de riesgos", source: "Riesgos detectados (RSG)", dateFilterable: false },
      { id: "risk-distribution", label: "Distribución por nivel y estado", source: "Riesgos detectados (RSG)", dateFilterable: false },
      { id: "risk-process", label: "Riesgos por proceso", source: "Riesgos detectados (RSG)", dateFilterable: false },
      { id: "risk-details", label: "Detalle de riesgos", source: "Riesgos detectados (RSG) con seguimiento", dateFilterable: false },
      { id: "risk-anomalies", label: "Riesgos de sistemas de IA", source: "Registro de riesgos de gobernanza de IA", dateFilterable: false },
      { id: "risk-recommendations", label: "Recomendaciones de mitigación", source: "Riesgos detectados (RSG)", dateFilterable: false },
      { id: "risk-sources", label: "Fuentes de riesgo", source: "Riesgos detectados (RSG)", dateFilterable: false },
    ],
  },
  {
    id: "compliance", label: "Cumplimiento", sections: [
      { id: "compliance-indicators", label: "Indicadores de cumplimiento", source: "Seguimiento de normativas y controles", dateFilterable: false },
      { id: "norms", label: "Normativas evaluadas", source: "Seguimiento de normativas", dateFilterable: false },
      { id: "controls-done", label: "Controles realizados", source: "Controles de gobernanza conformes", dateFilterable: false },
      { id: "controls-pending", label: "Controles pendientes", source: "Controles sin evaluar, en revisión o con brecha", dateFilterable: false },
      { id: "regulatory-risks", label: "Riesgos regulatorios", source: "Riesgos regulatorios identificados y su seguimiento", dateFilterable: false },
      { id: "compliance-history", label: "Historial de seguimiento", source: "Eventos de seguimiento de cumplimiento", dateFilterable: false },
      { id: "related-audits", label: "Auditorías relacionadas", source: "Seguimiento de auditorías", dateFilterable: false },
      { id: "evidence-compliance", label: "Evidencias", source: "Archivos adjuntos de cumplimiento y controles", dateFilterable: false },
    ],
  },
  {
    id: "audit", label: "Auditoría", sections: [
      { id: "audit-summary", label: "Resumen de auditorías", source: "Seguimiento de auditorías", dateFilterable: false },
      { id: "audits-pending", label: "Auditorías pendientes", source: "Seguimiento de auditorías", dateFilterable: false },
      { id: "audits-completed", label: "Auditorías completadas", source: "Seguimiento de auditorías", dateFilterable: false },
      { id: "audits-progress", label: "Auditorías en curso", source: "Seguimiento de auditorías", dateFilterable: false },
      { id: "audits-observed", label: "Auditorías observadas", source: "Seguimiento de auditorías", dateFilterable: false },
      { id: "audit-history", label: "Historial de auditorías", source: "Eventos de seguimiento de auditoría", dateFilterable: false },
      { id: "evidence-audit", label: "Evidencias", source: "Documentos adjuntos a auditorías", dateFilterable: false },
      { id: "access-logs", label: "Registros de acceso", source: "Registro de accesos de la plataforma (últimos 200 eventos)", dateFilterable: true },
    ],
  },
  {
    id: "traceability", label: "Trazabilidad", sections: [
      { id: "forecast-summary", label: "Resumen de pronósticos de demanda", source: "Historial de pronósticos guardados (pestaña Trazabilidad)", dateFilterable: false },
      { id: "forecast-history", label: "Historial de pronósticos generados", source: "Pronósticos guardados con modelo, fuente de datos y solicitante", dateFilterable: false },
    ],
  },
];

const DASHBOARD_SECTIONS = ["demand", "hydrocarbons", "sector-operations", "inventory"];
const RISK_SECTIONS = REPORT_SECTION_GROUPS.find((group) => group.id === "risks")!.sections.map((section) => section.id);
const COMPLIANCE_SECTIONS = REPORT_SECTION_GROUPS.find((group) => group.id === "compliance")!.sections.map((section) => section.id);
const AUDIT_SECTIONS = REPORT_SECTION_GROUPS.find((group) => group.id === "audit")!.sections.map((section) => section.id);

const REPORT_SECTIONS_BY_TYPE: Record<GeneratedReportType, string[]> = {
  "Dashboard Ejecutivo": DASHBOARD_SECTIONS,
  "Reporte de Riesgos": RISK_SECTIONS,
  "Reporte de Trazabilidad": ["forecast-summary", "forecast-history"],
  "Reporte de Cumplimiento": COMPLIANCE_SECTIONS,
  "Reporte de Auditoría": AUDIT_SECTIONS,
};

const REPORT_SECTIONS_BY_ROLE: Record<UserRole, string[]> = {
  "Gerente de Operaciones": ["forecast-summary", "forecast-history", ...DASHBOARD_SECTIONS],
  "Analista de Datos": ["forecast-summary", "forecast-history", ...DASHBOARD_SECTIONS, ...RISK_SECTIONS],
  "Supervisor de Cumplimiento": ["forecast-summary", "forecast-history", ...DASHBOARD_SECTIONS, ...RISK_SECTIONS, ...COMPLIANCE_SECTIONS, ...AUDIT_SECTIONS],
  "Ingeniero de Campo": ["forecast-summary", "forecast-history", ...DASHBOARD_SECTIONS, ...RISK_SECTIONS],
};

export function getReportSectionGroups(reportType: GeneratedReportType, role: UserRole): ReportSectionGroup[] {
  const reportIds = REPORT_SECTIONS_BY_TYPE[reportType];
  const roleIds = REPORT_SECTIONS_BY_ROLE[role];
  const allowedIds = new Set(reportIds.filter((id) => roleIds.includes(id)));
  return REPORT_SECTION_GROUPS
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