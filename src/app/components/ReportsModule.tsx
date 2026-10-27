import { FileBarChart2, FileDown, FileSpreadsheet, FileImage, Clock, CheckCircle, Eye, Download, AlertCircle, Loader, ShieldAlert, GitMerge, FileText, Building2, Truck, TrendingUp, ShieldCheck, ClipboardCheck, AlertTriangle, CloudRain, Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { generateExecutiveDashboardPDF, generateDashboardPreview } from "../../utils/reportGenerators/executiveDashboard";
import { generateDetailedReportPDF } from "../../utils/reportGenerators/detailedReport";
import { generateExcelExport } from "../../utils/reportGenerators/excelExport";
import { generateEvidencesZip } from "../../utils/reportGenerators/evidencesZip";
import { downloadGeneratedReport, formatReportSize, listGeneratedReports, openGeneratedReport, saveGeneratedReport, type GeneratedReport, type GeneratedReportType } from "../../utils/generatedReports";
import { formatPeriodLabel, getDefaultSections, getReportSectionGroups, type ReportConfiguration, type ReportDetailLevel } from "../../utils/reportConfiguration";
import { buildConfiguredReportSections } from "../../utils/reportGenerators/configuredReport";
import { canGenerateReport, canGenerateReportWithSections } from "../reportPermissions";
import { UserStoryRefs } from "./UserStoryRefs";
import { useAuth, type UserRole } from "../AuthContext";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded ${className}`} style={{ border: "1px solid #e1dfdd" }}>{children}</div>;
}

type ReportCard = { icon: React.ElementType; label: GeneratedReportType; desc: string; color: string; formato: string; acceso: string };

const reportTypes: ReportCard[] = [
  { icon: TrendingUp, label: "Reporte de Predicción de Demanda", desc: "Ventas observadas de combustibles, evaluación temporal XGBoost, baseline y métricas", color: "#8764b8", formato: "PDF", acceso: "Analítica" },
  { icon: FileBarChart2, label: "Dashboard Ejecutivo", desc: "KPIs ejecutivos, gobernanza y riesgos", color: "#0f6cbd", formato: "PDF / Web", acceso: "Gerencia / Cumplimiento" },
  { icon: ShieldAlert, label: "Reporte de Riesgos", desc: "Distribución, procesos y mitigaciones", color: "#ca5010", formato: "PDF", acceso: "Riesgos / Analítica" },
  { icon: GitMerge, label: "Reporte de Trazabilidad", desc: "Recorrido de decisiones AI TRiSM", color: "#8764b8", formato: "PDF", acceso: "Trazabilidad" },
  { icon: FileText, label: "Reporte Ejecutivo", desc: "Resumen estratégico para supervisión", color: "#107c10", formato: "PDF", acceso: "Gerencia de Operaciones" },
  { icon: Building2, label: "Reporte de Inventario", desc: "Instalaciones y capacidad registrada; sin existencias actuales", color: "#986f0b", formato: "PDF", acceso: "Analítica" },
  { icon: Truck, label: "Reporte de Transporte", desc: "Rutas y envíos conceptuales", color: "#0f6cbd", formato: "PDF", acceso: "Analítica / Campo" },
  { icon: FileSpreadsheet, label: "Reportes Analíticos", desc: "Datos históricos filtrados para análisis", color: "#986f0b", formato: "XLSX", acceso: "Analista de Datos" },
  { icon: ShieldCheck, label: "Reporte de Cumplimiento", desc: "Indicadores y riesgos regulatorios conceptuales", color: "#107c10", formato: "PDF", acceso: "Cumplimiento" },
  { icon: ClipboardCheck, label: "Reporte de Auditoría", desc: "Registros de auditoría disponibles y referencias", color: "#0f6cbd", formato: "PDF", acceso: "Auditoría" },
  { icon: FileImage, label: "Evidencias Digitales", desc: "Artefactos seleccionados y resoluciones relacionadas", color: "#8764b8", formato: "ZIP / PDF", acceso: "Auditoría / Legal" },
  { icon: AlertTriangle, label: "Reporte de Riesgos de Transporte", desc: "Evaluaciones simuladas de ruta y transporte", color: "#ca5010", formato: "PDF", acceso: "Ingeniería de Campo" },
  { icon: CloudRain, label: "Reporte de Condiciones Ambientales", desc: "Condiciones conceptuales de ruta, sin sensores", color: "#0f6cbd", formato: "PDF", acceso: "Ingeniería de Campo" },
  { icon: Bell, label: "Reporte de Alertas", desc: "Alertas simuladas de transporte y ambiente", color: "#a4262c", formato: "PDF", acceso: "Ingeniería de Campo" },
];

const STATE_STYLES: Record<string, { icon: React.ElementType; bg: string; text: string }> = {
  "Generado":   { icon: CheckCircle, bg: "#f1faf1", text: "#107c10" },
  "En proceso": { icon: Clock,       bg: "#fff8f0", text: "#ca5010" },
  "Programado": { icon: Clock,       bg: "#eff6ff", text: "#0f6cbd" },
};

const TYPE_COLORS: Record<string, string> = {
  "Dashboard Ejecutivo": "#0f6cbd",
  "Reporte de Riesgos": "#ca5010",
  "Reporte de Trazabilidad": "#8764b8",
  "Reporte Ejecutivo": "#107c10",
  "Reporte de Inventario": "#986f0b",
  "Reporte de Transporte": "#0f6cbd",
  "Reporte de Predicción de Demanda": "#8764b8",
  "Reportes Analíticos": "#986f0b",
  "Reporte de Cumplimiento": "#107c10",
  "Reporte de Auditoría": "#0f6cbd",
  "Reporte de Riesgos de Transporte": "#ca5010",
  "Reporte de Condiciones Ambientales": "#0f6cbd",
  "Reporte de Alertas": "#a4262c",
  "Reporte PDF":         "#107c10",
  "Exportación Excel":   "#986f0b",
  "Evidencias Digitales":"#8764b8",
};

function getReportLoadingKey(reportType: GeneratedReportType): string {
  if (reportType === "Dashboard Ejecutivo") return "dashboard-pdf";
  if (reportType === "Reportes Analíticos" || reportType === "Exportación Excel") return "excel";
  if (reportType === "Evidencias Digitales") return "evidences-zip";
  return "detailed-pdf";
}

function ReportWebPreviewModal({ htmlContent, reportType, period, onBack }: { htmlContent: string; reportType: GeneratedReportType; period: string; onBack: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: "rgba(0, 0, 0, 0.5)" }}>
      <div className="bg-white rounded-lg shadow-xl w-[96vw] max-w-[1440px] h-[92vh] max-h-[92vh] mx-4 overflow-hidden flex flex-col">
        <div className="flex flex-shrink-0 items-center justify-between px-6 py-4 border-b" style={{ borderColor: "#e1dfdd" }}>
          <h2 className="text-lg font-semibold">Vista previa web · {reportType} · {period}</h2>
          <button onClick={onBack} className="px-3 py-1.5 rounded text-[10px] font-medium border" style={{ borderColor: "#0f6cbd", color: "#0f6cbd" }}>
            Volver
          </button>
        </div>
        <div className="min-h-0 overflow-auto flex-1">
          <iframe
            srcDoc={htmlContent}
            title={`Vista previa ${reportType}`}
            className="block w-full h-full min-h-full border-none"
          />
        </div>
      </div>
    </div>
  );
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function ReportConfigurationModal({
  initialType,
  userRole,
  loading,
  onClose,
  onGenerate,
  onPreviewWeb,
}: {
  initialType: GeneratedReportType;
  userRole: UserRole;
  loading: boolean;
  onClose: () => void;
  onGenerate: (configuration: ReportConfiguration) => void;
  onPreviewWeb: (configuration: ReportConfiguration) => void;
}) {
  const currentYear = new Date().getFullYear();
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(toDateInputValue(new Date()));
  const [detailLevel, setDetailLevel] = useState<ReportDetailLevel>(userRole === "Gerente de Operaciones" ? "executive" : "detailed");
  const [sections, setSections] = useState<string[]>(getDefaultSections(initialType, userRole));
  const [phase, setPhase] = useState<"configure" | "preview">("configure");
  const [recordCount, setRecordCount] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preset, setPreset] = useState("Año en curso");
  const sectionGroups = getReportSectionGroups(initialType, userRole);
  const selectedOptions = sectionGroups.flatMap((group) => group.sections).filter((section) => sections.includes(section.id));
  const configuration: ReportConfiguration = {
    role: userRole,
    reportType: initialType,
    startDate,
    endDate,
    detailLevel,
    sections: initialType === "Evidencias Digitales" ? [] : sections,
    evidenceSections: initialType === "Evidencias Digitales" ? sections : [],
  };
  const isPeriodValid = !!startDate && !!endDate && startDate <= endDate;
  const selectedSectionKey = sections.join("|");

  useEffect(() => {
    let active = true;
    setPreviewLoading(true);
    buildConfiguredReportSections(configuration)
      .then((reportSections) => {
        if (active) setRecordCount(reportSections.reduce((total, section) => total + section.records.length, 0));
      })
      .catch((error) => {
        console.error("Error calculating report preview:", error);
        if (active) setRecordCount(0);
      })
      .finally(() => { if (active) setPreviewLoading(false); });
    return () => { active = false; };
  }, [initialType, startDate, endDate, detailLevel, selectedSectionKey]);

  const setDatePreset = (value: string) => {
    setPreset(value);
    if (value === "Personalizado") return;
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (value === "Año en curso") {
      setStartDate(`${today.getFullYear()}-01-01`);
      setEndDate(toDateInputValue(end));
      return;
    }
    if (value === "Año completo") {
      setStartDate(`${today.getFullYear()}-01-01`);
      setEndDate(`${today.getFullYear()}-12-31`);
      return;
    }
    const monthsBack = value === "Último mes" ? 1 : value === "Últimos 3 meses" ? 3 : 6;
    const start = new Date(end.getFullYear(), end.getMonth() - monthsBack, end.getDate() + 1);
    setStartDate(toDateInputValue(start));
    setEndDate(toDateInputValue(end));
  };

  const toggleSection = (id: string, checked: boolean) => {
    setSections((current) => checked ? [...new Set([...current, id])] : current.filter((section) => section !== id));
  };

  const sourceSummary = [...new Set(selectedOptions.map((section) => section.source))];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4" style={{ background: "rgba(0, 0, 0, 0.5)" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="report-config-title" className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[92vh] overflow-hidden flex flex-col" style={{ border: "1px solid #e1dfdd" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#e1dfdd" }}>
          <div>
            <h2 id="report-config-title" className="text-[14px] font-semibold" style={{ color: "#201f1e" }}>{phase === "configure" ? "Configurar reporte" : "Vista previa de configuración"}</h2>
            <p className="text-[10px] mt-1" style={{ color: "#8a8886" }}>Selecciona el contenido y confirma cómo se aplican las fuentes.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar configuración" className="text-gray-500 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {phase === "configure" ? <>
            <div className="grid grid-cols-1 gap-4">
              <fieldset className="text-[10px] font-medium" style={{ color: "#605e5c" }}>
                <legend>Nivel de detalle</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2">
                  {([{ value: "executive", label: "Resumen ejecutivo" }, { value: "detailed", label: "Detallado" }, { value: "complete", label: "Completo" }] as const).map((option) => <label key={option.value} className="inline-flex items-center gap-1.5 font-normal"><input type="radio" name="report-detail" value={option.value} checked={detailLevel === option.value} onChange={() => setDetailLevel(option.value)} />{option.label}</label>)}
                </div>
              </fieldset>
            </div>

            <section className="p-3 rounded" style={{ background: "#f9f8f7", border: "1px solid #e1dfdd" }}>
              <div className="text-[11px] font-semibold mb-2" style={{ color: "#201f1e" }}>Período del reporte</div>
              <div className="flex flex-wrap gap-2 mb-3">
                {["Último mes", "Últimos 3 meses", "Últimos 6 meses", "Año en curso", "Año completo", "Personalizado"].map((value) => <button key={value} type="button" onClick={() => setDatePreset(value)} className="px-2.5 py-1 rounded text-[9px] border" style={{ borderColor: preset === value ? "#0f6cbd" : "#e1dfdd", background: preset === value ? "#eff6ff" : "#ffffff", color: preset === value ? "#0f6cbd" : "#605e5c" }}>{value}</button>)}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-[9px]" style={{ color: "#605e5c" }}>Fecha inicial<input type="date" value={startDate} max={endDate || undefined} onChange={(event) => { setStartDate(event.target.value); setPreset("Personalizado"); }} className="mt-1 w-full px-2 py-1.5 rounded text-[10px] border" style={{ borderColor: "#e1dfdd" }} /></label>
                <label className="text-[9px]" style={{ color: "#605e5c" }}>Fecha final<input type="date" value={endDate} min={startDate || undefined} onChange={(event) => { setEndDate(event.target.value); setPreset("Personalizado"); }} className="mt-1 w-full px-2 py-1.5 rounded text-[10px] border" style={{ borderColor: "#e1dfdd" }} /></label>
              </div>
              <div className="text-[10px] mt-2" style={{ color: isPeriodValid ? "#605e5c" : "#a4262c" }}>{isPeriodValid ? `Periodo seleccionado: ${formatPeriodLabel(startDate, endDate)}` : "La fecha inicial no puede ser posterior a la fecha final."}</div>
              <p className="text-[9px] mt-2" style={{ color: "#8a8886" }}>El rango filtra registros con fecha de SINADA, expedientes, resoluciones y accesos locales. La capacidad CDCLyOPDH es una referencia histórica, no una medición de existencias.</p>
            </section>

            <section>
              <div className="text-[11px] font-semibold mb-2" style={{ color: "#201f1e" }}>Información a incluir</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {sectionGroups.map((group) => <details key={group.id} open className="p-3 rounded" style={{ border: "1px solid #e1dfdd" }}>
                  <summary className="cursor-pointer text-[10px] font-semibold" style={{ color: "#201f1e" }}>{group.label}</summary>
                  <div className="grid grid-cols-1 gap-1.5 mt-2">
                    {group.sections.map((section) => <label key={section.id} title={`Fuente: ${section.source}`} className="flex items-start gap-2 text-[9px] font-normal" style={{ color: "#605e5c" }}>
                      <input type="checkbox" checked={sections.includes(section.id)} onChange={(event) => toggleSection(section.id, event.target.checked)} className="mt-0.5" />
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {section.label}
                        {section.id === "demand" && (
                          <span className="rounded px-1.5 py-0.5 text-[8px] font-medium" style={{ background: "#f5f0fb", color: "#8764b8" }}>
                            XGBoost
                          </span>
                        )}
                      </span>
                    </label>)}
                  </div>
                </details>)}
              </div>
              {selectedOptions.length === 0 && <p className="text-[10px] mt-2" style={{ color: "#a4262c" }}>Selecciona al menos una sección.</p>}
            </section>

            <p className="text-[9px]" style={{ color: "#605e5c" }}>“Vista previa web” muestra el contenido seleccionado. “Generar reporte” crea y almacena el archivo del tipo correspondiente.</p>
          </> : <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "Tipo de reporte", value: initialType },
                { label: "Periodo", value: formatPeriodLabel(startDate, endDate) },
                { label: "Nivel", value: detailLevel === "executive" ? "Resumen ejecutivo" : detailLevel === "complete" ? "Completo" : "Detallado" },
                { label: "Secciones", value: String(selectedOptions.length) },
              ].map((item) => <div key={item.label} className="p-2 rounded" style={{ background: "#f9f8f7" }}><div className="text-[8px]" style={{ color: "#8a8886" }}>{item.label}</div><div className="text-[10px] font-medium mt-1" style={{ color: "#201f1e" }}>{item.value}</div></div>)}
            </div>
            <div className="p-3 rounded" style={{ background: "#eff6ff", border: "1px solid #cce0f5" }}>
              <div className="text-[10px] font-semibold" style={{ color: "#0f6cbd" }}>Contenido seleccionado</div>
              <p className="text-[9px] mt-1" style={{ color: "#605e5c" }}>{selectedOptions.map((section) => section.label).join(" · ") || "Sin secciones"}</p>
              <div className="text-[10px] mt-2" style={{ color: "#201f1e" }}>{previewLoading ? "Contando registros..." : `Cantidad aproximada de registros: ${recordCount}`}</div>
              <p className="text-[9px] mt-1" style={{ color: "#605e5c" }}>Origen: {[...new Set(sourceSummary)].slice(0, 4).join(" · ")}{sourceSummary.length > 4 ? " · y otras fuentes indicadas por sección" : ""}</p>
            </div>
            <p className="text-[9px]" style={{ color: "#8a8886" }}>Los rangos se aplican a CSV con fecha compatible. Las secciones sin datos exportables no generan registros inventados.</p>
          </>}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: "#e1dfdd" }}>
          {phase === "configure" ? <>
            <button onClick={onClose} className="px-3 py-1.5 rounded text-[10px] border" style={{ borderColor: "#e1dfdd", color: "#605e5c" }}>Cancelar</button>
            <button disabled={!isPeriodValid || selectedOptions.length === 0 || loading} onClick={() => setPhase("preview")} className="px-3 py-1.5 rounded text-[10px] font-medium text-white disabled:opacity-50" style={{ background: "#0f6cbd" }}>Vista previa</button>
          </> : <>
            <button onClick={onClose} className="px-3 py-1.5 rounded text-[10px] border" style={{ borderColor: "#e1dfdd", color: "#605e5c" }}>Cancelar</button>
            <button onClick={() => setPhase("configure")} className="px-3 py-1.5 rounded text-[10px] border" style={{ borderColor: "#e1dfdd", color: "#0f6cbd" }}>Volver a configurar</button>
            <button disabled={!isPeriodValid || selectedOptions.length === 0 || loading} onClick={() => onPreviewWeb(configuration)} className="px-3 py-1.5 rounded text-[10px] border disabled:opacity-50" style={{ borderColor: "#0f6cbd", color: "#0f6cbd" }}>Vista previa web</button>
            <button disabled={!isPeriodValid || selectedOptions.length === 0 || loading} onClick={() => onGenerate(configuration)} className="px-3 py-1.5 rounded text-[10px] font-medium text-white disabled:opacity-50" style={{ background: "#107c10" }}>{loading ? "Generando..." : "Generar reporte"}</button>
          </>}
        </div>
      </div>
    </div>
  );
}

export function ReportsModule() {
  const { recordAccess, user } = useAuth();
  const [generatedReports, setGeneratedReports] = useState<GeneratedReport[]>([]);
  const [loadingReport, setLoadingReport] = useState<string | null>(null);
  const [configurationReportType, setConfigurationReportType] = useState<GeneratedReportType | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewPeriod, setPreviewPeriod] = useState<string | null>(null);
  const [previewReportType, setPreviewReportType] = useState<GeneratedReportType | null>(null);
  const history = [...generatedReports].sort((a, b) => Date.parse(b.generado) - Date.parse(a.generado));
  const authorizedReportTypes = user ? reportTypes.filter((report) => canGenerateReport(user.role, report.label)) : [];

  useEffect(() => {
    let isActive = true;
    listGeneratedReports()
      .then((reports) => {
        if (isActive) setGeneratedReports(reports);
      })
      .catch((error) => {
        console.error("Error loading generated reports:", error);
        if (isActive) toast.error("No se pudo cargar el historial de reportes desde PostgreSQL");
      });
    return () => { isActive = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    const currentUrl = new URL(window.location.href);
    const requestedType = currentUrl.searchParams.get("tipo") ?? currentUrl.searchParams.get("reportType");
    if (!requestedType) return;
    currentUrl.searchParams.delete("tipo");
    currentUrl.searchParams.delete("reportType");
    window.history.replaceState(null, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
    if (canGenerateReport(user.role, requestedType)) {
      setConfigurationReportType(requestedType as GeneratedReportType);
      return;
    }
    recordAccess("Intento de generación de reporte", `Reporte: ${requestedType}`, "Denegado", user.username, user.role);
    toast.error("Acceso no autorizado para este tipo de reporte.");
  }, [user, recordAccess]);

  const saveGeneratedReportFile = async (blob: Blob, tipo: GeneratedReportType, nombre: string, periodo: string, rol: UserRole, secciones: string[]) => {
    const report = await saveGeneratedReport(blob, {
      nombre,
      tipo,
      periodo,
      usuario: user?.name ?? user?.username,
      rol,
      secciones,
    });
    setGeneratedReports((reports) => [report, ...reports]);
    return report;
  };
  const handleGenerateConfiguredReport = async (configuration: ReportConfiguration) => {
    const sections = configuration.reportType === "Evidencias Digitales" ? configuration.evidenceSections : configuration.sections;
    if (!user || !canGenerateReportWithSections(user.role, configuration.reportType, sections)) {
      recordAccess("Intento de generación de reporte", `Reporte: ${configuration.reportType} · Período: ${formatPeriodLabel(configuration.startDate, configuration.endDate)}`, "Denegado", user?.username, user?.role);
      toast.error("Acceso no autorizado para este tipo de reporte.");
      setConfigurationReportType(null);
      return;
    }

    const loadingKey = getReportLoadingKey(configuration.reportType);
    const reportName = `${configuration.reportType.replace(/\s+/g, "_")}_${configuration.startDate}_${configuration.endDate}`;
    const period = `${configuration.startDate}|${configuration.endDate}`;
    try {
      setLoadingReport(loadingKey);
      let blob: Blob;
      if (configuration.reportType === "Dashboard Ejecutivo") {
        blob = await generateExecutiveDashboardPDF(Number(configuration.startDate.slice(0, 4)), configuration);
      } else if (configuration.reportType === "Reportes Analíticos" || configuration.reportType === "Exportación Excel") {
        blob = await generateExcelExport(Number(configuration.startDate.slice(0, 4)), configuration);
      } else if (configuration.reportType === "Evidencias Digitales") {
        blob = await generateEvidencesZip(Number(configuration.startDate.slice(0, 4)), configuration);
      } else {
        blob = await generateDetailedReportPDF(Number(configuration.startDate.slice(0, 4)), configuration);
      }
      await saveGeneratedReportFile(blob, configuration.reportType, reportName, period, user.role, sections);
      toast.success("Reporte generado y guardado exitosamente");
      setConfigurationReportType(null);
    } catch (error) {
      console.error("Error generating configured report:", error);
      if (error instanceof Error && error.message === "UNAUTHORIZED_REPORT_TYPE") {
        recordAccess("Intento de generación de reporte", `Reporte: ${configuration.reportType} · Período: ${formatPeriodLabel(configuration.startDate, configuration.endDate)}`, "Denegado", user.username, user.role);
        toast.error("Acceso no autorizado para este tipo de reporte.");
        setConfigurationReportType(null);
        return;
      }
      toast.error("Error al generar o guardar el reporte configurado");
    } finally {
      setLoadingReport(null);
    }
  };

  const handleConfiguredReportPreview = async (configuration: ReportConfiguration) => {
    if (!user || !canGenerateReportWithSections(user.role, configuration.reportType, configuration.sections)) {
      recordAccess("Intento de vista previa de reporte", `Reporte: ${configuration.reportType}`, "Denegado", user?.username, user?.role);
      toast.error("Acceso no autorizado para este tipo de reporte.");
      setConfigurationReportType(null);
      return;
    }
    try {
      setLoadingReport("dashboard-web");
      const htmlContent = await generateDashboardPreview(Number(configuration.startDate.slice(0, 4)), configuration);
      setPreviewHtml(htmlContent);
      setPreviewPeriod(formatPeriodLabel(configuration.startDate, configuration.endDate));
      setPreviewReportType(configuration.reportType);
      recordAccess("Consulta de reporte", `Vista previa web · ${configuration.reportType} · ${formatPeriodLabel(configuration.startDate, configuration.endDate)}`, "Permitido", user.username, user.role);
    } catch (error) {
      console.error("Error generating configured report preview:", error);
      toast.error("Error al generar la vista previa web");
    } finally {
      setLoadingReport(null);
    }
  };
  const handleReportButtonClick = (reportType: GeneratedReportType) => {
    if (!user || !canGenerateReport(user.role, reportType)) {
      recordAccess("Intento de generación de reporte", `Reporte: ${reportType}`, "Denegado", user?.username, user?.role);
      toast.error("Acceso no autorizado para este tipo de reporte.");
      return;
    }
    setConfigurationReportType(reportType);
  };

  const handleHistoryDetails = async (report: GeneratedReport) => {
    recordAccess("Consulta de reporte", report.nombre);
    try {
      if (report.fileName.endsWith(".pdf")) {
        await openGeneratedReport(report);
        return;
      }
      await downloadGeneratedReport(report);
      toast.info(`El formato ${report.fileName.split(".").pop()?.toUpperCase()} se descarga para su visualización`);
    } catch (error) {
      console.error("No se pudo abrir el reporte:", error);
      toast.error(error instanceof Error ? error.message : "No se pudo abrir el reporte.");
    }
  };

  const handleHistoryDownload = async (report: GeneratedReport) => {
    try {
      await downloadGeneratedReport(report);
      recordAccess("Descarga de reporte", report.nombre);
      toast.success("Descarga del reporte generado iniciada");
    } catch (error) {
      console.error("No se pudo descargar el reporte:", error);
      toast.error(error instanceof Error ? error.message : "No se pudo descargar el reporte.");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-[16px] font-semibold" style={{ color: "#201f1e" }}>Reportes</h1><UserStoryRefs ids={["HU-010", "HU-013", "HU-014", "HU-016", "HU-017"]} /></div>
        <p className="text-[11px] mt-0.5" style={{ color: "#605e5c" }}>
          Generación y exportación de informes con periodos configurables
        </p>
      </div>

      {/* Report type cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {authorizedReportTypes.map((rt) => {
          const Icon = rt.icon;
          const loadingKey = getReportLoadingKey(rt.label);
          const isLoading = loadingReport === loadingKey;
          return (
            <Card key={rt.label} className="p-4 cursor-pointer hover:shadow-sm transition-shadow">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style={{ background: rt.color + "15" }}>
                <Icon className="w-5 h-5" style={{ color: rt.color }} />
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <div className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>{rt.label}</div>
                {rt.label === "Reporte de Predicción de Demanda" && (
                  <span className="rounded px-1.5 py-0.5 text-[9px] font-medium" style={{ background: "#f5f0fb", color: "#8764b8" }}>
                    XGBoost
                  </span>
                )}
              </div>
              <p className="text-[10px] leading-snug mb-3" style={{ color: "#8a8886" }}>{rt.desc}</p>
              <div className="flex items-center justify-between">
                <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: rt.color + "15", color: rt.color }}>{rt.formato}</span>
                <span className="text-[9px]" style={{ color: "#8a8886" }}>{rt.acceso}</span>
              </div>
              <button
                onClick={() => handleReportButtonClick(rt.label)}
                disabled={isLoading}
                className="mt-3 w-full py-1.5 rounded text-[10px] font-medium transition-colors flex items-center justify-center gap-2"
                style={{
                  background: rt.color,
                  color: "#ffffff",
                  opacity: isLoading ? 0.7 : 1,
                  cursor: isLoading ? "not-allowed" : "pointer",
                }}
              >
                {isLoading ? (
                  <>
                    <Loader className="w-3.5 h-3.5 animate-spin" />
                    Generando...
                  </>
                ) : (
                  "Generar Reporte"
                )}
              </button>
            </Card>
          );
        })}
      </div>

      {/* Report history */}
      <Card className="p-4">
        <div className="text-[12px] font-semibold mb-4" style={{ color: "#201f1e" }}>
          Historial de reportes · {history.length} registros · más recientes primero
        </div>

        <div className="overflow-x-auto">
        <div className="min-w-[760px]">
        {/* Table header */}
        <div className="grid grid-cols-12 gap-2 pb-2 mb-1 text-[10px] font-semibold" style={{ color: "#8a8886", borderBottom: "1px solid #f3f2f1" }}>
          <div className="col-span-1">ID</div>
          <div className="col-span-3">Nombre del Reporte</div>
          <div className="col-span-1">Tipo</div>
          <div className="col-span-2">Periodo</div>
          <div className="col-span-2">Generado</div>
          <div className="col-span-1">Estado</div>
          <div className="col-span-1">Tamaño</div>
          <div className="col-span-1 text-right">Acciones</div>
        </div>

        <div className="space-y-1">
          {history.length === 0 ? (
            <div className="py-6 text-center text-[11px]" style={{ color: "#8a8886" }}>No hay reportes generados</div>
          ) : history.map(report => {
            const s = STATE_STYLES[report.estado];
            const Icon = s.icon;
            const typeColor = TYPE_COLORS[report.tipo] ?? "#605e5c";
            const generatedAt = new Date(report.generado).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" });
            return (
              <div key={report.id} className="grid grid-cols-12 gap-2 items-center py-2.5 px-1 rounded hover:bg-gray-50 transition-colors">
                <div className="col-span-1 text-[9px] font-mono" style={{ color: "#8a8886" }}>{report.id.replace("RPT-", "")}</div>
                <div className="col-span-3 text-[11px] font-medium" style={{ color: "#201f1e" }}>{report.nombre}</div>
                <div className="col-span-1">
                  <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: typeColor + "15", color: typeColor }}>
                    {report.tipo}
                  </span>
                </div>
                <div className="col-span-2 text-[9px]" style={{ color: "#605e5c" }}>{report.periodo.includes("|") ? formatPeriodLabel(...report.periodo.split("|") as [string, string]) : report.periodo}</div>
                <div className="col-span-2 text-[10px]" style={{ color: "#8a8886" }}>{generatedAt}</div>
                <div className="col-span-1">
                  <span className="inline-flex items-center gap-1 text-[9px]" style={{ color: s.text }}>
                    <Icon className="w-2.5 h-2.5" />{report.estado}
                  </span>
                </div>
                <div className="col-span-1 text-[10px]" style={{ color: "#8a8886" }}>{formatReportSize(report.sizeBytes)}</div>
                <div className="col-span-1 flex items-center justify-end gap-1">
                  {report.estado === "Generado" && (
                    <>
                      <button onClick={() => handleHistoryDetails(report)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-gray-100 transition-colors" title="Ver detalles">
                        <Eye className="w-3 h-3" style={{ color: "#0f6cbd" }} />
                      </button>
                      <button onClick={() => handleHistoryDownload(report)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-gray-100 transition-colors" title="Descargar reporte generado">
                        <Download className="w-3 h-3" style={{ color: "#107c10" }} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        </div>
        </div>
      </Card>

      {/* Footer note */}
      <div className="flex items-center gap-2 px-4 py-3 rounded text-[10px]" style={{ background: "#eff6ff", color: "#0f6cbd", border: "1px solid #cce0f5" }}>
        <FileBarChart2 className="w-3.5 h-3.5 flex-shrink-0" />
        <span>Las exportaciones usan datasets históricos cargados en PostgreSQL y resultados persistidos del modelo de demanda cuando están disponibles. No hay conexiones en vivo, firma digital ni cadena de custodia real.</span>
      </div>

      {/* Dashboard Preview Modal */}
      {previewHtml && previewPeriod && previewReportType && (
        <ReportWebPreviewModal
          htmlContent={previewHtml}
          reportType={previewReportType}
          period={previewPeriod}
          onBack={() => setPreviewHtml(null)}
        />
      )}

      {configurationReportType && (
        <ReportConfigurationModal
          key={configurationReportType}
          initialType={configurationReportType}
          userRole={user!.role}
          loading={loadingReport !== null}
          onClose={() => setConfigurationReportType(null)}
          onGenerate={handleGenerateConfiguredReport}
          onPreviewWeb={handleConfiguredReportPreview}
        />
      )}
    </div>
  );
}
