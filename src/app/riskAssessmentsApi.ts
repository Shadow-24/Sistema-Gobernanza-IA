import { apiRequest } from "./apiClient";

export type RiskAssessment = {
  id: string;
  scenarioName: string;
  inputs: { delayHours: number; incidentCount: number; environmentalAlert: boolean };
  score: number;
  riskLevel: "Bajo" | "Medio" | "Alto" | "Crítico";
  factors: { name: string; observation: string; points: number }[];
  assessmentType: "simulación";
  createdBy: string;
  createdAt: string;
};

export type RiskSimulationInput = {
  scenario_name: string;
  delay_hours: number;
  incident_count: number;
  environmental_alert: boolean;
};

export type RoadImpactModel = {
  available: boolean;
  reason?: string;
  model?: string;
  modelStatus?: string;
  source?: string;
  records?: number;
  trainRecords?: number;
  testRecords?: number;
  dateFrom?: string;
  dateTo?: string;
  classes?: Record<string, number>;
  metrics?: { accuracy: number; balancedAccuracy: number; macroF1: number; majorityBaselineAccuracy: number };
  categories?: Record<string, string[]>;
  locations?: string[][];
  phenomena?: string[][];
  reliability?: { from: number; to: number; cases: number; accuracy: number | null }[];
  validation?: { records: number; auc?: number; brierScore?: number } | null;
  caveat?: string;
}

export type RoadImpactInput = {
  phenomenonClass: string;
  phenomenon: string;
  event: string;
  department: string;
  province?: string;
  roadCode?: string;
  roadSection?: string;
  date?: string;
}

export type RoadImpactPrediction = {
  prediction: string;
  confidence: number;
  confidenceLevel?: "Alta" | "Media" | "Baja" | null;
  reliability?: { observedAccuracy: number; cases: number; from: number; to: number } | null;
  probabilities: Record<string, number>;
  model: string;
  evaluation: NonNullable<RoadImpactModel["metrics"]>;
  limitations: string;
}

export function loadRiskAssessments(): Promise<RiskAssessment[]> {
  return apiRequest<RiskAssessment[]>("/api/risk-assessments");
}

export function saveRiskSimulation(input: RiskSimulationInput): Promise<RiskAssessment> {
  return apiRequest<RiskAssessment>("/api/risk-assessments/simulations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function loadRoadImpactModel(): Promise<RoadImpactModel> {
  return apiRequest<RoadImpactModel>("/api/risk-model/road-impact");
}

