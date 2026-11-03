import React from "react";
import { useEffect, useState } from "react";
import {
  AuditDocument,
  AuditPhase,
  AuditRegistration,
  AuditStatus,
  AuditWorkflow,
  AuditWorkflowEvent,
  deleteAuditDocument,
  downloadAuditDocument,
  loadAuditDocuments,
  loadAuditWorkflow,
  loadAuditWorkflowEvents,
  registerAudits,
  updateAuditWorkflow,
  uploadAuditDocument,
} from "../auditsApi";
import {
  loadDemandModelStatus,
  trainDemandModel,
  type DemandModelStatus,
} from "../demandModelApi";
import { useAuth } from "../AuthContext";
import { csvValue, useSectorData } from "../SectorDataContext";
import type { CSVRow } from "../../utils/csvParser";
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

const AUDIT_MODEL_EVALUATIONS = new Set(["AUD-04"]);
type AuditReference = {
  kind: "resolution" | "case";
  identifier: string;
  row: CSVRow;
};

function AuditTechnicalEvaluation({
  status,
  loading,
  error,
  training,
  canTrainDemand,
  onTrain,
}: {
  status: DemandModelStatus | null;
  loading: boolean;
  error: string;
  training: boolean;
  canTrainDemand: boolean;
  onTrain: () => void;
}) {
  if (loading) {
    return <p className="text-[12px]" style={{ color: "#605e5c" }}>Consultando evaluación real del modelo…</p>;
  }

  if (error) {
    return <p role="alert" className="text-[12px]" style={{ color: "#a4262c" }}>{error}</p>;
  }

  const metrics = status?.metrics?.hybrid ?? status?.metrics?.xgboost;
  const needsTraining = status?.status === "training_pending" || status?.sourceIsCurrent === false;
  return (
    <div className="space-y-3 text-[12px]" style={{ color: "#605e5c" }}>
      <p><strong style={{ color: "#201f1e" }}>Modelo:</strong> {status?.model ?? "XGBoost"} · pronóstico de ventas mensuales observadas.</p>
      {status?.status === "evaluated" && metrics ? (
        <>
          <p>
            <strong>Prueba temporal:</strong> {status.evaluationPeriod?.from ?? "—"} a {status.evaluationPeriod?.to ?? "—"}
            {" · "}{status.trainingObservations ?? "—"} observaciones de entrenamiento
            {" · "}{status.testObservations ?? "—"} de prueba.
          </p>
          <p><strong>Estrategia:</strong> {status.forecastStrategy ?? "XGBoost"}.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>MAE: {metrics.mae?.toLocaleString("es-PE") ?? "—"} {status.unit}</span>
            <span>RMSE: {metrics.rmse?.toLocaleString("es-PE") ?? "—"} {status.unit}</span>
            <span>WAPE: {metrics.wape == null ? "—" : `${metrics.wape.toFixed(2)}%`}</span>
            <span>R²: {metrics.r2?.toFixed(3) ?? "—"}</span>
            <span>Mejora vs. baseline: {status.metrics?.errorReductionPercent == null ? "—" : `${status.metrics.errorReductionPercent.toFixed(2)}%`}</span>
          </div>
          <p>Explicabilidad: {status.explainability?.evaluation.status ?? "no disponible"}.</p>
          {status.sourceIsCurrent === false && <p role="status" style={{ color: "#8a4b08" }}>La fuente cambió desde esta evaluación; vuelve a entrenar antes de interpretar las métricas.</p>}
          {status.warnings?.map((warning) => <p key={warning} style={{ color: "#8a4b08" }}>{warning}</p>)}
        </>
      ) : (
        <p>{status?.message ?? "Aún no existe una evaluación entrenada con este modelo."}</p>
      )}
      {canTrainDemand && needsTraining && (
        <button
          type="button"
          onClick={onTrain}
          disabled={training}
          className="rounded px-3 py-1.5 font-medium text-white disabled:opacity-60"
          style={{ background: "#8764b8" }}
        >
          {training ? "Entrenando y evaluando…" : "Entrenar y evaluar con datos actuales"}
        </button>
      )}
    </div>
  );
}

function AuditEvaluationDetails({
  status,
  loading,
  error,
  training,
  canTrainDemand,
  onTrain,
}: {
  status: DemandModelStatus | null;
  loading: boolean;
  error: string;
  training: boolean;
  canTrainDemand: boolean;
  onTrain: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <details
      onClick={(event) => event.stopPropagation()}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      className="mb-3 p-3 rounded"
      style={{ background: "#f9f8f7", border: "1px solid #e1dfdd" }}
    >
      <summary className="cursor-pointer text-[12px] font-medium" style={{ color: "#0f6cbd" }}>Ver estado y evaluación técnica</summary>
      {isOpen && (
        <div className="pt-3">
          <AuditTechnicalEvaluation
            status={status}
            loading={loading}
            error={error}
            training={training}
            canTrainDemand={canTrainDemand}
            onTrain={onTrain}
          />
        </div>
      )}
    </details>
  );
}

const auditoriasByYear: Record<string, {
  id: string; tipo: string; estado: keyof typeof STATE_STYLES;
  administrado: string; sector: string;
  resoluciones: string[]; expedientes: string[];
  hallazgos: string;
}[]> = {
  "2024": [
    { id: "AUD-04", tipo: "Auditoría de Modelo IA – Predicción de Demanda", estado: "En curso", administrado: "Ventas mensuales de combustibles", sector: "Cadena de suministro · Demanda", resoluciones: [], expedientes: [], hallazgos: "Evaluación del modelo con ventas mensuales observadas y métricas de prueba temporal." },
    { id: "AUD-05", tipo: "Auditoría de Trazabilidad – Decisiones HC", estado: "Completada", administrado: "REFINERIA LA PAMPILLA S.A.A.", sector: "Hidrocarburos Mayores", resoluciones: ["0382-2024-OEFA/DFAI"], expedientes: ["411-2024-OEFA/TFA-SE", "084-2024-OEFA/TFA-SE"], hallazgos: "Registro de decisiones completo. Se recomienda automatizar notificaciones de resolución." },
    { id: "AUD-06", tipo: "Auditoría de Cumplimiento Normativo SINADA", estado: "Completada", administrado: "Gas Natural de Lima y Callao", sector: "Comercialización HC", resoluciones: ["0376-2024-OEFA/DFAI"], expedientes: [], hallazgos: "Cumplimiento dentro de parámetros. Sin observaciones críticas." },
    { id: "AUD-07", tipo: "Auditoría de Instalaciones Fijas CDCLy", estado: "En curso", administrado: "OLYMPIC PERU INC SUC. DEL PERU", sector: "Hidrocarburos Mayores", resoluciones: [], expedientes: ["239-2024-OEFA/TFA-SE"], hallazgos: "Pendiente verificación de 3 tanques de almacenamiento en Lote XIII-A." },
  ],
  "2025": [
    { id: "AUD-01", tipo: "Auditoría de Medidas Correctivas – Lote 192", estado: "En curso", administrado: "PLUSPETROL NORTE S.A.", sector: "Hidrocarburos Mayores", resoluciones: ["0389-2025-OEFA/DFAI", "0372-2025-OEFA/DFAI"], expedientes: [], hallazgos: "Dos medidas correctivas en un trimestre. Patrón de recurrencia activa proceso de auditoría intensiva." },
    { id: "AUD-02", tipo: "Auditoría de Trazabilidad Q1 2025", estado: "En curso", administrado: "Sistema AI TRiSM – General", sector: "Plataforma AI TRiSM", resoluciones: ["0382-2025-OEFA/DFAI", "0376-2025-OEFA/DFAI"], expedientes: [], hallazgos: "Trazabilidad parcial. Resoluciones sin medida correctiva carecen de evidencia documental adjunta." },
    { id: "AUD-03", tipo: "Auditoría de Apertura de Período 2025", estado: "Completada", administrado: "Todos los sectores", sector: "Multi-sector", resoluciones: [], expedientes: [], hallazgos: "Línea base establecida. 1,672 instalaciones verificadas en CDCLy. 879 denuncias arrastradas identificadas." },
  ],
};

const timelineByYear: Record<string, { fecha: string; evento: string; tipo: "audit" | "resolution" | "expediente" | "risk"; detalle: string; relatedAuditId?: string }[]> = {
  "2024": [],
  "2025": [],
};

const auditTemplates = Object.keys(auditoriasByYear)
  .sort((a, b) => Number(b) - Number(a))
  .flatMap((year) => auditoriasByYear[year]);
const timeline = Object.keys(timelineByYear)
  .sort((a, b) => Number(b) - Number(a))
  .flatMap((year) => timelineByYear[year]);

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
  const { datasets, loading: datasetsLoading, dataError } = useSectorData();
  const canManageAudits = user?.role === "Supervisor de Cumplimiento" && user.permissions.includes("auditoria");
  const eligibleAssignees = managedUsers.filter((account) => account.active && account.permissions.includes("auditoria"));
  const [demandModelStatus, setDemandModelStatus] = useState<DemandModelStatus | null>(null);
  const [demandModelStatusLoading, setDemandModelStatusLoading] = useState(true);
  const [demandModelStatusError, setDemandModelStatusError] = useState("");
  const [demandTraining, setDemandTraining] = useState(false);
  const [workflow, setWorkflow] = useState<AuditWorkflow[]>([]);
  const [auditRegistrations, setAuditRegistrations] = useState<AuditRegistration[]>([]);
  const [auditRegistrationError, setAuditRegistrationError] = useState("");
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
  const [selectedReference, setSelectedReference] = useState<AuditReference | null>(null);
  const [documentCategory, setDocumentCategory] = useState<AuditDocument["category"]>("Otro documento relacionado");
  const [notice, setNotice] = useState("");
  const [documentPreview, setDocumentPreview] = useState<{ fileName: string; mediaType: string; blob: Blob } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const demandAuditAvailable = (
    demandModelStatus?.coverage?.months ?? 0
  ) >= 36 && ["evaluated", "training_pending"].includes(demandModelStatus?.status ?? "");
  const availableResolutionIds = new Set(datasets.resolutions.map((row) => csvValue(row, "NRO RESOLUCIÓN")).filter(Boolean));
  const availableCaseResolutionIds = new Set(datasets.cases.map((row) => csvValue(row, "RESOLUCION TFA")).filter(Boolean));
  const workflowById = new Map(workflow.map((item) => [item.audit_id, item]));
  const auditRegistrationById = new Map(auditRegistrations.map((item) => [item.audit_id, item]));
  const audits = auditTemplates.filter((audit) => (
    audit.id !== "AUD-04" || (!demandModelStatusLoading && !demandModelStatusError && demandAuditAvailable)
  )).map((audit) => {
    const saved = workflowById.get(audit.id);
    const registeredAt = auditRegistrationById.get(audit.id)?.registered_at;
    return {
      ...audit,
      fecha: registeredAt
        ? new Date(registeredAt).toLocaleDateString("es-PE")
        : "Cargando fecha…",
      resoluciones: audit.resoluciones.filter((resolution) => availableResolutionIds.has(resolution)),
      expedientes: audit.expedientes.filter((expediente) => availableCaseResolutionIds.has(expediente)),
      estado: saved?.status ?? "Pendiente",
    };
  });
  const filteredAudits = statusFilter ? audits.filter((audit) => audit.estado === statusFilter) : audits;
  const selectedAudit = filteredAudits.find((audit) => audit.id === selectedAuditId) ?? filteredAudits[0];
  const selectedWorkflow = selectedAudit ? workflowById.get(selectedAudit.id) : undefined;
  const auditIdsKey = audits.map((audit) => audit.id).join("|");

  useEffect(() => {
    let active = true;
    loadDemandModelStatus()
      .then((status) => {
        if (active) {
          setDemandModelStatus(status);
          setDemandModelStatusError("");
        }
      })
      .catch((error: unknown) => {
        if (active) setDemandModelStatusError(error instanceof Error ? error.message : "No se pudo consultar la disponibilidad de datos.");
      })
      .finally(() => {
        if (active) setDemandModelStatusLoading(false);
      });
    return () => { active = false; };
  }, []);

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
    let active = true;
    if (!auditIdsKey) return () => { active = false; };
    registerAudits(auditIdsKey.split("|"))
      .then((registrations) => {
        if (active) {
          setAuditRegistrations(registrations);
          setAuditRegistrationError("");
        }
      })
      .catch((error: unknown) => {
        if (active) setAuditRegistrationError(error instanceof Error ? error.message : "No se pudieron cargar las fechas de registro.");
      });
    return () => { active = false; };
  }, [auditIdsKey]);

  async function trainDemandAuditModel() {
    setDemandTraining(true);
    setDemandModelStatusError("");
    try {
      setDemandModelStatus(await trainDemandModel());
    } catch (error) {
      setDemandModelStatusError(error instanceof Error ? error.message : "No se pudo entrenar y evaluar el modelo de demanda.");
    } finally {
      setDemandTraining(false);
    }
  }

  function showAuditReference(auditId: string, kind: AuditReference["kind"], identifier: string) {
    const row = kind === "resolution"
      ? datasets.resolutions.find((item) => csvValue(item, "NRO RESOLUCIÓN") === identifier)
      : datasets.cases.find((item) => csvValue(item, "RESOLUCION TFA") === identifier);
    if (!row) return;
    setSelectedAuditId(auditId);
    setSelectedReference({ kind, identifier, row });
    setIsFollowUpOpen(true);
  }

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
      const saved = await uploadAuditDocument(selectedAudit.id, file, documentCategory);
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
      auditId: event.tipo === "audit" ? event.evento.match(/AUD-\d{2}/)?.[0] : undefined,
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
          Historial de auditorías · métricas de modelos disponibles en la evaluación técnica
        </p>
        <p className="text-[11px] mt-1" style={{ color: "#8a8886" }}>Los cambios de seguimiento y los documentos adjuntos se guardan en PostgreSQL.</p>
      </div>

      {workflowError && <p role="alert" className="rounded px-3 py-2 text-[12px]" style={{ background: "#fdf3f4", color: "#a4262c" }}>{workflowError}</p>}
      {auditRegistrationError && <p role="alert" className="rounded px-3 py-2 text-[12px]" style={{ background: "#fdf3f4", color: "#a4262c" }}>{auditRegistrationError}</p>}
      {notice && <p role="status" className="rounded px-3 py-2 text-[12px]" style={{ background: "#f1faf1", color: "#107c10" }}>{notice}</p>}
      {demandModelStatusLoading && <p role="status" className="text-[11px]" style={{ color: "#605e5c" }}>Verificando datos para AUD-04…</p>}
      {demandModelStatusError && (
        <p role="alert" className="rounded px-3 py-2 text-[12px]" style={{ background: "#fdf3f4", color: "#a4262c" }}>
          No se pudo validar la disponibilidad de datos de AUD-04; se mantiene fuera del historial. {demandModelStatusError}
        </p>
      )}
      {!demandModelStatusLoading && !demandModelStatusError && !demandAuditAvailable && (
        <p role="status" className="text-[11px]" style={{ color: "#605e5c" }}>
          AUD-04 no aparece en el historial porque requiere al menos 36 meses de ventas válidas. {demandModelStatus?.message}
        </p>
      )}

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
            const hasModelEvaluation = AUDIT_MODEL_EVALUATIONS.has(audit.id);
            return (
              <Card
                key={audit.id}
                className="cursor-pointer p-4 transition-shadow hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0f6cbd]"
                role="button"
                tabIndex={0}
                aria-label={`Abrir seguimiento de ${audit.id}: ${audit.tipo}`}
                onClick={() => {
                  setSelectedAuditId(audit.id);
                  setSelectedReference(null);
                  setIsFollowUpOpen(true);
                }}
                onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedAuditId(audit.id);
                    setSelectedReference(null);
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
                    {hasModelEvaluation && <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[11px]" style={{ background: "#eff6ff", color: "#0f6cbd" }}>Revisar evaluación técnica</span>}
                    <div className="text-[13px] mt-0.5" style={{ color: "#605e5c" }}>{audit.administrado} · {audit.sector}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[13px]" style={{ color: "#8a8886" }}>{audit.fecha}</div>
                  </div>
                </div>

                <p className="text-[13px] mb-3 leading-snug" style={{ color: "#605e5c" }}>{audit.hallazgos}</p>

                {hasModelEvaluation && (
                  <AuditEvaluationDetails
                    status={demandModelStatus}
                    loading={demandModelStatusLoading}
                    error={demandModelStatusError}
                    training={demandTraining}
                    canTrainDemand={canManageAudits}
                    onTrain={() => void trainDemandAuditModel()}
                  />
                )}

                {!datasetsLoading && !dataError && (audit.resoluciones.length > 0 || audit.expedientes.length > 0) && (
                  <div className="flex items-center gap-4 text-[12px]" style={{ color: "#8a8886" }}>
                    {audit.resoluciones.length > 0 && <span className="flex items-center gap-1"><Link className="w-3 h-3" />{audit.resoluciones.length} resoluciones verificadas</span>}
                    {audit.expedientes.length > 0 && (
                      <span className="flex items-center gap-1">
                        <ChevronRight className="w-3 h-3" />{audit.expedientes.length} expedientes verificados
                      </span>
                    )}
                  </div>
                )}

                {!datasetsLoading && !dataError && (audit.resoluciones.length > 0 || audit.expedientes.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {audit.resoluciones.map((resolution) => (
                      <button
                        key={resolution}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          showAuditReference(audit.id, "resolution", resolution);
                        }}
                        className="rounded px-1.5 py-0.5 text-[11px] font-mono underline"
                        style={{ background: "#eff6ff", color: "#0f6cbd" }}
                      >{resolution}</button>
                    ))}
                    {audit.expedientes.map((caseId) => (
                      <button
                        key={caseId}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          showAuditReference(audit.id, "case", caseId);
                        }}
                        className="rounded px-1.5 py-0.5 text-[11px] font-mono underline"
                        style={{ background: "#f1faf1", color: "#107c10" }}
                      >{caseId}</button>
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
                <button type="button" onClick={() => {
                  setIsFollowUpOpen(false);
                  setSelectedReference(null);
                }} aria-label="Cerrar seguimiento de auditoría" className="rounded px-2 py-1 text-[12px]" style={{ color: "#605e5c" }}>Cerrar</button>
              </div>
              <div className="mb-4 rounded p-3" style={{ background: "#f9f8f7", border: "1px solid #e1dfdd" }}>
                <h3 className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>Referencias de esta auditoría</h3>
                <p className="mt-0.5 text-[10px]" style={{ color: "#8a8886" }}>
                  {datasetsLoading
                    ? "Consultando las fuentes de resoluciones y expedientes…"
                    : dataError
                      ? "No se pudieron verificar las referencias con las fuentes importadas."
                      : "Solo se muestran referencias encontradas en las fuentes importadas."}
                </p>
                <div className="mt-2 space-y-2">
                  <div>
                    <div className="text-[10px] font-medium" style={{ color: "#605e5c" }}>Resoluciones verificadas</div>
                    {datasetsLoading ? (
                      <p className="mt-0.5 text-[10px]" style={{ color: "#8a8886" }}>Consultando…</p>
                    ) : dataError ? (
                      <p className="mt-0.5 text-[10px]" style={{ color: "#a4262c" }}>No se pudieron verificar las resoluciones.</p>
                    ) : selectedAudit.resoluciones.length ? (
                      <div className="mt-1 flex flex-wrap gap-1">{selectedAudit.resoluciones.map((resolution) => (
                        <button
                          key={resolution}
                          type="button"
                          onClick={() => showAuditReference(selectedAudit.id, "resolution", resolution)}
                          className="rounded px-1.5 py-0.5 text-[10px] font-mono underline"
                          style={{ background: "#eff6ff", color: "#0f6cbd" }}
                        >{resolution}</button>
                      ))}</div>
                    ) : <p className="mt-0.5 text-[10px]" style={{ color: "#8a8886" }}>No hay resoluciones verificadas para esta auditoría.</p>}
                  </div>
                  <div>
                    <div className="text-[10px] font-medium" style={{ color: "#605e5c" }}>Expedientes verificados</div>
                    {datasetsLoading ? (
                      <p className="mt-0.5 text-[10px]" style={{ color: "#8a8886" }}>Consultando…</p>
                    ) : dataError ? (
                      <p className="mt-0.5 text-[10px]" style={{ color: "#a4262c" }}>No se pudieron verificar los expedientes.</p>
                    ) : selectedAudit.expedientes.length ? (
                      <div className="mt-1 flex flex-wrap gap-1">{selectedAudit.expedientes.map((caseId) => (
                        <button
                          key={caseId}
                          type="button"
                          onClick={() => showAuditReference(selectedAudit.id, "case", caseId)}
                          className="rounded px-1.5 py-0.5 text-[10px] font-mono underline"
                          style={{ background: "#f1faf1", color: "#107c10" }}
                        >{caseId}</button>
                      ))}</div>
                    ) : <p className="mt-0.5 text-[10px]" style={{ color: "#8a8886" }}>No hay expedientes verificados para esta auditoría.</p>}
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
                    <div className="text-[10px] font-medium" style={{ color: "#605e5c" }}>Documentos adjuntos</div>
                    <p className="mt-0.5 text-[10px]" style={{ color: "#8a8886" }}>
                      {documentsLoading
                        ? "Consultando archivos adjuntos…"
                        : documentsError
                          ? "No se pudieron consultar los archivos adjuntos."
                          : documents.length
                            ? `${documents.length} archivo${documents.length === 1 ? "" : "s"} adjunto${documents.length === 1 ? "" : "s"} disponible${documents.length === 1 ? "" : "s"} abajo.`
                            : "No hay archivos adjuntos para esta auditoría."}
                    </p>
                  </div>
                </div>
                {selectedReference && (
                  <div className="mt-3 rounded border p-3" style={{ borderColor: "#cce0f5", background: "#ffffff" }}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h4 className="text-[11px] font-semibold" style={{ color: "#201f1e" }}>
                        {selectedReference.kind === "resolution" ? "Detalle de resolución" : "Detalle de expediente"} · {selectedReference.identifier}
                      </h4>
                      <button
                        type="button"
                        onClick={() => setSelectedReference(null)}
                        className="text-[10px] underline"
                        style={{ color: "#0f6cbd" }}
                      >Cerrar detalle</button>
                    </div>
                    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {Object.entries(selectedReference.row)
                        .filter(([, value]) => value.trim())
                        .map(([field, value]) => (
                          <div key={field} className="min-w-0">
                            <dt className="text-[9px] font-medium" style={{ color: "#8a8886" }}>{field}</dt>
                            <dd className="break-words text-[10px]" style={{ color: "#323130" }}>{value}</dd>
                          </div>
                        ))}
                    </dl>
                  </div>
                )}
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
                </div>
                {canManageAudits && (
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <label className="text-[10px] font-medium" style={{ color: "#605e5c" }}>
                      Tipo de documento
                      <select
                        value={documentCategory}
                        onChange={(event) => setDocumentCategory(event.target.value as AuditDocument["category"])}
                        disabled={uploading}
                        className="mt-1 block rounded border bg-white px-2 py-1.5 text-[11px]"
                        style={{ borderColor: "#e1dfdd" }}
                      >
                        <option value="Resoluciones">Resoluciones</option>
                        <option value="Expedientes">Expedientes</option>
                        <option value="Otro documento relacionado">Otro documento relacionado</option>
                      </select>
                    </label>
                    <label className="cursor-pointer rounded border px-2 py-1.5 text-[11px] font-medium" style={{ borderColor: "#cce0f5", color: "#0f6cbd" }}>
                      {uploading ? "Subiendo…" : "Seleccionar archivo"}
                      <input type="file" className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg" disabled={uploading} onChange={(event) => void addAuditDocument(event)} />
                    </label>
                  </div>
                )}
                {documentsError && <p role="alert" className="mt-2 text-[11px]" style={{ color: "#a4262c" }}>{documentsError}</p>}
                {documentsLoading ? (
                  <p className="mt-2 text-[11px]" style={{ color: "#8a8886" }}>Cargando documentos…</p>
                ) : documents.length ? (
                  <div className="mt-2 space-y-1">
                    {documents.map((document) => (
                      <div key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1.5" style={{ background: "#f9f8f7" }}>
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-medium" style={{ color: "#201f1e" }}>{document.file_name}</div>
                          <div className="text-[10px]" style={{ color: "#8a8886" }}>{document.category} · {(document.size_bytes / 1024).toFixed(1)} KB · {document.uploaded_by} · {new Date(document.created_at).toLocaleDateString("es-PE")}</div>
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
