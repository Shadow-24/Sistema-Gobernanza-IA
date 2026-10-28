import { RadialBarChart, RadialBar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { CheckCircle, Clock, AlertTriangle, Scale, BookOpen, ShieldCheck, Save, Paperclip, Download, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { UserStoryRefs } from "./UserStoryRefs";
import { useAuth } from "../AuthContext";
import { downloadAIGovernanceEvidence, loadAIGovernanceControls, loadAIGovernanceEvidence, updateAIGovernanceControl, uploadAIGovernanceEvidence, type GovernanceControl, type GovernanceControlStatus, type GovernanceEvidenceFile } from "../aiGovernanceApi";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded ${className}`} style={{ border: "1px solid #e1dfdd" }}>{children}</div>;
}

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
        fontSize={13} fontWeight={700} fill={color}>{value}%</text>
    </svg>
  );
}

const complianceByYear: Record<string, {
  overall: number; normativas: number; controlesRealizados: number; controlesPendientes: number;
  normativaList: { nombre: string; tipo: string; cumplimiento: number; estado: string; controles: number; pendientes: number }[];
  riesgosRegulatorios: { id: string; descripcion: string; nivel: string; normativa: string; fechaLimite: string }[];
  historico: { periodo: string; cumplimiento: number; controles: number }[];
}> = {
  "2024": {
    overall: 95,
    normativas: 6,
    controlesRealizados: 47,
    controlesPendientes: 8,
    normativaList: [
      { nombre: "Reglamento para la Protección Ambiental (D.S. 039-2014-EM)", tipo: "Ambiental", cumplimiento: 96, estado: "Conforme", controles: 12, pendientes: 1 },
      { nombre: "Normas técnicas OEFA – Hidrocarburos Mayores", tipo: "Fiscalización", cumplimiento: 94, estado: "Conforme", controles: 10, pendientes: 2 },
      { nombre: "Ley SINADA – Gestión de denuncias ambientales", tipo: "Administrativo", cumplimiento: 91, estado: "En revisión", controles: 8, pendientes: 3 },
      { nombre: "Norma técnica CDCLy – Instalaciones fijas", tipo: "Técnico", cumplimiento: 98, estado: "Conforme", controles: 9, pendientes: 0 },
      { nombre: "AI Act Framework (referencia UE) – Gobernanza IA", tipo: "Referencia", cumplimiento: 88, estado: "Evaluación conceptual", controles: 5, pendientes: 2 },
      { nombre: "ISO/IEC 42001 – Gestión de Sistemas de IA", tipo: "Referencia", cumplimiento: 82, estado: "Evaluación conceptual", controles: 3, pendientes: 3 },
    ],
    riesgosRegulatorios: [
      { id: "RRG-001", descripcion: "Incumplimiento plazo medidas correctivas PLUSPETROL Lote 192", nivel: "Alto", normativa: "D.S. 039-2014-EM", fechaLimite: "31/01/2025" },
      { id: "RRG-002", descripcion: "879 denuncias SINADA sin resolución superan tiempo normativo", nivel: "Medio", normativa: "Ley SINADA", fechaLimite: "30/06/2025" },
      { id: "RRG-003", descripcion: "Referencia ISO/IEC 42001 pendiente de evaluación conceptual", nivel: "Medio", normativa: "ISO/IEC 42001 · sin certificación", fechaLimite: "31/12/2025" },
      { id: "RRG-004", descripcion: "Documentación modelo IA sin validar para AI Act", nivel: "Bajo", normativa: "AI Act UE (ref.)", fechaLimite: "30/09/2025" },
    ],
    historico: [
      { periodo: "Q3 2024", cumplimiento: 93, controles: 38 },
      { periodo: "Q4 2024", cumplimiento: 95, controles: 47 },
    ],
  },
  "2025": {
    overall: 92,
    normativas: 6,
    controlesRealizados: 14,
    controlesPendientes: 11,
    normativaList: [
      { nombre: "Reglamento para la Protección Ambiental (D.S. 039-2014-EM)", tipo: "Ambiental", cumplimiento: 91, estado: "En revisión", controles: 4, pendientes: 3 },
      { nombre: "Normas técnicas OEFA – Hidrocarburos Mayores", tipo: "Fiscalización", cumplimiento: 88, estado: "En revisión", controles: 3, pendientes: 3 },
      { nombre: "Ley SINADA – Gestión de denuncias ambientales", tipo: "Administrativo", cumplimiento: 90, estado: "Conforme", controles: 3, pendientes: 2 },
      { nombre: "Norma técnica CDCLy – Instalaciones fijas", tipo: "Técnico", cumplimiento: 98, estado: "Conforme", controles: 2, pendientes: 0 },
      { nombre: "AI Act Framework (referencia UE) – Gobernanza IA", tipo: "Referencia", cumplimiento: 85, estado: "Evaluación conceptual", controles: 1, pendientes: 2 },
      { nombre: "ISO/IEC 42001 – Gestión de Sistemas de IA", tipo: "Referencia", cumplimiento: 82, estado: "Evaluación conceptual", controles: 1, pendientes: 2 },
    ],
    riesgosRegulatorios: [
      { id: "RRG-001", descripcion: "Medidas correctivas PLUSPETROL – plazo vencido Q4 2024", nivel: "Crítico", normativa: "D.S. 039-2014-EM", fechaLimite: "15/04/2025" },
      { id: "RRG-002", descripcion: "879 denuncias SINADA sin resolver – sobrepasan tiempo normativo", nivel: "Alto", normativa: "Ley SINADA", fechaLimite: "30/06/2025" },
      { id: "RRG-003", descripcion: "Referencia ISO/IEC 42001 pendiente de evaluación conceptual", nivel: "Medio", normativa: "ISO/IEC 42001 · sin certificación", fechaLimite: "31/12/2025" },
    ],
    historico: [
      { periodo: "Q3 2024", cumplimiento: 93, controles: 38 },
      { periodo: "Q4 2024", cumplimiento: 95, controles: 47 },
      { periodo: "Q1 2025", cumplimiento: 92, controles: 14 },
    ],
  },
};

const latestComplianceYear = Object.keys(complianceByYear).sort((a, b) => Number(b) - Number(a))[0];

const RISK_COLORS: Record<string, string> = {
  Crítico: "#a4262c", Alto: "#ca5010", Medio: "#986f0b", Bajo: "#107c10",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  "Conforme":          { bg: "#f1faf1", text: "#107c10" },
  "En revisión":       { bg: "#fff8f0", text: "#ca5010" },
  "Evaluación conceptual": { bg: "#eff6ff", text: "#0f6cbd" },
};

export function ComplianceModule() {
  const d = complianceByYear[latestComplianceYear];
  const { user } = useAuth();
  const canEvaluateControls = user?.role === "Supervisor de Cumplimiento";
  const [governanceControls, setGovernanceControls] = useState<GovernanceControl[]>([]);
  const [governanceLoading, setGovernanceLoading] = useState(true);
  const [governanceError, setGovernanceError] = useState("");
  const [governanceSaved, setGovernanceSaved] = useState("");
  const [governanceDrafts, setGovernanceDrafts] = useState<Record<string, { status: GovernanceControlStatus; evidence: string }>>({});
  const [governanceAttachments, setGovernanceAttachments] = useState<Record<string, GovernanceEvidenceFile[]>>({});
  const [uploadingEvidenceControl, setUploadingEvidenceControl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([loadAIGovernanceControls(), loadAIGovernanceEvidence()])
      .then(([controls, files]) => {
        if (!active) return;
        setGovernanceControls(controls);
        setGovernanceDrafts(Object.fromEntries(controls.map((control) => [control.id, { status: control.status, evidence: control.evidence }])));
        setGovernanceAttachments(files.reduce<Record<string, GovernanceEvidenceFile[]>>((groups, file) => {
          (groups[file.control_id] ??= []).push(file);
          return groups;
        }, {}));
      })
      .catch((error: unknown) => {
        if (active) setGovernanceError(error instanceof Error ? error.message : "No se pudieron cargar los controles.");
      })
      .finally(() => { if (active) setGovernanceLoading(false); });
    return () => { active = false; };
  }, []);

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

  const governanceByStandard = governanceControls.reduce<Record<string, GovernanceControl[]>>((groups, control) => {
    (groups[control.standard] ??= []).push(control);
    return groups;
  }, {});
  const governanceCount = (status: GovernanceControlStatus) => governanceControls.filter((control) => control.status === status).length;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-[16px] font-semibold" style={{ color: "#201f1e" }}>Cumplimiento Normativo</h1><UserStoryRefs ids={["HU-014", "HU-015"]} /></div>
        <p className="text-[11px] mt-0.5" style={{ color: "#605e5c" }}>
          Último escenario demostrativo disponible · referencias del estudio · {latestComplianceYear}
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: "#201f1e" }}>
              <ShieldCheck className="w-4 h-4" style={{ color: "#0f6cbd" }} />
              Controles y evidencias de gobernanza de IA
              <UserStoryRefs ids={["HU-011", "HU-012", "HU-013", "HU-014", "HU-015", "HU-016", "HU-021", "HU-022", "HU-025", "HU-026"]} />
            </div>
            <p className="text-[10px] mt-1" style={{ color: "#605e5c" }}>
              Registro central de evidencias y responsables. Los controles aplicables se muestran junto a cada evaluación XGBoost.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[9px]">
            <span className="rounded px-2 py-1" style={{ background: "#f3f2f1", color: "#605e5c" }}>Sin evaluar: {governanceCount("no_evaluado")}</span>
            <span className="rounded px-2 py-1" style={{ background: "#eff6ff", color: "#0f6cbd" }}>En revisión: {governanceCount("en_revision")}</span>
            <span className="rounded px-2 py-1" style={{ background: "#f1faf1", color: "#107c10" }}>Conformes con evidencia: {governanceCount("conforme")}</span>
            <span className="rounded px-2 py-1" style={{ background: "#fdf3f4", color: "#a4262c" }}>Brechas: {governanceCount("brecha")}</span>
          </div>
        </div>
        {governanceError && <p role="alert" className="mb-3 rounded px-3 py-2 text-[10px]" style={{ background: "#fdf3f4", color: "#a4262c" }}>{governanceError}</p>}
        {governanceSaved && <p role="status" className="mb-3 text-[10px]" style={{ color: "#107c10" }}>{governanceSaved}</p>}
        {governanceLoading ? <p className="text-[10px]" style={{ color: "#8a8886" }}>Cargando controles desde PostgreSQL…</p> : governanceControls.length === 0 ? <p className="text-[10px]" style={{ color: "#8a8886" }}>No hay controles inicializados. Verifica la conexión con PostgreSQL.</p> : (
          <div className="space-y-4">
            {Object.entries(governanceByStandard).map(([standard, controls]) => (
              <section key={standard}>
                <h2 className="text-[10px] font-semibold mb-2" style={{ color: "#323130" }}>{standard}</h2>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                  {controls.map((control) => {
                    const draft = governanceDrafts[control.id] ?? { status: control.status, evidence: control.evidence };
                    return (
                      <article key={control.id} className="rounded p-3" style={{ border: "1px solid #edebe9" }}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5"><h3 className="text-[10px] font-semibold" style={{ color: "#201f1e" }}>{control.focus}</h3><span className="rounded px-1 py-0.5 text-[8px]" style={{ background: "#eff6ff", color: "#0f6cbd" }}>{control.model_scope === "ambos" ? "Demanda y vial" : control.model_scope === "demanda" ? "XGBoost demanda" : "XGBoost vial"}</span></div>
                            <p className="text-[9px] mt-1" style={{ color: "#605e5c" }}>{control.objective}</p>
                          </div>
                          <span className="text-[8px] rounded px-1.5 py-1" style={{ background: control.status === "conforme" ? "#f1faf1" : control.status === "brecha" ? "#fdf3f4" : "#f3f2f1", color: control.status === "conforme" ? "#107c10" : control.status === "brecha" ? "#a4262c" : "#605e5c" }}>
                            {control.status.replace("_", " ")}
                          </span>
                        </div>
                        {canEvaluateControls ? (
                          <div className="mt-2 grid grid-cols-1 sm:grid-cols-[150px_1fr_auto] gap-2 items-end">
                            <label className="text-[8px]" style={{ color: "#605e5c" }}>Evaluación
                              <select className="mt-1 block w-full rounded border p-1.5 text-[9px]" value={draft.status} onChange={(event) => setGovernanceDrafts((current) => ({ ...current, [control.id]: { ...draft, status: event.target.value as GovernanceControlStatus } }))}>
                                <option value="no_evaluado">Sin evaluar</option><option value="en_revision">En revisión</option><option value="conforme">Conforme</option><option value="brecha">Brecha</option>
                              </select>
                            </label>
                            <div className="text-[8px]" style={{ color: "#605e5c" }}><span>Evidencia / referencia</span>
                              <span className="mt-1 block text-[8px]" style={{ color: "#8a8886" }}>Escribe una referencia o adjunta el documento; guardaremos su nombre y huella SHA-256.</span>
                              <span className="mt-1 flex flex-wrap items-center gap-2">
                                <label htmlFor={`governance-evidence-${control.id}`} className="inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-[8px]" style={{ borderColor: "#cce0f5", color: "#0f6cbd" }}>
                                  <Paperclip className="h-3 w-3" /> {uploadingEvidenceControl === control.id ? "Subiendo…" : "Elegir archivos"}
                                </label>
                                <input id={`governance-evidence-${control.id}`} type="file" className="sr-only" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg" disabled={!canEvaluateControls || uploadingEvidenceControl === control.id} onChange={(event) => {
                                    const selected = Array.from(event.currentTarget.files ?? []);
                                    event.currentTarget.value = "";
                                    void uploadGovernanceEvidence(control, selected);
                                  }} />
                                <span className="text-[8px]" style={{ color: "#8a8886" }}>PDF, Word, Excel, CSV, TXT o imagen · hasta 10 MB</span>
                              </span>
                              {(governanceAttachments[control.id] ?? []).length > 0 && (
                                <span className="mt-2 grid gap-1">
                                  {(governanceAttachments[control.id] ?? []).map((file) => (
                                    <span key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1" style={{ background: "#f9f8f7" }}>
                                      <span className="inline-flex min-w-0 items-center gap-1 text-[8px]" style={{ color: "#323130" }}><FileText className="h-3 w-3 shrink-0" /><span className="truncate">{file.file_name}</span><span style={{ color: "#8a8886" }}>· {formatEvidenceSize(file.size_bytes)} · {file.uploaded_by}</span></span>
                                      <button type="button" onClick={() => void downloadGovernanceEvidence(file)} className="inline-flex items-center gap-1 text-[8px]" style={{ color: "#0f6cbd" }}><Download className="h-3 w-3" /> Descargar</button>
                                    </span>
                                  ))}
                                </span>
                              )}
                              <textarea className="mt-1 block w-full rounded border p-1.5 text-[9px]" rows={2} maxLength={5000} placeholder="Documento, versión, enlace interno o motivo de la brecha" value={draft.evidence} onChange={(event) => setGovernanceDrafts((current) => ({ ...current, [control.id]: { ...draft, evidence: event.target.value } }))} />
                            </div>
                            <button type="button" className="inline-flex items-center justify-center gap-1 rounded px-2 py-1.5 text-[9px] text-white disabled:opacity-50" style={{ background: "#0f6cbd" }} onClick={() => void saveGovernanceControl(control)} disabled={draft.status === control.status && draft.evidence === control.evidence}>
                              <Save className="w-3 h-3" /> Guardar
                            </button>
                          </div>
                        ) : (
                          <>
                          <div className="mt-2 space-y-1">
                            {(governanceAttachments[control.id] ?? []).map((file) => (
                              <div key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1 text-[8px]" style={{ background: "#f9f8f7" }}>
                                <span className="inline-flex items-center gap-1" style={{ color: "#323130" }}><FileText className="h-3 w-3" />{file.file_name} · {formatEvidenceSize(file.size_bytes)} · {file.uploaded_by}</span>
                                <button type="button" onClick={() => void downloadGovernanceEvidence(file)} className="inline-flex items-center gap-1" style={{ color: "#0f6cbd" }}><Download className="h-3 w-3" />Descargar</button>
                              </div>
                            ))}
                          </div>
                          <p className="text-[8px] mt-2" style={{ color: "#8a8886" }}>Evidencia: {control.evidence || "Pendiente"} · actualizado por {control.updated_by || "sin evaluar"}</p>
                          </>
                        )}
                        {canEvaluateControls && control.updated_by && <p className="text-[8px] mt-1" style={{ color: "#8a8886" }}>Último registro: {control.updated_by} · {new Date(control.updated_at).toLocaleString("es-PE")}</p>}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
        <p className="text-[8px] mt-3" style={{ color: "#8a8886" }}>
          La matriz traduce temas de seguridad (ISO/IEC 27001:2022), gobernanza organizacional de IA (ISO/IEC 38507:2022) y calidad/mejora (ISO 9001:2026) a controles del proyecto. Las referencias no son una lista oficial de cláusulas ni acreditan conformidad. “Conforme” es una autoevaluación del supervisor sustentada por la evidencia descrita.
        </p>
      </Card>

      {/* Top KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { icon: ShieldCheck, label: "Cumplimiento Global", value: `${d.overall}%`, color: d.overall >= 90 ? "#107c10" : "#ca5010" },
          { icon: BookOpen,    label: "Normativas Evaluadas", value: `${d.normativas}`, color: "#0f6cbd" },
          { icon: CheckCircle, label: "Controles Realizados", value: `${d.controlesRealizados}`, color: "#107c10" },
          { icon: Clock,       label: "Controles Pendientes", value: `${d.controlesPendientes}`, color: "#ca5010" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded flex items-center justify-center" style={{ background: kpi.color + "18" }}>
                <Icon className="w-4 h-4" style={{ color: kpi.color }} />
              </div>
              <div>
                <div className="text-[20px] font-semibold" style={{ color: "#201f1e" }}>{kpi.value}</div>
                <div className="text-[10px]" style={{ color: "#8a8886" }}>{kpi.label}</div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Compliance rings per normativa */}
        <div className="xl:col-span-2">
          <Card className="p-4">
            <div className="text-[12px] font-semibold mb-4" style={{ color: "#201f1e" }}>Cumplimiento por Normativa</div>
            <div className="space-y-3">
              {d.normativaList.map((norm, i) => {
                const sc = STATUS_COLORS[norm.estado] ?? STATUS_COLORS["Conforme"];
                return (
                  <div key={i} className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="min-w-0 mr-2">
                          <div className="text-[11px] font-medium truncate" style={{ color: "#201f1e" }}>{norm.nombre}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "#f3f2f1", color: "#8a8886" }}>{norm.tipo}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: sc.bg, color: sc.text }}>{norm.estado}</span>
                          </div>
                        </div>
                        <div className="flex-shrink-0 flex items-center gap-2">
                          <span className="text-[11px] font-semibold" style={{ color: norm.cumplimiento >= 90 ? "#107c10" : norm.cumplimiento >= 80 ? "#ca5010" : "#a4262c" }}>
                            {norm.cumplimiento}%
                          </span>
                        </div>
                      </div>
                      <div className="h-2 rounded-full" style={{ background: "#f3f2f1" }}>
                        <div className="h-2 rounded-full transition-all" style={{
                          width: `${norm.cumplimiento}%`,
                          background: norm.cumplimiento >= 90 ? "#107c10" : norm.cumplimiento >= 80 ? "#ca5010" : "#a4262c",
                        }} />
                      </div>
                      <div className="flex gap-3 mt-1 text-[9px]" style={{ color: "#8a8886" }}>
                        <span>{norm.controles} controles realizados</span>
                        {norm.pendientes > 0 && <span style={{ color: "#ca5010" }}>{norm.pendientes} pendientes</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Overall ring + trend */}
        <div className="space-y-4">
          <Card className="p-4 flex flex-col items-center">
            <div className="text-[12px] font-semibold mb-3" style={{ color: "#201f1e" }}>Cumplimiento Global</div>
            <ProgressRing value={d.overall} color={d.overall >= 90 ? "#107c10" : "#ca5010"} size={120} />
            <p className="text-[10px] text-center mt-3" style={{ color: "#8a8886" }}>
              Promedio ponderado de {d.normativas} normativas evaluadas
            </p>
          </Card>

          <Card className="p-4">
            <div className="text-[12px] font-semibold mb-3" style={{ color: "#201f1e" }}>Evolución histórica del cumplimiento</div>
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={d.historico} margin={{ left: 0, right: 4, top: 0, bottom: 0 }}>
                <XAxis dataKey="periodo" tick={{ fontSize: 8, fill: "#8a8886" }} axisLine={false} tickLine={false} />
                <YAxis domain={[80, 100]} tick={{ fontSize: 8, fill: "#8a8886" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 10, border: "1px solid #e1dfdd", borderRadius: 4 }} />
                <Bar name="Cumplimiento %" dataKey="cumplimiento" fill="#0f6cbd" radius={[3, 3, 0, 0]} barSize={28} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </div>

      {/* Regulatory risks */}
      <Card className="p-4">
        <div className="text-[12px] font-semibold mb-3" style={{ color: "#201f1e" }}>
          <Scale className="w-3.5 h-3.5 inline mr-1.5" style={{ color: "#0f6cbd" }} />
          Riesgos regulatorios identificados · {d.riesgosRegulatorios.length}
        </div>
        <div className="space-y-2">
          {d.riesgosRegulatorios.map(r => (
            <div key={r.id} className="flex items-center gap-4 p-3 rounded" style={{ background: "#f3f2f1" }}>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: RISK_COLORS[r.nivel] }} />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium" style={{ color: "#201f1e" }}>{r.descripcion}</div>
                <div className="text-[9px] mt-0.5" style={{ color: "#8a8886" }}>{r.normativa}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[10px] font-medium" style={{ color: RISK_COLORS[r.nivel] }}>{r.nivel}</span>
                <div className="flex items-center gap-1 text-[9px]" style={{ color: "#8a8886" }}>
                  <AlertTriangle className="w-3 h-3" />
                  {r.fechaLimite}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <p className="text-[10px] px-1" style={{ color: "#8a8886" }}>
        Porcentajes, controles y estados son simulados para el prototipo académico. AI Act e ISO/IEC 42001 se muestran como referencias conceptuales; no representan certificación ni cumplimiento organizacional real.
      </p>
    </div>
  );
}
