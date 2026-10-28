import { ShieldAlert, User, Calendar, AlertTriangle, ChevronRight, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { csvYear, groupCount, latestCsvYear, useSectorData } from "../SectorDataContext";
import { simulatedSupplyChainRisks } from "../governanceScenarios";
import { UserStoryRefs } from "./UserStoryRefs";
import { loadRoadImpactModel, predictRoadImpact, type RoadImpactModel, type RoadImpactPrediction } from "../riskAssessmentsApi";
import { useAuth } from "../AuthContext";
import { createAIGovernanceRisk, loadAIGovernanceAlerts, loadAIGovernanceRisks, updateAIGovernanceRisk, type GovernanceAlert, type GovernanceRisk, type GovernanceRiskStatus } from "../aiGovernanceApi";
import { ModelGovernancePanel } from "./ModelGovernancePanel";

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

const risksByYear: Record<string, {
  id: string; nivel: keyof typeof RISK_LEVEL; estado: string; descripcion: string;
  fuente: string; departamento: string; responsable: string; fecha: string; recomendacion: string;
  proceso?: string; modelo?: string; confianza?: number; factores?: { name: string; percent: number }[]; simulado?: boolean; evaluacionConceptual?: boolean;
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
    { id: "RSK-007", nivel: "Crítico", estado: "Activo", descripcion: "Doble medida correctiva PLUSPETROL Lote 192 en Q1 2025 – patrón de recurrencia", fuente: "OEFA/DFAI", departamento: "LORETO", responsable: "Equipo AI Governance", fecha: "31/03/2025", recomendacion: "Priorizar revisión humana del patrón documentado y evaluar un escenario de alerta temprana." },
    { id: "RSK-008", nivel: "Alto", estado: "En análisis", descripcion: "879 denuncias SINADA sin resolución arrastradas desde 2024", fuente: "SINADA", departamento: "NACIONAL", responsable: "Compliance Officer", fecha: "15/03/2025", recomendacion: "Priorización por departamento y nivel de impacto ambiental." },
    { id: "RSK-009", nivel: "Medio", estado: "En análisis", descripcion: "Incremento de resoluciones en sector Residuos Sólidos supera HC en Q1", fuente: "OEFA/DFAI", departamento: "NACIONAL", responsable: "Data Science Team", fecha: "28/02/2025", recomendacion: "Evaluar extensión del modelo de gobernanza a sector Residuos." },
    { id: "RSK-010", nivel: "Bajo", estado: "Mitigado", descripcion: "Reconsideración Corporación Alan & Hnos. – riesgo de nulidad de RD", fuente: "OEFA/DFAI", departamento: "TACNA", responsable: "Legal & Compliance", fecha: "31/03/2025", recomendacion: "Seguimiento del proceso administrativo y documentación de evidencias." },
  ],
};

const latestRiskYear = Object.keys(risksByYear).sort((a, b) => Number(b) - Number(a))[0];

// ─── Peru simplified region map ──────────────────────────────────────────────

const peruvianRegions = [
  // North
  { id: "tumbes", name: "Tumbes", x: 48, y: 28, w: 28, h: 22, denuncias: 4 },
  { id: "piura", name: "Piura", x: 38, y: 50, w: 45, h: 40, denuncias: 45 },
  { id: "amazonas", name: "Amazonas", x: 130, y: 38, w: 40, h: 50, denuncias: 8 },
  { id: "loreto", name: "Loreto", x: 170, y: 28, w: 120, h: 120, denuncias: 36 },
  { id: "lambayeque", name: "Lambayeque", x: 50, y: 90, w: 38, h: 32, denuncias: 37 },
  { id: "cajamarca", name: "Cajamarca", x: 88, y: 80, w: 45, h: 50, denuncias: 37 },
  { id: "sanmartin", name: "San Martín", x: 140, y: 88, w: 52, h: 48, denuncias: 21 },
  // Center
  { id: "lalibertad", name: "La Libertad", x: 60, y: 122, w: 48, h: 40, denuncias: 61 },
  { id: "ancash", name: "Áncash", x: 60, y: 162, w: 48, h: 42, denuncias: 28 },
  { id: "huanuco", name: "Huánuco", x: 108, y: 130, w: 46, h: 50, denuncias: 9 },
  { id: "ucayali", name: "Ucayali", x: 154, y: 136, w: 65, h: 80, denuncias: 24 },
  { id: "pasco", name: "Pasco", x: 108, y: 180, w: 46, h: 32, denuncias: 12 },
  { id: "lima", name: "Lima", x: 54, y: 204, w: 52, h: 50, denuncias: 339 },
  { id: "junin", name: "Junín", x: 106, y: 212, w: 48, h: 42, denuncias: 51 },
  { id: "madrededios", name: "Madre de Dios", x: 219, y: 216, w: 71, h: 66, denuncias: 7 },
  // South
  { id: "ica", name: "Ica", x: 62, y: 254, w: 46, h: 48, denuncias: 33 },
  { id: "huancavelica", name: "Huancavelica", x: 108, y: 254, w: 44, h: 40, denuncias: 10 },
  { id: "ayacucho", name: "Ayacucho", x: 118, y: 294, w: 56, h: 48, denuncias: 21 },
  { id: "apurimac", name: "Apurímac", x: 152, y: 282, w: 42, h: 44, denuncias: 25 },
  { id: "cusco", name: "Cusco", x: 174, y: 282, w: 60, h: 56, denuncias: 50 },
  { id: "puno", name: "Puno", x: 194, y: 332, w: 60, h: 68, denuncias: 13 },
  { id: "arequipa", name: "Arequipa", x: 88, y: 310, w: 66, h: 68, denuncias: 55 },
  { id: "moquegua", name: "Moquegua", x: 116, y: 374, w: 50, h: 38, denuncias: 21 },
  { id: "tacna", name: "Tacna", x: 122, y: 408, w: 46, h: 34, denuncias: 17 },
  { id: "callao", name: "Callao", x: 48, y: 208, w: 22, h: 18, denuncias: 33 },
];

function getRegionColor(denuncias: number): string {
  if (denuncias >= 200) return "#a4262c";
  if (denuncias >= 50)  return "#ca5010";
  if (denuncias >= 25)  return "#0f6cbd";
  if (denuncias >= 10)  return "#8764b8";
  return "#edebe9";
}

function getRegionOpacity(denuncias: number): number {
  if (denuncias >= 200) return 0.9;
  if (denuncias >= 50)  return 0.75;
  if (denuncias >= 25)  return 0.6;
  if (denuncias >= 10)  return 0.45;
  return 0.4;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function RiskManagement() {
  const { user } = useAuth();
  const canManageGovernanceRisk = user?.role === "Supervisor de Cumplimiento";
  const [governanceRisks, setGovernanceRisks] = useState<GovernanceRisk[]>([]);
  const [governanceRiskError, setGovernanceRiskError] = useState("");
  const [governanceRiskSaved, setGovernanceRiskSaved] = useState("");
  const [governanceRiskLoading, setGovernanceRiskLoading] = useState(true);
  const [automaticAlerts, setAutomaticAlerts] = useState<GovernanceAlert[]>([]);
  const [automaticAlertsError, setAutomaticAlertsError] = useState("");
  const [automaticAlertsAt, setAutomaticAlertsAt] = useState<string | null>(null);
  const [newGovernanceRisk, setNewGovernanceRisk] = useState({
    model_name: "XGBoost · Predicción de demanda de combustibles líquidos", other_model_name: "", category: "", description: "", data_basis: "observado" as GovernanceRisk["data_basis"],
    evidence: "", likelihood: 3, impact: 3, owner: "", treatment: "",
  });
  const [riskDrafts, setRiskDrafts] = useState<Record<string, { status: GovernanceRiskStatus; treatment: string }>>({});
  const { datasets, loading, operationalData, operationalLoading, operationalError } = useSectorData();
  const complaintsYear = latestCsvYear(datasets.complaints, "FECHA DE REGISTRO");
  const risks = [
    ...risksByYear[latestRiskYear].map((risk) => ({ ...risk, evaluacionConceptual: true })),
    ...simulatedSupplyChainRisks.map((scenario) => ({
      id: scenario.id,
      nivel: scenario.level,
      estado: scenario.status,
      descripcion: scenario.description,
      fuente: scenario.source,
      departamento: scenario.department,
      responsable: scenario.owner,
      fecha: `Escenario simulado · ${latestRiskYear}`,
      recomendacion: scenario.recommendation,
      proceso: scenario.process,
      modelo: scenario.model,
      confianza: scenario.confidence,
      factores: scenario.explanation,
      simulado: true,
    })),
  ];
  const selectedComplaints = datasets.complaints.filter((row) => csvYear(row, "FECHA DE REGISTRO") === complaintsYear);
  const complaintCounts = new Map(groupCount(selectedComplaints, ["DEPARTAMENTO"]).map((item) => [
    item.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase(), item.value,
  ]));
  const mapRegions = peruvianRegions.map((region) => ({
    ...region,
    denuncias: complaintCounts.get(region.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()) ?? 0,
  }));
  const latestFineRecord = operationalData?.liquidFuels.fines.slice(-1)[0];
  const latestTransportRecord = operationalData?.naturalGas.transport.slice(-1)[0];
  const latestFuelPriceRecord = operationalData?.liquidFuels.fuelPrices.slice(-1)[0];
  const [roadModel, setRoadModel] = useState<RoadImpactModel | null>(null);
  const [roadPredictions, setRoadPredictions] = useState<Record<string, RoadImpactPrediction>>({});
  const [roadPredictingRisk, setRoadPredictingRisk] = useState<string | null>(null);
  const [roadModelError, setRoadModelError] = useState("");
  const [roadScenario, setRoadScenario] = useState({
    phenomenonClass: "", phenomenon: "", event: "", department: "", province: "", roadCode: "", roadSection: "", date: "2026-01-01",
  });

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

  const reviewAutomaticAlert = (alert: GovernanceAlert) => {
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
      });
      setGovernanceRisks((current) => [created, ...current]);
      setRiskDrafts((current) => ({ ...current, [created.id]: { status: created.status, treatment: created.treatment } }));
      setGovernanceRiskSaved("Riesgo registrado en PostgreSQL.");
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
      setGovernanceRiskSaved(`Se actualizó ${updated.id}.`);
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
        if (model.categories) {
          setRoadScenario((current) => ({
            ...current,
            phenomenonClass: model.categories?.CLASE_FENOMENO?.[0] ?? "",
            phenomenon: model.categories?.FENOMENO?.[0] ?? "",
            event: model.categories?.EVENTO?.[0] ?? "",
            department: model.categories?.DEPARTEMENTO?.[0] ?? "",
            province: model.categories?.PROVINCIA?.[0] ?? "",
            roadCode: model.categories?.RED_AFECTADA?.[0] ?? "",
            roadSection: model.categories?.TRAMO_AFECADO?.[0] ?? "",
          }));
        }
      })
      .catch((error: unknown) => { if (active) setRoadModelError(error instanceof Error ? error.message : "No se pudo cargar el modelo vial."); });
    return () => { active = false; };
  }, []);

  const handleRoadPrediction = async (event: React.FormEvent<HTMLFormElement>, riskId: string) => {
    event.preventDefault();
    setRoadPredictingRisk(riskId);
    setRoadModelError("");
    try {
      const prediction = await predictRoadImpact(roadScenario);
      setRoadPredictions((current) => ({ ...current, [riskId]: prediction }));
    } catch (error) {
      setRoadModelError(error instanceof Error ? error.message : "No se pudo evaluar el evento vial.");
    } finally {
      setRoadPredictingRisk(null);
    }
  };
  
  // Estado para expand/collapse de riesgos
  const [expandedRisks, setExpandedRisks] = useState<Set<string>>(new Set());
  
  // Estado para filtros y búsqueda
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  
  // Toggle expand/collapse
  const toggleRisk = (riskId: string) => {
    const newExpanded = new Set(expandedRisks);
    if (newExpanded.has(riskId)) {
      newExpanded.delete(riskId);
    } else {
      newExpanded.add(riskId);
    }
    setExpandedRisks(newExpanded);
  };
  
  // Filtrar riesgos según búsqueda, nivel y estado
  const filteredRisks = risks.filter(risk => {
    const matchesSearch = searchQuery === "" || 
      risk.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      risk.descripcion.toLowerCase().includes(searchQuery.toLowerCase()) ||
      risk.responsable.toLowerCase().includes(searchQuery.toLowerCase()) ||
      risk.proceso?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      risk.modelo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      risk.fuente.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesLevel = selectedLevel === null || risk.nivel === selectedLevel;
    const matchesStatus = selectedStatus === null || risk.estado === selectedStatus;
    
    return matchesSearch && matchesLevel && matchesStatus;
  });

  const counts = { Crítico: 0, Alto: 0, Medio: 0, Bajo: 0 };
  risks.forEach(r => counts[r.nivel]++);
  
  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-[16px] font-semibold" style={{ color: "#201f1e" }}>Gestión de Riesgos</h1><UserStoryRefs ids={["HU-011", "HU-012", "HU-013", "HU-021", "HU-022", "HU-025", "HU-026"]} /></div>
        <p className="text-[11px] mt-0.5" style={{ color: "#605e5c" }}>
          Riesgos conceptuales hasta {latestRiskYear} · denuncias más recientes disponibles: {complaintsYear ?? "sin datos"}
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <h2 className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>Registro de riesgos de los sistemas de IA</h2>
          <UserStoryRefs ids={["HU-011", "HU-012", "HU-013", "HU-021", "HU-022", "HU-025", "HU-026"]} />
        </div>
        <p className="text-[9px] mb-3" style={{ color: "#605e5c" }}>Registra riesgo, origen de la información, probabilidad, impacto, responsable y tratamiento. Los valores son evaluación humana; XGBoost disponible en esta aplicación no estima riesgos genéricos ni selecciona mitigaciones.</p>
        {governanceRiskError && <p role="alert" className="mb-2 rounded px-2 py-1.5 text-[9px]" style={{ background: "#fdf3f4", color: "#a4262c" }}>{governanceRiskError}</p>}
        {governanceRiskSaved && <p role="status" className="mb-2 text-[9px]" style={{ color: "#107c10" }}>{governanceRiskSaved}</p>}
        <div className="rounded p-3 mb-3" style={{ background: "#f5f9fd", border: "1px solid #cce0f5" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-[10px] font-semibold" style={{ color: "#0f6cbd" }}>Alertas automáticas de los modelos</h3><p className="text-[8px] mt-1" style={{ color: "#605e5c" }}>Se calculan con la última evaluación persistida. Son señales técnicas para revisar, no riesgos registrados ni decisiones automáticas.</p></div>
            {automaticAlertsAt && <span className="text-[8px]" style={{ color: "#8a8886" }}>Actualizadas: {new Date(automaticAlertsAt).toLocaleString("es-PE")}</span>}
          </div>
          {automaticAlertsError ? <p role="alert" className="mt-2 text-[8px]" style={{ color: "#a4262c" }}>{automaticAlertsError}</p> : governanceRiskLoading ? <p className="mt-2 text-[8px]" style={{ color: "#605e5c" }}>Calculando alertas técnicas…</p> : automaticAlerts.length === 0 ? <p className="mt-2 text-[8px]" style={{ color: "#107c10" }}>No hay alertas automáticas con los criterios definidos y la evaluación disponible.</p> : <div className="mt-2 space-y-2">{automaticAlerts.map((alert) => <div key={alert.id} className="flex flex-wrap items-start justify-between gap-2 rounded p-2" style={{ background: "#ffffff", border: "1px solid #e1dfdd" }}><div className="min-w-0 flex-1"><div className="text-[9px] font-semibold" style={{ color: "#201f1e" }}>{alert.category} · {alert.modelName}</div><p className="text-[8px] mt-1" style={{ color: "#605e5c" }}>{alert.description}</p><p className="text-[8px] mt-1" style={{ color: "#8a8886" }}>Probabilidad {alert.likelihood}/5 · impacto {alert.impact}/5</p></div><button type="button" onClick={() => reviewAutomaticAlert(alert)} className="rounded px-2 py-1.5 text-[8px] text-white" style={{ background: "#0f6cbd" }}>Revisar y registrar</button></div>)}</div>}
        </div>
        <form id="ai-risk-registration" onSubmit={(event) => void submitGovernanceRisk(event)} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 rounded p-3 mb-3" style={{ background: "#f8f8f8" }}>
          <label className="text-[8px]" style={{ color: "#605e5c" }}>Sistema/modelo<select value={newGovernanceRisk.model_name} onChange={(event) => setNewGovernanceRisk((current) => ({ ...current, model_name: event.target.value }))} className="mt-1 w-full rounded border bg-white p-1.5 text-[9px]"><option value="XGBoost · Predicción de demanda de combustibles líquidos">XGBoost · Demanda</option><option value="XGBoost · Estado inicial de emergencia vial">XGBoost · Emergencia vial</option><option value="otro">Otro sistema de IA</option></select></label>
          {newGovernanceRisk.model_name === "otro" && <label className="text-[8px]" style={{ color: "#605e5c" }}>Nombre del sistema<input required minLength={2} maxLength={160} value={newGovernanceRisk.other_model_name} onChange={(event) => setNewGovernanceRisk((current) => ({ ...current, other_model_name: event.target.value }))} className="mt-1 w-full rounded border bg-white p-1.5 text-[9px]" /></label>}
          <label className="text-[8px]" style={{ color: "#605e5c" }}>Categoría<input required minLength={2} maxLength={120} value={newGovernanceRisk.category} onChange={(event) => setNewGovernanceRisk((current) => ({ ...current, category: event.target.value }))} className="mt-1 w-full rounded border bg-white p-1.5 text-[9px]" placeholder="Datos, deriva, sesgo, seguridad…" /></label>
          <label className="text-[8px]" style={{ color: "#605e5c" }}>Base de información<select value={newGovernanceRisk.data_basis} onChange={(event) => setNewGovernanceRisk((current) => ({ ...current, data_basis: event.target.value as GovernanceRisk["data_basis"] }))} className="mt-1 w-full rounded border bg-white p-1.5 text-[9px]"><option value="observado">Observado</option><option value="sintetico">Sintético</option><option value="conceptual">Conceptual</option></select></label>
          <label className="text-[8px]" style={{ color: "#605e5c" }}>Responsable<input maxLength={160} value={newGovernanceRisk.owner} onChange={(event) => setNewGovernanceRisk((current) => ({ ...current, owner: event.target.value }))} className="mt-1 w-full rounded border bg-white p-1.5 text-[9px]" placeholder={user?.name ?? "Responsable"} /></label>
          <label className="text-[8px] sm:col-span-2" style={{ color: "#605e5c" }}>Descripción<textarea required minLength={10} maxLength={2000} rows={2} value={newGovernanceRisk.description} onChange={(event) => setNewGovernanceRisk((current) => ({ ...current, description: event.target.value }))} className="mt-1 w-full rounded border bg-white p-1.5 text-[9px]" /></label>
          <label className="text-[8px]" style={{ color: "#605e5c" }}>Evidencia o referencia{newGovernanceRisk.data_basis === "observado" && <span style={{ color: "#a4262c" }}> · obligatoria</span>}<textarea required={newGovernanceRisk.data_basis === "observado"} maxLength={5000} rows={2} value={newGovernanceRisk.evidence} onChange={(event) => setNewGovernanceRisk((current) => ({ ...current, evidence: event.target.value }))} className="mt-1 w-full rounded border bg-white p-1.5 text-[9px]" placeholder="Archivo, fecha, registro o enlace interno" /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[8px]" style={{ color: "#605e5c" }}>Probabilidad (1–5)<input type="number" required min={1} max={5} value={newGovernanceRisk.likelihood} onChange={(event) => setNewGovernanceRisk((current) => ({ ...current, likelihood: Number(event.target.value) }))} className="mt-1 w-full rounded border bg-white p-1.5 text-[9px]" /></label>
            <label className="text-[8px]" style={{ color: "#605e5c" }}>Impacto (1–5)<input type="number" required min={1} max={5} value={newGovernanceRisk.impact} onChange={(event) => setNewGovernanceRisk((current) => ({ ...current, impact: Number(event.target.value) }))} className="mt-1 w-full rounded border bg-white p-1.5 text-[9px]" /></label>
          </div>
          <label className="text-[8px] sm:col-span-3" style={{ color: "#605e5c" }}>Tratamiento propuesto<textarea required minLength={5} maxLength={3000} rows={2} value={newGovernanceRisk.treatment} onChange={(event) => setNewGovernanceRisk((current) => ({ ...current, treatment: event.target.value }))} className="mt-1 w-full rounded border bg-white p-1.5 text-[9px]" placeholder="Acción, responsable y resultado esperado" /></label>
          <div className="flex items-end"><button type="submit" className="w-full rounded px-3 py-2 text-[9px] font-medium text-white" style={{ background: "#0f6cbd" }}>Registrar riesgo</button></div>
        </form>
        {governanceRiskLoading ? <p className="text-[9px]" style={{ color: "#8a8886" }}>Cargando registro desde PostgreSQL…</p> : governanceRisks.length === 0 ? <p className="rounded p-3 text-[9px]" style={{ background: "#f3f2f1", color: "#605e5c" }}>Todavía no hay riesgos registrados. No se precargan riesgos demostrativos como si fueran hallazgos reales.</p> : (
          <div className="space-y-2">
            {governanceRisks.map((risk) => {
              const draft = riskDrafts[risk.id] ?? { status: risk.status, treatment: risk.treatment };
              return <article key={risk.id} className="rounded p-3" style={{ border: "1px solid #edebe9" }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5"><h3 className="text-[10px] font-semibold" style={{ color: "#201f1e" }}>{risk.description}</h3><span className="rounded px-1 py-0.5 text-[8px]" style={{ background: risk.data_basis === "observado" ? "#f1faf1" : "#fff8f0", color: risk.data_basis === "observado" ? "#107c10" : "#986f0b" }}>{risk.data_basis}</span><span className="rounded px-1 py-0.5 text-[8px]" style={{ background: "#f3f2f1", color: "#605e5c" }}>{risk.status.replace("_", " ")}</span></div>
                    <p className="text-[8px] mt-1" style={{ color: "#605e5c" }}>{risk.model_name} · {risk.category} · probabilidad {risk.likelihood}/5 · impacto {risk.impact}/5 · responsable: {risk.owner}</p>
                    <p className="text-[8px] mt-1" style={{ color: "#8a8886" }}>Evidencia: {risk.evidence || "Sin evidencia adjunta"} · registrado por {risk.created_by} · tratamiento: {risk.treatment}</p>
                  </div>
                </div>
                {canManageGovernanceRisk ? <div className="mt-2 grid grid-cols-1 sm:grid-cols-[150px_1fr_auto] gap-2 items-end">
                  <label className="text-[8px]" style={{ color: "#605e5c" }}>Estado<select value={draft.status} onChange={(event) => setRiskDrafts((current) => ({ ...current, [risk.id]: { ...draft, status: event.target.value as GovernanceRiskStatus } }))} className="mt-1 block w-full rounded border p-1.5 text-[9px]"><option value="identificado">Identificado</option><option value="en_tratamiento">En tratamiento</option><option value="aceptado">Aceptado</option><option value="cerrado">Cerrado</option></select></label>
                  <label className="text-[8px]" style={{ color: "#605e5c" }}>Tratamiento actualizado<textarea rows={2} maxLength={3000} value={draft.treatment} onChange={(event) => setRiskDrafts((current) => ({ ...current, [risk.id]: { ...draft, treatment: event.target.value } }))} className="mt-1 block w-full rounded border p-1.5 text-[9px]" /></label>
                  <button type="button" className="rounded px-2 py-1.5 text-[9px] text-white disabled:opacity-50" style={{ background: "#0f6cbd" }} onClick={() => void saveGovernanceRisk(risk)} disabled={draft.status === risk.status && draft.treatment === risk.treatment}>Guardar seguimiento</button>
                </div> : <p className="text-[8px] mt-2" style={{ color: "#8a8886" }}>El seguimiento y cierre requieren evaluación del Supervisor de Cumplimiento.</p>}
              </article>;
            })}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="text-[11px] font-semibold mb-2" style={{ color: "#201f1e" }}>Indicadores operativos para análisis de contexto</div>
        {operationalLoading ? (
          <p className="text-[10px]" style={{ color: "#605e5c" }}>Cargando fuentes sectoriales…</p>
        ) : operationalError ? (
          <p className="text-[10px]" role="alert" style={{ color: "#a4262c" }}>{operationalError}</p>
        ) : operationalData ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <div className="text-sm font-semibold" style={{ color: "#0f6cbd" }}>{latestTransportRecord?.packedVolume.toLocaleString("es-PE", { maximumFractionDigits: 0 }) ?? "s/d"} MMPC</div>
              <div className="text-[9px]" style={{ color: "#605e5c" }}>Transporte TGP · {latestTransportRecord?.period ?? "sin periodo"}</div>
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: "#ca5010" }}>{latestFineRecord?.count.toLocaleString("es-PE") ?? "s/d"} multas · {latestFineRecord?.uit.toLocaleString("es-PE", { maximumFractionDigits: 0 }) ?? "s/d"} UIT</div>
              <div className="text-[9px]" style={{ color: "#605e5c" }}>Multas de unidades operativas · {latestFineRecord?.period ?? "sin periodo"}</div>
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: "#8764b8" }}>S/ {latestFuelPriceRecord?.averagePrice.toFixed(2) ?? "s/d"}</div>
              <div className="text-[9px]" style={{ color: "#605e5c" }}>Precio promedio de {latestFuelPriceRecord?.product ?? "combustibles"} · {latestFuelPriceRecord?.period ?? "sin periodo"}</div>
            </div>
          </div>
        ) : null}
        <p className="text-[9px] mt-2" style={{ color: "#8a8886" }}>
          Son datos observados y contextualizan la revisión humana; no constituyen alertas ni puntajes automáticos de riesgo.
        </p>
      </Card>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                <div className="text-[18px] font-semibold" style={{ color: s.text }}>{counts[nivel]}</div>
                <div className="text-[10px]" style={{ color: "#8a8886" }}>Riesgo {nivel}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Risk List */}
        <div className="lg:col-span-3 space-y-3">
          {/* Búsqueda y filtros */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4" style={{ color: "#c8c6c4" }} />
              <input
                type="text"
                placeholder="Buscar riesgo por ID, descripción..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded text-[11px] border"
                style={{ 
                  borderColor: "#e1dfdd",
                  backgroundColor: "#ffffff"
                }}
              />
            </div>
            <select
              value={selectedStatus || ""}
              onChange={(e) => setSelectedStatus(e.target.value === "" ? null : e.target.value)}
              className="px-3 py-2 rounded text-[11px] border"
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
            </select>
          </div>

          <div className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>
            Riesgos Detectados {filteredRisks.length > 0 && <span style={{ color: "#8a8886" }}>({filteredRisks.length})</span>}
          </div>

          <div className="space-y-2">
            {filteredRisks.length === 0 ? (
              <Card className="p-6 text-center">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2" style={{ color: "#8a8886" }} />
                <p className="text-[12px]" style={{ color: "#8a8886" }}>No se encontraron riesgos con los criterios seleccionados</p>
              </Card>
            ) : (
              filteredRisks.map(risk => {
                const lvl = RISK_LEVEL[risk.nivel];
                const st = RISK_STATE[risk.estado];
                const isExpanded = expandedRisks.has(risk.id);
                
                return (
                  <Card 
                    key={risk.id} 
                    className={`p-4 cursor-pointer transition-all ${isExpanded ? "ring-2" : "hover:shadow-sm"}`}
                    style={{
                      borderColor: isExpanded ? lvl.border : "#e1dfdd",
                      backgroundColor: isExpanded ? lvl.bg : "#ffffff",
                      ringColor: isExpanded ? lvl.border : "transparent",
                    }}
                  >
                    {/* Header del riesgo */}
                    <div 
                      className="flex items-start justify-between gap-3"
                      onClick={() => toggleRisk(risk.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className="text-[10px] font-mono font-medium" style={{ color: "#8a8886" }}>{risk.id}</span>
                          {risk.simulado
                            ? <span className="px-2 py-0.5 rounded-full text-[9px]" style={{ background: "#eff6ff", color: "#0f6cbd" }}>Escenario demostrativo</span>
                            : risk.evaluacionConceptual && <span className="px-2 py-0.5 rounded-full text-[9px]" style={{ background: "#f3f2f1", color: "#605e5c" }}>Evaluación conceptual</span>}
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: lvl.bg, color: lvl.text, border: `1px solid ${lvl.border}` }}>
                            {risk.nivel}
                          </span>
                          <span className="text-[10px] font-medium" style={{ color: st.color }}>● {risk.estado}</span>
                        </div>
                        <p className="text-[12px] font-medium leading-snug mb-2" style={{ color: "#201f1e" }}>{risk.descripcion}</p>
                        
                        {!isExpanded && (
                          <div className="flex flex-wrap gap-3 text-[10px]" style={{ color: "#8a8886" }}>
                            <span className="flex items-center gap-1"><User className="w-3 h-3" />{risk.responsable}</span>
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{risk.fecha}</span>
                            <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{risk.departamento}</span>
                          </div>
                        )}
                      </div>
                      <ChevronRight 
                        className="w-5 h-5 flex-shrink-0 mt-1 transition-transform"
                        style={{ 
                          color: lvl.text,
                          transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                        }} 
                      />
                    </div>

                    {/* Contenido expandido */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 space-y-4" style={{ borderTop: `1px solid ${lvl.border}` }}>
                        
                        {/* Información detallada */}
                        <div className="grid grid-cols-2 gap-3">
                          {risk.proceso && <div>
                            <div className="text-[10px] font-medium" style={{ color: "#605e5c" }}>Proceso</div>
                            <div className="text-[11px] font-medium mt-1" style={{ color: "#201f1e" }}>{risk.proceso}</div>
                          </div>}
                          {risk.modelo && <div>
                            <div className="text-[10px] font-medium" style={{ color: "#605e5c" }}>Modelo asociado al escenario</div>
                            <div className="text-[11px] font-medium mt-1" style={{ color: "#201f1e" }}>{risk.modelo}</div>
                          </div>}
                          <div>
                            <div className="text-[10px] font-medium" style={{ color: "#605e5c" }}>Responsable</div>
                            <div className="text-[11px] font-medium flex items-center gap-1 mt-1" style={{ color: "#201f1e" }}><User className="w-3.5 h-3.5" style={{ color: lvl.text }} />{risk.responsable}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-medium" style={{ color: "#605e5c" }}>Departamento</div>
                            <div className="text-[11px] font-medium flex items-center gap-1 mt-1" style={{ color: "#201f1e" }}><AlertTriangle className="w-3.5 h-3.5" style={{ color: lvl.text }} />{risk.departamento}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-medium" style={{ color: "#605e5c" }}>Fecha identificación</div>
                            <div className="text-[11px] font-medium flex items-center gap-1 mt-1" style={{ color: "#201f1e" }}><Calendar className="w-3.5 h-3.5" style={{ color: lvl.text }} />{risk.fecha}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-medium" style={{ color: "#605e5c" }}>Fuente del riesgo</div>
                            <div className="text-[11px] font-medium flex items-center gap-1 mt-1" style={{ color: "#201f1e" }}><ShieldAlert className="w-3.5 h-3.5" style={{ color: lvl.text }} />{risk.fuente}</div>
                          </div>
                        </div>

                        {risk.simulado && risk.proceso === "Transporte" && (
                          <div className="rounded p-3 space-y-3" style={{ background: "#f5f9fd", border: "1px solid #cce0f5" }}>
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-[10px] font-semibold" style={{ color: "#0f6cbd" }}>Evaluación XGBoost de este riesgo vial</div>
                              <span className="rounded px-1.5 py-0.5 text-[8px]" style={{ background: "#e8f1fb", color: "#0f6cbd" }}>HU-013 · HU-025 · HU-026</span>
                            </div>
                            <ModelGovernancePanel scope="vial" modelName="XGBoost · Estado inicial de emergencia vial" />
                            {!roadModel ? (
                              <p className="text-[9px]" style={{ color: roadModelError ? "#a4262c" : "#605e5c" }}>{roadModelError || "Cargando el modelo XGBoost y su evaluación temporal…"}</p>
                            ) : !roadModel.available ? (
                              <p className="text-[9px]" style={{ color: "#605e5c" }}>{roadModel.reason}</p>
                            ) : (
                              <>
                                <p className="text-[9px]" style={{ color: "#605e5c" }}>
                                  Este escenario es conceptual. XGBoost clasifica el estado inicial de una vía en emergencias MTC; no calcula riesgo de accidente ni determina una mitigación óptima. Fuente: {roadModel.source}, {roadModel.records?.toLocaleString("es-PE")} registros; F1 macro {(roadModel.metrics!.macroF1 * 100).toFixed(1)}% frente a baseline mayoritaria {(roadModel.metrics!.majorityBaselineAccuracy * 100).toFixed(1)}%.
                                </p>
                                <form onSubmit={(event) => handleRoadPrediction(event, risk.id)} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                                  {([
                                    ["phenomenonClass", "Clase de fenómeno", "CLASE_FENOMENO"],
                                    ["phenomenon", "Fenómeno", "FENOMENO"],
                                    ["event", "Evento", "EVENTO"],
                                    ["department", "Departamento", "DEPARTEMENTO"],
                                    ["province", "Provincia", "PROVINCIA"],
                                    ["roadCode", "Código de vía", "RED_AFECTADA"],
                                    ["roadSection", "Tramo", "TRAMO_AFECADO"],
                                  ] as const).map(([key, label, category]) => (
                                    <label key={key} className="block text-[9px] font-medium" style={{ color: "#605e5c" }}>{label}
                                      <select required={key !== "province" && key !== "roadCode" && key !== "roadSection"} value={roadScenario[key]} onChange={(event) => setRoadScenario((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 w-full rounded border px-2 py-1.5 text-[10px]" style={{ borderColor: "#e1dfdd" }}>
                                        {key === "province" || key === "roadCode" || key === "roadSection" ? <option value="">No informado</option> : null}
                                        {(roadModel.categories?.[category] ?? []).map((value) => <option key={value} value={value}>{value}</option>)}
                                      </select>
                                    </label>
                                  ))}
                                  <label className="block text-[9px] font-medium" style={{ color: "#605e5c" }}>Fecha del evento
                                    <input type="date" value={roadScenario.date} onChange={(event) => setRoadScenario((current) => ({ ...current, date: event.target.value }))} className="mt-1 w-full rounded border px-2 py-1.5 text-[10px]" style={{ borderColor: "#e1dfdd" }} />
                                  </label>
                                  <div className="flex items-end"><button type="submit" disabled={roadPredictingRisk !== null} className="rounded px-3 py-1.5 text-[10px] font-medium text-white disabled:opacity-60" style={{ background: "#0f6cbd" }}>{roadPredictingRisk === risk.id ? "Evaluando…" : "Evaluar este riesgo"}</button></div>
                                </form>
                                {roadPredictions[risk.id] && (
                                  <div className="rounded p-2.5" style={{ background: "#ffffff", border: "1px solid #e1dfdd" }}>
                                    <div className="text-[10px] font-semibold" style={{ color: "#201f1e" }}>Estado vial estimado: {roadPredictions[risk.id].prediction} · confianza { (roadPredictions[risk.id].confidence * 100).toFixed(1) }%</div>
                                    <div className="text-[9px] mt-1" style={{ color: "#605e5c" }}>Probabilidades por clase: {Object.entries(roadPredictions[risk.id].probabilities).map(([label, value]) => `${label} ${(value * 100).toFixed(1)}%`).join(" · ")}. La confianza no es probabilidad de accidente.</div>
                                    <div className="text-[9px] mt-2" style={{ color: "#605e5c" }}>Acción sugerida para revisión humana: {risk.recomendacion}</div>
                                    <div className="text-[8px] mt-1" style={{ color: "#8a8886" }}>La acción procede de la ficha del riesgo; el modelo no optimiza mitigaciones ni la valida.</div>
                                  </div>
                                )}
                                {roadModelError && <p role="alert" className="text-[9px]" style={{ color: "#a4262c" }}>{roadModelError}</p>}
                                <p className="text-[8px]" style={{ color: "#8a8886" }}>{roadModel.caveat}</p>
                              </>
                            )}
                          </div>
                        )}

                        {risk.simulado && risk.proceso !== "Transporte" && (
                          <div className="rounded p-2.5 text-[9px]" style={{ background: "#fffbf0", border: "1px solid #f5e2a0", color: "#605e5c" }}>
                            XGBoost aún no puede evaluar este riesgo: el modelo disponible usa emergencias viales MTC. Se requieren datos históricos etiquetados del proceso {risk.proceso ?? "asociado"} y resultados de mitigación para entrenar y validar una evaluación pertinente.
                          </div>
                        )}

                        {/* Recomendación */}
                        <div>
                          <div className="text-[10px] font-medium mb-1.5" style={{ color: "#605e5c" }}>
                            Recomendación de mitigación
                          </div>
                          <p className="text-[11px] leading-relaxed p-2.5 rounded" style={{ 
                            color: "#201f1e",
                            background: "#f9f8f7",
                            borderLeft: `3px solid ${lvl.border}`
                          }}>
                            {risk.recomendacion}
                          </p>
                        </div>

                        <p className="text-[9px]" style={{ color: "#8a8886" }}>
                          La recomendación es orientativa. Este prototipo no ejecuta ni registra acciones de mitigación o escalamiento.
                        </p>
                      </div>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        </div>

        {/* Peru Map */}
        <div className="lg:col-span-2">
          <Card className="p-4 h-full">
            <div className="text-[12px] font-semibold mb-1" style={{ color: "#201f1e" }}>Mapa de Denuncias SINADA por Departamento</div>
            <p className="text-[9px] mb-3" style={{ color: "#8a8886" }}>Color por volumen de denuncias · Fuente: SINADA {complaintsYear ?? "sin datos"}{loading ? " · cargando" : ""}</p>

            {/* SVG Map */}
            <div className="flex justify-center">
              <svg viewBox="38 20 258 430" width="100%" style={{ maxHeight: 440 }}>
                {mapRegions.map(region => (
                  <g key={region.id} style={{ cursor: "pointer" }}>
                    <rect
                      x={region.x} y={region.y} width={region.w} height={region.h}
                      rx={3} ry={3}
                      fill={getRegionColor(region.denuncias)}
                      opacity={getRegionOpacity(region.denuncias)}
                      stroke="white" strokeWidth={1.5}
                      style={{ 
                        transition: "opacity 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        (e.target as SVGElement).style.opacity = (parseFloat((e.target as SVGElement).getAttribute('opacity') ?? '0.5') + 0.2).toString();
                        (e.target as SVGElement).style.filter = "brightness(1.1)";
                      }}
                      onMouseLeave={(e) => {
                        (e.target as SVGElement).style.opacity = getRegionOpacity(region.denuncias).toString();
                        (e.target as SVGElement).style.filter = "brightness(1)";
                      }}
                    />
                    {region.w > 35 && region.h > 25 && (
                      <text
                        x={region.x + region.w / 2}
                        y={region.y + region.h / 2 - 3}
                        textAnchor="middle"
                        fontSize={region.w > 60 ? 7.5 : 6}
                        fill="white"
                        fontWeight="600"
                        style={{ pointerEvents: "none" }}
                      >
                        {region.name.length > 9 ? region.name.substring(0, 8) + "…" : region.name}
                      </text>
                    )}
                    {region.w > 35 && region.h > 25 && (
                      <text
                        x={region.x + region.w / 2}
                        y={region.y + region.h / 2 + 8}
                        textAnchor="middle"
                        fontSize={7}
                        fill="white"
                        fontWeight="400"
                        style={{ pointerEvents: "none" }}
                      >
                        {region.denuncias}
                      </text>
                    )}
                  </g>
                ))}
              </svg>
            </div>

            {/* Legend */}
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { label: "≥200", color: "#a4262c" }, { label: "50–199", color: "#ca5010" },
                { label: "25–49", color: "#0f6cbd" }, { label: "10–24", color: "#8764b8" },
                { label: "<10", color: "#edebe9" },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm" style={{ background: l.color }} />
                  <span className="text-[9px]" style={{ color: "#8a8886" }}>{l.label}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
