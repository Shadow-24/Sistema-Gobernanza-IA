import { CheckCircle, Clock, AlertTriangle, Scale, BookOpen, ShieldCheck, Save, Paperclip, Download, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { UserStoryRefs } from "./UserStoryRefs";
import { useAuth } from "../AuthContext";
import { downloadAIGovernanceEvidence, loadAIGovernanceControls, loadAIGovernanceEvidence, updateAIGovernanceControl, uploadAIGovernanceEvidence, type GovernanceControl, type GovernanceControlStatus, type GovernanceEvidenceFile } from "../aiGovernanceApi";
import {
  deleteComplianceFollowupDocument,
  downloadComplianceFollowupDocument,
  loadComplianceFollowupDocuments,
  loadComplianceFollowupEvents,
  loadComplianceFollowups,
  updateComplianceFollowup,
  uploadComplianceFollowupDocument,
  type ComplianceFollowup,
  type ComplianceFollowupDocument,
  type ComplianceFollowupEvent,
  type ComplianceFollowupPhase,
  type ComplianceFollowupStatus,
  type ComplianceItemType,
  type ComplianceRiskLevel,
} from "../complianceFollowUpApi";
import { generateGovernanceControlsReport } from "../../utils/reportGenerators/governanceControlsReport";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded ${className}`} style={{ border: "1px solid #e1dfdd" }}>{children}</div>;
}

type ComplianceFollowupTarget = {
  id: string;
  type: ComplianceItemType;
  title: string;
  reference: string;
  description: string;
};

type ComplianceFollowupDraft = {
  status: ComplianceFollowupStatus;
  phase: ComplianceFollowupPhase;
  responsible: string;
  notes: string;
  riskLevel: ComplianceRiskLevel | "";
};

function ProgressRing({ value, color, size = 80 }: { value: number; color: string; size?: number }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f2f1" strokeWidth={8} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x={size / 2} y={size / 2 + 1} textAnchor="middle" dominantBaseline="middle"
        fontSize={15} fontWeight={700} fill={color}>{value}%</text>
    </svg>
  );
}

const REGULATORY_NORMS = [
  { id: "NORM-01", nombre: "Reglamento para la Protección Ambiental (D.S. 039-2014-EM)", tipo: "Ambiental" },
  { id: "NORM-02", nombre: "Normas técnicas OEFA – Hidrocarburos Mayores", tipo: "Fiscalización" },
  { id: "NORM-03", nombre: "Ley SINADA – Gestión de denuncias ambientales", tipo: "Administrativo" },
  { id: "NORM-04", nombre: "Norma técnica CDCLy – Instalaciones fijas", tipo: "Técnico" },
  { id: "NORM-05", nombre: "AI Act Framework (referencia UE) – Gobernanza IA", tipo: "Referencia" },
  { id: "NORM-06", nombre: "ISO/IEC 42001 – Gestión de Sistemas de IA", tipo: "Referencia" },
];

const REGULATORY_RISKS = [
  { id: "RRG-001", descripcion: "Medidas correctivas PLUSPETROL – plazo vencido Q4 2024", normativa: "D.S. 039-2014-EM" },
  { id: "RRG-002", descripcion: "879 denuncias SINADA sin resolver – sobrepasan tiempo normativo", normativa: "Ley SINADA" },
  { id: "RRG-003", descripcion: "Referencia ISO/IEC 42001 pendiente de evaluación conceptual", normativa: "ISO/IEC 42001 · sin certificación" },
];

const PHASE_PROGRESS: Record<ComplianceFollowupPhase, number> = {
  "Evaluación": 10, "Plan de acción": 30, "Implementación": 60, "Verificación": 80, "Cierre": 90,
};

function followupProgress(followup?: ComplianceFollowup): number {
  if (!followup) return 0;
  if (followup.status === "Conforme" || followup.status === "Cerrado") return 100;
  if (followup.status === "Pendiente" || followup.status === "Brecha") return 0;
  return PHASE_PROGRESS[followup.phase];
}

const RISK_COLORS: Record<string, string> = {
  Crítico: "#a4262c", Alto: "#ca5010", Medio: "#986f0b", Bajo: "#107c10", "Sin clasificar": "#8a8886",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  "Sin iniciar":  { bg: "#f3f2f1", text: "#605e5c" },
  "Pendiente":    { bg: "#f3f2f1", text: "#605e5c" },
  "En curso":     { bg: "#eff6ff", text: "#0f6cbd" },
  "Conforme":     { bg: "#f1faf1", text: "#107c10" },
  "Cerrado":      { bg: "#f1faf1", text: "#107c10" },
  "Mitigado":     { bg: "#fff8f0", text: "#986f0b" },
  "Brecha":       { bg: "#fdf3f4", text: "#a4262c" },
};

export function ComplianceModule() {
  const { user, managedUsers } = useAuth();
  const canEvaluateControls = user?.role === "Supervisor de Cumplimiento";
  const canManageFollowups = user?.role === "Supervisor de Cumplimiento" && user.permissions.includes("cumplimiento");
  const [governanceControls, setGovernanceControls] = useState<GovernanceControl[]>([]);
  const [governanceLoading, setGovernanceLoading] = useState(true);
  const [governanceError, setGovernanceError] = useState("");
  const [governanceEvidenceError, setGovernanceEvidenceError] = useState("");
  const [governanceSaved, setGovernanceSaved] = useState("");
  const [governanceDrafts, setGovernanceDrafts] = useState<Record<string, { status: GovernanceControlStatus; evidence: string }>>({});
  const [governanceAttachments, setGovernanceAttachments] = useState<Record<string, GovernanceEvidenceFile[]>>({});
  const [uploadingEvidenceControl, setUploadingEvidenceControl] = useState<string | null>(null);
  const [selectedStandard, setSelectedStandard] = useState("");
  const [activeTab, setActiveTab] = useState<"normativas" | "controles">("normativas");
  const [complianceFollowups, setComplianceFollowups] = useState<Record<string, ComplianceFollowup>>({});
  const [complianceFollowupsLoading, setComplianceFollowupsLoading] = useState(true);
  const [complianceFollowupsError, setComplianceFollowupsError] = useState("");
  const [selectedFollowup, setSelectedFollowup] = useState<ComplianceFollowupTarget | null>(null);
  const [followupDraft, setFollowupDraft] = useState<ComplianceFollowupDraft>({
    status: "Pendiente",
    phase: "Evaluación",
    responsible: "",
    notes: "",
    riskLevel: "",
  });
  const [followupEvents, setFollowupEvents] = useState<ComplianceFollowupEvent[]>([]);
  const [followupDocuments, setFollowupDocuments] = useState<ComplianceFollowupDocument[]>([]);
  const [followupLoading, setFollowupLoading] = useState(false);
  const [followupSaving, setFollowupSaving] = useState(false);
  const [followupUploading, setFollowupUploading] = useState(false);
  const [followupDeletingDocument, setFollowupDeletingDocument] = useState<string | null>(null);
  const [followupError, setFollowupError] = useState("");
  const [followupNotice, setFollowupNotice] = useState("");

  useEffect(() => {
    let active = true;
    loadAIGovernanceControls()
      .then((controls) => {
        if (!active) return;
        setGovernanceControls(controls);
        setGovernanceDrafts(Object.fromEntries(controls.map((control) => [control.id, { status: control.status, evidence: control.evidence }])));
      })
      .catch((error: unknown) => {
        if (active) setGovernanceError(error instanceof Error ? error.message : "No se pudieron cargar los controles.");
      })
      .finally(() => { if (active) setGovernanceLoading(false); });
    loadAIGovernanceEvidence()
      .then((files) => {
        if (!active) return;
        setGovernanceAttachments(files.reduce<Record<string, GovernanceEvidenceFile[]>>((groups, file) => {
          (groups[file.control_id] ??= []).push(file);
          return groups;
        }, {}));
      })
      .catch((error: unknown) => {
        if (active) setGovernanceEvidenceError(error instanceof Error ? error.message : "No se pudieron cargar las evidencias.");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    loadComplianceFollowups()
      .then((items) => {
        if (!active) return;
        setComplianceFollowups(Object.fromEntries(items.map((item) => [item.item_id, item])));
        setComplianceFollowupsError("");
      })
      .catch((error: unknown) => {
        if (active) setComplianceFollowupsError(error instanceof Error ? error.message : "No se pudieron cargar los seguimientos.");
      })
      .finally(() => { if (active) setComplianceFollowupsLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedFollowup) return;
    let active = true;
    setFollowupLoading(true);
    setFollowupError("");
    Promise.all([
      loadComplianceFollowupEvents(selectedFollowup.type, selectedFollowup.id),
      loadComplianceFollowupDocuments(selectedFollowup.type, selectedFollowup.id),
    ])
      .then(([events, documents]) => {
        if (!active) return;
        setFollowupEvents(events);
        setFollowupDocuments(documents);
      })
      .catch((error: unknown) => {
        if (active) setFollowupError(error instanceof Error ? error.message : "No se pudo cargar el seguimiento.");
      })
      .finally(() => { if (active) setFollowupLoading(false); });
    return () => { active = false; };
  }, [selectedFollowup]);

  const uploadGovernanceEvidence = async (control: GovernanceControl, files: File[]) => {
    if (!files.length) return;
    setGovernanceError("");
    setGovernanceSaved("");
    setUploadingEvidenceControl(control.id);
    try {
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} supera el máximo de 10 MB.`);
        const saved = await uploadAIGovernanceEvidence(control.id, file);
        setGovernanceAttachments((current) => ({
          ...current,
          [control.id]: [saved, ...(current[control.id] ?? []).filter((item) => item.id !== saved.id)],
        }));
        setGovernanceControls((current) => current.map((item) => item.id === control.id
          ? { ...item, evidence: saved.control_evidence ?? item.evidence, updated_by: saved.uploaded_by, updated_at: saved.created_at }
          : item));
        setGovernanceDrafts((current) => {
          const existing = current[control.id] ?? { status: control.status, evidence: control.evidence };
          const reference = `Adjunto: ${saved.file_name} · SHA-256 ${saved.checksum}`;
          return {
            ...current,
            [control.id]: {
              ...existing,
              evidence: existing.evidence.includes(reference) ? existing.evidence : [existing.evidence.trim(), reference].filter(Boolean).join("\n"),
            },
          };
        });
        setGovernanceSaved(`Se adjuntó ${saved.file_name}. El archivo quedó guardado en PostgreSQL.`);
      }
    } catch (error) {
      setGovernanceError(error instanceof Error ? error.message : "No se pudo adjuntar el archivo.");
    } finally {
      setUploadingEvidenceControl(null);
    }
  };

  const downloadGovernanceEvidence = async (file: GovernanceEvidenceFile) => {
    try {
      const blob = await downloadAIGovernanceEvidence(file.id);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = file.file_name;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      setGovernanceError(error instanceof Error ? error.message : "No se pudo descargar la evidencia.");
    }
  };

  const formatEvidenceSize = (bytes: number) => bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  const downloadGovernanceReport = () => {
    try {
      const report = generateGovernanceControlsReport(governanceControls, user?.name ?? "Usuario");
      const objectUrl = URL.createObjectURL(report);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "reporte-controles-gobernanza-ia.pdf";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      setGovernanceError(error instanceof Error ? error.message : "No se pudo generar el reporte de gobernanza.");
    }
  };

  const saveGovernanceControl = async (control: GovernanceControl) => {
    const draft = governanceDrafts[control.id];
    if (!draft) return;
    setGovernanceError("");
    setGovernanceSaved("");
    try {
      const saved = await updateAIGovernanceControl(control.id, draft);
      setGovernanceControls((current) => current.map((item) => item.id === saved.id ? saved : item));
      setGovernanceDrafts((current) => ({ ...current, [saved.id]: { status: saved.status, evidence: saved.evidence } }));
      setGovernanceSaved(`Se guardó ${saved.focus}.`);
    } catch (error) {
      setGovernanceError(error instanceof Error ? error.message : "No se pudo guardar la evaluación.");
    }
  };

  const openComplianceFollowup = (target: ComplianceFollowupTarget) => {
    const saved = complianceFollowups[target.id];
    setFollowupDraft({
      status: saved?.status ?? "Pendiente",
      phase: saved?.phase ?? "Evaluación",
      responsible: saved?.responsible ?? "",
      notes: saved?.notes ?? "",
      riskLevel: saved?.risk_level ?? "",
    });
    setFollowupEvents([]);
    setFollowupDocuments([]);
    setFollowupError("");
    setFollowupNotice("");
    setSelectedFollowup(target);
  };

  const saveComplianceFollowup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFollowup) return;
    setFollowupSaving(true);
    setFollowupError("");
    setFollowupNotice("");
    try {
      const saved = await updateComplianceFollowup(selectedFollowup.type, selectedFollowup.id, {
        status: followupDraft.status,
        phase: followupDraft.phase,
        responsible: followupDraft.responsible,
        notes: followupDraft.notes,
        risk_level: selectedFollowup.type === "riesgo" && followupDraft.riskLevel ? followupDraft.riskLevel : null,
      });
      setComplianceFollowups((current) => ({ ...current, [saved.item_id]: saved }));
      setFollowupNotice("Seguimiento guardado.");
      const events = await loadComplianceFollowupEvents(selectedFollowup.type, selectedFollowup.id);
      setFollowupEvents(events);
    } catch (error) {
      setFollowupError(error instanceof Error ? error.message : "No se pudo guardar el seguimiento.");
    } finally {
      setFollowupSaving(false);
    }
  };

  const uploadComplianceDocument = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !selectedFollowup) return;
    setFollowupUploading(true);
    setFollowupError("");
    setFollowupNotice("");
    try {
      await uploadComplianceFollowupDocument(selectedFollowup.type, selectedFollowup.id, file);
      const [documents, events, items] = await Promise.all([
        loadComplianceFollowupDocuments(selectedFollowup.type, selectedFollowup.id),
        loadComplianceFollowupEvents(selectedFollowup.type, selectedFollowup.id),
        loadComplianceFollowups(),
      ]);
      setFollowupDocuments(documents);
      setFollowupEvents(events);
      setComplianceFollowups(Object.fromEntries(items.map((item) => [item.item_id, item])));
      setFollowupNotice("Documento adjuntado.");
    } catch (error) {
      setFollowupError(error instanceof Error ? error.message : "No se pudo adjuntar el documento.");
    } finally {
      setFollowupUploading(false);
    }
  };

  const downloadComplianceDocument = async (document: ComplianceFollowupDocument) => {
    setFollowupError("");
    try {
      const blob = await downloadComplianceFollowupDocument(document.id);
      const objectUrl = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = objectUrl;
      link.download = document.file_name;
      window.document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      setFollowupError(error instanceof Error ? error.message : "No se pudo descargar el documento.");
    }
  };

  const removeComplianceDocument = async (document: ComplianceFollowupDocument) => {
    if (!selectedFollowup) return;
    setFollowupDeletingDocument(document.id);
    setFollowupError("");
    setFollowupNotice("");
    try {
      await deleteComplianceFollowupDocument(document.id);
      const [documents, events] = await Promise.all([
        loadComplianceFollowupDocuments(selectedFollowup.type, selectedFollowup.id),
        loadComplianceFollowupEvents(selectedFollowup.type, selectedFollowup.id),
      ]);
      setFollowupDocuments(documents);
      setFollowupEvents(events);
      setFollowupNotice("Documento eliminado.");
    } catch (error) {
      setFollowupError(error instanceof Error ? error.message : "No se pudo eliminar el documento.");
    } finally {
      setFollowupDeletingDocument(null);
    }
  };

  const governanceByStandard = governanceControls.reduce<Record<string, GovernanceControl[]>>((groups, control) => {
    (groups[control.standard] ??= []).push(control);
    return groups;
  }, {});
  const standardEntries = Object.entries(governanceByStandard);
  const activeStandard = governanceByStandard[selectedStandard] ? selectedStandard : standardEntries[0]?.[0] ?? "";
  const governanceCount = (status: GovernanceControlStatus) => governanceControls.filter((control) => control.status === status).length;
  const normProgress = REGULATORY_NORMS.map((norm) => followupProgress(complianceFollowups[norm.id]));
  const overallProgress = Math.round(normProgress.reduce((sum, value) => sum + value, 0) / REGULATORY_NORMS.length);
  const normsInFollowup = REGULATORY_NORMS.filter((norm) => complianceFollowups[norm.id]).length;
  const normsCompliant = REGULATORY_NORMS.filter((norm) => ["Conforme", "Cerrado"].includes(complianceFollowups[norm.id]?.status ?? "")).length;
  const formatRegistrationDate = (value?: string) => value ? new Date(value).toLocaleDateString("es-PE") : "Sin registrar";
  const progressColor = (value: number) => value >= 90 ? "#107c10" : value > 0 ? "#ca5010" : "#8a8886";

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-[18px] font-semibold" style={{ color: "#201f1e" }}>Cumplimiento Normativo</h1><UserStoryRefs ids={["HU-014", "HU-015"]} /></div>
        <p className="text-[13px] mt-0.5" style={{ color: "#605e5c" }}>
          Seguimiento propio de normativas y riesgos regulatorios · se actualiza con los registros guardados
        </p>
      </div>

      <nav role="tablist" aria-label="Secciones de cumplimiento" className="flex flex-wrap gap-2 border-b" style={{ borderColor: "#e1dfdd" }}>
        {([
          { id: "normativas", label: "Normativas y riesgos regulatorios" },
          { id: "controles", label: "Controles y evidencias de gobernanza de IA" },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-3 py-2 text-[14px] font-medium border-b-2 transition-colors"
            style={{
              color: activeTab === tab.id ? "#0f6cbd" : "#605e5c",
              borderColor: activeTab === tab.id ? "#0f6cbd" : "transparent",
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "controles" && (
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: "#201f1e" }}>
              <ShieldCheck className="w-4 h-4" style={{ color: "#0f6cbd" }} />
              Matriz de controles
              <UserStoryRefs ids={["HU-015", "HU-013", "HU-014"]} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <button
              type="button"
              onClick={downloadGovernanceReport}
              disabled={governanceControls.length === 0}
              className="inline-flex items-center gap-1 rounded border px-2 py-1 font-medium disabled:opacity-50"
              style={{ borderColor: "#cce0f5", color: "#0f6cbd" }}
            >
              <Download className="h-3 w-3" /> Descargar reporte
            </button>
            <span className="rounded px-2 py-1" style={{ background: "#f3f2f1", color: "#605e5c" }}>Sin evaluar: {governanceCount("no_evaluado")}</span>
            <span className="rounded px-2 py-1" style={{ background: "#eff6ff", color: "#0f6cbd" }}>En revisión: {governanceCount("en_revision")}</span>
            <span className="rounded px-2 py-1" style={{ background: "#f1faf1", color: "#107c10" }}>Conformes: {governanceCount("conforme")}</span>
            <span className="rounded px-2 py-1" style={{ background: "#fdf3f4", color: "#a4262c" }}>Brechas: {governanceCount("brecha")}</span>
          </div>
        </div>
        {governanceError && <p role="alert" className="mb-3 rounded px-3 py-2 text-[12px]" style={{ background: "#fdf3f4", color: "#a4262c" }}>{governanceError}</p>}
        {governanceEvidenceError && <p role="alert" className="mb-3 rounded px-3 py-2 text-[12px]" style={{ background: "#fdf3f4", color: "#a4262c" }}>No se pudieron cargar las evidencias: {governanceEvidenceError}</p>}
        {governanceSaved && <p role="status" className="mb-3 text-[12px]" style={{ color: "#107c10" }}>{governanceSaved}</p>}
        {governanceLoading ? <p className="text-[12px]" style={{ color: "#8a8886" }}>Cargando controles desde PostgreSQL…</p> : governanceControls.length === 0 ? <p className="text-[12px]" style={{ color: "#8a8886" }}>No hay controles inicializados. Verifica la conexión con PostgreSQL.</p> : (
          <div>
            <nav role="tablist" aria-label="Normativas de gobernanza de IA" className="mb-3 flex flex-wrap gap-2 border-b" style={{ borderColor: "#e1dfdd" }}>
              {standardEntries.map(([standard]) => (
                <button
                  key={standard}
                  type="button"
                  role="tab"
                  aria-selected={activeStandard === standard}
                  onClick={() => setSelectedStandard(standard)}
                  className="px-3 py-2 text-[14px] font-medium border-b-2 transition-colors"
                  style={{
                    color: activeStandard === standard ? "#0f6cbd" : "#605e5c",
                    borderColor: activeStandard === standard ? "#0f6cbd" : "transparent",
                  }}
                >
                  {standard}
                </button>
              ))}
            </nav>
            {standardEntries.filter(([standard]) => standard === activeStandard).map(([standard, controls]) => (
              <section key={standard} role="tabpanel" aria-label={standard}>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                  {controls.map((control) => {
                    const draft = governanceDrafts[control.id] ?? { status: control.status, evidence: control.evidence };
                    return (
                      <article key={control.id} className="rounded p-3" style={{ border: "1px solid #edebe9" }}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5"><h3 className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>{control.focus}</h3><span className="rounded px-1 py-0.5 text-[10px]" style={{ background: "#eff6ff", color: "#0f6cbd" }}>{control.model_scope === "ambos" ? "Demanda y vial" : control.model_scope === "demanda" ? "XGBoost demanda" : "XGBoost vial"}</span></div>
                            <p className="text-[11px] mt-1" style={{ color: "#605e5c" }}>{control.objective}</p>
                          </div>
                          <span className="text-[10px] rounded px-1.5 py-1" style={{ background: control.status === "conforme" ? "#f1faf1" : control.status === "brecha" ? "#fdf3f4" : "#f3f2f1", color: control.status === "conforme" ? "#107c10" : control.status === "brecha" ? "#a4262c" : "#605e5c" }}>
                            {control.status.replace("_", " ")}
                          </span>
                        </div>
                        {canEvaluateControls ? (
                          <div className="mt-2 grid grid-cols-1 sm:grid-cols-[150px_1fr_auto] gap-2 items-end">
                            <label className="text-[10px]" style={{ color: "#605e5c" }}>Evaluación
                              <select className="mt-1 block w-full rounded border p-1.5 text-[11px]" value={draft.status} onChange={(event) => setGovernanceDrafts((current) => ({ ...current, [control.id]: { ...draft, status: event.target.value as GovernanceControlStatus } }))}>
                                <option value="no_evaluado">Sin evaluar</option><option value="en_revision">En revisión</option><option value="conforme">Conforme</option><option value="brecha">Brecha</option>
                              </select>
                            </label>
                            <div className="text-[10px]" style={{ color: "#605e5c" }}><span>Evidencia</span>
                              <span className="mt-1 block text-[10px]" style={{ color: "#8a8886" }}>Describe la evidencia o adjunta un archivo (máx. 10 MB).</span>
                              <span className="mt-1 flex flex-wrap items-center gap-2">
                                <label htmlFor={`governance-evidence-${control.id}`} className="inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-[10px]" style={{ borderColor: "#cce0f5", color: "#0f6cbd" }}>
                                  <Paperclip className="h-3 w-3" /> {uploadingEvidenceControl === control.id ? "Subiendo…" : "Elegir archivos"}
                                </label>
                                <input id={`governance-evidence-${control.id}`} type="file" className="sr-only" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg" disabled={!canEvaluateControls || uploadingEvidenceControl === control.id} onChange={(event) => {
                                    const selected = Array.from(event.currentTarget.files ?? []);
                                    event.currentTarget.value = "";
                                    void uploadGovernanceEvidence(control, selected);
                                  }} />
                                <span className="text-[10px]" style={{ color: "#8a8886" }}>PDF, Office, CSV, TXT o imagen</span>
                              </span>
                              {(governanceAttachments[control.id] ?? []).length > 0 && (
                                <span className="mt-2 grid gap-1">
                                  {(governanceAttachments[control.id] ?? []).map((file) => (
                                    <span key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1" style={{ background: "#f9f8f7" }}>
                                      <span className="inline-flex min-w-0 items-center gap-1 text-[10px]" style={{ color: "#323130" }}><FileText className="h-3 w-3 shrink-0" /><span className="truncate">{file.file_name}</span><span style={{ color: "#8a8886" }}>· {formatEvidenceSize(file.size_bytes)} · {file.uploaded_by}</span></span>
                                      <button type="button" onClick={() => void downloadGovernanceEvidence(file)} className="inline-flex items-center gap-1 text-[10px]" style={{ color: "#0f6cbd" }}><Download className="h-3 w-3" /> Descargar</button>
                                    </span>
                                  ))}
                                </span>
                              )}
                              <textarea className="mt-1 block w-full rounded border p-1.5 text-[11px]" rows={2} maxLength={5000} placeholder="Referencia o motivo de la brecha" value={draft.evidence} onChange={(event) => setGovernanceDrafts((current) => ({ ...current, [control.id]: { ...draft, evidence: event.target.value } }))} />
                            </div>
                            <button type="button" className="inline-flex items-center justify-center gap-1 rounded px-2 py-1.5 text-[11px] text-white disabled:opacity-50" style={{ background: "#0f6cbd" }} onClick={() => void saveGovernanceControl(control)} disabled={draft.status === control.status && draft.evidence === control.evidence}>
                              <Save className="w-3 h-3" /> Guardar
                            </button>
                          </div>
                        ) : (
                          <>
                          <div className="mt-2 space-y-1">
                            {(governanceAttachments[control.id] ?? []).map((file) => (
                              <div key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1 text-[10px]" style={{ background: "#f9f8f7" }}>
                                <span className="inline-flex items-center gap-1" style={{ color: "#323130" }}><FileText className="h-3 w-3" />{file.file_name} · {formatEvidenceSize(file.size_bytes)} · {file.uploaded_by}</span>
                                <button type="button" onClick={() => void downloadGovernanceEvidence(file)} className="inline-flex items-center gap-1" style={{ color: "#0f6cbd" }}><Download className="h-3 w-3" />Descargar</button>
                              </div>
                            ))}
                          </div>
                          <p className="text-[10px] mt-2" style={{ color: "#8a8886" }}>Evidencia: {control.evidence || "Pendiente"} · actualizado por {control.updated_by || "sin evaluar"}</p>
                          </>
                        )}
                        {canEvaluateControls && control.updated_by && <p className="text-[10px] mt-1" style={{ color: "#8a8886" }}>Último registro: {control.updated_by} · {new Date(control.updated_at).toLocaleString("es-PE")}</p>}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </Card>
      )}

      {activeTab === "normativas" && (
      <>
      {/* Top KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { icon: ShieldCheck, label: "Cumplimiento Global", value: `${overallProgress}%`, color: progressColor(overallProgress) },
          { icon: BookOpen,    label: "Normativas en seguimiento", value: `${normsInFollowup} de ${REGULATORY_NORMS.length}`, color: "#0f6cbd" },
          { icon: CheckCircle, label: "Normativas conformes", value: `${normsCompliant}`, color: "#107c10" },
          { icon: Clock,       label: "Normativas pendientes", value: `${REGULATORY_NORMS.length - normsCompliant}`, color: "#ca5010" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded flex items-center justify-center" style={{ background: kpi.color + "18" }}>
                <Icon className="w-4 h-4" style={{ color: kpi.color }} />
              </div>
              <div>
                <div className="text-[22px] font-semibold" style={{ color: "#201f1e" }}>{kpi.value}</div>
                <div className="text-[12px]" style={{ color: "#8a8886" }}>{kpi.label}</div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Compliance rings per normativa */}
        <div className="xl:col-span-2 space-y-3">
          <div className="text-[14px] font-semibold" style={{ color: "#201f1e" }}>Cumplimiento por Normativa</div>
          {REGULATORY_NORMS.map((norm) => {
            const tracking = complianceFollowups[norm.id];
            const estado = tracking?.status ?? "Sin iniciar";
            const sc = STATUS_COLORS[estado] ?? STATUS_COLORS["Sin iniciar"];
            return (
              <button
                key={norm.id}
                type="button"
                onClick={() => openComplianceFollowup({
                  id: norm.id,
                  type: "normativa",
                  title: norm.nombre,
                  reference: norm.tipo,
                  description: tracking ? `Fase actual: ${tracking.phase}.` : "Seguimiento sin iniciar.",
                })}
                aria-label={`Abrir seguimiento de ${norm.nombre}`}
                className="block w-full rounded bg-white p-4 text-left transition-shadow hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0f6cbd]"
                style={{ border: "1px solid #e1dfdd" }}
                disabled={complianceFollowupsLoading}
              >
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-[12px] font-mono" style={{ color: "#8a8886" }}>{norm.id}</span>
                  <span className="text-[12px] px-2 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.text }}>{estado}</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: "#f3f2f1", color: "#8a8886" }}>{norm.tipo}</span>
                </div>
                <div className="text-[14px] font-medium" style={{ color: "#201f1e" }}>{norm.nombre}</div>
                <div className="text-[12px] mt-1" style={{ color: tracking ? "#0f6cbd" : "#8a8886" }}>
                  {tracking ? `Fase: ${tracking.phase} · responsable @${tracking.responsible}` : "Abrir seguimiento"}
                </div>
              </button>
            );
          })}
        </div>

        {/* Overall ring */}
        <div className="space-y-4">
          <Card className="p-4 flex flex-col items-center">
            <div className="text-[14px] font-semibold mb-3" style={{ color: "#201f1e" }}>Cumplimiento Global</div>
            <ProgressRing value={overallProgress} color={progressColor(overallProgress)} size={120} />
            <p className="text-[12px] text-center mt-3" style={{ color: "#8a8886" }}>
              Promedio del avance de {REGULATORY_NORMS.length} normativas según su seguimiento
            </p>
          </Card>
        </div>
      </div>

      {/* Regulatory risks */}
      <Card className="p-4">
        <div className="text-[14px] font-semibold mb-3" style={{ color: "#201f1e" }}>
          <Scale className="w-3.5 h-3.5 inline mr-1.5" style={{ color: "#0f6cbd" }} />
          Riesgos regulatorios identificados · {REGULATORY_RISKS.length}
        </div>
        <div className="space-y-2">
          {REGULATORY_RISKS.map(r => {
            const tracking = complianceFollowups[r.id];
            const nivel = tracking?.risk_level ?? "Sin clasificar";
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => openComplianceFollowup({
                  id: r.id,
                  type: "riesgo",
                  title: r.descripcion,
                  reference: r.normativa,
                  description: `Registrado en la app: ${formatRegistrationDate(tracking?.created_at)}.`,
                })}
                aria-label={`Abrir seguimiento del riesgo ${r.id}`}
                className="flex w-full items-center gap-4 rounded p-3 text-left transition-colors hover:bg-[#edebe9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0f6cbd]"
                style={{ background: "#f3f2f1" }}
                disabled={complianceFollowupsLoading}
              >
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: RISK_COLORS[nivel] }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium" style={{ color: "#201f1e" }}>{r.descripcion}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: "#8a8886" }}>
                    {r.normativa} · {tracking ? `Seguimiento: ${tracking.status}` : "Abrir seguimiento"}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[12px] font-medium" style={{ color: RISK_COLORS[nivel] }}>{nivel}</span>
                  <div className="flex items-center gap-1 text-[11px]" style={{ color: "#8a8886" }}>
                    <AlertTriangle className="w-3 h-3" />
                    {formatRegistrationDate(tracking?.created_at)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Card>
      {complianceFollowupsError && (
        <p role="alert" className="rounded px-3 py-2 text-[12px]" style={{ background: "#fdf3f4", color: "#a4262c" }}>
          No se pudo cargar el seguimiento de cumplimiento: {complianceFollowupsError}
        </p>
      )}
      <p className="text-[12px] px-1" style={{ color: "#8a8886" }}>
        El avance de cada normativa se calcula con su estado y fase de seguimiento (sin iniciar = 0%). AI Act e ISO/IEC 42001 son referencias conceptuales; no representan certificación ni cumplimiento organizacional real.
      </p>
      </>
      )}
      {selectedFollowup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="compliance-followup-title">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded bg-white p-4" style={{ border: "1px solid #e1dfdd" }}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="compliance-followup-title" className="text-[15px] font-semibold" style={{ color: "#201f1e" }}>
                  Seguimiento · {selectedFollowup.id}
                </h2>
                <p className="mt-1 text-[13px]" style={{ color: "#201f1e" }}>{selectedFollowup.title}</p>
                <p className="mt-1 text-[11px]" style={{ color: "#605e5c" }}>{selectedFollowup.reference} · {selectedFollowup.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFollowup(null)}
                aria-label="Cerrar seguimiento de cumplimiento"
                className="rounded px-2 py-1 text-[12px]"
                style={{ color: "#605e5c" }}
              >
                Cerrar
              </button>
            </div>

            {followupError && <p role="alert" className="mb-3 rounded px-3 py-2 text-[12px]" style={{ background: "#fdf3f4", color: "#a4262c" }}>{followupError}</p>}
            {followupNotice && <p role="status" className="mb-3 text-[12px]" style={{ color: "#107c10" }}>{followupNotice}</p>}

            <form onSubmit={(event) => void saveComplianceFollowup(event)} className="space-y-3 rounded p-3" style={{ background: "#f9f8f7" }}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-[11px] font-medium" style={{ color: "#605e5c" }}>
                  Estado del seguimiento
                  <select
                    required
                    disabled={!canManageFollowups}
                    value={followupDraft.status}
                    onChange={(event) => setFollowupDraft((current) => ({ ...current, status: event.target.value as ComplianceFollowupStatus }))}
                    className="mt-1 block w-full rounded border bg-white px-2 py-1.5 text-[12px]"
                    style={{ borderColor: "#e1dfdd" }}
                  >
                    <option value="Pendiente">Pendiente</option>
                    <option value="En curso">En curso</option>
                    {selectedFollowup.type === "normativa" && <option value="Brecha">Brecha detectada</option>}
                    {selectedFollowup.type === "normativa" && <option value="Conforme">Conforme (requiere fase Verificación o Cierre)</option>}
                    {selectedFollowup.type === "riesgo" && <option value="Mitigado">Mitigado (controles aplicados, en monitoreo)</option>}
                    {selectedFollowup.type === "riesgo" && <option value="Cerrado">Cerrado (requiere fase Cierre)</option>}
                  </select>
                </label>
                <label className="text-[11px] font-medium" style={{ color: "#605e5c" }}>
                  Fase
                  <select
                    required
                    disabled={!canManageFollowups}
                    value={followupDraft.phase}
                    onChange={(event) => setFollowupDraft((current) => ({ ...current, phase: event.target.value as ComplianceFollowupPhase }))}
                    className="mt-1 block w-full rounded border bg-white px-2 py-1.5 text-[12px]"
                    style={{ borderColor: "#e1dfdd" }}
                  >
                    <option value="Evaluación">Evaluación</option>
                    <option value="Plan de acción">Plan de acción</option>
                    <option value="Implementación">Implementación</option>
                    <option value="Verificación">Verificación</option>
                    <option value="Cierre">Cierre</option>
                  </select>
                </label>
                <label className="text-[11px] font-medium sm:col-span-2" style={{ color: "#605e5c" }}>
                  Responsable
                  <select
                    required
                    disabled={!canManageFollowups}
                    value={followupDraft.responsible}
                    onChange={(event) => setFollowupDraft((current) => ({ ...current, responsible: event.target.value }))}
                    className="mt-1 block w-full rounded border bg-white px-2 py-1.5 text-[12px]"
                    style={{ borderColor: "#e1dfdd" }}
                  >
                    <option value="">Selecciona un responsable</option>
                    {followupDraft.responsible && !managedUsers.some((account) => account.username === followupDraft.responsible && account.active && account.permissions.includes("cumplimiento")) && (
                      <option value={followupDraft.responsible} disabled>{followupDraft.responsible} · usuario sin permiso activo</option>
                    )}
                    {managedUsers.filter((account) => account.active && account.permissions.includes("cumplimiento")).map((account) => (
                      <option key={account.username} value={account.username}>{account.name} · @{account.username}</option>
                    ))}
                  </select>
                  {canManageFollowups && managedUsers.filter((account) => account.active && account.permissions.includes("cumplimiento")).length === 0 && (
                    <span className="mt-1 block font-normal" style={{ color: "#a4262c" }}>No hay usuarios activos con permiso de Cumplimiento para asignar.</span>
                  )}
                </label>
                {selectedFollowup.type === "riesgo" && (
                  <label className="text-[11px] font-medium sm:col-span-2" style={{ color: "#605e5c" }}>
                    Nivel de riesgo
                    <select
                      disabled={!canManageFollowups}
                      value={followupDraft.riskLevel}
                      onChange={(event) => setFollowupDraft((current) => ({ ...current, riskLevel: event.target.value as ComplianceRiskLevel | "" }))}
                      className="mt-1 block w-full rounded border bg-white px-2 py-1.5 text-[12px]"
                      style={{ borderColor: "#e1dfdd" }}
                    >
                      <option value="">Sin clasificar</option>
                      <option value="Crítico">Crítico</option>
                      <option value="Alto">Alto</option>
                      <option value="Medio">Medio</option>
                      <option value="Bajo">Bajo</option>
                    </select>
                  </label>
                )}
                <label className="text-[11px] font-medium sm:col-span-2" style={{ color: "#605e5c" }}>
                  Notas y acciones de seguimiento
                  <textarea
                    required
                    disabled={!canManageFollowups}
                    maxLength={5000}
                    rows={3}
                    value={followupDraft.notes}
                    onChange={(event) => setFollowupDraft((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="Describe acuerdos, acciones pendientes o resultados de la revisión"
                    className="mt-1 block w-full rounded border bg-white p-2 text-[12px]"
                    style={{ borderColor: "#e1dfdd" }}
                  />
                </label>
              </div>
              {canManageFollowups ? (
                <button type="submit" disabled={followupSaving || complianceFollowupsLoading} className="rounded px-3 py-2 text-[12px] font-medium text-white disabled:opacity-60" style={{ background: "#0f6cbd" }}>
                  {followupSaving ? "Guardando…" : "Guardar seguimiento"}
                </button>
              ) : (
                <p className="text-[11px]" style={{ color: "#8a8886" }}>Solo el Supervisor de Cumplimiento con permiso de Cumplimiento puede actualizar el seguimiento.</p>
              )}
            </form>

            <section className="mt-4 border-t pt-3" style={{ borderColor: "#edebe9" }}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>Documentos relacionados</h3>
                  <p className="mt-0.5 text-[10px]" style={{ color: "#8a8886" }}>Archivos persistidos · máximo 10 MB por documento.</p>
                </div>
                {canManageFollowups && (
                  <label className="cursor-pointer rounded border px-2 py-1.5 text-[11px] font-medium" style={{ borderColor: "#cce0f5", color: "#0f6cbd" }}>
                    {followupUploading ? "Subiendo…" : "Adjuntar documento"}
                    <input type="file" className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg" disabled={followupUploading} onChange={(event) => void uploadComplianceDocument(event)} />
                  </label>
                )}
              </div>
              {followupDocuments.length ? (
                <ul className="mt-2 space-y-1">
                  {followupDocuments.map((document) => (
                    <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1.5 text-[11px]" style={{ background: "#f9f8f7" }}>
                      <span className="inline-flex min-w-0 items-center gap-1" style={{ color: "#323130" }}>
                        <FileText className="h-3 w-3 shrink-0" />
                        <span className="truncate">{document.file_name}</span>
                        <span style={{ color: "#8a8886" }}>· {(document.size_bytes / 1024).toFixed(1)} KB · {document.uploaded_by}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <button type="button" onClick={() => void downloadComplianceDocument(document)} className="inline-flex items-center gap-1" style={{ color: "#0f6cbd" }}><Download className="h-3 w-3" />Descargar</button>
                        {canManageFollowups && (
                          <button type="button" disabled={followupDeletingDocument === document.id} onClick={() => void removeComplianceDocument(document)} className="disabled:opacity-50" style={{ color: "#a4262c" }}>
                            {followupDeletingDocument === document.id ? "Eliminando…" : "Eliminar"}
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[11px]" style={{ color: "#8a8886" }}>{followupLoading ? "Cargando documentos…" : "Aún no hay documentos adjuntos."}</p>
              )}
            </section>

            <section className="mt-4 border-t pt-3" style={{ borderColor: "#edebe9" }}>
              <h3 className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>Historial de seguimiento</h3>
              {followupLoading ? (
                <p className="mt-2 text-[11px]" style={{ color: "#8a8886" }}>Cargando historial…</p>
              ) : followupEvents.length ? (
                <ol className="mt-2 space-y-2">
                  {followupEvents.map((timelineEvent) => {
                    let detail = timelineEvent.detail;
                    if (timelineEvent.event_type === "update") {
                      try {
                        const parsed = JSON.parse(timelineEvent.detail) as { changes?: { label: string; before: string; after: string }[] };
                        detail = parsed.changes?.map((change) => `${change.label}: ${change.before || "—"} → ${change.after || "—"}`).join(" · ") || detail;
                      } catch {
                        detail = timelineEvent.detail;
                      }
                    }
                    return (
                      <li key={timelineEvent.id} className="rounded p-2 text-[11px]" style={{ background: "#f9f8f7", color: "#605e5c" }}>
                        <span className="font-medium">{new Date(timelineEvent.occurred_at).toLocaleString("es-PE")} · {timelineEvent.username}</span>
                        <p className="mt-0.5">{detail}</p>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="mt-2 text-[11px]" style={{ color: "#8a8886" }}>Todavía no hay cambios registrados.</p>
              )}
              {complianceFollowups[selectedFollowup.id]?.updated_by && (
                <p className="mt-2 text-[10px]" style={{ color: "#8a8886" }}>
                  Última actualización: {complianceFollowups[selectedFollowup.id].updated_by} · {new Date(complianceFollowups[selectedFollowup.id].updated_at).toLocaleString("es-PE")}
                </p>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
