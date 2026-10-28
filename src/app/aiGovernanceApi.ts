import { apiFetch, apiRequest } from "./apiClient";

export type GovernanceControlStatus = "no_evaluado" | "en_revision" | "conforme" | "brecha";

export type GovernanceControl = {
  id: string;
  standard: string;
  model_scope: "demanda" | "vial" | "ambos";
  focus: string;
  objective: string;
  status: GovernanceControlStatus;
  evidence: string;
  updated_by: string | null;
  updated_at: string;
};

export type GovernanceRiskStatus = "identificado" | "en_tratamiento" | "aceptado" | "cerrado";

export type GovernanceRisk = {
  id: string;
  model_name: string;
  category: string;
  description: string;
  data_basis: "observado" | "sintetico" | "conceptual";
  evidence: string;
  likelihood: number;
  impact: number;
  owner: string;
  treatment: string;
  status: GovernanceRiskStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type GovernanceRiskInput = Omit<GovernanceRisk, "id" | "status" | "created_by" | "created_at" | "updated_at">;

export type GovernanceEvidenceFile = {
  id: string;
  control_id: string;
  file_name: string;
  media_type: string;
  size_bytes: number;
  checksum: string;
  uploaded_by: string;
  created_at: string;
  control_evidence?: string;
};

export type GovernanceAlert = {
  id: string;
  modelName: string;
  category: string;
  description: string;
  evidence: string;
  likelihood: number;
  impact: number;
  treatment: string;
};

export function loadAIGovernanceControls(scope: "todos" | "demanda" | "vial" = "todos"): Promise<GovernanceControl[]> {
  return apiRequest<GovernanceControl[]>(`/api/ai-governance/controls?scope=${scope}`);
}

export function updateAIGovernanceControl(
  id: string,
  value: Pick<GovernanceControl, "status" | "evidence">,
): Promise<GovernanceControl> {
  return apiRequest<GovernanceControl>(`/api/ai-governance/controls/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(value),
  });
}

export function loadAIGovernanceRisks(): Promise<GovernanceRisk[]> {
  return apiRequest<GovernanceRisk[]>("/api/ai-governance/risks");
}

export function loadAIGovernanceAlerts(): Promise<{ alerts: GovernanceAlert[]; generatedAt: string }> {
  return apiRequest<{ alerts: GovernanceAlert[]; generatedAt: string }>("/api/ai-governance/alerts");
}

export function createAIGovernanceRisk(value: GovernanceRiskInput): Promise<GovernanceRisk> {
  return apiRequest<GovernanceRisk>("/api/ai-governance/risks", {
    method: "POST",
    body: JSON.stringify({
      model_name: value.model_name,
      category: value.category,
      description: value.description,
      data_basis: value.data_basis,
      evidence: value.evidence,
      likelihood: value.likelihood,
      impact: value.impact,
      owner: value.owner,
      treatment: value.treatment,
    }),
  });
}

export function updateAIGovernanceRisk(
  id: string,
  value: Pick<GovernanceRisk, "status" | "treatment">,
): Promise<GovernanceRisk> {
  return apiRequest<GovernanceRisk>(`/api/ai-governance/risks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(value),
  });
}

export function loadAIGovernanceEvidence(): Promise<GovernanceEvidenceFile[]> {
  return apiRequest<GovernanceEvidenceFile[]>("/api/ai-governance/evidence");
}

export async function uploadAIGovernanceEvidence(controlId: string, file: File): Promise<GovernanceEvidenceFile> {
  const form = new FormData();
  form.append("file", file);
  const response = await apiFetch(`/api/ai-governance/controls/${encodeURIComponent(controlId)}/evidence`, {
    method: "POST",
    body: form,
  });
  return response.json() as Promise<GovernanceEvidenceFile>;
}

export async function downloadAIGovernanceEvidence(fileId: string): Promise<Blob> {
  const response = await apiFetch(`/api/ai-governance/evidence/${encodeURIComponent(fileId)}/download`);
  return response.blob();
}
