import { loadAIGovernanceControls, loadAIGovernanceEvidence, loadAIGovernanceRisks, type GovernanceControl, type GovernanceEvidenceFile, type GovernanceRisk } from "../../app/aiGovernanceApi";
import { loadAuditDocuments, loadAuditWorkflow, loadAuditWorkflowEvents, registerAudits, type AuditDocument, type AuditWorkflow, type AuditWorkflowEvent } from "../../app/auditsApi";
import { loadComplianceFollowupDocuments, loadComplianceFollowupEvents, loadComplianceFollowups, registerComplianceItems, type ComplianceFollowup, type ComplianceFollowupDocument, type ComplianceFollowupEvent } from "../../app/complianceFollowUpApi";
import { loadDetectedRiskDocuments, loadDetectedRiskWorkflows, registerDetectedRisks, type DetectedRiskDocument, type DetectedRiskWorkflow } from "../../app/detectedRisksApi";
import { auditTemplates } from "../../app/components/AuditModule";
import { buildRiskTemplates } from "../../app/components/RiskManagement";
import { followupProgress, REGULATORY_NORMS, REGULATORY_RISKS } from "../../app/components/ComplianceModule";

export type GovernanceReportData = {
  risks: { template: ReturnType<typeof buildRiskTemplates>[number]; displayId: string; workflow?: DetectedRiskWorkflow; date: string; documents: DetectedRiskDocument[] }[];
  aiRisks: GovernanceRisk[];
  controls: GovernanceControl[];
  controlEvidence: GovernanceEvidenceFile[];
  followups: Record<string, ComplianceFollowup>;
  complianceDates: Record<string, string>;
  complianceEvents: ComplianceFollowupEvent[];
  complianceDocuments: ComplianceFollowupDocument[];
  audits: { template: (typeof auditTemplates)[number]; workflow?: AuditWorkflow; date: string; documents: AuditDocument[] }[];
  auditEvents: AuditWorkflowEvent[];
};

export type GovernanceNeeds = { risks: boolean; compliance: boolean; audits: boolean; evidence: boolean };

// Un fallo de permisos o de red en una fuente no debe impedir el resto del reporte.
async function safe<T>(request: Promise<T>, fallback: T): Promise<T> {
  try {
    return await request;
  } catch {
    return fallback;
  }
}

const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString("es-PE") : "Sin registrar");

export async function loadGovernanceReportData(needs: GovernanceNeeds): Promise<GovernanceReportData> {
  const riskTemplates = buildRiskTemplates();
  const complianceItems = [...REGULATORY_NORMS.map((norm) => ({ id: norm.id, type: "normativa" as const })), ...REGULATORY_RISKS.map((risk) => ({ id: risk.id, type: "riesgo" as const }))];

  const [riskWorkflows, riskRegistrations, riskDocuments, aiRisks] = needs.risks || needs.evidence
    ? await Promise.all([
      safe(loadDetectedRiskWorkflows(), []),
      safe(registerDetectedRisks(riskTemplates.map((risk) => risk.id)), []),
      needs.evidence ? Promise.all(riskTemplates.map((risk) => safe(loadDetectedRiskDocuments(risk.id), []))) : Promise.resolve([]),
      needs.risks ? safe(loadAIGovernanceRisks(), []) : Promise.resolve([]),
    ])
    : [[], [], [], []];

  const [controls, controlEvidence, followups, complianceRegistrations, complianceEvents, complianceDocuments] = needs.compliance || needs.audits || needs.evidence
    ? await Promise.all([
      needs.compliance ? safe(loadAIGovernanceControls(), []) : Promise.resolve([]),
      needs.compliance || needs.evidence ? safe(loadAIGovernanceEvidence(), []) : Promise.resolve([]),
      needs.compliance ? safe(loadComplianceFollowups(), []) : Promise.resolve([]),
      needs.compliance ? safe(registerComplianceItems(complianceItems.map((item) => item.id)), []) : Promise.resolve([]),
      needs.compliance ? Promise.all(complianceItems.map((item) => safe(loadComplianceFollowupEvents(item.type, item.id), []))).then((lists) => lists.flat()) : Promise.resolve([]),
      needs.compliance || needs.evidence ? Promise.all(complianceItems.map((item) => safe(loadComplianceFollowupDocuments(item.type, item.id), []))).then((lists) => lists.flat()) : Promise.resolve([]),
    ])
    : [[], [], [], [], [], []];

  const [auditWorkflows, auditRegistrations, auditEvents, auditDocuments] = needs.audits || needs.compliance || needs.evidence
    ? await Promise.all([
      safe(loadAuditWorkflow(), []),
      safe(registerAudits(auditTemplates.map((audit) => audit.id)), []),
      needs.audits ? safe(loadAuditWorkflowEvents(), []) : Promise.resolve([]),
      needs.evidence ? Promise.all(auditTemplates.map((audit) => safe(loadAuditDocuments(audit.id), []))) : Promise.resolve([]),
    ])
    : [[], [], [], []];

  const riskWorkflowById = new Map(riskWorkflows.map((item) => [item.risk_id, item]));
  const riskDateById = new Map(riskRegistrations.map((item) => [item.risk_id, item.registered_at]));
  const auditWorkflowById = new Map(auditWorkflows.map((item) => [item.audit_id, item]));
  const auditDateById = new Map(auditRegistrations.map((item) => [item.audit_id, item.registered_at]));

  return {
    risks: riskTemplates.map((template, index) => ({
      template,
      displayId: `RSG-${String(index + 1).padStart(3, "0")}`,
      workflow: riskWorkflowById.get(template.id),
      date: formatDate(riskDateById.get(template.id)),
      documents: riskDocuments[index] ?? [],
    })),
    aiRisks,
    controls,
    controlEvidence,
    followups: Object.fromEntries(followups.map((item) => [item.item_id, item])),
    complianceDates: Object.fromEntries(complianceRegistrations.map((item) => [item.item_id, formatDate(item.registered_at)])),
    complianceEvents,
    complianceDocuments,
    audits: auditTemplates.map((template, index) => ({
      template,
      workflow: auditWorkflowById.get(template.id),
      date: formatDate(auditDateById.get(template.id)),
      documents: auditDocuments[index] ?? [],
    })),
    auditEvents,
  };
}

const count = (values: string[], label: string) => `${label}: ${values.filter(Boolean).length}`;
const countBy = (values: string[], keys: string[]) => keys.map((key) => `${key}: ${values.filter((value) => value === key).length}`);
const fileSize = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
const plural = (total: number) => `${total} ${total === 1 ? "riesgo" : "riesgos"}`;
// Las fuentes traen aclaraciones largas tras " · ", "; " o " + ": el nombre corto sirve como etiqueta de gráfico.
const sourceName = (source: string) => source.split(/ · |; | \+ /)[0].replace(/\s*\(.*\)$/, "").trim();
const timestamp = (value: string) => new Date(value).toLocaleString("es-PE");

const RISK_LEVELS = ["Crítico", "Alto", "Medio", "Bajo", "Sin clasificar"];
const RISK_STATUSES = ["Activo", "En análisis", "Mitigado", "Cerrado", "Sin estado"];
const AUDIT_STATUSES = ["Pendiente", "En curso", "Completada", "Observada"];

const riskLevel = (item: GovernanceReportData["risks"][number]) => item.workflow?.risk_level ?? "Sin clasificar";
const riskStatus = (item: GovernanceReportData["risks"][number]) => item.workflow?.status ?? "Sin estado";
const auditStatus = (item: GovernanceReportData["audits"][number]) => item.workflow?.status ?? "Pendiente";
const complianceStatus = (itemId: string, followups: GovernanceReportData["followups"]) => followups[itemId]?.status ?? "Pendiente";

export function riskRows(sectionId: string, data: GovernanceReportData): string[] {
  const { risks, aiRisks } = data;
  switch (sectionId) {
    case "risks":
    case "risk-summary": return [
      `Riesgos detectados: ${risks.length}`,
      ...countBy(risks.map(riskLevel), RISK_LEVELS).map((row) => `Nivel ${row}`),
      ...countBy(risks.map(riskStatus), RISK_STATUSES).map((row) => `Estado ${row}`),
      `Riesgos de sistemas de IA registrados: ${aiRisks.length}`,
    ];
    case "risk-distribution": return [
      ...countBy(risks.map(riskLevel), RISK_LEVELS).map((row) => `Nivel ${row}`),
      ...countBy(risks.map(riskStatus), RISK_STATUSES).map((row) => `Estado ${row}`),
    ];
    case "risk-process": {
      const processes = [...new Set(risks.map((item) => item.template.proceso ?? "Sin proceso asignado"))];
      return processes.map((process) => `${process}: ${plural(risks.filter((item) => (item.template.proceso ?? "Sin proceso asignado") === process).length)}`);
    }
    case "risk-details": return risks.map((item) => [
      item.displayId, riskLevel(item), riskStatus(item), item.workflow?.phase ?? "Sin etapa", item.workflow?.responsible || "Sin responsable", item.date,
      item.template.descripcion, `Fuente: ${item.template.fuente}`, item.workflow?.notes ? `Notas: ${item.workflow.notes}` : "",
    ].filter(Boolean).join(" · "));
    case "risk-anomalies": return aiRisks.map((risk) =>
      `${risk.id} · ${risk.model_name} · ${risk.category} · probabilidad ${risk.likelihood} × impacto ${risk.impact} · ${risk.status} · Responsable: ${risk.owner || "Sin responsable"} · ${risk.description}`);
    case "risk-recommendations": return risks.map((item) => `${item.displayId} · ${item.template.recomendacion}`);
    case "risk-sources": return risks.map((item) => `${item.displayId} · ${sourceName(item.template.fuente)} · ${item.template.departamento}`);
    case "risk-evidence": return risks.flatMap((item) => item.documents.map((doc) => `${item.displayId} · ${doc.file_name} · ${doc.media_type} · ${fileSize(doc.size_bytes)} · Subido por ${doc.uploaded_by} · ${timestamp(doc.created_at)}`));
    default: return [];
  }
}

export function complianceRows(sectionId: string, data: GovernanceReportData): string[] {
  const { followups, complianceDates, controls } = data;
  const normRow = (norm: (typeof REGULATORY_NORMS)[number]) => {
    const followup = followups[norm.id];
    return [norm.id, complianceStatus(norm.id, followups), norm.tipo, followup?.phase ?? "Sin etapa", followup?.responsible || "Sin responsable", complianceDates[norm.id] ?? "Sin registrar", norm.nombre, `Avance ${followupProgress(followup)}%`].join(" · ");
  };
  const controlRow = (control: GovernanceControl) =>
    `${control.id} · ${control.standard} · ${control.focus} · ${control.status.replace("_", " ")} · ${control.objective}${control.updated_by ? ` · Actualizado por ${control.updated_by}` : ""}`;
  switch (sectionId) {
    case "compliance":
    case "compliance-indicators": {
      const conformes = REGULATORY_NORMS.filter((norm) => ["Conforme", "Cerrado"].includes(complianceStatus(norm.id, followups))).length;
      const overall = Math.round(REGULATORY_NORMS.reduce((sum, norm) => sum + followupProgress(followups[norm.id]), 0) / REGULATORY_NORMS.length);
      return [
        `Cumplimiento global: ${overall}%`,
        `Normativas conformes: ${conformes} de ${REGULATORY_NORMS.length}`,
        `Normativas pendientes: ${REGULATORY_NORMS.length - conformes}`,
        `Normativas en seguimiento: ${REGULATORY_NORMS.filter((norm) => followups[norm.id]).length}`,
        `Riesgos regulatorios identificados: ${REGULATORY_RISKS.length}`,
        `Controles de gobernanza conformes: ${controls.filter((control) => control.status === "conforme").length} de ${controls.length}`,
      ];
    }
    case "norms": return REGULATORY_NORMS.map(normRow);
    case "controls-done": return controls.filter((control) => control.status === "conforme").map(controlRow);
    case "controls-pending": return controls.filter((control) => control.status !== "conforme").map(controlRow);
    case "regulatory-risks": return REGULATORY_RISKS.map((risk) => {
      const followup = followups[risk.id];
      return [risk.id, complianceStatus(risk.id, followups), followup?.risk_level ? `Nivel ${followup.risk_level}` : "Sin nivel", followup?.phase ?? "Sin etapa", followup?.responsible || "Sin responsable", complianceDates[risk.id] ?? "Sin registrar", risk.descripcion, risk.normativa].join(" · ");
    });
    case "compliance-history": return [...data.complianceEvents]
      .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
      .map((event) => `${timestamp(event.occurred_at)} · ${event.item_id} · ${event.username} · ${event.event_type === "document" ? "Documento" : "Actualización"}`);
    case "related-audits": return data.audits.map(auditRow);
    case "evidence-compliance":
    case "compliance-evidence": return [
      ...data.complianceDocuments.map((doc) => `${doc.item_id} · ${doc.file_name} · ${doc.media_type} · ${fileSize(doc.size_bytes)} · Subido por ${doc.uploaded_by} · ${timestamp(doc.created_at)}`),
      ...data.controlEvidence.map((file) => `${file.control_id} · ${file.file_name} · ${file.media_type} · ${fileSize(file.size_bytes)} · Subido por ${file.uploaded_by} · ${timestamp(file.created_at)}`),
    ];
    default: return [];
  }
}

function auditRow(item: GovernanceReportData["audits"][number]): string {
  const { template, workflow } = item;
  return [template.id, auditStatus(item), workflow?.phase ?? "Sin etapa", workflow?.responsible || "Sin responsable", item.date, template.tipo, `Administrado: ${template.administrado}`, template.hallazgos].join(" · ");
}

export function auditRows(sectionId: string, data: GovernanceReportData): string[] {
  const { audits } = data;
  switch (sectionId) {
    case "audits":
    case "audit-summary": return [
      `Auditorías registradas: ${audits.length}`,
      ...countBy(audits.map(auditStatus), AUDIT_STATUSES).map((row) => `Estado ${row}`),
      count(audits.filter((item) => item.workflow?.responsible).map((item) => item.template.id), "Con responsable asignado"),
    ];
    case "audits-pending": return audits.filter((item) => auditStatus(item) === "Pendiente").map(auditRow);
    case "audits-completed": return audits.filter((item) => auditStatus(item) === "Completada").map(auditRow);
    case "audits-progress": return audits.filter((item) => auditStatus(item) === "En curso").map(auditRow);
    case "audits-observed": return audits.filter((item) => auditStatus(item) === "Observada").map(auditRow);
    case "audit-history": return [...data.auditEvents]
      .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
      .map((event) => `${timestamp(event.occurred_at)} · ${event.audit_id} · ${event.username} · ${event.event_type === "document" ? "Documento" : "Actualización"}`);
    case "evidence-audit":
    case "audit-evidence": return audits.flatMap((item) => item.documents.map((doc) => `${item.template.id} · ${doc.category} · ${doc.file_name} · ${doc.media_type} · ${fileSize(doc.size_bytes)} · Subido por ${doc.uploaded_by} · ${timestamp(doc.created_at)}`));
    default: return [];
  }
}

export type ReportChartItem = { label: string; value: number; color: string };
export type ReportChart = { title: string; items: ReportChartItem[]; unit?: string };
export type ReportKpi = { label: string; value: string; color: string };
export type ReportVisuals = { kpis?: ReportKpi[]; charts?: ReportChart[] };

const LEVEL_COLORS: Record<string, string> = { "Crítico": "#a4262c", Alto: "#ca5010", Medio: "#986f0b", Bajo: "#107c10", "Sin clasificar": "#8a8886" };
const RISK_STATUS_COLORS: Record<string, string> = { Activo: "#a4262c", "En análisis": "#ca5010", Mitigado: "#107c10", Cerrado: "#605e5c", "Sin estado": "#8a8886" };
const AUDIT_STATUS_COLORS: Record<string, string> = { Pendiente: "#8a8886", "En curso": "#0f6cbd", Completada: "#107c10", Observada: "#a4262c" };
const FOLLOWUP_COLORS: Record<string, string> = { Pendiente: "#8a8886", "En curso": "#0f6cbd", Conforme: "#107c10", Brecha: "#a4262c", Mitigado: "#107c10", Cerrado: "#605e5c" };
const CONTROL_LABELS: Record<string, [string, string]> = { conforme: ["Conforme", "#107c10"], en_revision: ["En revisión", "#0f6cbd"], brecha: ["Brecha", "#a4262c"], no_evaluado: ["Sin evaluar", "#8a8886"] };

function tally(values: string[], colors: Record<string, string>): ReportChartItem[] {
  return Object.keys(colors).map((label) => ({ label, value: values.filter((value) => value === label).length, color: colors[label] }));
}

export function visualsFor(sectionId: string, data: GovernanceReportData): ReportVisuals {
  const { risks, audits, followups, controls } = data;
  const levels = { title: "Riesgos por nivel", items: tally(risks.map(riskLevel), LEVEL_COLORS) };
  const statuses = { title: "Riesgos por estado", items: tally(risks.map(riskStatus), RISK_STATUS_COLORS) };
  const auditStates = { title: "Auditorías por estado", items: tally(audits.map(auditStatus), AUDIT_STATUS_COLORS) };
  switch (sectionId) {
    case "risks":
    case "risk-summary": return {
      kpis: [
        { label: "Riesgos detectados", value: String(risks.length), color: "#0f6cbd" },
        { label: "Críticos y altos", value: String(risks.filter((item) => ["Crítico", "Alto"].includes(riskLevel(item))).length), color: "#a4262c" },
        { label: "Activos", value: String(risks.filter((item) => riskStatus(item) === "Activo").length), color: "#ca5010" },
        { label: "Mitigados o cerrados", value: String(risks.filter((item) => ["Mitigado", "Cerrado"].includes(riskStatus(item))).length), color: "#107c10" },
      ],
      charts: [levels, statuses],
    };
    case "risk-distribution": return { charts: [levels, statuses] };
    case "risk-process": {
      const processes = [...new Set(risks.map((item) => item.template.proceso ?? "Sin proceso asignado"))];
      return { charts: [{ title: "Riesgos por proceso", items: processes.map((process) => ({ label: process, value: risks.filter((item) => (item.template.proceso ?? "Sin proceso asignado") === process).length, color: "#0f6cbd" })) }] };
    }
    case "risk-sources": {
      const sources = [...new Set(risks.map((item) => sourceName(item.template.fuente)))];
      return { charts: [{ title: "Riesgos por fuente", items: sources.map((source) => ({ label: source, value: risks.filter((item) => sourceName(item.template.fuente) === source).length, color: "#8764b8" })) }] };
    }
    case "compliance":
    case "compliance-indicators": {
      const conformes = REGULATORY_NORMS.filter((norm) => ["Conforme", "Cerrado"].includes(complianceStatus(norm.id, followups))).length;
      const overall = Math.round(REGULATORY_NORMS.reduce((sum, norm) => sum + followupProgress(followups[norm.id]), 0) / REGULATORY_NORMS.length);
      return {
        kpis: [
          { label: "Cumplimiento global", value: `${overall}%`, color: "#0f6cbd" },
          { label: "Normativas conformes", value: `${conformes}/${REGULATORY_NORMS.length}`, color: "#107c10" },
          { label: "Normativas pendientes", value: String(REGULATORY_NORMS.length - conformes), color: "#ca5010" },
          { label: "Riesgos regulatorios", value: String(REGULATORY_RISKS.length), color: "#a4262c" },
        ],
        charts: [
          { title: "Avance por normativa", unit: "%", items: REGULATORY_NORMS.map((norm) => ({ label: norm.id, value: followupProgress(followups[norm.id]), color: "#0f6cbd" })) },
          { title: "Controles de gobernanza por estado", items: Object.entries(CONTROL_LABELS).map(([key, [label, color]]) => ({ label, value: controls.filter((control) => control.status === key).length, color })) },
        ],
      };
    }
    case "norms": return { charts: [{ title: "Normativas por estado", items: tally(REGULATORY_NORMS.map((norm) => complianceStatus(norm.id, followups)), FOLLOWUP_COLORS) }] };
    case "regulatory-risks": return { charts: [{ title: "Riesgos regulatorios por estado", items: tally(REGULATORY_RISKS.map((risk) => complianceStatus(risk.id, followups)), FOLLOWUP_COLORS) }] };
    case "controls-done":
    case "controls-pending": return { charts: [{ title: "Controles de gobernanza por estado", items: Object.entries(CONTROL_LABELS).map(([key, [label, color]]) => ({ label, value: controls.filter((control) => control.status === key).length, color })) }] };
    case "audits":
    case "audit-summary": return {
      kpis: [
        { label: "Auditorías", value: String(audits.length), color: "#0f6cbd" },
        { label: "Pendientes", value: String(audits.filter((item) => auditStatus(item) === "Pendiente").length), color: "#8a8886" },
        { label: "En curso", value: String(audits.filter((item) => auditStatus(item) === "En curso").length), color: "#0f6cbd" },
        { label: "Completadas", value: String(audits.filter((item) => auditStatus(item) === "Completada").length), color: "#107c10" },
        { label: "Observadas", value: String(audits.filter((item) => auditStatus(item) === "Observada").length), color: "#a4262c" },
      ],
      charts: [auditStates],
    };
    default: return {};
  }
}