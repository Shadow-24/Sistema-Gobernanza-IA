import { useEffect } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router";
import {
  LayoutDashboard, ShieldAlert, ClipboardList, GitBranch,
  CheckSquare, FileBarChart2, Brain, UserRoundCog
} from "lucide-react";
import { useAuth } from "../AuthContext";
import { useSectorData } from "../SectorDataContext";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Resumen" },
  { to: "/riesgos", icon: ShieldAlert, label: "Riesgos" },
  { to: "/auditoria", icon: ClipboardList, label: "Auditoría" },
  { to: "/trazabilidad", icon: GitBranch, label: "Trazabilidad" },
  { to: "/cumplimiento", icon: CheckSquare, label: "Cumplimiento" },
  { to: "/reportes", icon: FileBarChart2, label: "Reportes" },
  { to: "/supervision", icon: UserRoundCog, label: "Usuarios" },
];

export function DashboardLayout() {
  const { user, hasPermission, logout, recordAccess } = useAuth();
  const { dataError } = useSectorData();
  const location = useLocation();
  const navigate = useNavigate();
  const visibleItems = navItems.filter((item) => hasPermission(item.to.slice(1)));

  useEffect(() => {
    const item = navItems.find((navItem) => navItem.to === location.pathname);
    if (item && hasPermission(item.to.slice(1))) recordAccess("Acceso a módulo", item.label);
  }, [location.pathname, hasPermission, recordAccess]);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#f3f2f1", fontFamily: "'Inter', sans-serif" }}>

        {/* Sidebar */}
        <aside className="w-14 sm:w-56 flex flex-col flex-shrink-0" style={{ background: "#1b1a19" }}>
          {/* Logo */}
          <div className="px-2 sm:px-4 py-4 flex items-center justify-center sm:justify-start gap-3" style={{ borderBottom: "1px solid #323130" }}>
            <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: "#0f6cbd" }}>
              <Brain className="w-4 h-4 text-white" />
            </div>
            <div className="hidden sm:block">
              <div className="text-white font-semibold text-[13px] leading-tight">Gobernanza</div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 py-3 overflow-y-auto">
            {visibleItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                title={item.label}
                className={({ isActive }) =>
                  `flex items-center justify-center sm:justify-start gap-2.5 mx-1 sm:mx-2 px-2 sm:px-3 py-2 rounded text-[12.5px] transition-colors mb-0.5 ${
                    isActive
                      ? "text-white font-medium"
                      : "font-normal"
                  }`
                }
                style={({ isActive }) => ({
                  background: isActive ? "#0f6cbd" : "transparent",
                  color: isActive ? "#ffffff" : "#c8c6c4",
                })}
                onMouseEnter={(e) => {
                  const el = e.currentTarget;
                  if (!el.classList.contains("active") && !el.getAttribute("aria-current")) {
                    el.style.background = "#323130";
                  }
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget;
                  if (!el.getAttribute("aria-current")) {
                    el.style.background = "transparent";
                  }
                }}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">{item.label}</span>
              </NavLink>
            ))}
          </nav>

        </aside>

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Top Bar */}
          <header className="flex-shrink-0 flex items-center justify-between gap-2 px-3 sm:px-6 h-12 bg-white" style={{ borderBottom: "1px solid #e1dfdd" }}>
            <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium" title={user?.name} style={{ background: "#eff6ff", color: "#0f6cbd" }}>
              {user?.name.slice(0, 1)}
            </span>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <button onClick={handleLogout} className="h-8 px-2 rounded text-xs font-medium transition-colors hover:bg-gray-100" style={{ color: "#605e5c" }}>Salir</button>
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 overflow-auto p-3 sm:p-6">
            {dataError && (
              <div role="alert" className="mb-4 rounded px-3 py-2 text-[11px]" style={{ background: "#fdf3f4", border: "1px solid #f1b8bb", color: "#a4262c" }}>
                No se pudieron cargar los datos sectoriales desde PostgreSQL: {dataError}
              </div>
            )}
            <Outlet />
          </main>
        </div>
      </div>
  );
}
