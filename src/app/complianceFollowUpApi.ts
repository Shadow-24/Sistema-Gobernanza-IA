import { apiFetch, apiRequest } from "./apiClient";

export type ComplianceItemType = "normativa" | "riesgo";
export type ComplianceFollowupStatus = "Pendiente" | "En curso" | "Conforme" | "Brecha" | "Mitigado" | "Cerrado";
export type ComplianceFollowupPhase = "Evaluación" | "Plan de acción" | "Implementación" | "Verificación" | "Cierre";

export type ComplianceRiskLevel = "Crítico" | "Alto" | "Medio" | "Bajo";

export type ComplianceFollowup = {
  item_id: string;
  item_type: ComplianceItemType;
  status: ComplianceFollowupStatus;
  phase: ComplianceFollowupPhase;
  responsible: string;
  notes: string;
  risk_level: ComplianceRiskLevel | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ComplianceFollowupEvent = {
  id: number;
  item_id: string;
  event_type: "update" | "document";
  detail: string;
  username: string;
  occurred_at: string;
};

export type ComplianceFollowupDocument = {
  id: string;
  item_id: string;
  file_name: string;
  media_type: string;
  size_bytes: number;
  checksum: string;
  uploaded_by: string;
  created_at: string;
};

export function loadComplianceFollowups(): Promise<ComplianceFollowup[]> {
  return apiRequest<ComplianceFollowup[]>("/api/compliance/followups");
}

export type ComplianceRegistration = { item_id: string; registered_at: string };

export function registerComplianceItems(itemIds: string[]): Promise<ComplianceRegistration[]> {
  return apiRequest<ComplianceRegistration[]>("/api/compliance/registrations", {
    method: "POST",
    body: JSON.stringify({ item_ids: itemIds }),
  });
}

export function updateComplianceFollowup(
  itemType: ComplianceItemType,
  itemId: string,
  value: Pick<ComplianceFollowup, "status" | "phase" | "responsible" | "notes" | "risk_level">,
): Promise<ComplianceFollowup> {
  return apiRequest<ComplianceFollowup>(`/api/compliance/followups/${itemType}/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    body: JSON.stringify(value),
  });
}

export function loadComplianceFollowupEvents(
  itemType: ComplianceItemType,
  itemId: string,
): Promise<ComplianceFollowupEvent[]> {
  return apiRequest<ComplianceFollowupEvent[]>(
    `/api/compliance/followups/${itemType}/${encodeURIComponent(itemId)}/events`,
  );
}

export function loadComplianceFollowupDocuments(
  itemType: ComplianceItemType,
  itemId: string,
): Promise<ComplianceFollowupDocument[]> {
  return apiRequest<ComplianceFollowupDocument[]>(
    `/api/compliance/followups/${itemType}/${encodeURIComponent(itemId)}/documents`,
  );
}

export async function uploadComplianceFollowupDocument(
  itemType: ComplianceItemType,
  itemId: string,
  file: File,
): Promise<ComplianceFollowupDocument> {
  const form = new FormData();
  form.append("file", file);
  const response = await apiFetch(
    `/api/compliance/followups/${itemType}/${encodeURIComponent(itemId)}/documents`,
    { method: "POST", body: form },
  );
  return response.json() as Promise<ComplianceFollowupDocument>;
}

export async function downloadComplianceFollowupDocument(documentId: string): Promise<Blob> {
  const response = await apiFetch(`/api/compliance/followups/documents/${encodeURIComponent(documentId)}/download`);
  return response.blob();
}

export async function deleteComplianceFollowupDocument(documentId: string): Promise<void> {
  await apiFetch(`/api/compliance/followups/documents/${encodeURIComponent(documentId)}`, { method: "DELETE" });
}
