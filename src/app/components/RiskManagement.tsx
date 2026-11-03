import { ShieldAlert, User, Calendar, AlertTriangle, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useSectorData } from "../SectorDataContext";
import { simulatedSupplyChainRisks } from "../governanceScenarios";
import { UserStoryRefs } from "./UserStoryRefs";
import { loadRoadImpactModel, type RoadImpactInput, type RoadImpactModel } from "../riskAssessmentsApi";
import { ApiError } from "../apiClient";
import { useAuth } from "../AuthContext";
import { createAIGovernanceRisk, loadAIGovernanceAlerts, loadAIGovernanceRisks, updateAIGovernanceRisk, type GovernanceAlert, type GovernanceRisk, type GovernanceRiskStatus } from "../aiGovernanceApi";
import {
  deleteDetectedRiskDocument,
  downloadDetectedRiskDocument,
  evaluateDetectedRiskRoadImpact,
  loadDetectedRiskDocuments,
  loadDetectedRiskEvents,
  registerDetectedRisks,
  loadDetectedRiskRoadEvaluation,
  loadDetectedRiskWorkflows,
  updateDetectedRiskWorkflow,
  uploadDetectedRiskDocument,
  type DetectedRiskDocument,
  type DetectedRiskEvent,
  type DetectedRiskRegistration,
  type DetectedRiskLevel,
  type DetectedRiskPhase,
  type DetectedRiskRoadEvaluation,
  type DetectedRiskStatus,
  type DetectedRiskWorkflow,
} from "../detectedRisksApi";
import { DocumentPreviewModal } from "./DocumentPreviewModal";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded ${className}`} style={{ border: "1px solid #e1dfdd" }}>
      {children}
    </div>
  );
}

const RISK_LEVEL: Record<string, { bg: string; text: string; border: string }> = {
  Crítico: { bg: "#fdf3f4", text: "#a4262c", border: "#f1b9bc" },
  Alto:    { bg: "#fff8f0", text: "#ca5010", border: "#f8d1b4" },
  Medio:   { bg: "#fffbf0", text: "#986f0b", border: "#f5e2a0" },
  Bajo:    { bg: "#f1faf1", text: "#107c10", border: "#9fd89f" },
};

const RISK_STATE: Record<string, { color: string }> = {
  "Activo":      { color: "#a4262c" },
  "En análisis": { color: "#ca5010" },
  "Mitigado":    { color: "#107c10" },
  "Cerrado":     { color: "#8a8886" },
};

const DETECTED_RISK_PHASES: DetectedRiskPhase[] = [
  "Identificación",
  "Análisis",
  "Plan de tratamiento",
  "Implementación",
  "Monitoreo y cierre",
];

type DetectedRisk = {
  id: string;
  nivel: DetectedRiskLevel | null;
  estado: DetectedRiskStatus | null;
  descripcion: string;
  fuente: string;
  departamento: string;
  responsable: string;
  fecha: string;
  recomendacion: string;
  proceso?: string;
  modelo?: string;
  confianza?: number;
  factores?: { name: string; percent: number }[];
  requiresRoadEvaluation?: boolean;
};

type DetectedRiskChange = { label: string; before: string; after: string };
type RoadScenario = {
  phenomenonClass: string;
  phenomenon: string;
  event: string;
  department: string;
  province: string;
  roadCode: string;
  roadSection: string;
};

const EMPTY_ROAD_SCENARIO: RoadScenario = {
  phenomenonClass: "",
  phenomenon: "",
  event: "",
  department: "",
  province: "",
  roadCode: "",
  roadSection: "",
};

function formatGovernanceEvidence(evidence: string): string[] {
  const readable = evidence
    .replace(/Evaluación [0-9a-f-]{36} · (\S+?)\.(?=\s|$)/i, (_, date: string) => {
      const parsed = new Date(date);
      return `Evaluación del ${Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short", hour12: true }).replace(/\s*([ap])\.?\s?m\.?/i, (_, m: string) => ` ${m.toUpperCase()}M`)}.`;
    })
    .replace(/periodo de prueba=\{'to': '([^']+)', 'from': '([^']+)'\}/, "periodo de prueba: $2 a $1")
    .replace(/R² modelo=(-?\d+\.\d+)/, (_, value: string) => `R² del modelo: ${Number(value).toFixed(2)}`);
  return readable.split(/(?<=\.)\s+|;\s+/).map((part) => part.trim().replace(/\.$/, "")).filter(Boolean);
}

function normalizeRoadValue(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

function inferRoadScenario(risk: DetectedRisk, model: RoadImpactModel | null): RoadScenario {
  const categories = model?.categories;
  if (!categories) return EMPTY_ROAD_SCENARIO;

  const riskText = normalizeRoadValue([
    risk.descripcion,
    risk.fuente,
    risk.proceso ?? "",
    risk.modelo ?? "",
    risk.recomendacion,
  ].join(" "));
  const findMentionedCategory = (category: string) => (categories[category] ?? [])
    .filter((value) => normalizeRoadValue(value).length >= 5 && riskText.includes(normalizeRoadValue(value)))
    .sort((left, right) => normalizeRoadValue(right).length - normalizeRoadValue(left).length)[0] ?? "";
  const departmentTokens = risk.departamento.split(/[\/,;]|\s+y\s/i).map(normalizeRoadValue);
  const department = (categories.DEPARTEMENTO ?? []).find((value) =>
    departmentTokens.includes(normalizeRoadValue(value))
  ) ?? "";
  return {
    phenomenonClass: findMentionedCategory("CLASE_FENOMENO"),
    phenomenon: findMentionedCategory("FENOMENO"),
    event: findMentionedCategory("EVENTO"),
    department,
    province: findMentionedCategory("PROVINCIA"),
    roadCode: findMentionedCategory("RED_AFECTADA"),
    roadSection: findMentionedCategory("TRAMO_AFECADO"),
  };
}

function roadEvaluationInputsToScenario(inputs: RoadImpactInput): RoadScenario {
  return {
    phenomenonClass: inputs.phenomenonClass,
    phenomenon: inputs.phenomenon,
    event: inputs.event,
    department: inputs.department,
    province: inputs.province ?? "",
    roadCode: inputs.roadCode ?? "",
    roadSection: inputs.roadSection ?? "",
  };
}

function roadScenarioToInput(scenario: RoadScenario): RoadImpactInput {
  return {
    phenomenonClass: scenario.phenomenonClass,
    phenomenon: scenario.phenomenon,
    event: scenario.event,
    department: scenario.department,
    province: scenario.province || undefined,
    roadCode: scenario.roadCode || undefined,
    roadSection: scenario.roadSection || undefined,
  };
}

function roadEvaluationErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return "La API activa no tiene cargada la ruta de evaluación XGBoost. Reinicia el backend local e inténtalo de nuevo.";
  }
  return error instanceof Error ? error.message : "No se pudo completar la evaluación vial.";
}

function getDetectedRiskChanges(detail: string): DetectedRiskChange[] {
  try {
    const parsed: unknown = JSON.parse(detail);
    if (typeof parsed !== "object" || parsed === null || !("changes" in parsed) || !Array.isArray(parsed.changes)) return [];
    return parsed.changes.filter((change): change is DetectedRiskChange => (
      typeof change === "object" && change !== null &&
      "label" in change && typeof change.label === "string" &&
      "before" in change && typeof change.before === "string" &&
      "after" in change && typeof change.after === "string"
    ));
  } catch {
    return [];
  }
}

const risksByYear: Record<string, {
  id: string; nivel: DetectedRiskLevel; estado: DetectedRiskStatus; descripcion: string;
  fuente: string; departamento: string; responsable: string; fecha: string; recomendacion: string;
  proceso?: string; modelo?: string; confianza?: number; factores?: { name: string; percent: number }[]; requiresRoadEvaluation?: boolean;
}[]> = {
  "2024": [
    { id: "RSK-001", nivel: "Crítico", estado: "Activo", descripcion: "Sesgo en modelo de predicción de incidentes ambientales – sector Loreto", fuente: "SINADA/OEFA", departamento: "LORETO", responsable: "Equipo AI Governance", fecha: "15/11/2024", recomendacion: "Reentrenamiento del modelo con datos 2022–2024 + validación externa." },
    { id: "RSK-002", nivel: "Alto", estado: "En análisis", descripcion: "Deriva de datos en sistema de monitoreo de instalaciones Pluspetrol Norte", fuente: "CDCLy", departamento: "LORETO", responsable: "Compliance Officer", fecha: "08/10/2024", recomendacion: "Actualizar pipeline de ingesta de datos y recalibrar umbrales de alerta." },
    { id: "RSK-003", nivel: "Alto", estado: "En análisis", descripcion: "Falta de trazabilidad en resoluciones HC con medida correctiva", fuente: "OEFA/DFAI", departamento: "CALLAO", responsable: "Auditoría Interna", fecha: "22/09/2024", recomendacion: "Implementar registro automático de decisiones en plataforma AI TRiSM." },
    { id: "RSK-004", nivel: "Medio", estado: "En análisis", descripcion: "Concentración de denuncias SINADA en Lima (34%) sin análisis de causa raíz", fuente: "SINADA", departamento: "LIMA", responsable: "Data Science Team", fecha: "01/09/2024", recomendacion: "Análisis de clustering geoespacial y revisión de procesos de captura." },
    { id: "RSK-005", nivel: "Medio", estado: "Mitigado", descripcion: "Baja cobertura de auditoría en instalaciones de Madre de Dios", fuente: "CDCLy", departamento: "MADRE DE DIOS", responsable: "Auditoría Interna", fecha: "15/08/2024", recomendacion: "Plan de auditoría trimestral remota con soporte de imágenes satelitales." },
    { id: "RSK-006", nivel: "Bajo", estado: "Cerrado", descripcion: "Disponibilidad limitada de observaciones de precios de combustible", fuente: "Diccionario de datos de precios de combustibles", departamento: "NACIONAL", responsable: "Data Engineering", fecha: "03/07/2024", recomendacion: "Identificar una fuente histórica de observaciones antes de plantear análisis temporal de precios." },
  ],
  "2025": [
    { id: "RSK-007", nivel: "Crítico", estado: "Activo", descripcion: "Doble medida correctiva PLUSPETROL Lote 192 en Q1 2025 – patrón de recurrencia", fuente: "OEFA/DFAI", departamento: "LORETO", responsable: "Equipo AI Governance", fecha: "31/03/2025", recomendacion: "Priorizar revisión humana del patrón documentado y definir criterios de alerta temprana." },
    { id: "RSK-008", nivel: "Alto", estado: "En análisis", descripcion: "879 denuncias SINADA sin resolución arrastradas desde 2024", fuente: "SINADA", departamento: "NACIONAL", responsable: "Compliance Officer", fecha: "15/03/2025", recomendacion: "Priorización por departamento y nivel de impacto ambiental." },
    { id: "RSK-009", nivel: "Medio", estado: "En análisis", descripcion: "Incremento de resoluciones en sector Residuos Sólidos supera HC en Q1", fuente: "OEFA/DFAI", departamento: "NACIONAL", responsable: "Data Science Team", fecha: "28/02/2025", recomendacion: "Evaluar extensión del modelo de gobernanza a sector Residuos." },
    { id: "RSK-010", nivel: "Bajo", estado: "Mitigado", descripcion: "Reconsideración Corporación Alan & Hnos. – riesgo de nulidad de RD", fuente: "OEFA/DFAI", departamento: "TACNA", responsable: "Legal & Compliance", fecha: "31/03/2025", recomendacion: "Seguimiento del proceso administrativo y documentación de evidencias." },
  ],
};

const latestRiskYear = Object.keys(risksByYear).sort((a, b) => Number(b) - Number(a))[0];

// ─── Component ───────────────────────────────────────────────────────────────

export function RiskManagement() {
  const { user, managedUsers, managementError } = useAuth();
  const [riskSection, setRiskSection] = useState<"ai" | "detected">("ai");
  const canManageGovernanceRisk = user?.role === "Supervisor de Cumplimiento";
  const canManageDetectedRisks = user?.role === "Supervisor de Cumplimiento" && user.permissions.includes("riesgos");
  const eligibleRiskAssignees = managedUsers.filter((account) => account.active && account.permissions.includes("riesgos"));
  const [detectedRiskWorkflows, setDetectedRiskWorkflows] = useState<DetectedRiskWorkflow[]>([]);
  const [detectedRiskRegistrations, setDetectedRiskRegistrations] = useState<DetectedRiskRegistration[]>([]);
  const [detectedRiskRegistrationError, setDetectedRiskRegistrationError] = useState("");
  const [detectedRiskEvents, setDetectedRiskEvents] = useState<DetectedRiskEvent[]>([]);
  const [detectedRiskDocuments, setDetectedRiskDocuments] = useState<DetectedRiskDocument[]>([]);
  const [selectedDetectedRiskId, setSelectedDetectedRiskId] = useState<string | null>(null);
  const [isDetectedRiskFollowUpOpen, setIsDetectedRiskFollowUpOpen] = useState(false);
  const [detectedRiskWorkflowLoading, setDetectedRiskWorkflowLoading] = useState(false);
  const [detectedRiskSaving, setDetectedRiskSaving] = useState(false);
  const [detectedRiskUploading, setDetectedRiskUploading] = useState(false);
  const [detectedRiskDeletingDocumentId, setDetectedRiskDeletingDocumentId] = useState<string | null>(null);
  const [detectedRiskError, setDetectedRiskError] = useState("");
  const [detectedRiskNotice, setDetectedRiskNotice] = useState("");
  const [detectedRiskDocumentsError, setDetectedRiskDocumentsError] = useState("");
  const [detectedRiskPreview, setDetectedRiskPreview] = useState<{ fileName: string; mediaType: string; blob: Blob } | null>(null);
  const [detectedRiskDraft, setDetectedRiskDraft] = useState<{
    status: DetectedRiskStatus | "";
    risk_level: DetectedRiskLevel | "";
    phase: DetectedRiskPhase;
    responsible: string;
    notes: string;
  }>({ status: "", risk_level: "", phase: "Identificación", responsible: "", notes: "" });
  const [governanceRisks, setGovernanceRisks] = useState<GovernanceRisk[]>([]);
  const [governanceRiskError, setGovernanceRiskError] = useState("");
  const [governanceRiskSaved, setGovernanceRiskSaved] = useState("");
  const [governanceRiskLoading, setGovernanceRiskLoading] = useState(true);
  const [automaticAlerts, setAutomaticAlerts] = useState<GovernanceAlert[]>([]);
  const [selectedAutomaticAlertId, setSelectedAutomaticAlertId] = useState<string | null>(null);
  const [automaticAlertsError, setAutomaticAlertsError] = useState("");
  const [automaticAlertsAt, setAutomaticAlertsAt] = useState<string | null>(null);
  const [newGovernanceRisk, setNewGovernanceRisk] = useState({
    model_name: "XGBoost · Predicción de demanda de combustibles líquidos", other_model_name: "", category: "", description: "", data_basis: "observado" as GovernanceRisk["data_basis"],
    evidence: "", likelihood: 3, impact: 3, owner: "", treatment: "",
  });
  const [riskDrafts, setRiskDrafts] = useState<Record<string, { status: GovernanceRiskStatus; treatment: string }>>({});
  const { operationalData, operationalLoading, operationalError } = useSectorData();
  const latestFineRecord = operationalData?.liquidFuels.fines.slice(-1)[0];
  const latestTransportRecord = operationalData?.naturalGas.transport.slice(-1)[0];
  const latestFuelPriceRecord = operationalData?.liquidFuels.fuelPrices.slice(-1)[0];
  const [roadModel, setRoadModel] = useState<RoadImpactModel | null>(null);
  const [roadEvaluations, setRoadEvaluations] = useState<Record<string, DetectedRiskRoadEvaluation>>({});
  const [roadPredictingRisk, setRoadPredictingRisk] = useState<string | null>(null);
  const [roadEvaluationLoadingRisk, setRoadEvaluationLoadingRisk] = useState<string | null>(null);
  const [roadModelError, setRoadModelError] = useState("");
  const [roadScenarioDrafts, setRoadScenarioDrafts] = useState<Record<string, RoadScenario>>({});
  const riskTemplates: DetectedRisk[] = [
    ...risksByYear[latestRiskYear].map((risk) => ({
      ...risk,
      nivel: null,
      estado: null,
      responsable: "",
    })),
    ...simulatedSupplyChainRisks.map((scenario) => {
      const neutralText = ({
        "SIM-INV-001": {
          description: "Verificar disponibilidad de datos de inventario para evaluar posibles anomalías.",
          recommendation: "Confirmar la disponibilidad y calidad de registros operativos de inventario.",
        },
        "SIM-TRN-001": {
          description: "Verificar disponibilidad de registros de tiempos de transporte entre Lima y Callao.",
          recommendation: "Confirmar la disponibilidad y calidad de registros operativos de tiempos de transporte.",
        },
        "SIM-DMD-001": {
          description: "Verificar disponibilidad de datos históricos para evaluar la predicción de demanda de combustibles.",
          recommendation: "Reunir datos históricos validados antes de evaluar el desempeño de una predicción de demanda.",
        },
        "SIM-TRN-002": {
          description: "Verificar disponibilidad de datos de rutas y restricciones de transporte.",
          recommendation: "Confirmar la disponibilidad de información vial actualizada antes de evaluar riesgos de ruta.",
        },
      } as Record<string, { description: string; recommendation: string }>)[scenario.id] ?? {
        description: scenario.description,
        recommendation: scenario.recommendation,
      };
      return {
        id: scenario.id,
        nivel: null,
        estado: null,
        descripcion: neutralText.description,
        fuente: scenario.source,
        departamento: scenario.department,
        responsable: "",
        fecha: "",
        recomendacion: neutralText.recommendation,
        proceso: scenario.process,
        modelo: "Sin modelo asociado",
        requiresRoadEvaluation: scenario.process === "Transporte",
      };
    }),
  ];
  const detectedRiskWorkflowById = new Map(detectedRiskWorkflows.map((item) => [item.risk_id, item]));
  const detectedRiskRegistrationById = new Map(detectedRiskRegistrations.map((item) => [item.risk_id, item]));
  const risks: DetectedRisk[] = riskTemplates.map((risk) => {
    const saved = detectedRiskWorkflowById.get(risk.id);
    return {
      ...risk,
      nivel: saved?.risk_level ?? risk.nivel,
      estado: saved?.status ?? risk.estado,
      responsable: saved?.responsible ?? risk.responsable,
    };
  });
  const selectedDetectedRisk = risks.find((risk) => risk.id === selectedDetectedRiskId);
  const getDetectedRiskDisplayId = (riskId: string) => {
    const index = riskTemplates.findIndex((risk) => risk.id === riskId);
    return index >= 0 ? `RSG-${String(index + 1).padStart(3, "0")}` : riskId;
  };
  const getDetectedRiskRegistrationDate = (riskId: string) => {
    const registrationTimestamp = detectedRiskRegistrationById.get(riskId)?.registered_at;
    return registrationTimestamp ? new Date(registrationTimestamp).toLocaleDateString("es-PE") : "Cargando fecha…";
  };
  const getGovernanceRiskBasisLabel = (basis: GovernanceRisk["data_basis"]) => {
    if (basis === "observado") return "Con evidencia";
    if (basis === "sintetico") return "Registro de prueba";
    return "Por validar";
  };
  const getAIRegistrationDate = (registeredAt: string) => new Date(registeredAt).toLocaleDateString("es-PE");
  const roadScenario = selectedDetectedRisk
    ? roadScenarioDrafts[selectedDetectedRisk.id] ?? inferRoadScenario(selectedDetectedRisk, roadModel)
    : EMPTY_ROAD_SCENARIO;

  useEffect(() => {
    let active = true;
    Promise.all([loadAIGovernanceRisks(), loadAIGovernanceAlerts()])
      .then(([records, alertResponse]) => {
        if (!active) return;
        setGovernanceRisks(records);
        setRiskDrafts(Object.fromEntries(records.map((risk) => [risk.id, { status: risk.status, treatment: risk.treatment }])));
        setAutomaticAlerts(alertResponse.alerts);
        setAutomaticAlertsAt(alertResponse.generatedAt);
      })
      .catch((error: unknown) => { if (active) setAutomaticAlertsError(error instanceof Error ? error.message : "No se pudieron cargar las alertas técnicas de los modelos."); })
      .finally(() => { if (active) setGovernanceRiskLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    loadDetectedRiskWorkflows()
      .then((records) => {
        if (active) setDetectedRiskWorkflows(records);
      })
      .catch((error: unknown) => {
        if (active) setDetectedRiskError(error instanceof Error ? error.message : "No se pudo cargar el seguimiento de riesgos.");
      });
    return () => { active = false; };
  }, []);

  const riskRegistrationIdsKey = riskTemplates.map((risk) => risk.id).join("|");
  useEffect(() => {
    let active = true;
    registerDetectedRisks(riskRegistrationIdsKey.split("|"))
      .then((records) => {
        if (active) setDetectedRiskRegistrations(records);
      })
      .catch((error: unknown) => {
        if (active) setDetectedRiskRegistrationError(error instanceof Error ? error.message : "No se pudieron cargar las fechas de registro.");
      });
    return () => { active = false; };
  }, [riskRegistrationIdsKey]);

  useEffect(() => {
    if (!selectedDetectedRisk) return;
    const saved = detectedRiskWorkflowById.get(selectedDetectedRisk.id);
    setDetectedRiskDraft({
      status: saved?.status ?? selectedDetectedRisk.estado ?? "",
      risk_level: saved?.risk_level ?? selectedDetectedRisk.nivel ?? "",
      phase: saved?.phase ?? "Identificación",
      responsible: saved?.responsible ?? "",
      notes: saved?.notes ?? "",
    });
    setDetectedRiskNotice("");
    setDetectedRiskError("");
  }, [selectedDetectedRiskId]);

  useEffect(() => {
    if (!isDetectedRiskFollowUpOpen || !selectedDetectedRisk) return;
    let active = true;
    setDetectedRiskWorkflowLoading(true);
    setRoadEvaluationLoadingRisk(selectedDetectedRisk.id);
    setDetectedRiskDocuments([]);
    setDetectedRiskEvents([]);
    setDetectedRiskDocumentsError("");
    setRoadModelError("");
    Promise.all([
      loadDetectedRiskDocuments(selectedDetectedRisk.id),
      loadDetectedRiskEvents(selectedDetectedRisk.id),
    ])
      .then(([documents, events]) => {
        if (!active) return;
        setDetectedRiskDocuments(documents);
        setDetectedRiskEvents(events);
      })
      .catch((error: unknown) => {
        if (active) setDetectedRiskDocumentsError(error instanceof Error ? error.message : "No se pudo cargar el historial del riesgo.");
      })
      .finally(() => {
        if (active) setDetectedRiskWorkflowLoading(false);
      });
    loadDetectedRiskRoadEvaluation(selectedDetectedRisk.id)
      .then((evaluation) => {
        if (!active) return;
        if (evaluation) {
          setRoadEvaluations((current) => ({ ...current, [selectedDetectedRisk.id]: evaluation }));
          setRoadScenarioDrafts((current) => ({
            ...current,
            [selectedDetectedRisk.id]: roadEvaluationInputsToScenario(evaluation.inputs),
          }));
        } else {
          setRoadEvaluations((current) => {
            const next = { ...current };
            delete next[selectedDetectedRisk.id];
            return next;
          });
        }
      })
      .catch((error: unknown) => {
        if (active) setRoadModelError(roadEvaluationErrorMessage(error));
      })
      .finally(() => {
        if (active) setRoadEvaluationLoadingRisk(null);
      });
    return () => { active = false; };
  }, [isDetectedRiskFollowUpOpen, selectedDetectedRisk?.id]);

  async function refreshDetectedRiskTimeline(riskId: string) {
    try {
      setDetectedRiskEvents(await loadDetectedRiskEvents(riskId));
    } catch (error) {
      setDetectedRiskDocumentsError(error instanceof Error ? error.message : "No se pudo actualizar la línea de tiempo.");
    }
  }

  async function saveDetectedRiskFollowUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDetectedRisk) return;
    if (!detectedRiskDraft.status || !detectedRiskDraft.risk_level) {
      setDetectedRiskError("Selecciona el nivel y el estado del riesgo antes de guardar.");
      return;
    }
    setDetectedRiskSaving(true);
    setDetectedRiskError("");
    setDetectedRiskNotice("");
    try {
      const saved = await updateDetectedRiskWorkflow(selectedDetectedRisk.id, detectedRiskDraft);
      setDetectedRiskWorkflows((current) => [...current.filter((item) => item.risk_id !== saved.risk_id), saved]);
      setDetectedRiskNotice("Seguimiento del riesgo guardado.");
      await refreshDetectedRiskTimeline(saved.risk_id);
    } catch (error) {
      setDetectedRiskError(error instanceof Error ? error.message : "No se pudo guardar el seguimiento del riesgo.");
    } finally {
      setDetectedRiskSaving(false);
    }
  }

  async function addDetectedRiskDocument(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedDetectedRisk) return;
    setDetectedRiskUploading(true);
    setDetectedRiskDocumentsError("");
    try {
      const saved = await uploadDetectedRiskDocument(selectedDetectedRisk.id, file);
      setDetectedRiskDocuments((current) => [saved, ...current]);
      setDetectedRiskNotice(`Documento "${saved.file_name}" adjuntado.`);
      await refreshDetectedRiskTimeline(selectedDetectedRisk.id);
    } catch (error) {
      setDetectedRiskDocumentsError(error instanceof Error ? error.message : "No se pudo adjuntar el documento.");
    } finally {
      setDetectedRiskUploading(false);
    }
  }

  async function previewDetectedRiskDocument(document: DetectedRiskDocument) {
    setDetectedRiskDocumentsError("");
    try {
      const blob = await downloadDetectedRiskDocument(document.id);
      setDetectedRiskPreview({ fileName: document.file_name, mediaType: document.media_type, blob });
    } catch (error) {
      setDetectedRiskPreview(null);
      setDetectedRiskDocumentsError(error instanceof Error ? error.message : "No se pudo abrir la vista previa.");
    }
  }

  async function downloadDetectedRiskDocumentFile(document: DetectedRiskDocument) {
    setDetectedRiskDocumentsError("");
    try {
      const blob = await downloadDetectedRiskDocument(document.id);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = document.file_name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setDetectedRiskDocumentsError(error instanceof Error ? error.message : "No se pudo descargar el documento.");
    }
  }

  async function removeDetectedRiskDocument(document: DetectedRiskDocument) {
    if (!window.confirm(`¿Eliminar el documento "${document.file_name}"? Esta acción no se puede deshacer.`)) return;
    setDetectedRiskDeletingDocumentId(document.id);
    setDetectedRiskDocumentsError("");
    try {
      await deleteDetectedRiskDocument(document.id);
      setDetectedRiskDocuments((current) => current.filter((item) => item.id !== document.id));
      setDetectedRiskNotice(`Documento "${document.file_name}" eliminado.`);
      if (selectedDetectedRisk) await refreshDetectedRiskTimeline(selectedDetectedRisk.id);
    } catch (error) {
      setDetectedRiskDocumentsError(error instanceof Error ? error.message : "No se pudo eliminar el documento.");
    } finally {
      setDetectedRiskDeletingDocumentId(null);
    }
  }

  const reviewAutomaticAlert = (alert: GovernanceAlert) => {
    setSelectedAutomaticAlertId(alert.id);
    setNewGovernanceRisk({
      model_name: alert.modelName,
      other_model_name: "",
      category: alert.category,
      description: alert.description,
      data_basis: "observado",
      evidence: alert.evidence,
      likelihood: alert.likelihood,
      impact: alert.impact,
      owner: user?.name ?? user?.username ?? "",
      treatment: alert.treatment,
    });
    setGovernanceRiskSaved("Alerta cargada en el formulario. Completa o valida los campos y regístrala para dejar constancia de la revisión humana.");
    document.getElementById("ai-risk-registration")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const submitGovernanceRisk = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGovernanceRiskError("");
    setGovernanceRiskSaved("");
    try {
      const created = await createAIGovernanceRisk({
        ...newGovernanceRisk,
        model_name: (newGovernanceRisk.model_name === "otro" ? newGovernanceRisk.other_model_name : newGovernanceRisk.model_name).trim(),
        category: newGovernanceRisk.category.trim(),
        description: newGovernanceRisk.description.trim(),
        evidence: newGovernanceRisk.evidence.trim(),
        owner: (newGovernanceRisk.owner || user?.name || user?.username || "").trim(),
        treatment: newGovernanceRisk.treatment.trim(),
        source_alert_id: selectedAutomaticAlertId ?? undefined,
      });
      setGovernanceRisks((current) => [created, ...current]);
      setRiskDrafts((current) => ({ ...current, [created.id]: { status: created.status, treatment: created.treatment } }));
      setGovernanceRiskSaved("Riesgo registrado en PostgreSQL.");
      if (selectedAutomaticAlertId) {
        setAutomaticAlerts((current) => current.filter((alert) => alert.id !== selectedAutomaticAlertId));
        setSelectedAutomaticAlertId(null);
      }
      setNewGovernanceRisk({ model_name: "XGBoost · Predicción de demanda de combustibles líquidos", other_model_name: "", category: "", description: "", data_basis: "observado", evidence: "", likelihood: 3, impact: 3, owner: "", treatment: "" });
    } catch (error) {
      setGovernanceRiskError(error instanceof Error ? error.message : "No se pudo registrar el riesgo.");
    }
  };

  const saveGovernanceRisk = async (risk: GovernanceRisk) => {
    const draft = riskDrafts[risk.id];
    if (!draft) return;
    setGovernanceRiskError("");
    try {
      const updated = await updateAIGovernanceRisk(risk.id, draft);
      setGovernanceRisks((current) => current.map((item) => item.id === updated.id ? updated : item));
      setRiskDrafts((current) => ({ ...current, [updated.id]: { status: updated.status, treatment: updated.treatment } }));
      setGovernanceRiskSaved(`Se actualizó el riesgo "${updated.category}" del modelo "${updated.model_name}".`);
    } catch (error) {
      setGovernanceRiskError(error instanceof Error ? error.message : "No se pudo actualizar el riesgo.");
    }
  };

  useEffect(() => {
    let active = true;
    loadRoadImpactModel()
      .then((model) => {
        if (!active) return;
        setRoadModel(model);
      })
      .catch((error: unknown) => { if (active) setRoadModelError(error instanceof Error ? error.message : "No se pudo cargar el modelo vial."); });
    return () => { active = false; };
  }, []);

  const handleRoadPrediction = async (event: React.FormEvent<HTMLFormElement>, riskId: string) => {
    event.preventDefault();
    setRoadPredictingRisk(riskId);
    setRoadModelError("");
    try {
      const evaluation = await evaluateDetectedRiskRoadImpact(riskId, roadScenarioToInput(roadScenario));
      setRoadEvaluations((current) => ({ ...current, [riskId]: evaluation }));
      setRoadScenarioDrafts((current) => ({
        ...current,
        [riskId]: roadEvaluationInputsToScenario(evaluation.inputs),
      }));
    } catch (error) {
      setRoadModelError(roadEvaluationErrorMessage(error));
    } finally {
      setRoadPredictingRisk(null);
    }
  };

  const updateRoadScenario = (field: keyof RoadScenario, value: string) => {
    if (!selectedDetectedRisk) return;
    setRoadScenarioDrafts((current) => ({
      ...current,
      [selectedDetectedRisk.id]: { ...roadScenario, [field]: value },
    }));
  };
  
  // Filtrar riesgos seg?n b?squeda, nivel y estado
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);

  const filteredRisks = risks.filter(risk => {
    const matchesSearch = searchQuery === "" || 
      risk.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      risk.descripcion.toLowerCase().includes(searchQuery.toLowerCase()) ||
      risk.responsable.toLowerCase().includes(searchQuery.toLowerCase()) ||
      risk.proceso?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      risk.modelo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      risk.fuente.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesLevel = selectedLevel === null ||
      (selectedLevel === "Sin nivel" ? risk.nivel === null : risk.nivel === selectedLevel);
    const matchesStatus = selectedStatus === null ||
      (selectedStatus === "Sin estado" ? risk.estado === null : risk.estado === selectedStatus);
    
    return matchesSearch && matchesLevel && matchesStatus;
  }).sort((left, right) => {
    const leftUpdatedAt = detectedRiskWorkflowById.get(left.id)?.updated_at;
    const rightUpdatedAt = detectedRiskWorkflowById.get(right.id)?.updated_at;
    if (!leftUpdatedAt) return rightUpdatedAt ? 1 : 0;
    if (!rightUpdatedAt) return -1;
    return new Date(rightUpdatedAt).getTime() - new Date(leftUpdatedAt).getTime();
  });
  const activeDetectedRisks = filteredRisks.filter((risk) => risk.estado !== "Cerrado");
  const closedDetectedRisks = filteredRisks.filter((risk) => risk.estado === "Cerrado");

  const counts: Record<DetectedRiskLevel, number> = { Crítico: 0, Alto: 0, Medio: 0, Bajo: 0 };
  let unclassifiedCount = 0;
  risks.forEach((risk) => {
    if (risk.nivel) counts[risk.nivel]++;
    else unclassifiedCount++;
  });
  const activeGovernanceRisks = governanceRisks.filter((risk) => risk.status !== "cerrado");
  const closedGovernanceRisks = governanceRisks.filter((risk) => risk.status === "cerrado");
  
  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-[18px] font-semibold" style={{ color: "#201f1e" }}>Gestión de Riesgos</h1><UserStoryRefs ids={["HU-011", "HU-012", "HU-013", "HU-021", "HU-022", "HU-025", "HU-026"]} /></div>
        <p className="text-[13px] mt-0.5" style={{ color: "#605e5c" }}>
          Riesgos detectados en el periodo {latestRiskYear}. Selecciona uno para abrir su seguimiento.
        </p>
      </div>

      <div role="tablist" aria-label="Secciones de riesgos" className="flex flex-wrap gap-2 border-b" style={{ borderColor: "#e1dfdd" }}>
        {([
          { id: "ai", label: "Riesgos de IA" },
          { id: "detected", label: "Riesgos detectados" },
        ] as const).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={riskSection === id}
            onClick={() => setRiskSection(id)}
            className="px-3 py-2 text-[14px] font-medium border-b-2 transition-colors"
            style={{
              color: riskSection === id ? "#0f6cbd" : "#605e5c",
              borderColor: riskSection === id ? "#0f6cbd" : "transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {riskSection === "ai" && <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <h2 className="text-[16px] font-semibold" style={{ color: "#201f1e" }}>Riesgos de los sistemas de IA</h2>
          <UserStoryRefs ids={["HU-011", "HU-012", "HU-013", "HU-021", "HU-022", "HU-025", "HU-026"]} />
        </div>
        <p className="text-[11px] mb-3" style={{ color: "#605e5c" }}>Registra riesgo, origen de la información, probabilidad, impacto, responsable y tratamiento. Los valores son evaluación humana; XGBoost disponible en esta aplicación no estima riesgos genéricos ni selecciona mitigaciones.</p>
        {governanceRiskError && <p role="alert" className="mb-2 rounded px-2 py-1.5 text-[11px]" style={{ background: "#fdf3f4", color: "#a4262c" }}>{governanceRiskError}</p>}
        {governanceRiskSaved && <p role="status" className="mb-2 text-[11px]" style={{ color: "#107c10" }}>{governanceRiskSaved}</p>}
        <div className="rounded p-3 mb-3" style={{ background: "#f5f9fd", border: "1px solid #cce0f5" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-[12px] font-semibold" style={{ color: "#0f6cbd" }}>Alertas automáticas de los modelos</h3><p className="text-[10px] mt-1" style={{ color: "#605e5c" }}>Se calculan con la última evaluación persistida. Son señales técnicas para revisar, no riesgos registrados ni decisiones automáticas.</p></div>
            {automaticAlertsAt && <span className="text-[10px]" style={{ color: "#8a8886" }}>Actualizadas: {new Date(automaticAlertsAt).toLocaleString("es-PE")}</span>}
          </div>
          {automaticAlertsError ? <p role="alert" className="mt-2 text-[10px]" style={{ color: "#a4262c" }}>{automaticAlertsError}</p> : governanceRiskLoading ? <p className="mt-2 text-[10px]" style={{ color: "#605e5c" }}>Calculando alertas técnicas…</p> : automaticAlerts.length === 0 ? <p className="mt-2 text-[10px]" style={{ color: "#107c10" }}>No hay alertas automáticas con los criterios definidos y la evaluación disponible.</p> : <div className="mt-2 space-y-2">{automaticAlerts.map((alert) => <div key={alert.id} className="flex flex-wrap items-start justify-between gap-2 rounded p-2" style={{ background: "#ffffff", border: "1px solid #e1dfdd" }}><div className="min-w-0 flex-1"><div className="text-[11px] font-semibold" style={{ color: "#201f1e" }}>{alert.category} · {alert.modelName}</div><p className="text-[10px] mt-1" style={{ color: "#605e5c" }}>{alert.description}</p><p className="text-[10px] mt-1" style={{ color: "#8a8886" }}>Probabilidad {alert.likelihood}/5 · impacto {alert.impact}/5</p></div><button type="button" onClick={() => reviewAutomaticAlert(alert)} className="rounded px-2 py-1.5 text-[10px] text-white" style={{ background: "#0f6cbd" }}>Revisar y registrar</button></div>)}</div>}
        </div>
        <form id="ai-risk-registration" onSubmit={(event) => void submitGovernanceRisk(event)} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 rounded p-3 mb-3" style={{ background: "#f8f8f8" }}>
          <label className="text-[10px]" style={{ color: "#605e5c" }}>Sistema/modelo<select value={newGovernanceRisk.model_name} onChange={(event) => setNewGovernanceRisk((current) => ({ ...current, model_name: event.target.value }))} className="mt-1 w-full rounded border bg-white p-1.5 text-[11px]"><option value="XGBoost · Predicción de demanda de combustibles líquidos">XGBoost · Demanda</option><option value="XGBoost · Estado inicial de emergencia vial">XGBoost · Emergencia vial</option><option value="otro">Otro sistema de IA</option></select></label>
          {newGovernanceRisk.model_name === "otro" && <label className="text-[10px]" style={{ color: "#605e5c" }}>Nombre del sistema<input required minLength={2} maxLength={160} value={newGovernanceRisk.other_model_name} onChange={(event) => setNewGovernanceRisk((current) => ({ ...current, other_model_name: event.target.value }))} className="mt-1 w-full rounded border bg-white p-1.5 text-[11px]" /></label>}
          <label className="text-[10px]" style={{ color: "#605e5c" }}>Categoría<input required minLength={2} maxLength={120} value={newGovernanceRisk.category} onChange={(event) => setNewGovernanceRisk((current) => ({ ...current, category: event.target.value }))} className="mt-1 w-full rounded border bg-white p-1.5 text-[11px]" placeholder="Datos, deriva, sesgo, seguridad…" /></label>
          <label className="text-[10px]" style={{ color: "#605e5c" }}>Base de información<select value={newGovernanceRisk.data_basis} onChange={(event) => setNewGovernanceRisk((current) => ({ ...current, data_basis: event.target.value as GovernanceRisk["data_basis"] }))} className="mt-1 w-full rounded border bg-white p-1.5 text-[11px]"><option value="observado">Con evidencia</option><option value="sintetico">Registro de prueba</option><option value="conceptual">Por validar</option></select></label>
          <label className="text-[10px]" style={{ color: "#605e5c" }}>Responsable<input maxLength={160} value={newGovernanceRisk.owner} onChange={(event) => setNewGovernanceRisk((current) => ({ ...current, owner: event.target.value }))} className="mt-1 w-full rounded border bg-white p-1.5 text-[11px]" placeholder={user?.name ?? "Responsable"} /></label>
          <label className="text-[10px] sm:col-span-2" style={{ color: "#605e5c" }}>Descripción<textarea required minLength={10} maxLength={2000} rows={2} value={newGovernanceRisk.description} onChange={(event) => setNewGovernanceRisk((current) => ({ ...current, description: event.target.value }))} className="mt-1 w-full rounded border bg-white p-1.5 text-[11px]" /></label>
          <label className="text-[10px]" style={{ color: "#605e5c" }}>Evidencia o referencia{newGovernanceRisk.data_basis === "observado" && <span style={{ color: "#a4262c" }}> · obligatoria</span>}<textarea required={newGovernanceRisk.data_basis === "observado"} maxLength={5000} rows={2} value={newGovernanceRisk.evidence} onChange={(event) => setNewGovernanceRisk((current) => ({ ...current, evidence: event.target.value }))} className="mt-1 w-full rounded border bg-white p-1.5 text-[11px]" placeholder="Archivo, fecha, registro o enlace interno" /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px]" style={{ color: "#605e5c" }}>Probabilidad (1–5)<input type="number" required min={1} max={5} value={newGovernanceRisk.likelihood} onChange={(event) => setNewGovernanceRisk((current) => ({ ...current, likelihood: Number(event.target.value) }))} className="mt-1 w-full rounded border bg-white p-1.5 text-[11px]" /></label>
            <label className="text-[10px]" style={{ color: "#605e5c" }}>Impacto (1–5)<input type="number" required min={1} max={5} value={newGovernanceRisk.impact} onChange={(event) => setNewGovernanceRisk((current) => ({ ...current, impact: Number(event.target.value) }))} className="mt-1 w-full rounded border bg-white p-1.5 text-[11px]" /></label>
          </div>
          <label className="text-[10px] sm:col-span-3" style={{ color: "#605e5c" }}>Tratamiento propuesto<textarea required minLength={5} maxLength={3000} rows={2} value={newGovernanceRisk.treatment} onChange={(event) => setNewGovernanceRisk((current) => ({ ...current, treatment: event.target.value }))} className="mt-1 w-full rounded border bg-white p-1.5 text-[11px]" placeholder="Acción, responsable y resultado esperado" /></label>
          <div className="flex items-end"><button type="submit" className="w-full rounded px-3 py-2 text-[11px] font-medium text-white" style={{ background: "#0f6cbd" }}>Registrar riesgo</button></div>
        </form>
        {governanceRiskLoading ? <p className="text-[11px]" style={{ color: "#8a8886" }}>Cargando registro desde PostgreSQL…</p> : (
          <div className="space-y-4">
            <section aria-labelledby="active-ai-risks-heading" className="space-y-2">
              <h3 id="active-ai-risks-heading" className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>Riesgos en seguimiento ({activeGovernanceRisks.length})</h3>
              {activeGovernanceRisks.length === 0 ? <p className="rounded p-3 text-[11px]" style={{ background: "#f3f2f1", color: "#605e5c" }}>{governanceRisks.length === 0 ? "Todavía no hay riesgos registrados." : "No hay riesgos en seguimiento."}</p> : activeGovernanceRisks.map((risk) => {
              const draft = riskDrafts[risk.id] ?? { status: risk.status, treatment: risk.treatment };
              return <article key={risk.id} className="rounded p-3" style={{ border: "1px solid #edebe9" }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5"><h3 className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>{risk.description}</h3><span className="rounded px-1 py-0.5 text-[10px]" style={{ background: risk.data_basis === "observado" ? "#f1faf1" : "#fff8f0", color: risk.data_basis === "observado" ? "#107c10" : "#986f0b" }}>{getGovernanceRiskBasisLabel(risk.data_basis)}</span><span className="rounded px-1 py-0.5 text-[10px]" style={{ background: "#f3f2f1", color: "#605e5c" }}>{risk.status.replace("_", " ")}</span></div>
                    <p className="text-[10px] mt-1" style={{ color: "#605e5c" }}>{risk.model_name} · {risk.category} · probabilidad {risk.likelihood}/5 · impacto {risk.impact}/5 · responsable: {risk.owner} · registrado: {getAIRegistrationDate(risk.created_at)}</p>
                    <dl className="mt-2 space-y-1 text-[10px]" style={{ color: "#605e5c" }}>
                      <div><dt className="font-semibold">Evidencia</dt><dd>{risk.evidence ? <ul className="list-disc pl-4">{formatGovernanceEvidence(risk.evidence).map((item) => <li key={item}>{item}</li>)}</ul> : "Sin evidencia adjunta"}</dd></div>
                      <div><dt className="font-semibold">Tratamiento</dt><dd>{risk.treatment}</dd></div>
                      <div style={{ color: "#8a8886" }}>Registrado por {risk.created_by}</div>
                    </dl>
                  </div>
                </div>
                {canManageGovernanceRisk ? <div className="mt-2 grid grid-cols-1 sm:grid-cols-[150px_1fr_auto] gap-2 items-end">
                  <label className="text-[10px]" style={{ color: "#605e5c" }}>Estado<select value={draft.status} onChange={(event) => setRiskDrafts((current) => ({ ...current, [risk.id]: { ...draft, status: event.target.value as GovernanceRiskStatus } }))} className="mt-1 block w-full rounded border p-1.5 text-[11px]"><option value="identificado">Identificado</option><option value="en_tratamiento">En tratamiento</option><option value="aceptado">Aceptado</option><option value="cerrado">Cerrado</option></select></label>
                  <label className="text-[10px]" style={{ color: "#605e5c" }}>Tratamiento actualizado<textarea rows={2} maxLength={3000} value={draft.treatment} onChange={(event) => setRiskDrafts((current) => ({ ...current, [risk.id]: { ...draft, treatment: event.target.value } }))} className="mt-1 block w-full rounded border p-1.5 text-[11px]" /></label>
                  <button type="button" className="rounded px-2 py-1.5 text-[11px] text-white disabled:opacity-50" style={{ background: "#0f6cbd" }} onClick={() => void saveGovernanceRisk(risk)} disabled={draft.status === risk.status && draft.treatment === risk.treatment}>Guardar seguimiento</button>
                </div> : <p className="text-[10px] mt-2" style={{ color: "#8a8886" }}>El seguimiento y cierre requieren evaluación del Supervisor de Cumplimiento.</p>}
              </article>;
              })}
            </section>
            <section aria-labelledby="closed-ai-risks-heading" className="space-y-2">
              <h3 id="closed-ai-risks-heading" className="text-[12px] font-semibold" style={{ color: "#605e5c" }}>Historial de riesgos cerrados ({closedGovernanceRisks.length})</h3>
              {closedGovernanceRisks.length === 0 ? <p className="text-[10px]" style={{ color: "#8a8886" }}>Aún no hay riesgos cerrados.</p> : <ul className="divide-y rounded" style={{ border: "1px solid #edebe9" }}>
                {closedGovernanceRisks.map((risk) => <li key={risk.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium" style={{ color: "#201f1e" }}>{risk.description}</p>
                    <p className="text-[10px]" style={{ color: "#8a8886" }}>{risk.model_name} · {risk.category}</p>
                  </div>
                  <time className="shrink-0 text-[10px]" style={{ color: "#8a8886" }} dateTime={risk.created_at}>{getAIRegistrationDate(risk.created_at)}</time>
                </li>)}
              </ul>}
            </section>
          </div>
        )}
      </Card>}

      {riskSection === "detected" && <>
      <div>
        <h2 className="text-[18px] font-semibold" style={{ color: "#201f1e" }}>Riesgos detectados</h2>
        <p className="text-[14px] mt-1" style={{ color: "#605e5c" }}>Hallazgos identificados en los procesos y datos operativos; se presentan aparte de los riesgos propios de los sistemas de IA.</p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div
          className="bg-white rounded p-4 flex items-center gap-3 cursor-pointer hover:shadow-md transition-all"
          style={{
            border: "1px solid #e1dfdd",
            backgroundColor: selectedLevel === "Sin nivel" ? "#f3f2f1" : "#ffffff",
          }}
          onClick={() => setSelectedLevel(selectedLevel === "Sin nivel" ? null : "Sin nivel")}
        >
          <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: "#f3f2f1" }}>
            <ShieldAlert className="w-4 h-4" style={{ color: "#605e5c" }} />
          </div>
          <div>
            <div className="text-[20px] font-semibold" style={{ color: "#605e5c" }}>{unclassifiedCount}</div>
            <div className="text-[12px]" style={{ color: "#8a8886" }}>Sin nivel</div>
          </div>
        </div>
        {(["Crítico", "Alto", "Medio", "Bajo"] as const).map(nivel => {
          const s = RISK_LEVEL[nivel];
          return (
            <div 
              key={nivel} 
              className="bg-white rounded p-4 flex items-center gap-3 cursor-pointer hover:shadow-md transition-all" 
              style={{ 
                border: `1px solid ${s.border}`,
                backgroundColor: selectedLevel === nivel ? s.bg : "#ffffff",
              }}
              onClick={() => setSelectedLevel(selectedLevel === nivel ? null : nivel)}
            >
              <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: s.bg }}>
                <ShieldAlert className="w-4 h-4" style={{ color: s.text }} />
              </div>
              <div>
                <div className="text-[20px] font-semibold" style={{ color: s.text }}>{counts[nivel]}</div>
                <div className="text-[12px]" style={{ color: "#8a8886" }}>Riesgo {nivel}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4">

        {/* Risk List */}
        <div className="space-y-3">
          {/* Búsqueda y filtros */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4" style={{ color: "#c8c6c4" }} />
              <input
                type="text"
                placeholder="Buscar riesgo por ID, descripción..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded text-[13px] border"
                style={{ 
                  borderColor: "#e1dfdd",
                  backgroundColor: "#ffffff"
                }}
              />
            </div>
            <select
              value={selectedStatus || ""}
              onChange={(e) => setSelectedStatus(e.target.value === "" ? null : e.target.value)}
              className="px-3 py-2 rounded text-[13px] border"
              style={{ 
                borderColor: "#e1dfdd",
                backgroundColor: "#ffffff"
              }}
            >
              <option value="">Todos los estados</option>
              <option value="Activo">Activo</option>
              <option value="En análisis">En análisis</option>
              <option value="Mitigado">Mitigado</option>
              <option value="Cerrado">Cerrado</option>
              <option value="Sin estado">Sin estado</option>
            </select>
          </div>
          {detectedRiskRegistrationError && <p role="alert" className="rounded px-3 py-2 text-[11px]" style={{ background: "#fdf3f4", color: "#a4262c" }}>{detectedRiskRegistrationError}</p>}

          <div className="text-[16px] font-semibold" style={{ color: "#201f1e" }}>
            Riesgos detectados en seguimiento <span style={{ color: "#8a8886" }}>({activeDetectedRisks.length})</span>
          </div>

          <div className="space-y-2">
            {activeDetectedRisks.length === 0 ? (
              <Card className="p-6 text-center">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2" style={{ color: "#8a8886" }} />
                <p className="text-[14px]" style={{ color: "#8a8886" }}>No hay riesgos en seguimiento con los criterios seleccionados.</p>
              </Card>
            ) : (
              activeDetectedRisks.map((risk) => {
                const lvl = risk.nivel ? RISK_LEVEL[risk.nivel] : { bg: "#f3f2f1", text: "#605e5c", border: "#e1dfdd" };
                const st = risk.estado ? RISK_STATE[risk.estado] : { color: "#8a8886" };

                return (
                  <Card key={risk.id} className="p-4 transition-shadow hover:shadow-sm">
                    <button
                      type="button"
                      aria-label={`Abrir seguimiento del riesgo ${getDetectedRiskDisplayId(risk.id)}`}
                      onClick={() => {
                        setSelectedDetectedRiskId(risk.id);
                        setIsDetectedRiskFollowUpOpen(true);
                      }}
                      className="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0f6cbd]"
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="text-[12px] font-mono" style={{ color: "#8a8886" }}>{getDetectedRiskDisplayId(risk.id)}</span>
                        <span className="px-2 py-0.5 rounded-full text-[12px]" style={{ background: `${st.color}1a`, color: st.color }}>{risk.estado ?? "Sin estado"}</span>
                        <span className="px-2 py-0.5 rounded-full text-[12px]" style={{ background: lvl.bg, color: lvl.text, border: `1px solid ${lvl.border}` }}>
                          {risk.nivel ?? "Sin nivel"}
                        </span>
                      </div>
                      <p className="text-[14px] font-medium leading-snug" style={{ color: "#201f1e" }}>{risk.descripcion}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-[12px]" style={{ color: "#8a8886" }}>
                        <span className="flex items-center gap-1"><User className="w-3 h-3" />{risk.responsable || "Sin asignar"}</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{getDetectedRiskRegistrationDate(risk.id)}</span>
                        <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{risk.departamento}</span>
                      </div>
                    </button>
                  </Card>
                );
              })
            )}
          </div>

          <section aria-labelledby="closed-detected-risks-heading" className="space-y-2 pt-2">
            <h3 id="closed-detected-risks-heading" className="text-[13px] font-semibold" style={{ color: "#605e5c" }}>
              Historial de riesgos cerrados ({closedDetectedRisks.length})
            </h3>
            {closedDetectedRisks.length === 0 ? (
              <p className="text-[11px]" style={{ color: "#8a8886" }}>Aún no hay riesgos cerrados.</p>
            ) : (
              <ul className="divide-y rounded" style={{ border: "1px solid #edebe9" }}>
                {closedDetectedRisks.map((risk) => {
                  const registrationTimestamp = detectedRiskRegistrationById.get(risk.id)?.registered_at;
                  return <li key={risk.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium" style={{ color: "#201f1e" }}>{getDetectedRiskDisplayId(risk.id)} · {risk.descripcion}</p>
                      <p className="text-[10px]" style={{ color: "#8a8886" }}>{risk.departamento} · {risk.responsable || "Sin asignar"}</p>
                    </div>
                    <time className="shrink-0 text-[10px]" style={{ color: "#8a8886" }} dateTime={registrationTimestamp}>{getDetectedRiskRegistrationDate(risk.id)}</time>
                  </li>;
                })}
              </ul>
            )}
          </section>
        </div>

      </div>
      {selectedDetectedRisk && isDetectedRiskFollowUpOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="detected-risk-follow-up-title">
          <Card className="max-h-[90vh] w-full max-w-4xl overflow-y-auto p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 id="detected-risk-follow-up-title"                 className="text-[15px] font-semibold" style={{ color: "#201f1e" }}>
                  Seguimiento · {getDetectedRiskDisplayId(selectedDetectedRisk.id)}
                </h2>
                <p className="mt-1 text-[12px]" style={{ color: "#605e5c" }}>{selectedDetectedRisk.descripcion}</p>
              </div>
              <button type="button" onClick={() => setIsDetectedRiskFollowUpOpen(false)} aria-label="Cerrar seguimiento del riesgo" className="rounded px-2 py-1 text-[12px]" style={{ color: "#605e5c" }}>Cerrar</button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 rounded p-3 sm:grid-cols-2" style={{ background: "#f9f8f7", border: "1px solid #e1dfdd" }}>
              <div><div className="text-[11px] font-medium" style={{ color: "#605e5c" }}>Nivel</div><div className="text-[12px] mt-1" style={{ color: selectedDetectedRisk.nivel ? RISK_LEVEL[selectedDetectedRisk.nivel].text : "#8a8886" }}>{selectedDetectedRisk.nivel ?? "Sin asignar"}</div></div>
              <div><div className="text-[11px] font-medium" style={{ color: "#605e5c" }}>Departamento</div><div className="text-[12px] mt-1" style={{ color: "#201f1e" }}>{selectedDetectedRisk.departamento}</div></div>
            </div>

            {(selectedDetectedRisk.proceso || selectedDetectedRisk.modelo) && (
              <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 rounded p-3 text-[12px]" style={{ background: "#f9f8f7", color: "#605e5c" }}>
                {selectedDetectedRisk.proceso && <span>Proceso: <strong style={{ color: "#201f1e" }}>{selectedDetectedRisk.proceso}</strong></span>}
                {selectedDetectedRisk.modelo && <span>Modelo: <strong style={{ color: "#201f1e" }}>{selectedDetectedRisk.modelo}</strong></span>}
              </div>
            )}
            <section className="mb-4 rounded p-3" style={{ background: "#f9f8f7", borderLeft: `3px solid ${selectedDetectedRisk.nivel ? RISK_LEVEL[selectedDetectedRisk.nivel].border : "#e1dfdd"}` }}>
              <h3 className="text-[12px] font-medium" style={{ color: "#605e5c" }}>Recomendación de mitigación</h3>
              <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "#201f1e" }}>{selectedDetectedRisk.recomendacion}</p>
              <p className="mt-2 text-[11px]" style={{ color: "#8a8886" }}>La recomendación es orientativa. Este prototipo no ejecuta ni registra acciones de mitigación o escalamiento.</p>
            </section>
            {selectedDetectedRisk.requiresRoadEvaluation && selectedDetectedRisk.proceso === "Transporte" && (
              <section className="mb-4 space-y-3 rounded p-3" style={{ background: "#f5f9fd", border: "1px solid #cce0f5" }}>
                <h3 className="text-[12px] font-semibold" style={{ color: "#0f6cbd" }}>Evaluación XGBoost de impacto vial</h3>
                {!roadModel && !roadModelError && <p className="text-[11px]" style={{ color: "#605e5c" }}>Cargando el modelo vial…</p>}
                {roadModelError && <p role="alert" className="text-[11px]" style={{ color: "#a4262c" }}>{roadModelError}</p>}
                {roadModel && !roadModel.available && !roadModelError && <p role="alert" className="text-[11px]" style={{ color: "#a4262c" }}>{roadModel.reason}</p>}
                {roadModel?.available && (
                  <form onSubmit={(event) => handleRoadPrediction(event, selectedDetectedRisk.id)} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {([
                      ["phenomenonClass", "Clase de fenómeno", "CLASE_FENOMENO"],
                      ["phenomenon", "Fenómeno", "FENOMENO"],
                      ["event", "Evento", "EVENTO"],
                      ["department", "Departamento", "DEPARTEMENTO"],
                      ["province", "Provincia", "PROVINCIA"],
                      ["roadCode", "Código de vía", "RED_AFECTADA"],
                      ["roadSection", "Tramo", "TRAMO_AFECADO"],
                    ] as const).map(([key, label, category]) => (
                      <label key={key} className="text-[11px] font-medium" style={{ color: "#605e5c" }}>
                        {label}
                        <select required={!["province", "roadCode", "roadSection"].includes(key)} value={roadScenario[key]} onChange={(event) => updateRoadScenario(key, event.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-[12px]" style={{ borderColor: "#e1dfdd" }}>
                          <option value="">{["province", "roadCode", "roadSection"].includes(key) ? "No informado" : "No detectado · selecciona un valor"}</option>
                          {(roadModel.categories?.[category] ?? []).map((value) => <option key={value} value={value}>{value}</option>)}
                        </select>
                      </label>
                    ))}
                    <div className="flex items-end"><button type="submit" disabled={roadPredictingRisk !== null || roadEvaluationLoadingRisk === selectedDetectedRisk.id} className="rounded px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-60" style={{ background: "#0f6cbd" }}>{roadPredictingRisk === selectedDetectedRisk.id ? "Evaluando…" : "Evaluar riesgo"}</button></div>
                  </form>
                )}
                {roadEvaluations[selectedDetectedRisk.id] && (
                  <p className="rounded bg-white p-2 text-[11px]" style={{ color: "#605e5c" }}>
                    Resultado: <strong>{roadEvaluations[selectedDetectedRisk.id].result.prediction}</strong> · confianza {(roadEvaluations[selectedDetectedRisk.id].result.confidence * 100).toFixed(1)}%.
                  </p>
                )}
              </section>
            )}
            {selectedDetectedRisk.requiresRoadEvaluation && selectedDetectedRisk.proceso !== "Transporte" && (
              <p className="mb-4 rounded p-2.5 text-[11px]" style={{ background: "#fffbf0", border: "1px solid #f5e2a0", color: "#605e5c" }}>
                El modelo XGBoost disponible evalúa impactos viales. No hay un modelo asociado al proceso {selectedDetectedRisk.proceso ?? "seleccionado"}.
              </p>
            )}

            {detectedRiskError && <p role="alert" className="mb-3 rounded px-3 py-2 text-[12px]" style={{ background: "#fdf3f4", color: "#a4262c" }}>{detectedRiskError}</p>}
            {detectedRiskNotice && <p role="status" className="mb-3 text-[12px]" style={{ color: "#107c10" }}>{detectedRiskNotice}</p>}

            <form onSubmit={(event) => void saveDetectedRiskFollowUp(event)} className="space-y-3 rounded p-3" style={{ background: "#f9f8f7" }}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-[11px] font-medium" style={{ color: "#605e5c" }}>
                  Estado
                  <select required disabled={!canManageDetectedRisks} value={detectedRiskDraft.status} onChange={(event) => setDetectedRiskDraft((current) => ({ ...current, status: event.target.value as DetectedRiskStatus | "" }))} className="mt-1 block w-full rounded border bg-white px-2 py-1.5 text-[12px]" style={{ borderColor: "#e1dfdd" }}>
                    <option value="">Selecciona un estado</option>
                    <option value="Activo">Activo</option><option value="En análisis">En análisis</option><option value="Mitigado">Mitigado</option><option value="Cerrado">Cerrado</option>
                  </select>
                </label>
                <label className="text-[11px] font-medium" style={{ color: "#605e5c" }}>
                  Nivel de riesgo
                  <select required disabled={!canManageDetectedRisks} value={detectedRiskDraft.risk_level} onChange={(event) => setDetectedRiskDraft((current) => ({ ...current, risk_level: event.target.value as DetectedRiskLevel | "" }))} className="mt-1 block w-full rounded border bg-white px-2 py-1.5 text-[12px]" style={{ borderColor: "#e1dfdd" }}>
                    <option value="">Selecciona un nivel</option>
                    <option value="Crítico">Crítico</option><option value="Alto">Alto</option><option value="Medio">Medio</option><option value="Bajo">Bajo</option>
                  </select>
                </label>
                <label className="text-[11px] font-medium" style={{ color: "#605e5c" }}>
                  Etapa del riesgo
                  <select required disabled={!canManageDetectedRisks} value={detectedRiskDraft.phase} onChange={(event) => setDetectedRiskDraft((current) => ({ ...current, phase: event.target.value as DetectedRiskPhase }))} className="mt-1 block w-full rounded border bg-white px-2 py-1.5 text-[12px]" style={{ borderColor: "#e1dfdd" }}>
                    {DETECTED_RISK_PHASES.map((phase) => <option key={phase} value={phase}>{phase}</option>)}
                  </select>
                </label>
                <label className="text-[11px] font-medium" style={{ color: "#605e5c" }}>
                  Responsable
                  <select required disabled={!canManageDetectedRisks} value={detectedRiskDraft.responsible} onChange={(event) => setDetectedRiskDraft((current) => ({ ...current, responsible: event.target.value }))} className="mt-1 block w-full rounded border bg-white px-2 py-1.5 text-[12px]" style={{ borderColor: "#e1dfdd" }}>
                    <option value="">Selecciona un responsable</option>
                    {detectedRiskDraft.responsible && !eligibleRiskAssignees.some((account) => account.username === detectedRiskDraft.responsible) && <option value={detectedRiskDraft.responsible} disabled>Usuario asignado sin permiso activo</option>}
                    {eligibleRiskAssignees.map((account) => <option key={account.username} value={account.username}>{account.name} · @{account.username}</option>)}
                  </select>
                  {managementError && <span className="mt-1 block font-normal" style={{ color: "#a4262c" }}>No se pudo cargar la lista de usuarios: {managementError}</span>}
                  {!managementError && canManageDetectedRisks && eligibleRiskAssignees.length === 0 && <span className="mt-1 block font-normal" style={{ color: "#8a8886" }}>No hay usuarios activos con permiso de Riesgos.</span>}
                </label>
              </div>
              <label className="block text-[11px] font-medium" style={{ color: "#605e5c" }}>
                Notas de seguimiento
                <textarea required disabled={!canManageDetectedRisks} maxLength={5000} rows={3} value={detectedRiskDraft.notes} onChange={(event) => setDetectedRiskDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Acuerdos, acciones, avances o comentarios de revisión" className="mt-1 block w-full rounded border bg-white p-2 text-[12px]" style={{ borderColor: "#e1dfdd" }} />
              </label>
              {canManageDetectedRisks
                ? <button type="submit" disabled={detectedRiskSaving} className="rounded px-3 py-2 text-[12px] font-medium text-white disabled:opacity-60" style={{ background: "#0f6cbd" }}>{detectedRiskSaving ? "Guardando…" : "Guardar seguimiento"}</button>
                : <p className="text-[11px]" style={{ color: "#8a8886" }}>Solo el Supervisor de Cumplimiento puede actualizar el seguimiento de riesgos.</p>}
            </form>

            <div>
              <section className="mt-4 border-t pt-3" style={{ borderColor: "#edebe9" }}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>Documentos relacionados</h3>
                  {canManageDetectedRisks && <label className="cursor-pointer rounded border px-2 py-1 text-[11px]" style={{ borderColor: "#cce0f5", color: "#0f6cbd" }}>
                    {detectedRiskUploading ? "Subiendo…" : "Adjuntar documento"}
                    <input type="file" className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg" disabled={detectedRiskUploading} onChange={(event) => void addDetectedRiskDocument(event)} />
                  </label>}
                </div>
                <p className="mt-1 text-[10px]" style={{ color: "#8a8886" }}>Archivos persistidos · máximo 10 MB por archivo.</p>
                {detectedRiskDocumentsError && <p role="alert" className="mt-2 text-[11px]" style={{ color: "#a4262c" }}>{detectedRiskDocumentsError}</p>}
                {detectedRiskWorkflowLoading ? <p className="mt-2 text-[11px]" style={{ color: "#8a8886" }}>Cargando documentos…</p> : detectedRiskDocuments.length === 0 ? <p className="mt-2 text-[11px]" style={{ color: "#8a8886" }}>No hay documentos adjuntos.</p> : (
                  <ul className="mt-2 space-y-2">
                    {detectedRiskDocuments.map((document) => <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded p-2" style={{ background: "#f9f8f7" }}>
                      <div className="min-w-0"><div className="truncate text-[11px] font-medium" style={{ color: "#201f1e" }}>{document.file_name}</div><div className="text-[10px]" style={{ color: "#8a8886" }}>{(document.size_bytes / 1024).toFixed(0)} KB · {document.uploaded_by}</div></div>
                      <div className="flex items-center gap-2 text-[11px]">
                        <button type="button" onClick={() => void previewDetectedRiskDocument(document)} style={{ color: "#0f6cbd" }}>Ver</button>
                        <button type="button" onClick={() => void downloadDetectedRiskDocumentFile(document)} style={{ color: "#0f6cbd" }}>Descargar</button>
                        {canManageDetectedRisks && <button type="button" disabled={detectedRiskDeletingDocumentId === document.id} onClick={() => void removeDetectedRiskDocument(document)} className="disabled:opacity-50" style={{ color: "#a4262c" }}>{detectedRiskDeletingDocumentId === document.id ? "Eliminando…" : "Eliminar"}</button>}
                      </div>
                    </li>)}
                  </ul>
                )}
              </section>

              <section className="mt-4 border-t pt-3" style={{ borderColor: "#edebe9" }}>
                <h3 className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>Historial de seguimiento</h3>
                {detectedRiskWorkflowLoading ? <p className="mt-2 text-[11px]" style={{ color: "#8a8886" }}>Cargando historial…</p> : detectedRiskEvents.length === 0 ? <p className="mt-2 text-[11px]" style={{ color: "#8a8886" }}>Todavía no hay cambios registrados.</p> : (
                  <ol className="mt-2 space-y-3">
                    {detectedRiskEvents.map((timelineEvent) => {
                      const changes = timelineEvent.event_type === "update" ? getDetectedRiskChanges(timelineEvent.detail) : [];
                      const documentRemoved = timelineEvent.detail.startsWith("Documento eliminado:");
                      return <li key={timelineEvent.id} className="border-l-2 pl-3" style={{ borderColor: timelineEvent.event_type === "document" ? "#8764b8" : "#0f6cbd" }}>
                        <div className="text-[11px] font-medium" style={{ color: "#201f1e" }}>{timelineEvent.event_type === "document" ? (documentRemoved ? "Documento eliminado" : "Documento adjuntado") : `${changes.length} cambios de seguimiento`}</div>
                        <div className="text-[10px]" style={{ color: "#8a8886" }}>{new Date(timelineEvent.occurred_at).toLocaleString("es-PE")} · {timelineEvent.username}</div>
                        {timelineEvent.event_type === "document" ? <p className="mt-1 text-[11px]" style={{ color: "#605e5c" }}>{timelineEvent.detail}</p> : (
                          <details className="mt-1 text-[11px]">
                            <summary className="cursor-pointer font-medium" style={{ color: "#0f6cbd" }}>Ver cambios</summary>
                            <ul className="mt-1 space-y-1" style={{ color: "#605e5c" }}>
                              {changes.map((change, index) => <li key={`${change.label}-${index}`}>{change.label}: “{change.before || "Sin asignar"}” → “{change.after || "Sin asignar"}”</li>)}
                            </ul>
                          </details>
                        )}
                      </li>;
                    })}
                  </ol>
                )}
              </section>
            </div>
          </Card>
          {detectedRiskPreview && <DocumentPreviewModal fileName={detectedRiskPreview.fileName} mediaType={detectedRiskPreview.mediaType} blob={detectedRiskPreview.blob} onClose={() => setDetectedRiskPreview(null)} />}
        </div>
      )}
      </>}
    </div>
  );
}
