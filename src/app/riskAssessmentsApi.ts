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

export function predictRoadImpact(input: RoadImpactInput): Promise<RoadImpactPrediction> {
  return apiRequest<RoadImpactPrediction>("/api/risk-model/road-impact/predict", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
