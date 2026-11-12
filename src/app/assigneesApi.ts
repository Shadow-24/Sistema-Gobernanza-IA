import { apiRequest } from "./apiClient";

export type AssignablePermission = "riesgos" | "cumplimiento" | "auditoria";

export type Assignee = {
  username: string;
  name: string;
  role: string;
  permissions: string[];
  active: boolean;
};

export function loadAssignees(permission: AssignablePermission): Promise<Assignee[]> {
  return apiRequest<Assignee[]>(`/api/assignees?permission=${encodeURIComponent(permission)}`);
}
