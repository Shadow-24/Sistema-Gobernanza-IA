import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError, apiRequest, clearSessionToken, getSessionToken, saveSessionToken } from "./apiClient";

export type UserRole =
  | "Gerente de Operaciones"
  | "Analista de Datos"
  | "Supervisor de Cumplimiento"
  | "Ingeniero de Campo";

export type ManagedUser = {
  username: string;
  name: string;
  role: UserRole;
  permissions: string[];
  active: boolean;
};

export type AccessEvent = {
  timestamp: string;
  username: string;
  role: string;
  action: string;
  resource: string;
  result: "Permitido" | "Denegado";
};

type AuthContextValue = {
  user: ManagedUser | null;
  isLoading: boolean;
  managedUsers: ManagedUser[];
  accessEvents: AccessEvent[];
  managementError: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  hasPermission: (module: string) => boolean;
  recordAccess: (
    action: string,
    resource: string,
    result?: AccessEvent["result"],
    username?: string,
    role?: string,
  ) => void;
  createManagedUser: (account: { username: string; name: string; role: UserRole; password: string }) => Promise<boolean>;
  updateManagedUser: (username: string, updates: Partial<Pick<ManagedUser, "name" | "role" | "permissions" | "active">>) => Promise<boolean>;
  clearAccessEvents: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeUser(user: ManagedUser): ManagedUser {
  return { ...user, username: user.username.toLowerCase() };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ManagedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [accessEvents, setAccessEvents] = useState<AccessEvent[]>([]);
  const [managementError, setManagementError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const token = getSessionToken();
    if (!token) {
      setIsLoading(false);
      return () => { active = false; };
    }

    apiRequest<{ user: ManagedUser }>("/api/auth/session")
      .then(({ user: sessionUser }) => {
        if (active) setUser(normalizeUser(sessionUser));
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          clearSessionToken();
          return;
        }
        console.error("No se pudo restaurar la sesión desde PostgreSQL:", error);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (user?.role !== "Supervisor de Cumplimiento") {
      setManagedUsers([]);
      setAccessEvents([]);
      setManagementError(null);
      return () => { active = false; };
    }
    setManagementError(null);
    Promise.all([
      apiRequest<ManagedUser[]>("/api/users"),
      apiRequest<AccessEvent[]>("/api/access-events"),
    ])
      .then(([users, events]) => {
        if (!active) return;
        setManagedUsers(users.map(normalizeUser));
        setAccessEvents(events);
      })
      .catch((error: unknown) => {
        console.error("No se pudo cargar la administración de usuarios desde PostgreSQL:", error);
        if (active) setManagementError(error instanceof Error ? error.message : "No se pudo cargar la administración de usuarios.");
      });
    return () => { active = false; };
  }, [user]);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const response = await apiRequest<{ token: string; user: ManagedUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      saveSessionToken(response.token);
      setUser(normalizeUser(response.user));
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return false;
      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    const logoutRequest = apiRequest("/api/auth/logout", { method: "POST" });
    clearSessionToken();
    setUser(null);
    logoutRequest
      .catch((error: unknown) => console.error("No se pudo registrar el cierre de sesión:", error))
  }, []);

  const hasPermission = useCallback((module: string) => user?.permissions.includes(module) ?? false, [user]);

  const recordAccess = useCallback((
    action: string,
    resource: string,
    result: AccessEvent["result"] = "Permitido",
    _username?: string,
    _role?: string,
  ) => {
    if (!user) return;
    const event: AccessEvent = {
      timestamp: new Date().toISOString(),
      username: user.username,
      role: user.role,
      action,
      resource,
      result,
    };
    setAccessEvents((current) => [event, ...current].slice(0, 200));
    apiRequest("/api/access-events", {
      method: "POST",
      body: JSON.stringify({ action, resource, result }),
    }).catch((error: unknown) => console.error("No se pudo registrar el evento de acceso:", error));
  }, [user]);

  const createManagedUser = useCallback(async (account: {
    username: string;
    name: string;
    role: UserRole;
    password: string;
  }) => {
    try {
      const created = await apiRequest<ManagedUser>("/api/users", {
        method: "POST",
        body: JSON.stringify(account),
      });
      setManagedUsers((current) => [...current.filter((item) => item.username !== created.username), normalizeUser(created)]);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) return false;
      throw error;
    }
  }, []);

  const updateManagedUser = useCallback(async (
    username: string,
    updates: Partial<Pick<ManagedUser, "name" | "role" | "permissions" | "active">>,
  ) => {
    try {
      const updated = await apiRequest<ManagedUser>(`/api/users/${encodeURIComponent(username)}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      const normalized = normalizeUser(updated);
      setManagedUsers((current) => current.map((item) => item.username === username ? normalized : item));
      if (user?.username === username) {
        if (!updated.active) {
          clearSessionToken();
          setUser(null);
        } else {
          setUser(normalized);
        }
      }
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) return false;
      throw error;
    }
  }, [user]);

  const clearAccessEvents = useCallback(async () => {
    await apiRequest<void>("/api/access-events", { method: "DELETE" });
    setAccessEvents([]);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    managedUsers,
    accessEvents,
    managementError,
    login,
    logout,
    hasPermission,
    recordAccess,
    createManagedUser,
    updateManagedUser,
    clearAccessEvents,
  }), [
    user, isLoading, managedUsers, accessEvents, managementError, login, logout, hasPermission,
    recordAccess, createManagedUser, updateManagedUser, clearAccessEvents,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe utilizarse dentro de AuthProvider.");
  return context;
}
