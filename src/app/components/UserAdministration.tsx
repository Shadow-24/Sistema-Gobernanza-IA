import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, LockKeyhole, Plus, Search, ShieldCheck, Trash2, UserRound, XCircle } from "lucide-react";
import { useAuth, type ManagedUser, type UserRole } from "../AuthContext";
import { UserStoryRefs } from "./UserStoryRefs";

const roles: UserRole[] = [
  "Gerente de Operaciones",
  "Analista de Datos",
  "Supervisor de Cumplimiento",
  "Ingeniero de Campo",
];

const modules = [
  { id: "dashboard", label: "Dashboard Ejecutivo" },
  { id: "riesgos", label: "Gestión de Riesgos" },
  { id: "auditoria", label: "Auditoría" },
  { id: "trazabilidad", label: "Trazabilidad" },
  { id: "cumplimiento", label: "Cumplimiento" },
  { id: "reportes", label: "Reportes" },
];

const panelStyle = { background: "#ffffff", border: "1px solid #e1dfdd" };
const inputStyle = { border: "1px solid #c8c6c4", color: "#201f1e" };

function roleInitials(role: UserRole) {
  return role.split(" ").map((part) => part[0]).slice(0, 2).join("");
}

function UserRow({ user, selected, onSelect }: { user: ManagedUser; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex items-center gap-3 px-3 py-3 text-left transition-colors"
      style={{ background: selected ? "#eff6fc" : "#ffffff", borderBottom: "1px solid #edebe9" }}
    >
      <span className="w-9 h-9 flex items-center justify-center rounded-full text-[11px] font-semibold flex-shrink-0" style={{ background: "#e8f2fb", color: "#0f6cbd" }}>
        {roleInitials(user.role)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold truncate" style={{ color: "#201f1e" }}>{user.name}</span>
        <span className="block text-[10px] truncate" style={{ color: "#605e5c" }}>@{user.username} · {user.role}</span>
      </span>
      <span className="flex items-center gap-1 text-[9px] flex-shrink-0" style={{ color: user.active ? "#107c10" : "#a4262c" }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: user.active ? "#107c10" : "#a4262c" }} />
        {user.active ? "Activo" : "Inactivo"}
      </span>
    </button>
  );
}

export function UserAdministration() {
  const { managedUsers, accessEvents, managementError, user, createManagedUser, updateManagedUser, clearAccessEvents } = useAuth();
  const [selectedUsername, setSelectedUsername] = useState(managedUsers[0]?.username ?? "");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("Analista de Datos");
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState("Todos");
  const [notice, setNotice] = useState("");
  const selectedUser = managedUsers.find((account) => account.username === selectedUsername);

  useEffect(() => {
    if (!selectedUsername && managedUsers[0]) setSelectedUsername(managedUsers[0].username);
  }, [managedUsers, selectedUsername]);

  const filteredEvents = useMemo(() => accessEvents.filter((event) => {
    const matchesSearch = `${event.username} ${event.role} ${event.action} ${event.resource}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (resultFilter === "Todos" || event.result === resultFilter);
  }), [accessEvents, resultFilter, search]);

  async function handleCreateUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const created = await createManagedUser({ username, name, role, password });
      setNotice(created ? `Usuario @${username.trim().toLowerCase()} creado y habilitado.` : "No se pudo crear: verifica los datos y que el usuario no exista.");
      if (created) {
        setSelectedUsername(username.trim().toLowerCase());
        setName("");
        setUsername("");
        setPassword("");
      }
    } catch (error) {
      console.error("No se pudo crear el usuario:", error);
      setNotice(error instanceof Error ? error.message : "No se pudo crear el usuario.");
    }
  }

  async function updateSelected(updates: Parameters<typeof updateManagedUser>[1], successMessage: string) {
    if (!selectedUser) return;
    try {
      const updated = await updateManagedUser(selectedUser.username, updates);
      setNotice(updated ? successMessage : "Debe permanecer al menos un supervisor activo en la plataforma.");
    } catch (error) {
      console.error("No se pudo actualizar el usuario:", error);
      setNotice(error instanceof Error ? error.message : "No se pudo actualizar el usuario.");
    }
  }

  const authorizedCount = accessEvents.filter((event) => event.result === "Permitido").length;
  const deniedCount = accessEvents.filter((event) => event.result === "Denegado").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4" style={{ color: "#0f6cbd" }} />
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#0f6cbd" }}>Solo supervisor</span>
          </div>
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-[17px] font-semibold" style={{ color: "#201f1e" }}>Administración de accesos</h1><UserStoryRefs ids={["HU-019", "HU-020"]} /></div>
          <p className="text-[11px] mt-1" style={{ color: "#605e5c" }}>Autenticación, roles, permisos y actividad de usuarios.</p>
        </div>
        <div className="text-[10px] px-3 py-2 rounded-sm" style={{ background: "#fff8f0", color: "#8a4b08", border: "1px solid #f3d7b5" }}>
          Usuarios y permisos centralizados en PostgreSQL.
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 flex items-center gap-3" style={panelStyle}>
          <UserRound className="w-4 h-4" style={{ color: "#0f6cbd" }} />
          <div><div className="text-[17px] font-semibold" style={{ color: "#201f1e" }}>{managedUsers.length}</div><div className="text-[10px]" style={{ color: "#605e5c" }}>Usuarios registrados</div></div>
        </div>
        <div className="p-3 flex items-center gap-3" style={panelStyle}>
          <CheckCircle2 className="w-4 h-4" style={{ color: "#107c10" }} />
          <div><div className="text-[17px] font-semibold" style={{ color: "#201f1e" }}>{authorizedCount}</div><div className="text-[10px]" style={{ color: "#605e5c" }}>Accesos autorizados</div></div>
        </div>
        <div className="p-3 flex items-center gap-3" style={panelStyle}>
          <XCircle className="w-4 h-4" style={{ color: "#a4262c" }} />
          <div><div className="text-[17px] font-semibold" style={{ color: "#201f1e" }}>{deniedCount}</div><div className="text-[10px]" style={{ color: "#605e5c" }}>Accesos denegados</div></div>
        </div>
      </div>

      {notice && <div role="status" className="px-3 py-2 text-[11px]" style={{ background: "#f3f9fd", border: "1px solid #c7e0f4", color: "#004578" }}>{notice}</div>}
      {managementError && <div role="alert" className="px-3 py-2 text-[11px]" style={{ background: "#fdf3f4", border: "1px solid #f1b8bb", color: "#a4262c" }}>{managementError}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 items-start">
        <section className="xl:col-span-2 overflow-hidden" style={panelStyle}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #edebe9" }}>
            <div><h2 className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>Usuarios</h2><p className="text-[10px] mt-0.5" style={{ color: "#8a8886" }}>Selecciona una cuenta para administrar</p></div>
            <span className="text-[10px]" style={{ color: "#605e5c" }}>{managedUsers.filter((account) => account.active).length} activos</span>
          </div>
          <div className="max-h-[340px] overflow-y-auto">
            {managedUsers.map((account) => <UserRow key={account.username} user={account} selected={selectedUsername === account.username} onSelect={() => { setSelectedUsername(account.username); setNotice(""); }} />)}
          </div>
          {selectedUser && (
            <div className="p-4 space-y-4" style={{ borderTop: "1px solid #edebe9" }}>
              <div className="flex items-center justify-between gap-2">
                <div><h3 className="text-[11px] font-semibold" style={{ color: "#201f1e" }}>Cuenta seleccionada</h3><p className="text-[10px]" style={{ color: "#8a8886" }}>@{selectedUser.username}</p></div>
                <button type="button" onClick={() => updateSelected({ active: !selectedUser.active }, selectedUser.active ? "Cuenta desactivada." : "Cuenta activada.")} className="px-2.5 py-1.5 text-[10px] font-medium" style={{ background: selectedUser.active ? "#fdf3f4" : "#f1faf1", color: selectedUser.active ? "#a4262c" : "#107c10", border: "1px solid #e1dfdd" }}>
                  {selectedUser.active ? "Desactivar" : "Activar"}
                </button>
              </div>
              <label className="block text-[10px] font-medium" style={{ color: "#605e5c" }}>
                Nombre visible
                <input key={selectedUser.username} defaultValue={selectedUser.name} onBlur={(event) => {
                  const nextName = event.target.value.trim();
                  if (nextName && nextName !== selectedUser.name) updateSelected({ name: nextName }, "Nombre actualizado.");
                }} className="mt-1 w-full h-8 px-2 text-[11px] bg-white" style={inputStyle} />
              </label>
              <label className="block text-[10px] font-medium" style={{ color: "#605e5c" }}>
                Rol
                <select value={selectedUser.role} onChange={(event) => updateSelected({ role: event.target.value as UserRole }, "Rol actualizado.")} className="mt-1 w-full h-8 px-2 text-[11px] bg-white" style={inputStyle}>
                  {roles.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <fieldset>
                <legend className="text-[10px] font-medium mb-2" style={{ color: "#605e5c" }}>Permisos de módulos</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2">
                  {modules.map((module) => (
                    <label key={module.id} className="flex items-center gap-2 text-[10px]" style={{ color: "#323130" }}>
                      <input type="checkbox" checked={selectedUser.permissions.includes(module.id)} onChange={(event) => {
                        const permissions = event.target.checked
                          ? [...selectedUser.permissions, module.id]
                          : selectedUser.permissions.filter((permission) => permission !== module.id);
                        updateSelected({ permissions }, `Permisos de ${module.label} actualizados.`);
                      }} />
                      {module.label}
                    </label>
                  ))}
                </div>
                <p className="text-[9px] mt-2" style={{ color: "#8a8886" }}>La administración permanece reservada al rol Supervisor de Cumplimiento.</p>
              </fieldset>
            </div>
          )}
        </section>

        <div className="xl:col-span-3 space-y-4">
          <section className="p-4" style={panelStyle}>
            <div className="flex items-center gap-2 mb-3">
              <Plus className="w-4 h-4" style={{ color: "#0f6cbd" }} />
              <div><h2 className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>Registrar usuario</h2><p className="text-[10px]" style={{ color: "#8a8886" }}>La cuenta quedará habilitada al crearla.</p></div>
            </div>
            <form onSubmit={handleCreateUser} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-[10px] font-medium" style={{ color: "#605e5c" }}>Nombre completo
                <input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full h-8 px-2 text-[11px] bg-white" style={inputStyle} placeholder="Nombre y apellido" />
              </label>
              <label className="text-[10px] font-medium" style={{ color: "#605e5c" }}>Usuario
                <input required minLength={3} value={username} onChange={(event) => setUsername(event.target.value)} className="mt-1 w-full h-8 px-2 text-[11px] bg-white" style={inputStyle} placeholder="usuario" autoComplete="off" />
              </label>
              <label className="text-[10px] font-medium" style={{ color: "#605e5c" }}>Contraseña inicial
                <input required minLength={12} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full h-8 px-2 text-[11px] bg-white" style={inputStyle} autoComplete="new-password" />
              </label>
              <label className="text-[10px] font-medium" style={{ color: "#605e5c" }}>Rol inicial
                <select value={role} onChange={(event) => setRole(event.target.value as UserRole)} className="mt-1 w-full h-8 px-2 text-[11px] bg-white" style={inputStyle}>
                  {roles.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <div className="sm:col-span-2 flex justify-end">
                <button type="submit" className="inline-flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-white" style={{ background: "#0f6cbd" }}><Plus className="w-3.5 h-3.5" />Crear cuenta</button>
              </div>
            </form>
          </section>

          <section className="overflow-hidden" style={panelStyle}>
            <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ borderBottom: "1px solid #edebe9" }}>
              <div className="flex items-center gap-2"><Clock3 className="w-4 h-4" style={{ color: "#605e5c" }} /><div><h2 className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>Registro de accesos</h2><p className="text-[10px]" style={{ color: "#8a8886" }}>Eventos recientes · máximo 200 registros</p></div></div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative flex-1 sm:w-44">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "#8a8886" }} />
                  <input aria-label="Buscar en registros" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar usuario o evento" className="w-full h-8 pl-7 pr-2 text-[10px] bg-white" style={inputStyle} />
                </label>
                <select aria-label="Filtrar resultado" value={resultFilter} onChange={(event) => setResultFilter(event.target.value)} className="h-8 px-2 text-[10px] bg-white" style={inputStyle}>
                  <option>Todos</option><option>Permitido</option><option>Denegado</option>
                </select>
                <button type="button" title="Limpiar todos los registros" aria-label="Limpiar todos los registros" onClick={() => {
                  if (window.confirm("¿Limpiar todos los registros de acceso? Esta acción no se puede deshacer.")) {
                    clearAccessEvents().catch((error: unknown) => {
                      console.error("No se pudieron limpiar los eventos de acceso:", error);
                      setNotice(error instanceof Error ? error.message : "No se pudieron limpiar los eventos.");
                    });
                  }
                }} className="inline-flex items-center justify-center w-8 h-8" style={{ border: "1px solid #e1dfdd", color: "#a4262c", background: "#ffffff" }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <details>
            <summary className="cursor-pointer px-3 py-2 text-[10px] font-medium" style={{ color: "#0f6cbd" }}>Mostrar eventos de acceso ({filteredEvents.length})</summary>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[690px] text-left">
                <thead><tr className="text-[9px] uppercase" style={{ color: "#8a8886", background: "#faf9f8" }}>
                  <th className="px-3 py-2 font-semibold">Fecha y hora</th><th className="px-3 py-2 font-semibold">Usuario</th><th className="px-3 py-2 font-semibold">Acción / recurso</th><th className="px-3 py-2 font-semibold">Resultado</th>
                </tr></thead>
                <tbody>
                  {filteredEvents.map((event, index) => (
                    <tr key={`${event.timestamp}-${event.username}-${index}`} style={{ borderTop: "1px solid #edebe9" }}>
                      <td className="px-3 py-2.5 text-[10px] whitespace-nowrap" style={{ color: "#605e5c" }}>{new Date(event.timestamp).toLocaleString("es-PE")}</td>
                      <td className="px-3 py-2.5"><span className="block text-[10px] font-medium" style={{ color: "#201f1e" }}>{event.username}</span><span className="block text-[9px]" style={{ color: "#8a8886" }}>{event.role}</span></td>
                      <td className="px-3 py-2.5"><span className="block text-[10px]" style={{ color: "#323130" }}>{event.action}</span><span className="block text-[9px]" style={{ color: "#8a8886" }}>{event.resource}</span></td>
                      <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1 text-[9px] font-medium" style={{ color: event.result === "Permitido" ? "#107c10" : "#a4262c" }}>{event.result === "Permitido" ? <CheckCircle2 className="w-3 h-3" /> : <LockKeyhole className="w-3 h-3" />}{event.result}</span></td>
                    </tr>
                  ))}
                  {filteredEvents.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-[11px]" style={{ color: "#8a8886" }}>No hay registros que coincidan con los filtros.</td></tr>}
                </tbody>
              </table>
            </div>
            </details>
            <div className="px-3 py-2 text-[9px]" style={{ borderTop: "1px solid #edebe9", color: "#8a8886" }}>{filteredEvents.length} de {accessEvents.length} eventos</div>
          </section>
        </div>
      </div>
      <p className="text-[9px]" style={{ color: "#8a8886" }}>Sesión activa: {user?.name}. Las operaciones de autenticación y autorización se validan en el servidor.</p>
    </div>
  );
}
