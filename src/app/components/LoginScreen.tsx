import { FormEvent, useState } from "react";
import { Brain, LockKeyhole, UserRound } from "lucide-react";
import { useNavigate } from "react-router";
import { useAuth } from "../AuthContext";
import { UserStoryRefs } from "./UserStoryRefs";

export function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      if (await login(username, password)) {
        navigate("/dashboard", { replace: true });
        return;
      }
      setError("Usuario o contraseña incorrectos.");
    } catch (cause) {
      console.error("No se pudo iniciar sesión:", cause);
      setError(cause instanceof Error ? cause.message : "No se pudo conectar con la API.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-10" style={{ background: "#f3f2f1", fontFamily: "'Inter', sans-serif" }}>
      <div className="w-full max-w-md bg-white rounded p-8" style={{ border: "1px solid #e1dfdd" }}>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded flex items-center justify-center" style={{ background: "#0f6cbd" }}>
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2"><h1 className="text-[17px] font-semibold" style={{ color: "#201f1e" }}>Gobernanza</h1><UserStoryRefs ids={["HU-018"]} /></div>
            <p className="text-[11px] mt-1" style={{ color: "#605e5c" }}>Sector Hidrocarburos · Perú</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="block text-[12px] font-medium mb-1.5" style={{ color: "#201f1e" }}>Usuario</span>
            <span className="relative block">
              <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#8a8886" }} />
              <input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} className="w-full h-10 pl-9 pr-3 rounded text-[13px] outline-none focus:ring-2 focus:ring-[#0f6cbd]" style={{ border: "1px solid #c8c6c4", color: "#201f1e" }} />
            </span>
          </label>
          <label className="block">
            <span className="block text-[12px] font-medium mb-1.5" style={{ color: "#201f1e" }}>Contraseña</span>
            <span className="relative block">
              <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#8a8886" }} />
              <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full h-10 pl-9 pr-3 rounded text-[13px] outline-none focus:ring-2 focus:ring-[#0f6cbd]" style={{ border: "1px solid #c8c6c4", color: "#201f1e" }} />
            </span>
          </label>
          {error && <p role="alert" className="text-[12px]" style={{ color: "#a4262c" }}>{error}</p>}
          <button type="submit" disabled={isSubmitting} className="w-full h-10 rounded text-[13px] font-medium text-white transition-colors hover:bg-[#115ea3] disabled:opacity-60" style={{ background: "#0f6cbd" }}>
            {isSubmitting ? "Verificando..." : "Iniciar sesión"}
          </button>
        </form>
      </div>
    </div>
  );
}
