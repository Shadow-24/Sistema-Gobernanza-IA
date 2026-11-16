import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, LockKeyhole, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
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

const panelStyle = { background: "var(--cs-ffffff)", border: "1px solid var(--cs-e1dfdd)" };
const inputStyle = { border: "1px solid var(--cs-c8c6c4)", color: "var(--ct-201f1e)" };

function roleInitials(role: UserRole) {
  return role.split(" ").map((part) => part[0]).slice(0, 2).join("");
}

function UserRow({ user, selected, onSelect }: { user: ManagedUser; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex items-center gap-3 px-3 py-3 text-left transition-colors"
      style={{ background: selected ? "var(--cs-eff6fc)" : "var(--cs-ffffff)", borderBottom: "1px solid var(--cs-edebe9)" }}
    >
      <span className="w-9 h-9 flex items-center justify-center rounded-full text-[13px] font-semibold flex-shrink-0" style={{ background: "var(--cs-e8f2fb)", color: "var(--ct-0f6cbd)" }}>
        {roleInitials(user.role)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold truncate" style={{ color: "var(--ct-201f1e)" }}>{user.name}</span>
        <span className="block text-[12px] truncate" style={{ color: "var(--ct-605e5c)" }}>@{user.username} · {user.role}</span>
      </span>
      <span className="flex items-center gap-1 text-[11px] flex-shrink-0" style={{ color: user.active ? "var(--ct-107c10)" : "var(--ct-a4262c)" }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: user.active ? "#107c10" : "#a4262c" }} />
        {user.active ? "Activo" : "Inactivo"}
      </span>
    </button>
  );
}

export function UserAdministration() {
  const { managedUsers, accessEvents, managementError, user, createManagedUser, updateManagedUser, deleteManagedUser } = useAuth();
  const [selectedUsername, setSelectedUsername] = useState(managedUsers[0]?.username ?? "");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<UserRole>("Analista de Datos");
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState("Todos");
  const [notice, setNotice] = useState("");
  const [pendingAction, setPendingAction] = useState<"delete" | "password" | "save" | "toggle" | null>(null);
  const [busy, setBusy] = useState(false);
  const selectedUser = managedUsers.find((account) => account.username === selectedUsername);
  const [draftName, setDraftName] = useState("");
  const [draftRole, setDraftRole] = useState<UserRole>("Analista de Datos");
  const [draftPermissions, setDraftPermissions] = useState<string[]>([]);
  const permissionsKey = selectedUser?.permissions.join("|") ?? "";

  useEffect(() => {
    if (!selectedUser) return;
    setDraftName(selectedUser.name);
    setDraftRole(selectedUser.role);
    setDraftPermissions(selectedUser.permissions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser?.username, selectedUser?.name, selectedUser?.role, permissionsKey]);

  const nameChanged = Boolean(selectedUser) && draftName.trim() !== "" && draftName.trim() !== selectedUser?.name;
  const roleChanged = Boolean(selectedUser) && draftRole !== selectedUser?.role;
  const permissionsChanged = Boolean(selectedUser) && (
    draftPermissions.length !== selectedUser?.permissions.length || draftPermissions.some((permission) => !selectedUser?.permissions.includes(permission))
  );
  const hasProfileChanges = nameChanged || roleChanged || permissionsChanged;
  const moduleLabel = (id: string) => modules.find((module) => module.id === id)?.label ?? id;
  const changeSummary = selectedUser ? [
    nameChanged ? `Nombre visible: "${selectedUser.name}" → "${draftName.trim()}"` : null,
    roleChanged ? `Rol: ${selectedUser.role} → ${draftRole}` : null,
    permissionsChanged ? `Permisos: ${[
      ...draftPermissions.filter((permission) => !selectedUser.permissions.includes(permission)).map((permission) => `+ ${moduleLabel(permission)}`),
      ...selectedUser.permissions.filter((permission) => !draftPermissions.includes(permission)).map((permission) => `− ${moduleLabel(permission)}`),
    ].join(", ")}` : null,
  ].filter((line): line is string => Boolean(line)) : [];

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

  async function handleDeleteUser() {
    if (!selectedUser) return;
    if (selectedUser.username === user?.username) {
      setNotice("No puedes eliminar tu propia cuenta.");
      return;
    }
    try {
      const deleted = await deleteManagedUser(selectedUser.username);
      if (deleted) {
        setNotice(`Cuenta @${selectedUser.username} eliminada.`);
        setSelectedUsername(managedUsers.find((account) => account.username !== selectedUser.username)?.username ?? "");
      } else {
        setNotice("No se pudo eliminar: debe permanecer al menos un supervisor activo.");
      }
    } catch (error) {
      console.error("No se pudo eliminar el usuario:", error);
      setNotice(error instanceof Error ? error.message : "No se pudo eliminar el usuario.");
    }
  }

  async function handleChangePasswordConfirmed() {
    if (!selectedUser) return;
    await updateSelected({ password: newPassword }, `Contraseña de @${selectedUser.username} actualizada.`);
    setNewPassword("");
    setConfirmPassword("");
  }

  async function handleSaveProfile() {
    if (!selectedUser) return;
    const updates: Parameters<typeof updateManagedUser>[1] = {};
    if (nameChanged) updates.name = draftName.trim();
    if (roleChanged) updates.role = draftRole;
    if (permissionsChanged) updates.permissions = draftPermissions;
    await updateSelected(updates, `Cambios de @${selectedUser.username} guardados.`);
  }

  async function handleToggleActive() {
    if (!selectedUser) return;
    await updateSelected({ active: !selectedUser.active }, selectedUser.active ? "Cuenta desactivada." : "Cuenta activada.");
  }

  async function runPendingAction() {
    const action = pendingAction;
    setBusy(true);
    try {
      if (action === "delete") await handleDeleteUser();
      else if (action === "password") await handleChangePasswordConfirmed();
      else if (action === "save") await handleSaveProfile();
      else if (action === "toggle") await handleToggleActive();
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  }

  async function handleChangePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser) return;
    if (newPassword !== confirmPassword) {
      setNotice("Las contraseñas no coinciden.");
      return;
    }
    setPendingAction("password");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4" style={{ color: "var(--ct-0f6cbd)" }} />
            <span className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--ct-0f6cbd)" }}>Solo supervisor</span>
          </div>
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-[19px] font-semibold" style={{ color: "var(--ct-201f1e)" }}>Administración de accesos</h1><UserStoryRefs ids={["HU-019", "HU-020"]} /></div>
          <p className="text-[13px] mt-1" style={{ color: "var(--ct-605e5c)" }}>Autenticación, roles, permisos y actividad de usuarios.</p>
        </div>
      </div>

      {notice && <div role="status" className="px-3 py-2 text-[13px]" style={{ background: "var(--cs-f3f9fd)", border: "1px solid var(--cs-c7e0f4)", color: "var(--ct-004578)" }}>{notice}</div>}
      {managementError && <div role="alert" className="px-3 py-2 text-[13px]" style={{ background: "var(--cs-fdf3f4)", border: "1px solid var(--cs-f1b8bb)", color: "var(--ct-a4262c)" }}>{managementError}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 items-start">
        <section className="xl:col-span-2 overflow-hidden" style={panelStyle}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--cs-edebe9)" }}>
            <div><h2 className="text-[14px] font-semibold" style={{ color: "var(--ct-201f1e)" }}>Usuarios</h2><p className="text-[12px] mt-0.5" style={{ color: "var(--ct-8a8886)" }}>Selecciona una cuenta para administrar</p></div>
            <span className="text-[12px]" style={{ color: "var(--ct-605e5c)" }}>{managedUsers.filter((account) => account.active).length} activos</span>
          </div>
          <div className="max-h-[340px] overflow-y-auto">
            {managedUsers.map((account) => <UserRow key={account.username} user={account} selected={selectedUsername === account.username} onSelect={() => { setSelectedUsername(account.username); setNotice(""); setNewPassword(""); setConfirmPassword(""); }} />)}
          </div>
          {selectedUser && (
            <div className="p-4 space-y-4" style={{ borderTop: "1px solid var(--cs-edebe9)" }}>
              <div className="flex items-center justify-between gap-2">
                <div><h3 className="text-[13px] font-semibold" style={{ color: "var(--ct-201f1e)" }}>Cuenta seleccionada</h3><p className="text-[12px]" style={{ color: "var(--ct-8a8886)" }}>@{selectedUser.username}</p></div>
                <button type="button" onClick={() => setPendingAction("toggle")} className="px-2.5 py-1.5 text-[12px] font-medium" style={{ background: selectedUser.active ? "var(--cs-fdf3f4)" : "var(--cs-f1faf1)", color: selectedUser.active ? "var(--ct-a4262c)" : "var(--ct-107c10)", border: "1px solid var(--cs-e1dfdd)" }}>
                  {selectedUser.active ? "Desactivar" : "Activar"}
                </button>
              </div>
              <label className="block text-[12px] font-medium" style={{ color: "var(--ct-605e5c)" }}>
                Nombre visible
                <input key={selectedUser.username} value={draftName} onChange={(event) => setDraftName(event.target.value)} className="mt-1 w-full h-8 px-2 text-[13px] bg-white" style={inputStyle} />
              </label>
              <label className="block text-[12px] font-medium" style={{ color: "var(--ct-605e5c)" }}>
                Rol
                <select value={draftRole} onChange={(event) => setDraftRole(event.target.value as UserRole)} className="mt-1 w-full h-8 px-2 text-[13px] bg-white" style={inputStyle}>
                  {roles.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <fieldset>
                <legend className="text-[12px] font-medium mb-2" style={{ color: "var(--ct-605e5c)" }}>Permisos de módulos</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2">
                  {modules.map((module) => (
                    <label key={module.id} className="flex items-center gap-2 text-[12px]" style={{ color: "var(--ct-323130)" }}>
                      <input type="checkbox" checked={draftPermissions.includes(module.id)} onChange={(event) => {
                        setDraftPermissions((current) => event.target.checked
                          ? [...current, module.id]
                          : current.filter((permission) => permission !== module.id));
                      }} />
                      {module.label}
                    </label>
                  ))}
                </div>
                <p className="text-[11px] mt-2" style={{ color: "var(--ct-8a8886)" }}>La administración permanece reservada al rol Supervisor de Cumplimiento.</p>
              </fieldset>
              <div className="flex items-center justify-end gap-2">
                {hasProfileChanges && <button type="button" onClick={() => { setDraftName(selectedUser.name); setDraftRole(selectedUser.role); setDraftPermissions(selectedUser.permissions); }} className="px-3 py-1.5 text-[12px] font-medium" style={{ background: "var(--cs-ffffff)", color: "var(--ct-323130)", border: "1px solid var(--cs-c8c6c4)" }}>Descartar</button>}
                <button type="button" onClick={() => setPendingAction("save")} disabled={!hasProfileChanges} className="px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50" style={{ background: "#0f6cbd" }}>Guardar cambios</button>
              </div>
              <form onSubmit={handleChangePassword} className="space-y-2 pt-3" style={{ borderTop: "1px solid var(--cs-edebe9)" }}>
                <h4 className="text-[12px] font-semibold flex items-center gap-1.5" style={{ color: "var(--ct-201f1e)" }}><LockKeyhole className="w-3.5 h-3.5" />Cambiar contraseña</h4>
                <input required minLength={12} type={showPassword ? "text" : "password"} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Nueva contraseña (mín. 12 caracteres)" className="w-full h-8 px-2 text-[13px] bg-white" style={inputStyle} autoComplete="new-password" aria-label="Nueva contraseña" />
                <input required minLength={12} type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirmar nueva contraseña" className="w-full h-8 px-2 text-[13px] bg-white" style={inputStyle} autoComplete="new-password" aria-label="Confirmar nueva contraseña" />
                <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--ct-605e5c)" }}><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />Mostrar lo que escribo</label>
                {confirmPassword && newPassword !== confirmPassword && <p className="text-[11px]" style={{ color: "var(--ct-a4262c)" }}>Las contraseñas no coinciden.</p>}
                <button type="submit" disabled={newPassword.length < 12 || newPassword !== confirmPassword} className="px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50" style={{ background: "#0f6cbd" }}>Cambiar contraseña</button>
              </form>
              <div className="pt-3" style={{ borderTop: "1px solid var(--cs-edebe9)" }}>
                <button type="button" onClick={() => setPendingAction("delete")} disabled={selectedUser.username === user?.username} title={selectedUser.username === user?.username ? "No puedes eliminar tu propia cuenta" : undefined} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium disabled:opacity-50" style={{ background: "var(--cs-fdf3f4)", color: "var(--ct-a4262c)", border: "1px solid var(--cs-f1b8bb)" }}>
                  <Trash2 className="w-3.5 h-3.5" />Eliminar cuenta
                </button>
              </div>
            </div>
          )}
        </section>

        <div className="xl:col-span-3 space-y-4">
          <section className="p-4" style={panelStyle}>
            <div className="flex items-center gap-2 mb-3">
              <Plus className="w-4 h-4" style={{ color: "var(--ct-0f6cbd)" }} />
              <div><h2 className="text-[14px] font-semibold" style={{ color: "var(--ct-201f1e)" }}>Registrar usuario</h2><p className="text-[12px]" style={{ color: "var(--ct-8a8886)" }}>La cuenta quedará habilitada al crearla.</p></div>
            </div>
            <form onSubmit={handleCreateUser} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-[12px] font-medium" style={{ color: "var(--ct-605e5c)" }}>Nombre completo
                <input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full h-8 px-2 text-[13px] bg-white" style={inputStyle} placeholder="Nombre y apellido" />
              </label>
              <label className="text-[12px] font-medium" style={{ color: "var(--ct-605e5c)" }}>Usuario
                <input required minLength={3} value={username} onChange={(event) => setUsername(event.target.value)} className="mt-1 w-full h-8 px-2 text-[13px] bg-white" style={inputStyle} placeholder="usuario" autoComplete="off" />
              </label>
              <label className="text-[12px] font-medium" style={{ color: "var(--ct-605e5c)" }}>Contraseña inicial
                <input required minLength={12} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full h-8 px-2 text-[13px] bg-white" style={inputStyle} autoComplete="new-password" />
              </label>
              <label className="text-[12px] font-medium" style={{ color: "var(--ct-605e5c)" }}>Rol inicial
                <select value={role} onChange={(event) => setRole(event.target.value as UserRole)} className="mt-1 w-full h-8 px-2 text-[13px] bg-white" style={inputStyle}>
                  {roles.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <div className="sm:col-span-2 flex justify-end">
                <button type="submit" className="inline-flex items-center gap-2 px-3 py-2 text-[13px] font-medium text-white" style={{ background: "#0f6cbd" }}><Plus className="w-3.5 h-3.5" />Crear cuenta</button>
              </div>
            </form>
          </section>

          <section className="overflow-hidden" style={panelStyle}>
            <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--cs-edebe9)" }}>
              <div className="flex items-center gap-2"><Clock3 className="w-4 h-4" style={{ color: "var(--ct-605e5c)" }} /><div><h2 className="text-[14px] font-semibold" style={{ color: "var(--ct-201f1e)" }}>Registro de accesos</h2><p className="text-[12px]" style={{ color: "var(--ct-8a8886)" }}>Eventos recientes</p></div></div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative flex-1 sm:w-44">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--ct-8a8886)" }} />
                  <input aria-label="Buscar en registros" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar usuario o evento" className="w-full h-8 pl-7 pr-2 text-[12px] bg-white" style={inputStyle} />
                </label>
                <select aria-label="Filtrar resultado" value={resultFilter} onChange={(event) => setResultFilter(event.target.value)} className="h-8 px-2 text-[12px] bg-white" style={inputStyle}>
                  <option>Todos</option><option>Permitido</option><option>Denegado</option>
                </select>
              </div>
            </div>
            <details>
            <summary className="cursor-pointer px-3 py-2 text-[12px] font-medium" style={{ color: "var(--ct-0f6cbd)" }}>Mostrar eventos de acceso ({filteredEvents.length})</summary>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[690px] text-left">
                <thead><tr className="text-[11px] uppercase" style={{ color: "var(--ct-8a8886)", background: "var(--cs-faf9f8)" }}>
                  <th className="px-3 py-2 font-semibold">Fecha y hora</th><th className="px-3 py-2 font-semibold">Usuario</th><th className="px-3 py-2 font-semibold">Acción / recurso</th><th className="px-3 py-2 font-semibold">Resultado</th>
                </tr></thead>
                <tbody>
                  {filteredEvents.map((event, index) => (
                    <tr key={`${event.timestamp}-${event.username}-${index}`} style={{ borderTop: "1px solid var(--cs-edebe9)" }}>
                      <td className="px-3 py-2.5 text-[12px] whitespace-nowrap" style={{ color: "var(--ct-605e5c)" }}>{new Date(event.timestamp).toLocaleString("es-PE")}</td>
                      <td className="px-3 py-2.5"><span className="block text-[12px] font-medium" style={{ color: "var(--ct-201f1e)" }}>{event.username}</span><span className="block text-[11px]" style={{ color: "var(--ct-8a8886)" }}>{event.role}</span></td>
                      <td className="px-3 py-2.5"><span className="block text-[12px]" style={{ color: "var(--ct-323130)" }}>{event.action}</span><span className="block text-[11px]" style={{ color: "var(--ct-8a8886)" }}>{event.resource}</span></td>
                      <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: event.result === "Permitido" ? "var(--ct-107c10)" : "var(--ct-a4262c)" }}>{event.result === "Permitido" ? <CheckCircle2 className="w-3 h-3" /> : <LockKeyhole className="w-3 h-3" />}{event.result}</span></td>
                    </tr>
                  ))}
                  {filteredEvents.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-[13px]" style={{ color: "var(--ct-8a8886)" }}>No hay registros que coincidan con los filtros.</td></tr>}
                </tbody>
              </table>
            </div>
            </details>
            <div className="px-3 py-2 text-[11px]" style={{ borderTop: "1px solid var(--cs-edebe9)", color: "var(--ct-8a8886)" }}>{filteredEvents.length} de {accessEvents.length} eventos</div>
          </section>
        </div>
      </div>
      {pendingAction && selectedUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-user-action-title" onKeyDown={(event) => { if (event.key === "Escape" && !busy) setPendingAction(null); }}>
          <div className="w-full max-w-md p-5" style={panelStyle}>
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0" style={pendingAction === "delete" || (pendingAction === "toggle" && selectedUser.active) ? { background: "var(--cs-fdf3f4)", color: "var(--ct-a4262c)" } : { background: "var(--cs-e8f2fb)", color: "var(--ct-0f6cbd)" }}>
                {pendingAction === "delete" ? <Trash2 className="w-4 h-4" /> : pendingAction === "password" ? <LockKeyhole className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
              </span>
              <div>
                <h2 id="confirm-user-action-title" className="text-[15px] font-semibold" style={{ color: "var(--ct-201f1e)" }}>{pendingAction === "delete" ? "Eliminar cuenta" : pendingAction === "password" ? "Cambiar contraseña" : pendingAction === "save" ? "Guardar cambios" : selectedUser.active ? "Desactivar cuenta" : "Activar cuenta"}</h2>
                <p className="mt-1 text-[13px]" style={{ color: "var(--ct-605e5c)" }}>
                  {pendingAction === "delete"
                    ? <>¿Eliminar definitivamente la cuenta <strong style={{ color: "var(--ct-201f1e)" }}>@{selectedUser.username}</strong> ({selectedUser.name})? Esta acción no se puede deshacer y se cerrarán sus sesiones abiertas.</>
                    : pendingAction === "password"
                    ? <>¿Cambiar la contraseña de <strong style={{ color: "var(--ct-201f1e)" }}>@{selectedUser.username}</strong>? Sus sesiones abiertas se cerrarán.</>
                    : pendingAction === "save"
                    ? <>¿Guardar los siguientes cambios en la cuenta <strong style={{ color: "var(--ct-201f1e)" }}>@{selectedUser.username}</strong>?</>
                    : selectedUser.active
                    ? <>¿Desactivar la cuenta <strong style={{ color: "var(--ct-201f1e)" }}>@{selectedUser.username}</strong>? No podrá iniciar sesión y se cerrarán sus sesiones abiertas.</>
                    : <>¿Activar la cuenta <strong style={{ color: "var(--ct-201f1e)" }}>@{selectedUser.username}</strong>? Podrá volver a iniciar sesión.</>}
                </p>
                {pendingAction === "save" && <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px]" style={{ color: "var(--ct-323130)" }}>{changeSummary.map((line) => <li key={line}>{line}</li>)}</ul>}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" autoFocus onClick={() => setPendingAction(null)} disabled={busy} className="px-3 py-1.5 text-[13px] font-medium disabled:opacity-50" style={{ background: "var(--cs-ffffff)", color: "var(--ct-323130)", border: "1px solid var(--cs-c8c6c4)" }}>Cancelar</button>
              <button type="button" onClick={() => void runPendingAction()} disabled={busy} className="px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50" style={{ background: pendingAction === "delete" || (pendingAction === "toggle" && selectedUser.active) ? "#a4262c" : "#0f6cbd" }}>
                {busy ? "Procesando…" : pendingAction === "delete" ? "Eliminar cuenta" : pendingAction === "password" ? "Cambiar contraseña" : pendingAction === "save" ? "Guardar cambios" : selectedUser.active ? "Desactivar" : "Activar"}
              </button>
            </div>
          </div>
        </div>
      )}
      <p className="text-[11px]" style={{ color: "var(--ct-8a8886)" }}>Sesión activa: {user?.name}. Las operaciones de autenticación y autorización se validan en el servidor.</p>
    </div>
  );
}
