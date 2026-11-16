export type ExplanationFactor = { name: string; percent: number };

export type SupplyChainRiskScenario = {
  id: string;
  level: "Alto" | "Medio";
  status: "Activo" | "En análisis";
  description: string;
  process: string;
  model: string;
  source: string;
  department: string;
  owner: string;
  recommendation: string;
  confidence: number;
  explanation: ExplanationFactor[];
};

export const simulatedSupplyChainRisks: SupplyChainRiskScenario[] = [
  {
    id: "SIM-INV-001", level: "Alto", status: "Activo", description: "Anomalía demostrativa en instalación de almacenamiento",
    process: "Inventario", model: "Detección de Anomalías de Inventario", source: "CDCLyOPDH + simulación; el CSV describe instalaciones, no niveles de inventario",
    department: "LIMA", owner: "Analista de Datos", recommendation: "Revisar el escenario de capacidad con datos operacionales validados antes de tomar una decisión.",
    confidence: 91, explanation: [{ name: "Comportamiento histórico", percent: 42 }, { name: "Capacidad de instalación", percent: 31 }, { name: "Volumen simulado", percent: 18 }, { name: "Otros factores", percent: 9 }],
  },
  {
    id: "SIM-TRN-001", level: "Medio", status: "En análisis", description: "Escenario de posible retraso en transporte Lima - Callao",
    process: "Transporte", model: "Detección de Anomalías de Transporte", source: "Simulación AI · rutas y tiempos de transporte no están en los CSV",
    department: "LIMA / CALLAO", owner: "Ingeniero de Campo", recommendation: "Validar condiciones de ruta y ventanas de traslado con información operacional disponible.",
    confidence: 86, explanation: [{ name: "Historial simulado de retrasos", percent: 42 }, { name: "Condición de ruta simulada", percent: 31 }, { name: "Volumen de escenario", percent: 18 }, { name: "Otros factores", percent: 9 }],
  },
  {
    id: "SIM-DMD-001", level: "Medio", status: "En análisis", description: "Desviación conceptual en predicción de demanda de combustible",
    process: "Demanda", model: "Predicción de Demanda", source: "Diccionario de combustibles (metadatos) + simulación; no contiene observaciones históricas de precios",
    department: "LIMA", owner: "Analista de Datos", recommendation: "Contrastar el escenario con una serie histórica de precios/demanda antes de interpretarlo.",
    confidence: 89, explanation: [{ name: "Comportamiento histórico simulado", percent: 42 }, { name: "Estacionalidad de escenario", percent: 31 }, { name: "Volumen de escenario", percent: 18 }, { name: "Otros factores", percent: 9 }],
  },
  {
    id: "SIM-TRN-002", level: "Alto", status: "Activo", description: "Riesgo elevado asociado a una ruta de transporte (escenario conceptual)",
    process: "Transporte", model: "Evaluación de Riesgo de Ruta", source: "Simulación AI · geometría de rutas no incluida en los CSV",
    department: "LIMA / CALLAO", owner: "Ingeniero de Campo", recommendation: "Solicitar revisión humana de condiciones ambientales y restricciones de ruta.",
    confidence: 91, explanation: [{ name: "Historial simulado de retrasos", percent: 42 }, { name: "Condición de ruta simulada", percent: 31 }, { name: "Volumen de escenario", percent: 18 }, { name: "Otros factores", percent: 9 }],
  },
];

export const simulatedRiskCountsByProcess = ["Inventario", "Transporte", "Distribución", "Demanda"].map((process) => ({
  proceso: process,
  riesgos: simulatedSupplyChainRisks.filter((risk) => risk.process === process).length,
}));