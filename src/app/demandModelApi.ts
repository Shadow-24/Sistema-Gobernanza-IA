import { apiRequest } from "./apiClient";

export type DemandMetricSet = {
  mae: number | null;
  rmse: number | null;
  mape: number | null;
  wape: number | null;
  r2: number | null;
  mapeLimitation: string | null;
};

export type DemandDataSource = {
  source: string;
  status: string;
  reason: string;
  provider?: string;
  seriesId?: string;
  units?: string;
  geography?: string;
  feature?: string;
  trainingObservations?: number;
  testObservations?: number;
  latestFeaturePeriod?: string | null;
  mae?: number | null;
  baselineMae?: number | null;
  errorReductionPercent?: number | null;
};

export type DemandModelStatus = {
  runId?: string;
  model: string;
  modelVersion?: string;
  xgboostVersion?: string;
  status: string;
  sourceIsCurrent?: boolean;
  target: string;
  source: string;
  unit: string;
  trainedAt?: string;
  trainingPeriod?: { from: string; to: string };
  evaluationPeriod?: { from: string; to: string };
  trainingObservations?: number;
  testObservations?: number;
  coverage?: { months: number; from: string; to: string };
  metrics?: {
    xgboost: DemandMetricSet;
    baseline: DemandMetricSet;
    errorReductionPercent: number | null;
    comparisonMetric: string;
  } | null;
  testPredictions?: { period: string; actual: number; xgboost: number; baseline: number }[];
  forecast?: { period: string; value: number; unit: string };
  explainability?: {
    evaluation: {
      status: string;
      featureImportance: { feature: string; meanAbsoluteShap: number }[];
      reason?: string;
    };
  };
  dataQuality?: Record<string, number>;
  dataSources?: DemandDataSource[];
  candidateEvaluations?: DemandDataSource[];
  selectedSources?: string[];
  warnings?: string[];
  message?: string;
};

export type GovernanceMetric = {
  status: "measured" | "pending" | "unavailable";
  percent?: number | null;
  reason?: string;
  totalPredictions?: number;
  completePredictions?: number;
  explainedPredictions?: number;
  executed?: number;
  succeeded?: number;
  successRatePercent?: number | null;
  meanResponseTimeMs?: number | null;
  meanMinutes?: number | null;
};

export type DemandGovernanceMetrics = {
  predictiveMetrics: DemandModelStatus["metrics"];
  evaluationPeriod: DemandModelStatus["evaluationPeriod"];
  governanceAndSystem: {
    predictionTraceability: GovernanceMetric;
    explainabilityCoverage: GovernanceMetric;
    governanceControlsCompliance: GovernanceMetric;
    riskDetectionTime: GovernanceMetric;
    systemOperations: GovernanceMetric;
    securityTestPassRate: GovernanceMetric;
    aiRiskDetectionRate: GovernanceMetric;
    perceivedUtility: GovernanceMetric;
  };
  comparison: {
    status: string;
    indicators: {
      metric: string;
      unit: string;
      asIs: number | null;
      toBe: number | null;
      toBeStatus: "measured" | "pending" | "unavailable";
    }[];
    reason: string;
  };
};

export type DemandPredictionRecord = {
  id: string;
  run_id: string;
  model_version: string;
  period: string;
  predicted_value: number;
  unit: string;
  traceability: {
    runId: string;
    modelVersion: string;
    targetPeriod: string;
    source: string;
    sourcePeriod: string;
    generatedAt: string;
    requestedBy: string;
    unit: string;
  };
  explanation: {
    status: string;
    method?: string;
    reason?: string;
    localValues?: { feature: string; contribution: number }[];
  };
  created_at: string;
};

export type DemandForecastResponse = {
  runId: string;
  modelVersion: string;
  source: string;
  sourcePeriod: string;
  predictions: {
    period: string;
    value: number;
    unit: string;
    explanation: { status: string };
    warnings?: string[];
  }[];
  warnings?: string[];
};

export function loadDemandModelStatus(): Promise<DemandModelStatus> {
  return apiRequest<DemandModelStatus>("/api/demand-model/status");
}

export function loadDemandPredictionHistory(): Promise<{ runs: DemandModelStatus[]; predictions: DemandPredictionRecord[] }> {
  return apiRequest<{ runs: DemandModelStatus[]; predictions: DemandPredictionRecord[] }>("/api/demand-model/history?prediction_limit=25");
}

export function loadDemandGovernanceMetrics(): Promise<DemandGovernanceMetrics> {
  return apiRequest<DemandGovernanceMetrics>("/api/demand-model/governance-metrics");
}

export function trainDemandModel(): Promise<DemandModelStatus> {
  return apiRequest<DemandModelStatus>("/api/demand-model/train", { method: "POST" });
}

export function predictDemandModel(horizonMonths: number): Promise<DemandForecastResponse> {
  return apiRequest<DemandForecastResponse>("/api/demand-model/predict", {
    method: "POST",
    body: JSON.stringify({ horizon_months: horizonMonths }),
  });
}
