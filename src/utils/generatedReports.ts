import { ApiError, apiFetch, apiRequest } from "../app/apiClient";

export type GeneratedReportType =
  | "Dashboard Ejecutivo"
  | "Reporte de Riesgos"
  | "Reporte de Trazabilidad"
  | "Reporte Ejecutivo"
  | "Reporte de Inventario"
  | "Reporte de Transporte"
  | "Reporte de Predicción de Demanda"
  | "Reportes Analíticos"
  | "Reporte de Cumplimiento"
  | "Reporte de Auditoría"
  | "Reporte de Riesgos de Transporte"
  | "Reporte de Condiciones Ambientales"
  | "Reporte de Alertas"
  | "Reporte PDF"
  | "Exportación Excel"
  | "Evidencias Digitales";

export type GeneratedReport = {
  id: string;
  nombre: string;
  tipo: GeneratedReportType;
  generado: string;
  estado: "Generado";
  sizeBytes: number;
  fileName: string;
  path: string;
  periodo: string;
  usuario?: string;
};

const REPORTS_API = "/api/generated-reports";

export async function listGeneratedReports(): Promise<GeneratedReport[]> {
  return apiRequest<GeneratedReport[]>(REPORTS_API);
}

export async function saveGeneratedReport(
  blob: Blob,
  report: { nombre: string; tipo: GeneratedReportType; periodo: string; usuario?: string; rol: string; secciones: string[] },
): Promise<GeneratedReport> {
  const query = new URLSearchParams({
    nombre: report.nombre,
    tipo: report.tipo,
    periodo: report.periodo,
    secciones: JSON.stringify(report.secciones),
  });
  try {
    const response = await apiFetch(`${REPORTS_API}?${query}`, {
      method: "POST",
      headers: { "Content-Type": blob.type || "application/octet-stream" },
      body: blob,
    });
    return response.json() as Promise<GeneratedReport>;
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) throw new Error("UNAUTHORIZED_REPORT_TYPE");
    throw error;
  }
}

export function generatedReportUrl(report: GeneratedReport, download = false): string {
  const suffix = download ? "?download=true" : "";
  return `${REPORTS_API}/${encodeURIComponent(report.id)}${suffix}`;
}

async function fetchGeneratedReport(report: GeneratedReport, download: boolean): Promise<Blob> {
  const response = await apiFetch(generatedReportUrl(report, download));
  return response.blob();
}

export async function openGeneratedReport(report: GeneratedReport): Promise<void> {
  const previewWindow = window.open("about:blank", "_blank");
  if (previewWindow) previewWindow.opener = null;
  try {
    const objectUrl = URL.createObjectURL(await fetchGeneratedReport(report, false));
    if (!previewWindow) {
      URL.revokeObjectURL(objectUrl);
      throw new Error("El navegador bloqueó la ventana de vista previa.");
    }
    previewWindow.location.href = objectUrl;
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (error) {
    previewWindow?.close();
    throw error;
  }
}

export async function downloadGeneratedReport(report: GeneratedReport): Promise<void> {
  const objectUrl = URL.createObjectURL(await fetchGeneratedReport(report, true));
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = report.fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export function formatReportSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}