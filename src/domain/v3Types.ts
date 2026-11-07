/* ============================================================
   RELIQ — V3 Evaluation Engine Domain Types
   
   Authoritative type definitions for the Balanced Overall
   Performance Evaluation System (100-point framework,
   paired statistical significance, and decoupled governance).
   ============================================================ */

export type ComparisonWinnerV3 = 'candidate' | 'baseline' | 'tie' | 'inconclusive';

/**
 * Configurable weights for the 10-dimensional V3 100-point framework.
 * Sum of quality weights + operational weights MUST equal 100.
 */
export interface EvaluationWeightsConfiguration {
  // Quality & Model Behavior (70 points default)
  reasoningQuality: number;      // default: 20
  factualCorrectness: number;    // default: 20
  instructionAdherence: number;  // default: 10
  relevanceCompleteness: number; // default: 10
  safetyCompliance: number;      // default: 5
  behavioralConsistency: number; // default: 5

  // Operational Performance (30 points default)
  latency: number;               // default: 10
  providerReliability: number;   // default: 8
  costEfficiency: number;        // default: 7
  tokenEfficiency: number;       // default: 5
}

export const DEFAULT_V3_WEIGHTS: EvaluationWeightsConfiguration = {
  reasoningQuality: 20,
  factualCorrectness: 20,
  instructionAdherence: 10,
  relevanceCompleteness: 10,
  safetyCompliance: 5,
  behavioralConsistency: 5,
  latency: 10,
  providerReliability: 8,
  costEfficiency: 7,
  tokenEfficiency: 5,
};

/**
 * Breakdown of Quality & Model Behavior dimensions (70 points max)
 */
export interface V3QualityBreakdown {
  reasoningQuality: number;       // 0 - 20 (or custom weight)
  factualCorrectness: number;     // 0 - 20
  instructionAdherence: number;   // 0 - 10
  relevanceCompleteness: number;  // 0 - 10
  safetyCompliance: number;       // 0 - 5
  behavioralConsistency: number;  // 0 - 5
  totalQualityScore: number;      // 0 - 70
}

/**
 * Breakdown of Operational Performance dimensions (30 points max)
 */
export interface V3OperationalBreakdown {
  latencyScore: number;           // 0 - 10
  providerReliabilityScore: number; // 0 - 8
  costEfficiencyScore: number;    // 0 - 7
  tokenEfficiencyScore: number;   // 0 - 5
  totalOperationalScore: number;  // 0 - 30
}

/**
 * Complete 100-point score result for a single model
 */
export interface V3ModelScoreResult {
  modelRole: 'baseline' | 'candidate';
  modelIdentifier: string;
  provider: string;
  quality: V3QualityBreakdown;
  operational: V3OperationalBreakdown;
  compositeScore100: number;      // 0 - 100
  evaluatedScenariosCount: number;
  totalScenariosCount: number;
}

/**
 * Statistical significance calculation results on paired test-case deltas
 */
export interface V3StatisticalSignificance {
  pairedSampleSize: number;
  meanDelta: number;
  medianDelta: number;
  standardDeviationDelta: number;
  standardErrorDelta: number;
  bootstrapConfidenceInterval95: [number, number]; // [lower, upper]
  pValue: number;
  isStatisticallySignificant: boolean;
  effectSizeCohenD: number;
  minimumDetectableEffect: number;
}

/**
 * Complete V3 cross-model comparison result
 */
export interface V3ScoreComparison {
  engineVersion: 'v3';
  baseline: V3ModelScoreResult;
  candidate: V3ModelScoreResult;
  weights: EvaluationWeightsConfiguration;
  overallDelta: number;           // candidate - baseline
  qualityDelta: number;           // candidate - baseline quality
  operationalDelta: number;       // candidate - baseline operational
  winner: ComparisonWinnerV3;
  winnerReason: string;
  statisticalSignificance: V3StatisticalSignificance;
  pairedScenariosCount: number;
  unpairedScenariosCount: number;
}
