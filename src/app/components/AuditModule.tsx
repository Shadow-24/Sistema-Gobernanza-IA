import React from "react";
import { UserStoryRefs } from "./UserStoryRefs";

// Minimal inline icon components to avoid external dependency on 'lucide-react'
const SvgIcon = ({ children, className, style }: { children: React.ReactNode; className?: string; style?: any }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} width="16" height="16" aria-hidden>
    {children}
  </svg>
);

export const CheckCircle = (props: any) => (
  <SvgIcon {...props}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" /><path d="M9 12.5l1.5 1.5L15 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></SvgIcon>
);
export const Clock = (props: any) => (
  <SvgIcon {...props}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" /><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></SvgIcon>
);
export const XCircle = (props: any) => (
  <SvgIcon {...props}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" /><path d="M15 9L9 15M9 9l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></SvgIcon>
);
export const FileText = (props: any) => (
  <SvgIcon {...props}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.5" /><path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.5" /><path d="M8 13h8M8 17h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></SvgIcon>
);
export const Link = (props: any) => (
  <SvgIcon {...props}><path d="M10 14a3 3 0 0 1 0-4l1-1a3 3 0 0 1 4 4l-1 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M14 10a3 3 0 0 1 0 4l-1 1a3 3 0 0 1-4-4l1-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></SvgIcon>
);
export const ChevronRight = (props: any) => (
  <SvgIcon {...props}><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></SvgIcon>
);

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded ${className}`} style={{ border: "1px solid #e1dfdd" }}>{children}</div>;
}

const STATE_STYLES: Record<string, { icon: React.ElementType; bg: string; text: string; label: string }> = {
  "Completada":  { icon: CheckCircle, bg: "#f1faf1", text: "#107c10", label: "Completada" },
  "En curso":    { icon: Clock,       bg: "#fff8f0", text: "#ca5010", label: "En curso" },
  "Observada":   { icon: XCircle,     bg: "#fdf3f4", text: "#a4262c", label: "Observada" },
};

const auditoriasByYear: Record<string, {
  id: string; tipo: string; estado: keyof typeof STATE_STYLES;
  administrado: string; sector: string; fecha: string;
  evidencias: number; resoluciones: string[]; expedientes: string[];
  cumplimiento: number; hallazgos: string;
  modelo?: string; version?: string; proceso?: string; resultado?: string; nivelRiesgo?: string;
  confianza?: number; factores?: { name: string; percent: number }[]; recomendacion?: string;
}[]> = {
  "2024": [
    { id: "AUD-2024-041", tipo: "Auditoría de Modelo AI – Predicción Incidentes", estado: "Completada", administrado: "PLUSPETROL NORTE S.A.", sector: "Hidrocarburos Mayores", fecha: "15/12/2024", evidencias: 12, resoluciones: ["0389-2024-OEFA/DFAI", "0372-2024-OEFA/DFAI"], expedientes: ["516-2024-OEFA/TFA-SE"], cumplimiento: 87, hallazgos: "Escenario conceptual de sesgo en predicción de eventos. Evaluación simulada que requiere revisión humana.", modelo: "Clasificación de Incidentes", version: "sim. 2.3", proceso: "Distribución", resultado: "Posible sesgo · resultado simulado", nivelRiesgo: "Alto", confianza: 91, factores: [{ name: "Comportamiento histórico", percent: 42 }, { name: "Condición de operación", percent: 31 }, { name: "Volumen de escenario", percent: 18 }, { name: "Otros factores", percent: 9 }], recomendacion: "Revisar representatividad de datos antes de cualquier uso operacional." },
    { id: "AUD-2024-038", tipo: "Auditoría de Trazabilidad – Decisiones HC", estado: "Completada", administrado: "REFINERIA LA PAMPILLA S.A.A.", sector: "Hidrocarburos Mayores", fecha: "06/11/2024", evidencias: 8, resoluciones: ["0382-2024-OEFA/DFAI"], expedientes: ["411-2024-OEFA/TFA-SE", "084-2024-OEFA/TFA-SE"], cumplimiento: 92, hallazgos: "Registro de decisiones completo. Se recomienda automatizar notificaciones de resolución." },
    { id: "AUD-2024-035", tipo: "Auditoría de Cumplimiento Normativo SINADA", estado: "Completada", administrado: "Gas Natural de Lima y Callao", sector: "Comercialización HC", fecha: "22/10/2024", evidencias: 6, resoluciones: ["0376-2024-OEFA/DFAI"], expedientes: [], cumplimiento: 96, hallazgos: "Cumplimiento dentro de parámetros. Sin observaciones críticas." },
    { id: "AUD-2024-031", tipo: "Auditoría de Instalaciones Fijas CDCLy", estado: "En curso", administrado: "OLYMPIC PERU INC SUC. DEL PERU", sector: "Hidrocarburos Mayores", fecha: "05/10/2024", evidencias: 4, resoluciones: [], expedientes: ["239-2024-OEFA/TFA-SE"], cumplimiento: 71, hallazgos: "Pendiente verificación de 3 tanques de almacenamiento en Lote XIII-A." },
    { id: "AUD-2024-028", tipo: "Auditoría de Modelo AI – Clasificación Denuncias", estado: "Observada", administrado: "Escenario conceptual sobre el dataset SINADA", sector: "Plataforma AI TRiSM", fecha: "18/09/2024", evidencias: 9, resoluciones: [], expedientes: [], cumplimiento: 63, hallazgos: "Deriva representada conceptualmente en la clasificación de denuncias. Resultado simulado; requiere validación con datos etiquetados.", modelo: "Clasificación de Incidentes", version: "sim. 1.0", proceso: "Clasificación de denuncias", resultado: "Deriva potencial · resultado simulado", nivelRiesgo: "Medio", confianza: 74, factores: [{ name: "Cobertura de etiquetas", percent: 42 }, { name: "Comportamiento histórico", percent: 31 }, { name: "Calidad de datos", percent: 18 }, { name: "Otros factores", percent: 9 }], recomendacion: "Validar balance y calidad de etiquetas antes de evaluar un modelo real." },
    { id: "AUD-2024-052", tipo: "Auditoría de Modelo IA – Predicción de Demanda", estado: "En curso", administrado: "Escenario conceptual de demanda", sector: "Cadena de suministro · Demanda", fecha: "Escenario Q4 2024", evidencias: 4, resoluciones: [], expedientes: [], cumplimiento: 78, hallazgos: "Evaluación demostrativa; el diccionario disponible describe variables de precios, no una serie histórica de observaciones.", modelo: "Predicción de Demanda", version: "sim. 1.0", proceso: "Demanda", resultado: "Desviación de demanda · resultado simulado", nivelRiesgo: "Medio", confianza: 89, factores: [{ name: "Historial de escenario", percent: 42 }, { name: "Estacionalidad simulada", percent: 31 }, { name: "Volumen de escenario", percent: 18 }, { name: "Otros factores", percent: 9 }], recomendacion: "Contrastar con datos de demanda validados antes de tomar decisiones." },
    { id: "AUD-2024-055", tipo: "Auditoría de Modelo IA – Riesgo de Transporte", estado: "En curso", administrado: "Ruta conceptual Lima - Callao", sector: "Cadena de suministro · Transporte", fecha: "Escenario Q4 2024", evidencias: 3, resoluciones: [], expedientes: [], cumplimiento: 72, hallazgos: "Escenario de ruta simulado; los datasets disponibles no contienen geometrías ni tiempos de transporte.", modelo: "Evaluación de Riesgo de Ruta", version: "sim. 1.0", proceso: "Transporte", resultado: "Riesgo de ruta · resultado simulado", nivelRiesgo: "Alto", confianza: 91, factores: [{ name: "Historial simulado", percent: 42 }, { name: "Condición de ruta simulada", percent: 31 }, { name: "Volumen de escenario", percent: 18 }, { name: "Otros factores", percent: 9 }], recomendacion: "Revisión humana de condiciones y restricciones de ruta." },
    { id: "AUD-2024-058", tipo: "Auditoría de Modelo IA – Anomalías de Transporte", estado: "Observada", administrado: "Escenario operacional demostrativo", sector: "Cadena de suministro · Transporte", fecha: "Escenario Q4 2024", evidencias: 2, resoluciones: [], expedientes: [], cumplimiento: 68, hallazgos: "Se requiere validar la procedencia de datos operacionales antes de una evaluación real.", modelo: "Detección de Anomalías de Transporte", version: "sim. 1.0", proceso: "Transporte", resultado: "Posible retraso · resultado simulado", nivelRiesgo: "Medio", confianza: 86, factores: [{ name: "Historial simulado", percent: 42 }, { name: "Condición de ruta simulada", percent: 31 }, { name: "Volumen de escenario", percent: 18 }, { name: "Otros factores", percent: 9 }], recomendacion: "No tratar este resultado conceptual como una alerta operacional real." },
  ],
  "2025": [
    { id: "AUD-2025-004", tipo: "Auditoría de Medidas Correctivas – Lote 192", estado: "En curso", administrado: "PLUSPETROL NORTE S.A.", sector: "Hidrocarburos Mayores", fecha: "31/03/2025", evidencias: 3, resoluciones: ["0389-2025-OEFA/DFAI", "0372-2025-OEFA/DFAI"], expedientes: [], cumplimiento: 55, hallazgos: "Dos medidas correctivas en un trimestre. Patrón de recurrencia activa proceso de auditoría intensiva." },
    { id: "AUD-2025-002", tipo: "Auditoría de Trazabilidad Q1 2025", estado: "En curso", administrado: "Sistema AI TRiSM – General", sector: "Plataforma AI TRiSM", fecha: "15/03/2025", evidencias: 7, resoluciones: ["0382-2025-OEFA/DFAI", "0376-2025-OEFA/DFAI"], expedientes: [], cumplimiento: 82, hallazgos: "Trazabilidad parcial. Resoluciones sin medida correctiva carecen de evidencia documental adjunta." },
    { id: "AUD-2025-001", tipo: "Auditoría de Apertura de Período 2025", estado: "Completada", administrado: "Todos los sectores", sector: "Multi-sector", fecha: "31/01/2025", evidencias: 15, resoluciones: [], expedientes: [], cumplimiento: 91, hallazgos: "Línea base establecida. 1,672 instalaciones verificadas en CDCLy. 879 denuncias arrastradas identificadas." },
  ],
};

const timelineByYear: Record<string, { fecha: string; evento: string; tipo: "audit" | "resolution" | "expediente" | "risk"; detalle: string }[]> = {
  "2024": [
    { fecha: "15/12/2024", evento: "AUD-2024-041 Completada", tipo: "audit", detalle: "Auditoría modelo AI predicción – PLUSPETROL" },
    { fecha: "06/11/2024", evento: "AUD-2024-038 Completada", tipo: "audit", detalle: "Auditoría trazabilidad decisiones – La Pampilla" },
    { fecha: "16/07/2024", evento: "TFA-516-2024 Confirmado", tipo: "expediente", detalle: "Multa 10,000 UIT – PLUSPETROL Lote 8" },
    { fecha: "06/06/2024", evento: "TFA-411-2024 Resuelto", tipo: "expediente", detalle: "Multa 6,340 UIT – La Pampilla Terminal Multiboyas" },
    { fecha: "22/10/2024", evento: "AUD-2024-035 Completada", tipo: "audit", detalle: "Cumplimiento SINADA – Gas Natural Lima" },
    { fecha: "27/03/2024", evento: "TFA-239-2024 Confirmado", tipo: "expediente", detalle: "Multa 11,413 UIT – OLYMPIC PERU Lote XIII-A" },
    { fecha: "30/01/2024", evento: "TFA-084-2024 Confirmado", tipo: "expediente", detalle: "Multa 4,000 UIT – La Pampilla" },
  ],
  "2025": [
    { fecha: "31/03/2025", evento: "RD-0389-2025 Emitida", tipo: "resolution", detalle: "Med. Correctiva – PLUSPETROL Lote 192" },
    { fecha: "28/03/2025", evento: "RD-0372-2025 Emitida", tipo: "resolution", detalle: "Med. Correctiva – PLUSPETROL Lote 192" },
    { fecha: "28/03/2025", evento: "RD-0376-2025 Emitida", tipo: "resolution", detalle: "Sin Med. Correctiva – Gas Natural Lima" },
    { fecha: "31/03/2025", evento: "RSK-007 Activado", tipo: "risk", detalle: "Riesgo Crítico – recurrencia PLUSPETROL Q1" },
    { fecha: "15/03/2025", evento: "AUD-2025-002 Iniciada", tipo: "audit", detalle: "Auditoría trazabilidad Q1 2025" },
    { fecha: "31/01/2025", evento: "AUD-2025-001 Completada", tipo: "audit", detalle: "Apertura de período 2025 – línea base" },
  ],
};

const latestAuditYear = Object.keys(auditoriasByYear).sort((a, b) => Number(b) - Number(a))[0];

const TYPE_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  audit:      { bg: "#eff6ff", text: "#0f6cbd", dot: "#0f6cbd" },
  resolution: { bg: "#fff8f0", text: "#ca5010", dot: "#ca5010" },
  expediente: { bg: "#f1faf1", text: "#107c10", dot: "#107c10" },
  risk:       { bg: "#fdf3f4", text: "#a4262c", dot: "#a4262c" },
};

export function AuditModule() {
  const audits = auditoriasByYear[latestAuditYear];
  const timeline = timelineByYear[latestAuditYear];

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-[16px] font-semibold" style={{ color: "#201f1e" }}>Auditoría</h1><UserStoryRefs ids={["HU-013", "HU-016", "HU-017"]} /></div>
        <p className="text-[11px] mt-0.5" style={{ color: "#605e5c" }}>
          Último periodo de demostración disponible · {latestAuditYear} · evaluaciones de modelos simuladas cuando se indica
        </p>
        <p className="text-[9px] mt-1" style={{ color: "#8a8886" }}>Registros de demostración; las referencias administrativas no representan auditorías reales de la organización.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(["Completada", "En curso", "Observada"] as const).map(estado => {
          const s = STATE_STYLES[estado];
          const Icon = s.icon;
          const count = audits.filter(a => a.estado === estado).length;
          return (
            <Card key={estado} className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded flex items-center justify-center" style={{ background: s.bg }}>
                <Icon className="w-4 h-4" style={{ color: s.text }} />
              </div>
              <div>
                <div className="text-[18px] font-semibold" style={{ color: "#201f1e" }}>{count}</div>
                <div className="text-[10px]" style={{ color: "#8a8886" }}>Auditorías {estado}</div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Audit list */}
        <div className="lg:col-span-3 space-y-3">
          <div className="text-[12px] font-semibold" style={{ color: "#201f1e" }}>Historial de Auditorías</div>
          {audits.map(audit => {
            const s = STATE_STYLES[audit.estado];
            const Icon = s.icon;
            return (
              <Card key={audit.id} className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-mono" style={{ color: "#8a8886" }}>{audit.id}</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]" style={{ background: s.bg, color: s.text }}>
                        <Icon className="w-2.5 h-2.5" />{audit.estado}
                      </span>
                    </div>
                    <div className="text-[12px] font-medium" style={{ color: "#201f1e" }}>{audit.tipo}</div>
                    {audit.modelo && <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px]" style={{ background: "#eff6ff", color: "#0f6cbd" }}>Evaluación conceptual · Simulación AI</span>}
                    <div className="text-[11px] mt-0.5" style={{ color: "#605e5c" }}>{audit.administrado} · {audit.sector}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[11px]" style={{ color: "#8a8886" }}>{audit.fecha}</div>
                    <div className="mt-1">
                      <span className="text-[10px] font-semibold" style={{ color: audit.cumplimiento >= 90 ? "#107c10" : audit.cumplimiento >= 70 ? "#ca5010" : "#a4262c" }}>
                        {audit.cumplimiento}% cumpl.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 rounded-full mb-3" style={{ background: "#f3f2f1" }}>
                  <div className="h-1.5 rounded-full" style={{
                    width: `${audit.cumplimiento}%`,
                    background: audit.cumplimiento >= 90 ? "#107c10" : audit.cumplimiento >= 70 ? "#ca5010" : "#a4262c",
                  }} />
                </div>

                <p className="text-[11px] mb-3 leading-snug" style={{ color: "#605e5c" }}>{audit.hallazgos}</p>

                {audit.modelo && (
                  <details className="mb-3 p-3 rounded" style={{ background: "#f9f8f7", border: "1px solid #e1dfdd" }}>
                    <summary className="cursor-pointer text-[10px] font-medium" style={{ color: "#0f6cbd" }}>Ver evaluación técnica del modelo</summary>
                    <div className="pt-3">
                    <div className="grid grid-cols-2 gap-2 text-[10px] mb-2">
                      <span style={{ color: "#605e5c" }}>Modelo: <strong style={{ color: "#201f1e" }}>{audit.modelo} · {audit.version}</strong></span>
                      <span style={{ color: "#605e5c" }}>Proceso: <strong style={{ color: "#201f1e" }}>{audit.proceso}</strong></span>
                      <span style={{ color: "#605e5c" }}>Resultado: <strong style={{ color: "#201f1e" }}>{audit.resultado}</strong></span>
                      <span style={{ color: "#605e5c" }}>Riesgo: <strong style={{ color: "#ca5010" }}>{audit.nivelRiesgo}</strong></span>
                    </div>
                    <div className="text-[10px] font-semibold mb-1" style={{ color: "#201f1e" }}>Explicabilidad del modelo · simulada · confianza {audit.confianza}%</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px]" style={{ color: "#605e5c" }}>
                      {audit.factores?.map((factor) => <span key={factor.name}>{factor.name}: {factor.percent}%</span>)}
                    </div>
                    <p className="text-[9px] mt-2" style={{ color: "#8a8886" }}>Recomendación: {audit.recomendacion} Los factores no provienen de explicabilidad de un modelo real.</p>
                    </div>
                  </details>
                )}

                <div className="flex items-center gap-4 text-[10px]" style={{ color: "#8a8886" }}>
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />{audit.evidencias} evidencias
                  </span>
                  {audit.resoluciones.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Link className="w-3 h-3" />{audit.resoluciones.length} resoluciones
                    </span>
                  )}
                  {audit.expedientes.length > 0 && (
                    <span className="flex items-center gap-1">
                      <ChevronRight className="w-3 h-3" />{audit.expedientes.length} expedientes
                    </span>
                  )}
                </div>

                {audit.resoluciones.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {audit.resoluciones.map(r => (
                      <span key={r} className="px-1.5 py-0.5 rounded text-[9px] font-mono" style={{ background: "#eff6ff", color: "#0f6cbd" }}>{r}</span>
                    ))}
                    {audit.expedientes.map(e => (
                      <span key={e} className="px-1.5 py-0.5 rounded text-[9px] font-mono" style={{ background: "#f1faf1", color: "#107c10" }}>{e}</span>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {/* Timeline */}
        <div className="lg:col-span-2">
          <Card className="p-4 h-full">
            <div className="text-[12px] font-semibold mb-4" style={{ color: "#201f1e" }}>Línea de tiempo · {timeline.length} eventos</div>
            <div className="relative">
              <div className="absolute left-3 top-0 bottom-0 w-px" style={{ background: "#e1dfdd" }} />
              <div className="space-y-4">
                {timeline.map((event, i) => {
                  const t = TYPE_STYLE[event.tipo];
                  return (
                    <div key={i} className="flex gap-3 pl-2">
                      <div className="relative z-10 flex-shrink-0 w-3 h-3 rounded-full mt-0.5 ring-2 ring-white" style={{ background: t.dot }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-medium" style={{ color: "#201f1e" }}>{event.evento}</span>
                          <span className="ml-auto text-[9px] flex-shrink-0" style={{ color: "#8a8886" }}>{event.fecha}</span>
                        </div>
                        <p className="text-[10px] leading-snug" style={{ color: "#8a8886" }}>{event.detalle}</p>
                        <span className="mt-1 inline-block px-1.5 py-0.5 rounded text-[9px]" style={{ background: t.bg, color: t.text }}>
                          {event.tipo === "audit" ? "Auditoría" : event.tipo === "resolution" ? "Resolución" : event.tipo === "expediente" ? "Expediente" : "Riesgo"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>
      </div>

    </div>
  );
}
