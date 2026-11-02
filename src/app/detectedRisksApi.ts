import { apiFetch, apiRequest } from "./apiClient";
import type { RoadImpactInput, RoadImpactPrediction } from "./riskAssessmentsApi";

export type DetectedRiskStatus = "Activo" | "En análisis" | "Mitigado" | "Cerrado";
export type DetectedRiskLevel = "Crítico" | "Alto" | "Medio" | "Bajo";
export type DetectedRiskPhase =
  | "Identificación"
  | "Análisis"
  | "Plan de tratamiento"
  | "Implementación"
  | "Monitoreo y cierre";

export type DetectedRiskWorkflow = {
  risk_id: string;
  status: DetectedRiskStatus | null;
  risk_level: DetectedRiskLevel | null;
  phase: DetectedRiskPhase;
  responsible: string;
  notes: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DetectedRiskRegistration = {
  risk_id: string;
  registered_at: string;
};

export type DetectedRiskEvent = {
  id: number;
  risk_id: string;
  event_type: "update" | "document";
  detail: string;
  username: string;
  occurred_at: string;
};

export type DetectedRiskDocument = {
  id: string;
  risk_id: string;
  file_name: string;
  media_type: string;
  size_bytes: number;
  checksum: string;
  uploaded_by: string;
  created_at: string;
};

export type DetectedRiskRoadEvaluation = {
  risk_id: string;
  inputs: RoadImpactInput;
  result: RoadImpactPrediction;
  evaluated_by: string;
  evaluated_at: string;
};

export function loadDetectedRiskWorkflows(): Promise<DetectedRiskWorkflow[]> {
  return apiRequest<DetectedRiskWorkflow[]>("/api/detected-risks/workflow");
}

export function registerDetectedRisks(riskIds: string[]): Promise<DetectedRiskRegistration[]> {
  return apiRequest<DetectedRiskRegistration[]>("/api/detected-risks/registrations", {
    method: "POST",
    body: JSON.stringify({ risk_ids: riskIds }),
  });
}

export function loadDetectedRiskEvents(riskId: string): Promise<DetectedRiskEvent[]> {
  return apiRequest<DetectedRiskEvent[]>(`/api/detected-risks/events?risk_id=${encodeURIComponent(riskId)}`);
}

export function loadDetectedRiskRoadEvaluation(riskId: string): Promise<DetectedRiskRoadEvaluation | null> {
  return apiRequest<DetectedRiskRoadEvaluation | null>(`/api/detected-risks/${encodeURIComponent(riskId)}/road-evaluation`);
}

export function evaluateDetectedRiskRoadImpact(
  riskId: string,
  input: RoadImpactInput,
): Promise<DetectedRiskRoadEvaluation> {
  return apiRequest<DetectedRiskRoadEvaluation>(`/api/detected-risks/${encodeURIComponent(riskId)}/road-evaluation`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateDetectedRiskWorkflow(
  riskId: string,
  workflow: {
    status: DetectedRiskStatus;
    risk_level: DetectedRiskLevel;
    phase: DetectedRiskPhase;
    responsible: string;
    notes: string;
  },
): Promise<DetectedRiskWorkflow> {
  return apiRequest<DetectedRiskWorkflow>(`/api/detected-risks/${encodeURIComponent(riskId)}/workflow`, {
    method: "PATCH",
    body: JSON.stringify(workflow),
  });
}

export function loadDetectedRiskDocuments(riskId: string): Promise<DetectedRiskDocument[]> {
  return apiRequest<DetectedRiskDocument[]>(`/api/detected-risks/${encodeURIComponent(riskId)}/documents`);
}

export async function uploadDetectedRiskDocument(
  riskId: string,
  file: File,
): Promise<DetectedRiskDocument> {
  const form = new FormData();
  form.append("file", file);
  const response = await apiFetch(`/api/detected-risks/${encodeURIComponent(riskId)}/documents`, {
    method: "POST",
    body: form,
  });
  return response.json() as Promise<DetectedRiskDocument>;
}

export async function downloadDetectedRiskDocument(documentId: string): Promise<Blob> {
  const response = await apiFetch(`/api/detected-risks/documents/${encodeURIComponent(documentId)}/download`);
  return response.blob();
}

export async function deleteDetectedRiskDocument(documentId: string): Promise<void> {
  await apiFetch(`/api/detected-risks/documents/${encodeURIComponent(documentId)}`, { method: "DELETE" });
}
