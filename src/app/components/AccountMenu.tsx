import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../AuthContext";

type DialogMode = "name" | "password";

const MIN_PASSWORD_LENGTH = 12;

const inputClass = "w-full h-9 px-3 rounded border text-sm outline-none focus:ring-2 focus:ring-[#0f6cbd]/40";
const inputStyle = { borderColor: "var(--border)", background: "var(--input-background)", color: "var(--foreground)" };
const primaryButtonClass = "h-9 px-4 rounded text-sm font-medium text-white transition-colors disabled:opacity-60";

export function AccountMenu() {
  const { user, updateOwnProfile } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogMode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  if (!user) return null;

  function openDialog(mode: DialogMode) {
    setMenuOpen(false);
    setDialog(mode);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`Cuenta de ${user.name}`}
        title={user.name}
        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-opacity hover:opacity-80"
        style={{ background: "var(--cs-eff6ff)", color: "var(--ct-0f6cbd)" }}
      >
        {user.name.slice(0, 1)}
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1 w-56 rounded border bg-white py-1 shadow-lg z-50"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="text-sm font-medium truncate" style={{ color: "var(--foreground)" }}>{user.name}</div>
            <div className="text-xs text-gray-500 truncate">{user.role}</div>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => openDialog("name")}
            className="w-full text-left px-3 py-2 text-sm transition-colors hover:bg-gray-100"
            style={{ color: "var(--foreground)" }}
          >
            Cambiar nombre
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => openDialog("password")}
            className="w-full text-left px-3 py-2 text-sm transition-colors hover:bg-gray-100"
            style={{ color: "var(--foreground)" }}
          >
            Cambiar contraseña
          </button>
        </div>
      )}

      {dialog && (
        <ProfileDialog
          mode={dialog}
          currentName={user.name}
          onClose={() => setDialog(null)}
          onSave={updateOwnProfile}
        />
      )}
    </div>
  );
}

type ProfileDialogProps = {
  mode: DialogMode;
  currentName: string;
  onClose: () => void;
  onSave: (updates: { name?: string; currentPassword?: string; newPassword?: string }) => Promise<void>;
};

function ProfileDialog({ mode, currentName, onClose, onSave }: ProfileDialogProps) {
  const [name, setName] = useState(currentName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, saving]);

  const title = mode === "name" ? "Cambiar nombre" : "Cambiar contraseña";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (mode === "name") {
      if (!name.trim()) {
        setError("El nombre no puede estar vacío.");
        return;
      }
      if (name.trim() === currentName) {
        onClose();
        return;
      }
      setSaving(true);
      try {
        await onSave({ name: name.trim() });
        onClose();
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "No se pudo actualizar el nombre.");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!currentPassword) {
      setError("Ingresa tu contraseña actual.");
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("La confirmación no coincide con la nueva contraseña.");
      return;
    }
    setSaving(true);
    try {
      await onSave({ currentPassword, newPassword });
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo cambiar la contraseña.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-dialog-title"
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded bg-white p-5 shadow-xl"
      >
        <h2 id="profile-dialog-title" className="text-base font-semibold mb-4" style={{ color: "var(--foreground)" }}>{title}</h2>

        {mode === "name" ? (
          <label className="block text-sm mb-4" style={{ color: "var(--foreground)" }}>
            Nombre
            <input
              type="text"
              value={name}
              maxLength={200}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              className={`${inputClass} mt-1`}
              style={inputStyle}
            />
          </label>
        ) : (
          <div className="space-y-3 mb-4">
            <label className="block text-sm" style={{ color: "var(--foreground)" }}>
              Contraseña actual
              <input
                type="password"
                value={currentPassword}
                autoComplete="current-password"
                autoFocus
                onChange={(event) => setCurrentPassword(event.target.value)}
                className={`${inputClass} mt-1`}
                style={inputStyle}
              />
            </label>
            <label className="block text-sm" style={{ color: "var(--foreground)" }}>
              Nueva contraseña
              <input
                type="password"
                value={newPassword}
                autoComplete="new-password"
                onChange={(event) => setNewPassword(event.target.value)}
                className={`${inputClass} mt-1`}
                style={inputStyle}
              />
              <span className="block text-xs text-gray-500 mt-1">Mínimo {MIN_PASSWORD_LENGTH} caracteres.</span>
            </label>
            <label className="block text-sm" style={{ color: "var(--foreground)" }}>
              Confirmar nueva contraseña
              <input
                type="password"
                value={confirmPassword}
                autoComplete="new-password"
                onChange={(event) => setConfirmPassword(event.target.value)}
                className={`${inputClass} mt-1`}
                style={inputStyle}
              />
            </label>
          </div>
        )}

        {error && (
          <div role="alert" className="mb-4 rounded px-3 py-2 text-[13px]" style={{ background: "var(--cs-fdf3f4)", border: "1px solid var(--cs-f1b8bb)", color: "var(--ct-a4262c)" }}>
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-9 px-4 rounded text-sm font-medium transition-colors hover:bg-gray-100 disabled:opacity-60"
            style={{ color: "var(--foreground)" }}
          >
            Cancelar
          </button>
          <button type="submit" disabled={saving} className={primaryButtonClass} style={{ background: "#0f6cbd" }}>
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
