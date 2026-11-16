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

// Permiso de módulo que exige cada tipo de reporte (replica REPORT_PERMISSION_BY_TYPE del backend).
export const REPORT_PERMISSION_BY_TYPE: Partial<Record<GeneratedReportType, string>> = {
  "Dashboard Ejecutivo": "dashboard",
  "Reporte de Riesgos": "riesgos",
  "Reporte de Trazabilidad": "trazabilidad",
  "Reporte de Cumplimiento": "cumplimiento",
  "Reporte de Auditoría": "auditoria",
};

export function canGenerateReportWithPermissions(role: string, reportType: string, permissions: readonly string[]): boolean {
  const modulePermission = REPORT_PERMISSION_BY_TYPE[reportType as GeneratedReportType];
  return canGenerateReport(role, reportType) && !!modulePermission && permissions.includes(modulePermission);
}

export function canGenerateReportWithSections(role: string, reportType: string, sectionIds: string[]): boolean {
  return canGenerateReport(role, reportType)
    && canSelectReportSections(role as UserRole, reportType as GeneratedReportType, sectionIds);
}