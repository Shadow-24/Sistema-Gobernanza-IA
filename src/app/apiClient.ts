const SESSION_TOKEN_KEY = "gobernanza-session-token";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export function getSessionToken(): string | null {
  return sessionStorage.getItem(SESSION_TOKEN_KEY);
}

export function saveSessionToken(token: string): void {
  sessionStorage.setItem(SESSION_TOKEN_KEY, token);
}

export function clearSessionToken(): void {
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
}

export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getSessionToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof Blob) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    let message = `La API respondió con HTTP ${response.status}.`;
    try {
      const body = await response.json() as { detail?: unknown };
      if (typeof body.detail === "string") message = body.detail;
    } catch {
      console.error(`La API devolvió un error HTTP ${response.status} sin detalle JSON.`);
    }
    throw new ApiError(message, response.status);
  }
  return response;
}

export async function apiRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(url, init);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
