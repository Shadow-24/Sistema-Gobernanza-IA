import type { UserRole } from "./AuthContext";
import type { GeneratedReportType } from "../utils/generatedReports";
import { canSelectReportSections } from "../utils/reportConfiguration";

export const REPORT_TYPES_BY_ROLE: Record<UserRole, readonly GeneratedReportType[]> = {
  "Gerente de Operaciones": [
    "Dashboard Ejecutivo",
    "Reporte de Riesgos",
    "Reporte de Trazabilidad",
    "Reporte Ejecutivo",
  ],
  "Analista de Datos": [
    "Reporte de Riesgos",
    "Reporte de Trazabilidad",
    "Reporte de Inventario",
    "Reporte de Transporte",
    "Reporte de Predicción de Demanda",
    "Reportes Analíticos",
  ],
  "Supervisor de Cumplimiento": [
    "Dashboard Ejecutivo",
    "Reporte de Cumplimiento",
    "Reporte de Riesgos",
    "Reporte de Auditoría",
    "Reporte de Trazabilidad",
    "Evidencias Digitales",
  ],
  "Ingeniero de Campo": [
    "Reporte de Transporte",
    "Reporte de Riesgos de Transporte",
    "Reporte de Condiciones Ambientales",
    "Reporte de Alertas",
    "Reporte de Trazabilidad",
  ],
};

export function canGenerateReport(role: string, reportType: string): boolean {
  const allowedTypes = REPORT_TYPES_BY_ROLE[role as UserRole];
  return !!allowedTypes?.includes(reportType as GeneratedReportType);
}

export function canGenerateReportWithSections(role: string, reportType: string, sectionIds: string[]): boolean {
  return canGenerateReport(role, reportType)
    && canSelectReportSections(role as UserRole, reportType as GeneratedReportType, sectionIds);
}