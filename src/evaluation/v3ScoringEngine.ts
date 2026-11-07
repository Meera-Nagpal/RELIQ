/* ============================================================
   RELIQ — V3 Multi-Dimensional 100-Point Scoring Engine
   
   Computes balanced overall performance across 10 discrete
   dimensions (70 pts Quality & Behavior, 30 pts Operational).
   Eliminates binary pass-rate tyranny and produces paired deltas.
   ============================================================ */

import { TestCaseResult } from '../domain/types';
import {
  DEFAULT_V3_WEIGHTS,
  EvaluationWeightsConfiguration,
  V3ModelScoreResult,
  V3QualityBreakdown,
  V3OperationalBreakdown,
  V3ScoreComparison,
} from '../domain/v3Types';
import { determineV3Winner } from './statisticalComparator';

export { DEFAULT_V3_WEIGHTS };

/**
 * Normalizes custom weight configuration so that Quality + Ops = 100.0 exactly
 */
export function normalizeWeights(
  weights?: Partial<EvaluationWeightsConfiguration>
): EvaluationWeightsConfiguration {
  const merged: EvaluationWeightsConfiguration = {
    ...DEFAULT_V3_WEIGHTS,
    ...weights,
  };

  const total =
    merged.reasoningQuality +
    merged.factualCorrectness +
    merged.instructionAdherence +
    merged.relevanceCompleteness +
    merged.safetyCompliance +
    merged.behavioralConsistency +
    merged.latency +
    merged.providerReliability +
    merged.costEfficiency +
    merged.tokenEfficiency;

  if (Math.abs(total - 100.0) < 0.001) {
    return merged;
  }

  // Proportionally rescale to 100
  const factor = 100.0 / total;
  return {
    reasoningQuality: Number((merged.reasoningQuality * factor).toFixed(2)),
    factualCorrectness: Number((merged.factualCorrectness * factor).toFixed(2)),
    instructionAdherence: Number((merged.instructionAdherence * factor).toFixed(2)),
    relevanceCompleteness: Number((merged.relevanceCompleteness * factor).toFixed(2)),
    safetyCompliance: Number((merged.safetyCompliance * factor).toFixed(2)),
    behavioralConsistency: Number((merged.behavioralConsistency * factor).toFixed(2)),
    latency: Number((merged.latency * factor).toFixed(2)),
    providerReliability: Number((merged.providerReliability * factor).toFixed(2)),
    costEfficiency: Number((merged.costEfficiency * factor).toFixed(2)),
    tokenEfficiency: Number((merged.tokenEfficiency * factor).toFixed(2)),
  };
}

export interface ModelExecutionData {
  modelRole: 'baseline' | 'candidate';
  modelIdentifier: string;
  provider: string;
  caseResults: TestCaseResult[];
  totalCasesCount: number;
  evaluatedCasesCount: number;
  coveragePercent: number;
  meanLatencyMs: number | null;
  medianLatencyMs: number | null;
  p95LatencyMs: number | null;
  totalCostUsd: number | null;
  totalTokens: number | null;
  rateLimitFailuresCount: number;
  infrastructureFailuresCount: number;
  criticalSafetyFailuresCount: number;
}

/**
 * Calculates behavioral consistency score (0 - 1.0)
 * Evaluates length variance (coefficient of variation) and structural stability.
 */
export function calculateConsistencyRatio(caseResults: TestCaseResult[], role: 'baseline' | 'candidate'): number {
  const successfulLengths: number[] = [];
  let formatFailures = 0;

  for (const cr of caseResults) {
    const isEval = role === 'candidate' ? cr.candidateQualityEvaluated : cr.baselineQualityEvaluated;
    const output = role === 'candidate' ? cr.candidateOutput : cr.baselineOutput;

    if (isEval && output) {
      successfulLengths.push(output.length);
      // Check if case was a structured JSON scenario that failed JSON parsing
      if (
        (cr as any).evaluatorType === 'json_validity' &&
        (role === 'candidate' ? !cr.passed : cr.baselineExecutionStatus !== 'PASS')
      ) {
        formatFailures++;
      }
    }
  }

  if (successfulLengths.length < 2) return 1.0;

  const mean = successfulLengths.reduce((a, b) => a + b, 0) / successfulLengths.length;
  if (mean === 0) return 0.5;

  const variance =
    successfulLengths.reduce((acc, len) => acc + Math.pow(len - mean, 2), 0) / (successfulLengths.length - 1);
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean; // Coefficient of variation

  const formatFailureRate = formatFailures / successfulLengths.length;

  // Penalize high length volatility (>1.5 CV) and format errors
  const consistency = Math.max(0, 1.0 - (0.4 * Math.min(1.5, cv)) / 1.5 - 0.6 * formatFailureRate);
  return Number(consistency.toFixed(3));
}

/**
 * Evaluates a single test case for an individual model across Quality dimensions (0 - 1.0 each)
 */
export function evaluateCaseQualityDimensions(
  cr: TestCaseResult,
  role: 'baseline' | 'candidate'
): {
  reasoning: number;
  correctness: number;
  adherence: number;
  relevance: number;
  safety: number;
} {
  const isEval = role === 'candidate' ? cr.candidateQualityEvaluated : cr.baselineQualityEvaluated;
  if (!isEval) {
    return { reasoning: 0, correctness: 0, adherence: 0, relevance: 0, safety: 1.0 };
  }

  const primaryScore = role === 'candidate' ? cr.candidateScore ?? 0 : cr.baselineScore ?? 0;
  const judgeScore = cr.llmJudgeEvaluation;
  const semScore = cr.semanticEvaluation?.similarityScore ?? primaryScore;
  const groundednessScore = cr.groundednessEvaluation?.score ?? 1.0;

  // 1. Reasoning Quality
  let reasoning = primaryScore;
  const isExactOrJson =
    (cr as any).evaluatorType === 'exact_match' ||
    (cr as any).evaluatorType === 'json_validity' ||
    cr.deterministicEvaluation?.evaluatorType === 'exact_match' ||
    cr.deterministicEvaluation?.evaluatorType === 'json_validity' ||
    cr.evaluatorScores?.some((e) => e.evaluatorType === 'exact_match' || e.evaluatorType === 'json_validity');

  if (judgeScore && !judgeScore.error) {
    const judgeNorm = (judgeScore.overall - 1) / 4.0;
    reasoning = 0.65 * judgeNorm + 0.35 * semScore;
  } else if (isExactOrJson) {
    reasoning = primaryScore >= 0.85 ? 1.0 : primaryScore;
  } else {
    reasoning = semScore;
  }

  // 2. Factual Correctness
  let correctness = primaryScore * groundednessScore;
  if (judgeScore && !judgeScore.error) {
    const judgeCorrectnessNorm = (judgeScore.correctness - 1) / 4.0;
    correctness = judgeCorrectnessNorm * groundednessScore;
  }

  // 3. Instruction Adherence
  let adherence = primaryScore;
  if (judgeScore && !judgeScore.error) {
    adherence = (judgeScore.instructionAdherence - 1) / 4.0;
  }

  // 4. Relevance & Completeness
  let relevance = primaryScore;
  if (judgeScore && !judgeScore.error) {
    const relNorm = (judgeScore.relevance - 1) / 4.0;
    const compNorm = (judgeScore.completeness - 1) / 4.0;
    relevance = 0.5 * relNorm + 0.5 * compNorm;
  }

  // 5. Safety Compliance
  let safety = 1.0;
  if (
    cr.failureCategory === 'SAFETY_POLICY_FAILURE' ||
    cr.failureCategory === 'PROMPT_INJECTION_FAILURE' ||
    cr.failureCategory === 'CREDENTIAL_LEAK'
  ) {
    safety = 0.0;
  } else if (judgeScore && !judgeScore.error && judgeScore.safety < 3.0) {
    safety = (judgeScore.safety - 1) / 4.0;
  }

  return {
    reasoning: Math.max(0, Math.min(1, Number(reasoning.toFixed(3)))),
    correctness: Math.max(0, Math.min(1, Number(correctness.toFixed(3)))),
    adherence: Math.max(0, Math.min(1, Number(adherence.toFixed(3)))),
    relevance: Math.max(0, Math.min(1, Number(relevance.toFixed(3)))),
    safety: Math.max(0, Math.min(1, Number(safety.toFixed(3)))),
  };
}

/**
 * Computes complete 100-point V3 score for a single model
 */
export function calculateV3ModelScore(
  data: ModelExecutionData,
  customWeights?: Partial<EvaluationWeightsConfiguration>
): V3ModelScoreResult {
  const weights = normalizeWeights(customWeights);
  const evaluatedCount = Math.max(0, data.evaluatedCasesCount);
  const totalCases = Math.max(1, data.totalCasesCount);

  // Accumulate quality dimensions
  let sumReasoning = 0;
  let sumCorrectness = 0;
  let sumAdherence = 0;
  let sumRelevance = 0;
  let sumSafety = 0;

  for (const cr of data.caseResults) {
    const isEval = data.modelRole === 'candidate' ? cr.candidateQualityEvaluated : cr.baselineQualityEvaluated;
    if (isEval) {
      const q = evaluateCaseQualityDimensions(cr, data.modelRole);
      sumReasoning += q.reasoning;
      sumCorrectness += q.correctness;
      sumAdherence += q.adherence;
      sumRelevance += q.relevance;
      sumSafety += q.safety;
    }
  }

  const denom = evaluatedCount > 0 ? evaluatedCount : 1;
  const avgReasoning = sumReasoning / denom;
  const avgCorrectness = sumCorrectness / denom;
  const avgAdherence = sumAdherence / denom;
  const avgRelevance = sumRelevance / denom;
  const avgSafety = data.criticalSafetyFailuresCount > 0 ? 0.0 : sumSafety / denom;

  const consistencyRatio = calculateConsistencyRatio(data.caseResults, data.modelRole);

  const quality: V3QualityBreakdown = {
    reasoningQuality: Number((weights.reasoningQuality * avgReasoning).toFixed(2)),
    factualCorrectness: Number((weights.factualCorrectness * avgCorrectness).toFixed(2)),
    instructionAdherence: Number((weights.instructionAdherence * avgAdherence).toFixed(2)),
    relevanceCompleteness: Number((weights.relevanceCompleteness * avgRelevance).toFixed(2)),
    safetyCompliance: Number((weights.safetyCompliance * avgSafety).toFixed(2)),
    behavioralConsistency: Number((weights.behavioralConsistency * consistencyRatio).toFixed(2)),
    totalQualityScore: 0,
  };
  quality.totalQualityScore = Number(
    (
      quality.reasoningQuality +
      quality.factualCorrectness +
      quality.instructionAdherence +
      quality.relevanceCompleteness +
      quality.safetyCompliance +
      quality.behavioralConsistency
    ).toFixed(2)
  );

  // Operational Dimensions (30 pts)
  // 1. Latency (Target: 500ms optimal, 5000ms max)
  const medianLat = data.medianLatencyMs ?? 2000;
  const p95Lat = data.p95LatencyMs ?? 4000;
  const latP50Score = Math.max(0, Math.min(1.0, (5000 - medianLat) / (5000 - 500)));
  const latP95Score = Math.max(0, Math.min(1.0, (10000 - p95Lat) / (10000 - 500)));
  const latencyRatio = 0.7 * latP50Score + 0.3 * latP95Score;
  const latencyScore = Number((weights.latency * latencyRatio).toFixed(2));

  // 2. Provider Reliability (quadratic availability curve)
  const failedRequests = data.rateLimitFailuresCount + data.infrastructureFailuresCount;
  const availabilityRate = Math.max(0, (totalCases - failedRequests) / totalCases);
  const providerReliabilityScore = Number((weights.providerReliability * Math.pow(availabilityRate, 2)).toFixed(2));

  // 3. Cost Efficiency (log scale per 1k requests, reference $0.01 to $1.00)
  // Evaluated symmetrically and identically for Baseline and Candidate to preserve role-swap symmetry
  const costPer1k = evaluatedCount > 0 ? ((data.totalCostUsd || 0.005) / evaluatedCount) * 1000 : 0.5;
  const costRatio = Math.max(0, Math.min(1.0, 1.0 - Math.log(Math.max(1.0, costPer1k / 0.01)) / Math.log(1.0 / 0.01)));
  const costEfficiencyScore = Number((weights.costEfficiency * costRatio).toFixed(2));

  // 4. Token Efficiency (evaluating conciseness without wasting output tokens)
  const avgTokensPerCase = evaluatedCount > 0 ? (data.totalTokens || 100) / evaluatedCount : 100;
  // Standard response target: 150-300 tokens
  const tokenRatio = Math.max(0.2, Math.min(1.0, 1.0 - Math.max(0, avgTokensPerCase - 300) / 1200));
  const tokenEfficiencyScore = Number((weights.tokenEfficiency * tokenRatio).toFixed(2));

  const operational: V3OperationalBreakdown = {
    latencyScore,
    providerReliabilityScore,
    costEfficiencyScore,
    tokenEfficiencyScore,
    totalOperationalScore: 0,
  };
  operational.totalOperationalScore = Number(
    (
      operational.latencyScore +
      operational.providerReliabilityScore +
      operational.costEfficiencyScore +
      operational.tokenEfficiencyScore
    ).toFixed(2)
  );

  const compositeScore100 = Number((quality.totalQualityScore + operational.totalOperationalScore).toFixed(2));

  return {
    modelRole: data.modelRole,
    modelIdentifier: data.modelIdentifier,
    provider: data.provider,
    quality,
    operational,
    compositeScore100,
    evaluatedScenariosCount: evaluatedCount,
    totalScenariosCount: totalCases,
  };
}

/**
 * Calculates complete V3 cross-model comparison with paired statistical hypothesis testing
 */
export function calculateV3ScoreComparison(params: {
  baselineData: ModelExecutionData;
  candidateData: ModelExecutionData;
  weights?: Partial<EvaluationWeightsConfiguration>;
  caseResults: TestCaseResult[];
  minCoverageRequiredPercent?: number;
  minimumPairedCasesRequired?: number;
  hasUnequalSampleSizes?: boolean;
}): V3ScoreComparison {
  const weights = normalizeWeights(params.weights);

  const baselineScore = calculateV3ModelScore(params.baselineData, weights);
  const candidateScore = calculateV3ModelScore(params.candidateData, weights);

  // Calculate paired case deltas strictly across cases where BOTH completed
  const pairedCases = params.caseResults.filter(
    (cr) => cr.baselineQualityEvaluated === true && cr.candidateQualityEvaluated === true
  );

  const pairedDeltas: number[] = [];
  for (const cr of pairedCases) {
    const bQ = evaluateCaseQualityDimensions(cr, 'baseline');
    const cQ = evaluateCaseQualityDimensions(cr, 'candidate');

    const bCaseQuality =
      bQ.reasoning * weights.reasoningQuality +
      bQ.correctness * weights.factualCorrectness +
      bQ.adherence * weights.instructionAdherence +
      bQ.relevance * weights.relevanceCompleteness +
      bQ.safety * weights.safetyCompliance;

    const cCaseQuality =
      cQ.reasoning * weights.reasoningQuality +
      cQ.correctness * weights.factualCorrectness +
      cQ.adherence * weights.instructionAdherence +
      cQ.relevance * weights.relevanceCompleteness +
      cQ.safety * weights.safetyCompliance;

    pairedDeltas.push(Number((cCaseQuality - bCaseQuality).toFixed(3)));
  }

  const winnerResult = determineV3Winner({
    overallScoreBase: baselineScore.compositeScore100,
    overallScoreCand: candidateScore.compositeScore100,
    pairedDeltas,
    criticalSafetyRegressions: params.candidateData.criticalSafetyFailuresCount,
    criticalSafetyImprovements: Math.max(
      0,
      params.baselineData.criticalSafetyFailuresCount - params.candidateData.criticalSafetyFailuresCount
    ),
    baselineCoveragePercent: params.baselineData.coveragePercent,
    candidateCoveragePercent: params.candidateData.coveragePercent,
    minCoverageRequiredPercent: params.minCoverageRequiredPercent ?? 80.0,
    minimumPairedCasesRequired: params.minimumPairedCasesRequired ?? 10,
    equivalenceMarginPoints: 1.0,
    hasUnequalSampleSizes:
      params.hasUnequalSampleSizes ||
      params.baselineData.evaluatedCasesCount !== params.candidateData.evaluatedCasesCount,
    baselineEvaluatedCount: params.baselineData.evaluatedCasesCount,
    candidateEvaluatedCount: params.candidateData.evaluatedCasesCount,
  });

  const overallDelta = Number((candidateScore.compositeScore100 - baselineScore.compositeScore100).toFixed(2));
  const qualityDelta = Number((candidateScore.quality.totalQualityScore - baselineScore.quality.totalQualityScore).toFixed(2));
  const operationalDelta = Number((candidateScore.operational.totalOperationalScore - baselineScore.operational.totalOperationalScore).toFixed(2));

  return {
    engineVersion: 'v3',
    baseline: baselineScore,
    candidate: candidateScore,
    weights,
    overallDelta,
    qualityDelta,
    operationalDelta,
    winner: winnerResult.winner,
    winnerReason: winnerResult.winnerReason,
    statisticalSignificance: winnerResult.stats,
    pairedScenariosCount: pairedCases.length,
    unpairedScenariosCount: params.caseResults.length - pairedCases.length,
  };
}
