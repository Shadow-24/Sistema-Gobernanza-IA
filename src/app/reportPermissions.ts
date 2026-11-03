import type { UserRole } from "./AuthContext";
import type { GeneratedReportType } from "../utils/generatedReports";
import { canSelectReportSections } from "../utils/reportConfiguration";

export const REPORT_TYPES_BY_ROLE: Record<UserRole, readonly GeneratedReportType[]> = {
  "Gerente de Operaciones": [
    "Dashboard Ejecutivo",
    "Reporte de Trazabilidad",
  ],
  "Analista de Datos": [
    "Dashboard Ejecutivo",
    "Reporte de Riesgos",
    "Reporte de Trazabilidad",
  ],
  "Supervisor de Cumplimiento": [
    "Dashboard Ejecutivo",
    "Reporte de Cumplimiento",
    "Reporte de Riesgos",
    "Reporte de Auditoría",
    "Reporte de Trazabilidad",
  ],
  "Ingeniero de Campo": [
    "Dashboard Ejecutivo",
    "Reporte de Riesgos",
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