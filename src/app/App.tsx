import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from "react-router";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import { SectorDataProvider } from "./SectorDataContext";
import { DashboardLayout } from "./components/DashboardLayout";
import { LoginScreen } from "./components/LoginScreen";
import { ExecutiveDashboard } from "./components/ExecutiveDashboard";
import { RiskManagement } from "./components/RiskManagement";
import { AuditModule } from "./components/AuditModule";
import { TraceabilityModule } from "./components/TraceabilityModule";
import { ComplianceModule } from "./components/ComplianceModule";
import { ReportsModule } from "./components/ReportsModule";
import { UserAdministration } from "./components/UserAdministration";

function LoginRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  return user ? <Navigate to="/dashboard" replace /> : <LoginScreen />;
}

function ProtectedLayout() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  return user ? <DashboardLayout /> : <Navigate to="/login" replace />;
}

function ProtectedModule({ module, label, supervisorOnly = false, children }: { module: string; label: string; supervisorOnly?: boolean; children: React.ReactNode }) {
  const { user, hasPermission, recordAccess } = useAuth();
  const location = useLocation();
  const permitted = hasPermission(module) && (!supervisorOnly || user?.role === "Supervisor de Cumplimiento");

  useEffect(() => {
    if (user && !permitted) recordAccess("Acceso a módulo", label, "Denegado");
  }, [user, permitted, label, recordAccess]);

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!permitted) {
    return (
      <div className="max-w-xl mx-auto mt-10 bg-white rounded p-6" style={{ border: "1px solid #e1dfdd" }}>
        <h1 className="text-[16px] font-semibold" style={{ color: "#201f1e" }}>Acceso no autorizado</h1>
        <p className="text-[12px] mt-2 mb-4" style={{ color: "#605e5c" }}>Tu rol no tiene permiso para acceder a {label}.</p>
        <Link to="/dashboard" className="inline-flex items-center px-3 py-2 rounded text-[12px] font-medium text-white" style={{ background: "#0f6cbd" }}>Regresar al Dashboard Ejecutivo</Link>
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <SectorDataProvider>
        <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/" element={<ProtectedLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<ProtectedModule module="dashboard" label="Dashboard Ejecutivo"><ExecutiveDashboard /></ProtectedModule>} />
            <Route path="riesgos" element={<ProtectedModule module="riesgos" label="Gestión de Riesgos"><RiskManagement /></ProtectedModule>} />
            <Route path="auditoria" element={<ProtectedModule module="auditoria" label="Auditoría"><AuditModule /></ProtectedModule>} />
            <Route path="trazabilidad" element={<ProtectedModule module="trazabilidad" label="Trazabilidad"><TraceabilityModule /></ProtectedModule>} />
            <Route path="cumplimiento" element={<ProtectedModule module="cumplimiento" label="Cumplimiento"><ComplianceModule /></ProtectedModule>} />
            <Route path="reportes" element={<ProtectedModule module="reportes" label="Reportes"><ReportsModule /></ProtectedModule>} />
            <Route path="supervision" element={<ProtectedModule module="supervision" label="Administración de usuarios" supervisorOnly><UserAdministration /></ProtectedModule>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </BrowserRouter>
      </SectorDataProvider>
    </AuthProvider>
  );
}
