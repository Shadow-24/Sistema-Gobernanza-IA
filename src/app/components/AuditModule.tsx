import React from "react";
import { useEffect, useState } from "react";
import {
  AuditDocument,
  AuditPhase,
  AuditStatus,
  AuditWorkflow,
  AuditWorkflowEvent,
  deleteAuditDocument,
  downloadAuditDocument,
  loadAuditDocuments,
  loadAuditWorkflow,
  loadAuditWorkflowEvents,
  updateAuditWorkflow,
  uploadAuditDocument,
} from "../auditsApi";
import { useAuth } from "../AuthContext";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { UserStoryRefs } from "./UserStoryRefs";

// Minimal inline icon components to avoid external dependency on 'lucide-react'
const SvgIcon = ({ children, className, style }: { children: React.ReactNode; className?: string; style?: any }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} width="16" height="16" aria-hidden>
    {children}
  </svg>
);

export const CheckCircle = (props: any) => (
  <SvgIcon {...props}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" /><path d="M9 12.5l1.5 1.5L15 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></SvgIcon>
);
export const Clock = (props: any) => (
  <SvgIcon {...props}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" /><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></SvgIcon>
);
export const XCircle = (props: any) => (
  <SvgIcon {...props}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" /><path d="M15 9L9 15M9 9l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></SvgIcon>
);
export const FileText = (props: any) => (
  <SvgIcon {...props}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.5" /><path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.5" /><path d="M8 13h8M8 17h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></SvgIcon>
);
export const Link = (props: any) => (
  <SvgIcon {...props}><path d="M10 14a3 3 0 0 1 0-4l1-1a3 3 0 0 1 4 4l-1 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M14 10a3 3 0 0 1 0 4l-1 1a3 3 0 0 1-4-4l1-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></SvgIcon>
);
export const ChevronRight = (props: any) => (
  <SvgIcon {...props}><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></SvgIcon>
);

function Card({
  children,
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) {
  return <div {...props} className={`bg-white rounded ${className}`} style={{ border: "1px solid #e1dfdd", ...props.style }}>{children}</div>;
}

const STATE_STYLES: Record<string, { icon: React.ElementType; bg: string; text: string; label: string }> = {
  "Pendiente":   { icon: Clock,       bg: "#f3f2f1", text: "#605e5c", label: "Pendiente" },
  "Completada":  { icon: CheckCircle, bg: "#f1faf1", text: "#107c10", label: "Completada" },
  "En curso":    { icon: Clock,       bg: "#fff8f0", text: "#ca5010", label: "En curso" },
  "Observada":   { icon: XCircle,     bg: "#fdf3f4", text: "#a4262c", label: "Observada" },
};

const AUDIT_PHASES: AuditPhase[] = [
  "Planificación",
  "Recopilación de evidencias",
  "Análisis",
  "Hallazgos y recomendaciones",
  "Revisión y cierre",
];

type AuditChange = { field: string; label: string; before: string; after: string };

function getAuditEventChanges(detail: string): AuditChange[] {
  try {
    const parsed: unknown = JSON.parse(detail);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "changes" in parsed &&
      Array.isArray(parsed.changes)
    ) {
      return parsed.changes.filter((change): change is AuditChange => (
        typeof change === "object" &&
        change !== null &&
        "field" in change && typeof change.field === "string" &&
        "label" in change && typeof change.label === "string" &&
        "before" in change && typeof change.before === "string" &&
        "after" in change && typeof change.after === "string"
      ));
    }
  } catch {
    return [];
  }
  return [];
}

const auditoriasByYear: Record<string, {
  id: string; tipo: string; estado: keyof typeof STATE_STYLES;
  administrado: string; sector: string; fecha: string;
  evidencias: number; resoluciones: string[]; expedientes: string[];
  cumplimiento: number; hallazgos: string;
  modelo?: string; version?: string; proceso?: string; resultado?: string; nivelRiesgo?: string;
  confianza?: number; factores?: { name: string; percent: number }[]; recomendacion?: string;
}[]> = {
  "2024": [
    { id: "AUD-2024-041", tipo: "Auditoría de Modelo AI – Predicción Incidentes", estado: "Completada", administrado: "PLUSPETROL NORTE S.A.", sector: "Hidrocarburos Mayores", fecha: "15/12/2024", evidencias: 12, resoluciones: ["0389-2024-OEFA/DFAI", "0372-2024-OEFA/DFAI"], expedientes: ["516-2024-OEFA/TFA-SE"], cumplimiento: 87, hallazgos: "Escenario conceptual de sesgo en predicción de eventos. Evaluación simulada que requiere revisión humana.", modelo: "Clasificación de Incidentes", version: "sim. 2.3", proceso: "Distribución", resultado: "Posible sesgo · resultado simulado", nivelRiesgo: "Alto", confianza: 91, factores: [{ name: "Comportamiento histórico", percent: 42 }, { name: "Condición de operación", percent: 31 }, { name: "Volumen de escenario", percent: 18 }, { name: "Otros factores", percent: 9 }], recomendacion: "Revisar representatividad de datos antes de cualquier uso operacional." },
    { id: "AUD-2024-038", tipo: "Auditoría de Trazabilidad – Decisiones HC", estado: "Completada", administrado: "REFINERIA LA PAMPILLA S.A.A.", sector: "Hidrocarburos Mayores", fecha: "06/11/2024", evidencias: 8, resoluciones: ["0382-2024-OEFA/DFAI"], expedientes: ["411-2024-OEFA/TFA-SE", "084-2024-OEFA/TFA-SE"], cumplimiento: 92, hallazgos: "Registro de decisiones completo. Se recomienda automatizar notificaciones de resolución." },
    { id: "AUD-2024-035", tipo: "Auditoría de Cumplimiento Normativo SINADA", estado: "Completada", administrado: "Gas Natural de Lima y Callao", sector: "Comercialización HC", fecha: "22/10/2024", evidencias: 6, resoluciones: ["0376-2024-OEFA/DFAI"], expedientes: [], cumplimiento: 96, hallazgos: "Cumplimiento dentro de parámetros. Sin observaciones críticas." },
    { id: "AUD-2024-031", tipo: "Auditoría de Instalaciones Fijas CDCLy", estado: "En curso", administrado: "OLYMPIC PERU INC SUC. DEL PERU", sector: "Hidrocarburos Mayores", fecha: "05/10/2024", evidencias: 4, resoluciones: [], expedientes: ["239-2024-OEFA/TFA-SE"], cumplimiento: 71, hallazgos: "Pendiente verificación de 3 tanques de almacenamiento en Lote XIII-A." },
    { id: "AUD-2024-028", tipo: "Auditoría de Modelo AI – Clasificación Denuncias", estado: "Observada", administrado: "Escenario conceptual sobre el dataset SINADA", sector: "Plataforma AI TRiSM", fecha: "18/09/2024", evidencias: 9, resoluciones: [], expedientes: [], cumplimiento: 63, hallazgos: "Deriva representada conceptualmente en la clasificación de denuncias. Resultado simulado; requiere validación con datos etiquetados.", modelo: "Clasificación de Incidentes", version: "sim. 1.0", proceso: "Clasificación de denuncias", resultado: "Deriva potencial · resultado simulado", nivelRiesgo: "Medio", confianza: 74, factores: [{ name: "Cobertura de etiquetas", percent: 42 }, { name: "Comportamiento histórico", percent: 31 }, { name: "Calidad de datos", percent: 18 }, { name: "Otros factores", percent: 9 }], recomendacion: "Validar balance y calidad de etiquetas antes de evaluar un modelo real." },
    { id: "AUD-2024-052", tipo: "Auditoría de Modelo IA – Predicción de Demanda", estado: "En curso", administrado: "Escenario conceptual de demanda", sector: "Cadena de suministro · Demanda", fecha: "Escenario Q4 2024", evidencias: 4, resoluciones: [], expedientes: [], cumplimiento: 78, hallazgos: "Evaluación demostrativa; el diccionario disponible describe variables de precios, no una serie histórica de observaciones.", modelo: "Predicción de Demanda", version: "sim. 1.0", proceso: "Demanda", resultado: "Desviación de demanda · resultado simulado", nivelRiesgo: "Medio", confianza: 89, factores: [{ name: "Historial de escenario", percent: 42 }, { name: "Estacionalidad simulada", percent: 31 }, { name: "Volumen de escenario", percent: 18 }, { name: "Otros factores", percent: 9 }], recomendacion: "Contrastar con datos de demanda validados antes de tomar decisiones." },
    { id: "AUD-2024-055", tipo: "Auditoría de Modelo IA – Riesgo de Transporte", estado: "En curso", administrado: "Ruta conceptual Lima - Callao", sector: "Cadena de suministro · Transporte", fecha: "Escenario Q4 2024", evidencias: 3, resoluciones: [], expedientes: [], cumplimiento: 72, hallazgos: "Escenario de ruta simulado; los datasets disponibles no contienen geometrías ni tiempos de transporte.", modelo: "Evaluación de Riesgo de Ruta", version: "sim. 1.0", proceso: "Transporte", resultado: "Riesgo de ruta · resultado simulado", nivelRiesgo: "Alto", confianza: 91, factores: [{ name: "Historial simulado", percent: 42 }, { name: "Condición de ruta simulada", percent: 31 }, { name: "Volumen de escenario", percent: 18 }, { name: "Otros factores", percent: 9 }], recomendacion: "Revisión humana de condiciones y restricciones de ruta." },
    { id: "AUD-2024-058", tipo: "Auditoría de Modelo IA – Anomalías de Transporte", estado: "Observada", administrado: "Escenario operacional demostrativo", sector: "Cadena de suministro · Transporte", fecha: "Escenario Q4 2024", evidencias: 2, resoluciones: [], expedientes: [], cumplimiento: 68, hallazgos: "Se requiere validar la procedencia de datos operacionales antes de una evaluación real.", modelo: "Detección de Anomalías de Transporte", version: "sim. 1.0", proceso: "Transporte", resultado: "Posible retraso · resultado simulado", nivelRiesgo: "Medio", confianza: 86, factores: [{ name: "Historial simulado", percent: 42 }, { name: "Condición de ruta simulada", percent: 31 }, { name: "Volumen de escenario", percent: 18 }, { name: "Otros factores", percent: 9 }], recomendacion: "No tratar este resultado conceptual como una alerta operacional real." },
  ],
  "2025": [
    { id: "AUD-2025-004", tipo: "Auditoría de Medidas Correctivas – Lote 192", estado: "En curso", administrado: "PLUSPETROL NORTE S.A.", sector: "Hidrocarburos Mayores", fecha: "31/03/2025", evidencias: 3, resoluciones: ["0389-2025-OEFA/DFAI", "0372-2025-OEFA/DFAI"], expedientes: [], cumplimiento: 55, hallazgos: "Dos medidas correctivas en un trimestre. Patrón de recurrencia activa proceso de auditoría intensiva." },
    { id: "AUD-2025-002", tipo: "Auditoría de Trazabilidad Q1 2025", estado: "En curso", administrado: "Sistema AI TRiSM – General", sector: "Plataforma AI TRiSM", fecha: "15/03/2025", evidencias: 7, resoluciones: ["0382-2025-OEFA/DFAI", "0376-2025-OEFA/DFAI"], expedientes: [], cumplimiento: 82, hallazgos: "Trazabilidad parcial. Resoluciones sin medida correctiva carecen de evidencia documental adjunta." },
    { id: "AUD-2025-001", tipo: "Auditoría de Apertura de Período 2025", estado: "Completada", administrado: "Todos los sectores", sector: "Multi-sector", fecha: "31/01/2025", evidencias: 15, resoluciones: [], expedientes: [], cumplimiento: 91, hallazgos: "Línea base establecida. 1,672 instalaciones verificadas en CDCLy. 879 denuncias arrastradas identificadas." },
  ],
};

const timelineByYear: Record<string, { fecha: string; evento: string; tipo: "audit" | "resolution" | "expediente" | "risk"; detalle: string; relatedAuditId?: string }[]> = {
  "2024": [],
  "2025": [],
};

const latestAuditYear = Object.keys(auditoriasByYear).sort((a, b) => Number(b) - Number(a))[0];

const TYPE_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  audit:      { bg: "#eff6ff", text: "#0f6cbd", dot: "#0f6cbd" },
  resolution: { bg: "#fff8f0", text: "#ca5010", dot: "#ca5010" },
  expediente: { bg: "#f1faf1", text: "#107c10", dot: "#107c10" },
  risk:       { bg: "#fdf3f4", text: "#a4262c", dot: "#a4262c" },
};

function timelineTimestamp(value: string): number {
  const date = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (date) return Date.UTC(Number(date[3]), Number(date[2]) - 1, Number(date[1]));
  return Date.parse(value) || 0;
}

export function AuditModule() {
  const { user, managedUsers, managementError } = useAuth();
  const canManageAudits = user?.role === "Supervisor de Cumplimiento" && user.permissions.includes("auditoria");
  const eligibleAssignees = managedUsers.filter((account) => account.active && account.permissions.includes("auditoria"));
  const auditTemplates = auditoriasByYear[latestAuditYear];
  const timeline = timelineByYear[latestAuditYear];
  const [workflow, setWorkflow] = useState<AuditWorkflow[]>([]);
  const [workflowEvents, setWorkflowEvents] = useState<AuditWorkflowEvent[]>([]);
  const [expandedTimelineEvents, setExpandedTimelineEvents] = useState<Set<string>>(() => new Set());
  const [documents, setDocuments] = useState<AuditDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [selectedAuditId, setSelectedAuditId] = useState(auditTemplates[0]?.id ?? "");
  const [isFollowUpOpen, setIsFollowUpOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<AuditStatus | null>(null);
  const [draftStatus, setDraftStatus] = useState<AuditStatus>(auditTemplates[0]?.estado ?? "En curso");
  const [draftPhase, setDraftPhase] = useState<AuditPhase>("Planificación");
  const [draftResponsible, setDraftResponsible] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [workflowError, setWorkflowError] = useState("");
  const [documentsError, setDocumentsError] = useState("");
  const [notice, setNotice] = useState("");
  const [documentPreview, setDocumentPreview] = useState<{ fileName: string; mediaType: string; blob: Blob } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const workflowById = new Map(workflow.map((item) => [item.audit_id, item]));
  const audits = auditTemplates.map((audit) => {
    const saved = workflowById.get(audit.id);
    return {
      ...audit,
      estado: saved?.status ?? "Pendiente",
    };
  });
  const filteredAudits = statusFilter ? audits.filter((audit) => audit.estado === statusFilter) : audits;
  const selectedAudit = filteredAudits.find((audit) => audit.id === selectedAuditId) ?? filteredAudits[0];
  const selectedWorkflow = selectedAudit ? workflowById.get(selectedAudit.id) : undefined;

  useEffect(() => {
    let active = true;
    Promise.all([loadAuditWorkflow(), loadAuditWorkflowEvents()])
      .then(([savedWorkflow, events]) => {
        if (!active) return;
        setWorkflow(savedWorkflow);
        setWorkflowEvents(events);
        setWorkflowError("");
      })
      .catch((error: unknown) => {
        if (active) setWorkflowError(error instanceof Error ? error.message : "No se pudo cargar el seguimiento de auditorías.");
      });
    return () => { active = false; };
  }, [refreshKey]);

  useEffect(() => {
    if (!selectedAudit) return;
    setDraftStatus(selectedAudit.estado);
    setDraftPhase(selectedWorkflow?.phase ?? "Planificación");
    setDraftResponsible(selectedWorkflow?.responsible ?? "");
    setDraftNotes(selectedWorkflow?.notes ?? "");
    setNotice("");
  }, [selectedAuditId, selectedWorkflow?.phase, selectedWorkflow?.responsible, selectedWorkflow?.notes, selectedAudit?.estado]);

  useEffect(() => {
    if (!selectedAudit) return;
    let active = true;
    setDocuments([]);
    setDocumentsLoading(true);
    setDocumentsError("");
    loadAuditDocuments(selectedAudit.id)
      .then((files) => {
        if (active) {
          setDocuments(files);
          setDocumentsError("");
        }
      })
      .catch((error: unknown) => {
        if (active) setDocumentsError(error instanceof Error ? error.message : "No se pudieron cargar los documentos.");
      })
      .finally(() => {
        if (active) setDocumentsLoading(false);
      });
    return () => { active = false; };
  }, [selectedAudit?.id]);

  async function saveAuditChanges(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAudit) return;
    setSaving(true);
    setWorkflowError("");
    setNotice("");
    try {
      const saved = await updateAuditWorkflow(selectedAudit.id, {
        status: draftStatus,
        phase: draftPhase,
        responsible: draftResponsible,
        notes: draftNotes,
      });
      setWorkflow((current) => [...current.filter((item) => item.audit_id !== saved.audit_id), saved]);
      setRefreshKey((current) => current + 1);
      setNotice("Seguimiento de auditoría guardado.");
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : "No se pudieron guardar los cambios de auditoría.");
    } finally {
      setSaving(false);
    }
  }

  async function addAuditDocument(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedAudit) return;
    setUploading(true);
    setDocumentsError("");
    try {
      const saved = await uploadAuditDocument(selectedAudit.id, file);
      setDocuments((current) => [saved, ...current]);
      setRefreshKey((current) => current + 1);
      setNotice(`Documento "${saved.file_name}" adjuntado.`);
    } catch (error) {
      setDocumentsError(error instanceof Error ? error.message : "No se pudo adjuntar el documento.");
    } finally {
      setUploading(false);
    }
  }

  async function previewAuditDocument(document: AuditDocument) {
    setDocumentsError("");
    try {
      const blob = await downloadAuditDocument(document.id);
      setDocumentPreview({ fileName: document.file_name, mediaType: document.media_type, blob });
    } catch (error) {
      setDocumentPreview(null);
      setDocumentsError(error instanceof Error ? error.message : "No se pudo abrir la vista previa del documento.");
    }
  }

  async function downloadAuditDocumentFile(document: AuditDocument) {
    try {
      const blob = await downloadAuditDocument(document.id);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = document.file_name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setDocumentsError(error instanceof Error ? error.message : "No se pudo descargar el documento.");
    }
  }

  async function removeAuditDocument(document: AuditDocument) {
    if (!window.confirm(`¿Eliminar el documento "${document.file_name}"? Esta acción no se puede deshacer.`)) return;
    setDeletingDocumentId(document.id);
    setDocumentsError("");
    try {
      await deleteAuditDocument(document.id);
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      setRefreshKey((current) => current + 1);
      setNotice(`Documento "${document.file_name}" eliminado.`);
    } catch (error) {
      setDocumentsError(error instanceof Error ? error.message : "No se pudo eliminar el documento.");
    } finally {
      setDeletingDocumentId(null);
    }
  }

  const timelineItems = [
    ...workflowEvents.map((event) => ({
      fecha: new Date(event.occurred_at).toLocaleString("es-PE"),
      evento: `${event.audit_id} · ${event.event_type === "document" ? (event.detail.startsWith("Documento eliminado:") ? "Documento eliminado" : "Documento adjuntado") : "Seguimiento actualizado"}`,
      tipo: event.event_type === "document" ? "expediente" as const : "audit" as const,
      detalle: event.event_type === "update"
        ? `${getAuditEventChanges(event.detail).length} cambios guardados · ${event.username}`
        : `${event.detail} · ${event.username}`,
      key: `workflow-${event.id}`,
      eventType: event.event_type,
      changes: getAuditEventChanges(event.detail),
      auditId: event.audit_id,
      relatedAuditId: event.audit_id,
    })),
    ...timeline.map((event, index) => ({
      ...event,
      key: `legacy-${index}`,
      eventType: null,
      changes: [],
      auditId: event.tipo === "audit" ? event.evento.match(/AUD-\d{4}-\d{3}/)?.[0] : undefined,
    })),
  ].filter((event) => event.tipo !== "audit" || audits.some((audit) => audit.id === event.auditId))
    .sort((left, right) => timelineTimestamp(right.fecha) - timelineTimestamp(left.fecha));
  const visibleAuditIds = new Set(filteredAudits.map((audit) => audit.id));
  const filteredTimelineItems = timelineItems.filter((event) => (
    event.auditId ? visibleAuditIds.has(event.auditId)
      : event.relatedAuditId ? visibleAuditIds.has(event.relatedAuditId)
        : statusFilter === null
  ));
  const selectedAuditRelatedEvents = filteredTimelineItems.filter((event) => event.relatedAuditId === selectedAudit?.id && event.tipo !== "audit");

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-[18px] font-semibold" style={{ color: "#201f1e" }}>Auditoría</h1><UserStoryRefs ids={["HU-013", "HU-016", "HU-017"]} /></div>
        <p className="text-[13px] mt-0.5" style={{ color: "#605e5c" }}>
          Último periodo de demostración disponible · {latestAuditYear} · evaluaciones de modelos simuladas cuando se indica
        </p>
        <p className="text-[11px] mt-1" style={{ color: "#8a8886" }}>Registros de demostración; las referencias administrativas no representan auditorías reales. Los cambios de seguimiento y documentos adjuntos se guardan en PostgreSQL.</p>
      </div>

      {workflowError && <p role="alert" className="rounded px-3 py-2 text-[12px]" style={{ background: "#fdf3f4", color: "#a4262c" }}>{workflowError}</p>}
      {notice && <p role="status" className="rounded px-3 py-2 text-[12px]" style={{ background: "#f1faf1", color: "#107c10" }}>{notice}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {(["Pendiente", "En curso", "Observada", "Completada"] as const).map(estado => {
          const s = STATE_STYLES[estado];
          const Icon = s.icon;
          const count = audits.filter(a => a.estado === estado).length;
          return (
            <button
              key={estado}
              type="button"
              aria-pressed={statusFilter === estado}
              onClick={() => setStatusFilter((current) => current === estado ? null : estado)}
              className="rounded text-left transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0f6cbd]"
              style={{
                background: "#ffffff",
                border: `1px solid ${statusFilter === estado ? "#0f6cbd" : "#e1dfdd"}`,
                boxShadow: statusFilter === estado ? "0 0 0 2px #cce0f5" : undefined,
              }}
            >
              <div className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded flex items-center justify-center" style={{ background: s.bg }}>
                <Icon className="w-4 h-4" style={{ color: s.text }} />
              </div>
              <div>
                <div className="text-[20px] font-semibold" style={{ color: "#201f1e" }}>{count}</div>
                <div className="text-[12px]" style={{ color: "#8a8886" }}>Auditorías {estado}</div>
              </div>
              </div>
            </button>
          );
        })}
      </div>
      {statusFilter && (
        <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: "#605e5c" }}>
          <span>Filtrando historial y línea de tiempo: {statusFilter}.</span>
          <button type="button" onClick={() => setStatusFilter(null)} className="font-medium" style={{ color: "#0f6cbd" }}>Quitar filtro</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 items-start gap-4">

        {/* Audit list */}
        <div className="lg:col-span-3 space-y-3">
          <div className="text-[14px] font-semibold" style={{ color: "#201f1e" }}>Historial de Auditorías</div>
          {filteredAudits.map(audit => {
            const s = STATE_STYLES[audit.estado];
            const Icon = s.icon;
            return (
              <Card
                key={audit.id}
                className="cursor-pointer p-4 transition-shadow hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0f6cbd]"
                role="button"
                tabIndex={0}
                aria-label={`Abrir seguimiento de ${audit.id}: ${audit.tipo}`}
                onClick={() => {
                  setSelectedAuditId(audit.id);
                  setIsFollowUpOpen(true);
                }}
                onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedAuditId(audit.id);
                    setIsFollowUpOpen(true);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[12px] font-mono" style={{ color: "#8a8886" }}>{audit.id}</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px]" style={{ background: s.bg, color: s.text }}>
                        <Icon className="w-2.5 h-2.5" />{audit.estado}
                      </span>
                      {audit.id === selectedAudit?.id && <span className="text-[11px] font-medium" style={{ color: "#0f6cbd" }}>Seleccionada</span>}
                    </div>
                    <div className="text-[14px] font-medium" style={{ color: "#201f1e" }}>{audit.tipo}</div>
                    {audit.modelo && <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[11px]" style={{ background: "#eff6ff", color: "#0f6cbd" }}>Evaluación conceptual · Simulación AI</span>}
                    <div className="text-[13px] mt-0.5" style={{ color: "#605e5c" }}>{audit.administrado} · {audit.sector}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[13px]" style={{ color: "#8a8886" }}>{audit.fecha}</div>
                  </div>
                </div>

                <p className="text-[13px] mb-3 leading-snug" style={{ color: "#605e5c" }}>{audit.hallazgos}</p>

                {audit.modelo && (
                  <details onClick={(event) => event.stopPropagation()} className="mb-3 p-3 rounded" style={{ background: "#f9f8f7", border: "1px solid #e1dfdd" }}>
                    <summary className="cursor-pointer text-[12px] font-medium" style={{ color: "#0f6cbd" }}>Ver evaluación técnica del modelo</summary>
                    <div className="pt-3">
                    <div className="grid grid-cols-2 gap-2 text-[12px] mb-2">
                      <span style={{ color: "#605e5c" }}>Modelo: <strong style={{ color: "#201f1e" }}>{audit.modelo} · {audit.version}</strong></span>
                      <span style={{ color: "#605e5c" }}>Proceso: <strong style={{ color: "#201f1e" }}>{audit.proceso}</strong></span>
                      <span style={{ color: "#605e5c" }}>Resultado: <strong style={{ color: "#201f1e" }}>{audit.resultado}</strong></span>
                      <span style={{ color: "#605e5c" }}>Riesgo: <strong style={{ color: "#ca5010" }}>{audit.nivelRiesgo}</strong></span>
                    </div>
                    <div className="text-[12px] font-semibold mb-1" style={{ color: "#201f1e" }}>Explicabilidad del modelo · simulada · confianza {audit.confianza}%</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]" style={{ color: "#605e5c" }}>
                      {audit.factores?.map((factor) => <span key={factor.name}>{factor.name}: {factor.percent}%</span>)}
                    </div>
                    <p className="text-[11px] mt-2" style={{ color: "#8a8886" }}>Recomendación: {audit.recomendacion} Los factores no provienen de explicabilidad de un modelo real.</p>
                    </div>
                  </details>
                )}

                <div className="flex items-center gap-4 text-[12px]" style={{ color: "#8a8886" }}>
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />{audit.evidencias} referencias · demo
                  </span>
                  {audit.resoluciones.length > 0 && <span className="flex items-center gap-1"><Link className="w-3 h-3" />{audit.resoluciones.length} resoluciones</span>}
                  {audit.expedientes.length > 0 && (
                    <span className="flex items-center gap-1">
                      <ChevronRight className="w-3 h-3" />{audit.expedientes.length} expedientes
                    </span>
                  )}
                </div>

                {(audit.resoluciones.length > 0 || audit.expedientes.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {audit.resoluciones.map(r => (
                      <span key={r} className="px-1.5 py-0.5 rounded text-[11px] font-mono" style={{ background: "#eff6ff", color: "#0f6cbd" }}>{r}</span>
                    ))}
                    {audit.expedientes.map(e => (
                      <span key={e} className="px-1.5 py-0.5 rounded text-[11px] font-mono" style={{ background: "#f1faf1", color: "#107c10" }}>{e}</span>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}

          {selectedAudit && isFollowUpOpen && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="audit-follow-up-title">
            <Card className="max-h-[90vh] w-full max-w-3xl overflow-y-auto p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                <h2 id="audit-follow-up-title" className="text-[14px] font-semibold" style={{ color: "#201f1e" }}>Seguimiento · {selectedAudit.id}</h2>
                <p className="text-[11px] mt-1" style={{ color: "#8a8886" }}>{selectedAudit.tipo} · Los identificadores históricos son referencias; los archivos adjuntos se listan por separado.</p>
                </div>
                <button type="button" onClick={() => setIsFollowUpOpen(false)} aria-label="Cerrar seguimiento de auditoría" className="rounded px-2 py-1 text-[12px]" style={{ color: "#605e5c" }}>Cerrar</button>
              </div>
              <div className="mb-4 rounded p-3" style={{ background: "#f9f8f7", border: "1px solid #e1dfdd" }}>
                <h3 className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>Referencias de esta auditoría</h3>
                <p className="mt-0.5 text-[10px]" style={{ color: "#8a8886" }}>Referencias históricas demostrativas; no son archivos adjuntos.</p>
                <div className="mt-2 space-y-2">
                  <div>
                    <div className="text-[10px] font-medium" style={{ color: "#605e5c" }}>Resoluciones</div>
                    {selectedAudit.resoluciones.length ? (
                      <div className="mt-1 flex flex-wrap gap-1">{selectedAudit.resoluciones.map((resolution) => <span key={resolution} className="rounded px-1.5 py-0.5 text-[10px] font-mono" style={{ background: "#eff6ff", color: "#0f6cbd" }}>{resolution}</span>)}</div>
                    ) : <p className="mt-0.5 text-[10px]" style={{ color: "#8a8886" }}>Sin referencias de resolución.</p>}
                  </div>
                  <div>
                    <div className="text-[10px] font-medium" style={{ color: "#605e5c" }}>Expedientes</div>
                    {selectedAudit.expedientes.length ? (
                      <div className="mt-1 flex flex-wrap gap-1">{selectedAudit.expedientes.map((caseId) => <span key={caseId} className="rounded px-1.5 py-0.5 text-[10px] font-mono" style={{ background: "#f1faf1", color: "#107c10" }}>{caseId}</span>)}</div>
                    ) : <p className="mt-0.5 text-[10px]" style={{ color: "#8a8886" }}>Sin referencias de expediente.</p>}
                  </div>
                  {selectedAuditRelatedEvents.length > 0 && (
                    <div>
                      <div className="text-[10px] font-medium" style={{ color: "#605e5c" }}>Eventos relacionados de la línea de tiempo</div>
                      <div className="mt-1 space-y-1">
                        {selectedAuditRelatedEvents.map((event) => <p key={event.key} className="text-[10px]" style={{ color: "#605e5c" }}>{event.fecha} · {event.evento} — {event.detalle}</p>)}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="text-[10px] font-medium" style={{ color: "#605e5c" }}>Evidencias históricas</div>
                    <p className="mt-0.5 text-[10px]" style={{ color: "#8a8886" }}>{selectedAudit.evidencias} referencias indicadas en el registro demostrativo. Para consultar archivos, revisa los documentos adjuntos abajo.</p>
                  </div>
                </div>
              </div>
              <form onSubmit={(event) => void saveAuditChanges(event)} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-[11px] font-medium" style={{ color: "#605e5c" }}>
                    Estado
                    <select required disabled={!canManageAudits} value={draftStatus} onChange={(event) => {
                      const status = event.target.value as AuditStatus;
                      setDraftStatus(status);
                    }} className="mt-1 block w-full rounded border bg-white px-2 py-1.5 text-[12px]" style={{ borderColor: "#e1dfdd" }}>
                      <option value="Pendiente">Pendiente</option>
                      <option value="En curso">En curso</option>
                      <option value="Observada">Observada</option>
                      <option value="Completada">Completada</option>
                    </select>
                  </label>
                  <label className="text-[11px] font-medium" style={{ color: "#605e5c" }}>
                    Etapa de la auditoría
                    <select required disabled={!canManageAudits} value={draftPhase} onChange={(event) => setDraftPhase(event.target.value as AuditPhase)} className="mt-1 block w-full rounded border bg-white px-2 py-1.5 text-[12px]" style={{ borderColor: "#e1dfdd" }}>
                      {AUDIT_PHASES.map((phase) => <option key={phase} value={phase}>{phase}</option>)}
                    </select>
                  </label>
                  <label className="text-[11px] font-medium" style={{ color: "#605e5c" }}>
                    Responsable
                    <select required={draftStatus !== "Pendiente"} disabled={!canManageAudits} value={draftResponsible} onChange={(event) => setDraftResponsible(event.target.value)} className="mt-1 block w-full rounded border bg-white px-2 py-1.5 text-[12px]" style={{ borderColor: "#e1dfdd" }}>
                      <option value="">Selecciona un responsable</option>
                      {draftResponsible && !eligibleAssignees.some((account) => account.username === draftResponsible) && (
                        <option value={draftResponsible} disabled>Usuario asignado sin permiso activo</option>
                      )}
                      {eligibleAssignees.map((account) => (
                        <option key={account.username} value={account.username}>{account.name} · @{account.username}</option>
                      ))}
                    </select>
                    {managementError && <span className="mt-1 block font-normal" style={{ color: "#a4262c" }}>No se pudo cargar la lista de usuarios: {managementError}</span>}
                    {!managementError && canManageAudits && eligibleAssignees.length === 0 && <span className="mt-1 block font-normal" style={{ color: "#8a8886" }}>No hay usuarios activos con permiso de Auditoría.</span>}
                  </label>
                </div>
                <label className="block text-[11px] font-medium" style={{ color: "#605e5c" }}>
                  Notas de seguimiento
                  <textarea required={draftStatus !== "Pendiente"} disabled={!canManageAudits} maxLength={5000} rows={3} value={draftNotes} onChange={(event) => setDraftNotes(event.target.value)} placeholder="Acuerdos, tareas pendientes o comentarios de revisión" className="mt-1 block w-full rounded border bg-white p-2 text-[12px]" style={{ borderColor: "#e1dfdd" }} />
                </label>
                {canManageAudits ? (
                  <button type="submit" disabled={saving} className="rounded px-3 py-2 text-[12px] font-medium text-white disabled:opacity-60" style={{ background: "#0f6cbd" }}>{saving ? "Guardando…" : "Guardar seguimiento"}</button>
                ) : (
                  <p className="text-[11px]" style={{ color: "#8a8886" }}>Solo el Supervisor de Cumplimiento puede actualizar auditorías.</p>
                )}
              </form>

              <div className="mt-4 border-t pt-3" style={{ borderColor: "#edebe9" }}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>Documentos relacionados</h3>
                    <p className="text-[10px] mt-0.5" style={{ color: "#8a8886" }}>Adjuntos persistidos · máximo 10 MB por archivo.</p>
                  </div>
                  {canManageAudits && (
                    <label className="cursor-pointer rounded border px-2 py-1.5 text-[11px] font-medium" style={{ borderColor: "#cce0f5", color: "#0f6cbd" }}>
                      {uploading ? "Subiendo…" : "Adjuntar documento"}
                      <input type="file" className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg" disabled={uploading} onChange={(event) => void addAuditDocument(event)} />
                    </label>
                  )}
                </div>
                {documentsError && <p role="alert" className="mt-2 text-[11px]" style={{ color: "#a4262c" }}>{documentsError}</p>}
                {documentsLoading ? (
                  <p className="mt-2 text-[11px]" style={{ color: "#8a8886" }}>Cargando documentos…</p>
                ) : documents.length ? (
                  <div className="mt-2 space-y-1">
                    {documents.map((document) => (
                      <div key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1.5" style={{ background: "#f9f8f7" }}>
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-medium" style={{ color: "#201f1e" }}>{document.file_name}</div>
                          <div className="text-[10px]" style={{ color: "#8a8886" }}>{(document.size_bytes / 1024).toFixed(1)} KB · {document.uploaded_by} · {new Date(document.created_at).toLocaleDateString("es-PE")}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => void previewAuditDocument(document)} className="rounded px-2 py-1 text-[11px]" style={{ color: "#0f6cbd" }}>Ver</button>
                          <button type="button" onClick={() => void downloadAuditDocumentFile(document)} className="rounded px-2 py-1 text-[11px]" style={{ color: "#0f6cbd" }}>Descargar</button>
                          {canManageAudits && (
                            <button type="button" disabled={deletingDocumentId === document.id} onClick={() => void removeAuditDocument(document)} className="rounded px-2 py-1 text-[11px] disabled:opacity-60" style={{ color: "#a4262c" }}>
                              {deletingDocumentId === document.id ? "Eliminando…" : "Eliminar"}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  !documentsError && <p className="mt-2 text-[11px]" style={{ color: "#8a8886" }}>Aún no hay documentos adjuntos para esta auditoría.</p>
                )}
              </div>
              {documentPreview && (
                <DocumentPreviewModal
                  fileName={documentPreview.fileName}
                  mediaType={documentPreview.mediaType}
                  blob={documentPreview.blob}
                  onClose={() => setDocumentPreview(null)}
                />
              )}
              {selectedWorkflow?.updated_by && <p className="mt-2 text-[10px]" style={{ color: "#8a8886" }}>Última actualización: {selectedWorkflow.updated_by} · {new Date(selectedWorkflow.updated_at).toLocaleString("es-PE")}</p>}
            </Card>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="lg:col-span-2">
          <Card className="p-4">
            <div className="text-[14px] font-semibold mb-1" style={{ color: "#201f1e" }}>Línea de tiempo · {filteredTimelineItems.length} eventos</div>
            <p className="mb-4 text-[10px]" style={{ color: "#8a8886" }}>Las auditorías listadas aquí se pueden seleccionar; RD, expedientes y RSK son referencias relacionadas, no auditorías aparte.</p>
            <div className="relative">
              <div className="absolute left-3 top-0 bottom-0 w-px" style={{ background: "#e1dfdd" }} />
              <div className="space-y-4">
                {filteredTimelineItems.length ? filteredTimelineItems.map((event) => {
                  const t = TYPE_STYLE[event.tipo];
                  return (
                    <div key={event.key} className="flex gap-3 pl-2">
                      <div className="relative z-10 flex-shrink-0 w-3 h-3 rounded-full mt-0.5 ring-2 ring-white" style={{ background: t.dot }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          {event.auditId ? (
                            <button type="button" onClick={() => {
                              if (event.auditId) {
                                setSelectedAuditId(event.auditId);
                                setIsFollowUpOpen(true);
                              }
                            }} className="text-left text-[12px] font-medium" style={{ color: "#0f6cbd" }}>{event.evento}</button>
                          ) : (
                            <span className="text-[12px] font-medium" style={{ color: "#201f1e" }}>{event.evento}</span>
                          )}
                          <span className="ml-auto text-[11px] flex-shrink-0" style={{ color: "#8a8886" }}>{event.fecha}</span>
                        </div>
                        <p className="text-[12px] leading-snug" style={{ color: "#8a8886" }}>{event.detalle}</p>
                        {event.eventType === "update" && event.changes.length > 0 && (
                          <div className="mt-1">
                            <button
                              type="button"
                              aria-expanded={expandedTimelineEvents.has(event.key)}
                              onClick={() => setExpandedTimelineEvents((current) => {
                                const next = new Set(current);
                                if (next.has(event.key)) next.delete(event.key);
                                else next.add(event.key);
                                return next;
                              })}
                              className="text-[11px] font-medium"
                              style={{ color: "#0f6cbd" }}
                            >
                              {expandedTimelineEvents.has(event.key) ? "Ocultar cambios" : `Ver ${event.changes.length} cambios`}
                            </button>
                            {expandedTimelineEvents.has(event.key) && (
                              <ul className="mt-1 space-y-1 rounded p-2 text-[11px]" style={{ background: "#f9f8f7" }}>
                                {event.changes.map((change) => (
                                  <li key={change.field}>
                                    <span className="font-medium" style={{ color: "#605e5c" }}>{change.label}:</span>{" "}
                                    <span style={{ color: "#8a8886" }}>{change.before || "Sin asignar"}</span>
                                    <span style={{ color: "#605e5c" }}> → </span>
                                    <span style={{ color: "#201f1e" }}>{change.after || "Sin asignar"}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                        <span className="mt-1 inline-block px-1.5 py-0.5 rounded text-[11px]" style={{ background: t.bg, color: t.text }}>
                          {event.tipo === "audit" ? "Auditoría" : event.tipo === "resolution" ? "Resolución" : event.tipo === "expediente" ? "Expediente" : "Riesgo"}
                        </span>
                      </div>
                    </div>
                  );
                }) : (
                  <p className="pl-5 text-[11px]" style={{ color: "#8a8886" }}>No hay eventos vinculados a las auditorías de este estado.</p>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>

    </div>
  );
}
