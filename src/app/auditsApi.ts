import { apiFetch, apiRequest } from "./apiClient";

export type AuditStatus = "Pendiente" | "Completada" | "En curso" | "Observada";
export type AuditPhase =
  | "Planificación"
  | "Recopilación de evidencias"
  | "Análisis"
  | "Hallazgos y recomendaciones"
  | "Revisión y cierre";

export type AuditWorkflow = {
  audit_id: string;
  status: AuditStatus;
  phase: AuditPhase;
  responsible: string;
  notes: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AuditRegistration = {
  audit_id: string;
  registered_at: string;
};

export type AuditWorkflowEvent = {
  id: number;
  audit_id: string;
  event_type: "status" | "stage" | "responsible" | "note" | "update" | "document";
  detail: string;
  username: string;
  occurred_at: string;
};

export type AuditDocument = {
  id: string;
  audit_id: string;
  category: "Resoluciones" | "Expedientes" | "Otro documento relacionado";
  file_name: string;
  media_type: string;
  size_bytes: number;
  checksum: string;
  uploaded_by: string;
  created_at: string;
};

export function loadAuditWorkflow(): Promise<AuditWorkflow[]> {
  return apiRequest<AuditWorkflow[]>("/api/audits/workflow");
}

export function registerAudits(auditIds: string[]): Promise<AuditRegistration[]> {
  return apiRequest<AuditRegistration[]>("/api/audits/registrations", {
    method: "POST",
    body: JSON.stringify({ audit_ids: auditIds }),
  });
}

export function loadAuditWorkflowEvents(auditId?: string): Promise<AuditWorkflowEvent[]> {
  const query = auditId ? `?audit_id=${encodeURIComponent(auditId)}` : "";
  return apiRequest<AuditWorkflowEvent[]>(`/api/audits/events${query}`);
}

export function updateAuditWorkflow(
  auditId: string,
  workflow: Pick<AuditWorkflow, "status" | "phase" | "responsible" | "notes">,
): Promise<AuditWorkflow> {
  return apiRequest<AuditWorkflow>(`/api/audits/${encodeURIComponent(auditId)}/workflow`, {
    method: "PATCH",
    body: JSON.stringify(workflow),
  });
}

export function loadAuditDocuments(auditId: string): Promise<AuditDocument[]> {
  return apiRequest<AuditDocument[]>(`/api/audits/${encodeURIComponent(auditId)}/documents`);
}

export async function uploadAuditDocument(
  auditId: string,
  file: File,
  category: AuditDocument["category"],
): Promise<AuditDocument> {
  const form = new FormData();
  form.append("file", file);
  form.append("category", category);
  const response = await apiFetch(`/api/audits/${encodeURIComponent(auditId)}/documents`, {
    method: "POST",
    body: form,
  });
  return response.json() as Promise<AuditDocument>;
}

export async function downloadAuditDocument(documentId: string): Promise<Blob> {
  const response = await apiFetch(`/api/audits/documents/${encodeURIComponent(documentId)}/download`);
  return response.blob();
}

export async function deleteAuditDocument(documentId: string): Promise<void> {
  await apiFetch(`/api/audits/documents/${encodeURIComponent(documentId)}`, {
    method: "DELETE",
  });
}
