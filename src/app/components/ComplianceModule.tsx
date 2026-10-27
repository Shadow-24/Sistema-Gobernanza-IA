import { RadialBarChart, RadialBar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { CheckCircle, Clock, AlertTriangle, Scale, BookOpen, ShieldCheck } from "lucide-react";
import { UserStoryRefs } from "./UserStoryRefs";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded ${className}`} style={{ border: "1px solid #e1dfdd" }}>{children}</div>;
}

function ProgressRing({ value, color, size = 80 }: { value: number; color: string; size?: number }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f2f1" strokeWidth={8} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x={size / 2} y={size / 2 + 1} textAnchor="middle" dominantBaseline="middle"
        fontSize={13} fontWeight={700} fill={color}>{value}%</text>
    </svg>
  );
}

const complianceByYear: Record<string, {
  overall: number; normativas: number; controlesRealizados: number; controlesPendientes: number;
  normativaList: { nombre: string; tipo: string; cumplimiento: number; estado: string; controles: number; pendientes: number }[];
  riesgosRegulatorios: { id: string; descripcion: string; nivel: string; normativa: string; fechaLimite: string }[];
  historico: { periodo: string; cumplimiento: number; controles: number }[];
}> = {
  "2024": {
    overall: 95,
    normativas: 6,
    controlesRealizados: 47,
    controlesPendientes: 8,
    normativaList: [
      { nombre: "Reglamento para la Protección Ambiental (D.S. 039-2014-EM)", tipo: "Ambiental", cumplimiento: 96, estado: "Conforme", controles: 12, pendientes: 1 },
      { nombre: "Normas técnicas OEFA – Hidrocarburos Mayores", tipo: "Fiscalización", cumplimiento: 94, estado: "Conforme", controles: 10, pendientes: 2 },
      { nombre: "Ley SINADA – Gestión de denuncias ambientales", tipo: "Administrativo", cumplimiento: 91, estado: "En revisión", controles: 8, pendientes: 3 },
      { nombre: "Norma técnica CDCLy – Instalaciones fijas", tipo: "Técnico", cumplimiento: 98, estado: "Conforme", controles: 9, pendientes: 0 },
      { nombre: "AI Act Framework (referencia UE) – Gobernanza IA", tipo: "Referencia", cumplimiento: 88, estado: "Evaluación conceptual", controles: 5, pendientes: 2 },
      { nombre: "ISO/IEC 42001 – Gestión de Sistemas de IA", tipo: "Referencia", cumplimiento: 82, estado: "Evaluación conceptual", controles: 3, pendientes: 3 },
    ],
    riesgosRegulatorios: [
      { id: "RRG-001", descripcion: "Incumplimiento plazo medidas correctivas PLUSPETROL Lote 192", nivel: "Alto", normativa: "D.S. 039-2014-EM", fechaLimite: "31/01/2025" },
      { id: "RRG-002", descripcion: "879 denuncias SINADA sin resolución superan tiempo normativo", nivel: "Medio", normativa: "Ley SINADA", fechaLimite: "30/06/2025" },
      { id: "RRG-003", descripcion: "Referencia ISO/IEC 42001 pendiente de evaluación conceptual", nivel: "Medio", normativa: "ISO/IEC 42001 · sin certificación", fechaLimite: "31/12/2025" },
      { id: "RRG-004", descripcion: "Documentación modelo IA sin validar para AI Act", nivel: "Bajo", normativa: "AI Act UE (ref.)", fechaLimite: "30/09/2025" },
    ],
    historico: [
      { periodo: "Q3 2024", cumplimiento: 93, controles: 38 },
      { periodo: "Q4 2024", cumplimiento: 95, controles: 47 },
    ],
  },
  "2025": {
    overall: 92,
    normativas: 6,
    controlesRealizados: 14,
    controlesPendientes: 11,
    normativaList: [
      { nombre: "Reglamento para la Protección Ambiental (D.S. 039-2014-EM)", tipo: "Ambiental", cumplimiento: 91, estado: "En revisión", controles: 4, pendientes: 3 },
      { nombre: "Normas técnicas OEFA – Hidrocarburos Mayores", tipo: "Fiscalización", cumplimiento: 88, estado: "En revisión", controles: 3, pendientes: 3 },
      { nombre: "Ley SINADA – Gestión de denuncias ambientales", tipo: "Administrativo", cumplimiento: 90, estado: "Conforme", controles: 3, pendientes: 2 },
      { nombre: "Norma técnica CDCLy – Instalaciones fijas", tipo: "Técnico", cumplimiento: 98, estado: "Conforme", controles: 2, pendientes: 0 },
      { nombre: "AI Act Framework (referencia UE) – Gobernanza IA", tipo: "Referencia", cumplimiento: 85, estado: "Evaluación conceptual", controles: 1, pendientes: 2 },
      { nombre: "ISO/IEC 42001 – Gestión de Sistemas de IA", tipo: "Referencia", cumplimiento: 82, estado: "Evaluación conceptual", controles: 1, pendientes: 2 },
    ],
    riesgosRegulatorios: [
      { id: "RRG-001", descripcion: "Medidas correctivas PLUSPETROL – plazo vencido Q4 2024", nivel: "Crítico", normativa: "D.S. 039-2014-EM", fechaLimite: "15/04/2025" },
      { id: "RRG-002", descripcion: "879 denuncias SINADA sin resolver – sobrepasan tiempo normativo", nivel: "Alto", normativa: "Ley SINADA", fechaLimite: "30/06/2025" },
      { id: "RRG-003", descripcion: "Referencia ISO/IEC 42001 pendiente de evaluación conceptual", nivel: "Medio", normativa: "ISO/IEC 42001 · sin certificación", fechaLimite: "31/12/2025" },
    ],
    historico: [
      { periodo: "Q3 2024", cumplimiento: 93, controles: 38 },
      { periodo: "Q4 2024", cumplimiento: 95, controles: 47 },
      { periodo: "Q1 2025", cumplimiento: 92, controles: 14 },
    ],
  },
};

const latestComplianceYear = Object.keys(complianceByYear).sort((a, b) => Number(b) - Number(a))[0];

const RISK_COLORS: Record<string, string> = {
  Crítico: "#a4262c", Alto: "#ca5010", Medio: "#986f0b", Bajo: "#107c10",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  "Conforme":          { bg: "#f1faf1", text: "#107c10" },
  "En revisión":       { bg: "#fff8f0", text: "#ca5010" },
  "Evaluación conceptual": { bg: "#eff6ff", text: "#0f6cbd" },
};

export function ComplianceModule() {
  const d = complianceByYear[latestComplianceYear];

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-[16px] font-semibold" style={{ color: "#201f1e" }}>Cumplimiento Normativo</h1><UserStoryRefs ids={["HU-014", "HU-015"]} /></div>
        <p className="text-[11px] mt-0.5" style={{ color: "#605e5c" }}>
          Último escenario demostrativo disponible · referencias del estudio · {latestComplianceYear}
        </p>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { icon: ShieldCheck, label: "Cumplimiento Global", value: `${d.overall}%`, color: d.overall >= 90 ? "#107c10" : "#ca5010" },
          { icon: BookOpen,    label: "Normativas Evaluadas", value: `${d.normativas}`, color: "#0f6cbd" },
          { icon: CheckCircle, label: "Controles Realizados", value: `${d.controlesRealizados}`, color: "#107c10" },
          { icon: Clock,       label: "Controles Pendientes", value: `${d.controlesPendientes}`, color: "#ca5010" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded flex items-center justify-center" style={{ background: kpi.color + "18" }}>
                <Icon className="w-4 h-4" style={{ color: kpi.color }} />
              </div>
              <div>
                <div className="text-[20px] font-semibold" style={{ color: "#201f1e" }}>{kpi.value}</div>
                <div className="text-[10px]" style={{ color: "#8a8886" }}>{kpi.label}</div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Compliance rings per normativa */}
        <div className="xl:col-span-2">
          <Card className="p-4">
            <div className="text-[12px] font-semibold mb-4" style={{ color: "#201f1e" }}>Cumplimiento por Normativa</div>
            <div className="space-y-3">
              {d.normativaList.map((norm, i) => {
                const sc = STATUS_COLORS[norm.estado] ?? STATUS_COLORS["Conforme"];
                return (
                  <div key={i} className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="min-w-0 mr-2">
                          <div className="text-[11px] font-medium truncate" style={{ color: "#201f1e" }}>{norm.nombre}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "#f3f2f1", color: "#8a8886" }}>{norm.tipo}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: sc.bg, color: sc.text }}>{norm.estado}</span>
                          </div>
                        </div>
                        <div className="flex-shrink-0 flex items-center gap-2">
                          <span className="text-[11px] font-semibold" style={{ color: norm.cumplimiento >= 90 ? "#107c10" : norm.cumplimiento >= 80 ? "#ca5010" : "#a4262c" }}>
                            {norm.cumplimiento}%
                          </span>
                        </div>
                      </div>
                      <div className="h-2 rounded-full" style={{ background: "#f3f2f1" }}>
                        <div className="h-2 rounded-full transition-all" style={{
                          width: `${norm.cumplimiento}%`,
                          background: norm.cumplimiento >= 90 ? "#107c10" : norm.cumplimiento >= 80 ? "#ca5010" : "#a4262c",
                        }} />
                      </div>
                      <div className="flex gap-3 mt-1 text-[9px]" style={{ color: "#8a8886" }}>
                        <span>{norm.controles} controles realizados</span>
                        {norm.pendientes > 0 && <span style={{ color: "#ca5010" }}>{norm.pendientes} pendientes</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Overall ring + trend */}
        <div className="space-y-4">
          <Card className="p-4 flex flex-col items-center">
            <div className="text-[12px] font-semibold mb-3" style={{ color: "#201f1e" }}>Cumplimiento Global</div>
            <ProgressRing value={d.overall} color={d.overall >= 90 ? "#107c10" : "#ca5010"} size={120} />
            <p className="text-[10px] text-center mt-3" style={{ color: "#8a8886" }}>
              Promedio ponderado de {d.normativas} normativas evaluadas
            </p>
          </Card>

          <Card className="p-4">
            <div className="text-[12px] font-semibold mb-3" style={{ color: "#201f1e" }}>Evolución histórica del cumplimiento</div>
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={d.historico} margin={{ left: 0, right: 4, top: 0, bottom: 0 }}>
                <XAxis dataKey="periodo" tick={{ fontSize: 8, fill: "#8a8886" }} axisLine={false} tickLine={false} />
                <YAxis domain={[80, 100]} tick={{ fontSize: 8, fill: "#8a8886" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 10, border: "1px solid #e1dfdd", borderRadius: 4 }} />
                <Bar name="Cumplimiento %" dataKey="cumplimiento" fill="#0f6cbd" radius={[3, 3, 0, 0]} barSize={28} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </div>

      {/* Regulatory risks */}
      <Card className="p-4">
        <div className="text-[12px] font-semibold mb-3" style={{ color: "#201f1e" }}>
          <Scale className="w-3.5 h-3.5 inline mr-1.5" style={{ color: "#0f6cbd" }} />
          Riesgos regulatorios identificados · {d.riesgosRegulatorios.length}
        </div>
        <div className="space-y-2">
          {d.riesgosRegulatorios.map(r => (
            <div key={r.id} className="flex items-center gap-4 p-3 rounded" style={{ background: "#f3f2f1" }}>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: RISK_COLORS[r.nivel] }} />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium" style={{ color: "#201f1e" }}>{r.descripcion}</div>
                <div className="text-[9px] mt-0.5" style={{ color: "#8a8886" }}>{r.normativa}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[10px] font-medium" style={{ color: RISK_COLORS[r.nivel] }}>{r.nivel}</span>
                <div className="flex items-center gap-1 text-[9px]" style={{ color: "#8a8886" }}>
                  <AlertTriangle className="w-3 h-3" />
                  {r.fechaLimite}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <p className="text-[10px] px-1" style={{ color: "#8a8886" }}>
        Porcentajes, controles y estados son simulados para el prototipo académico. AI Act e ISO/IEC 42001 se muestran como referencias conceptuales; no representan certificación ni cumplimiento organizacional real.
      </p>
    </div>
  );
}
