/* ============================================================
   RELIQ — Cross-Model Comparison & Recommendation Engine
   
   Calculates metric-by-metric deltas between any two model configurations
   (Gemini vs OpenAI, Gemini vs Claude, OpenAI vs Claude, version A vs B,
   prompt A vs B), evaluates regression status, and generates actionable
   verdicts (SHIP, SHIP WITH CONDITIONS, NO REGRESSION, REGRESSION DETECTED,
   BLOCK RELEASE, INSUFFICIENT EVIDENCE).
   ============================================================ */

import {
  EvidenceStrength,
  ModelVersion,
  RegressionCategory,
  RegressionSettings,
  RunExecutionMode,
  RunProvenance,
  TestCase,
  TestCaseResult,
} from '../domain/types';
import { ProviderType } from '../providers/types';
import { evaluateReleaseDecision, calculateEvidenceStrength, getEvidenceStrengthReason } from './releaseEngine';
import { evaluateGroundedness } from './groundednessEvaluator';

export type RecommendationVerdict =
  | 'SHIP'
  | 'SHIP WITH CONDITIONS'
  | 'NO REGRESSION'
  | 'REGRESSION DETECTED'
  | 'BLOCK RELEASE'
  | 'INSUFFICIENT EVIDENCE'
  | 'SHIP_WITH_CONDITIONS'
  | 'BLOCK'
  | 'INSUFFICIENT_EVIDENCE';

export type ComparisonWinner = 'candidate' | 'baseline' | 'tie';

export interface MetricDelta {
  metric: string;
  baselineValue: number | null;
  candidateValue: number | null;
  unit: string;
  absoluteDelta: number | null;
  percentageDelta: number | null;
  isImprovement: boolean | null;
  assessment?: 'IMPROVEMENT' | 'REGRESSION' | 'PARITY';
  description: string;
  rawBaselineValue?: number | null;
  rawCandidateValue?: number | null;
}

export interface MetricComparison {
  correctness: MetricDelta;
  passRate: MetricDelta;
  qualityScore: MetricDelta;
  evaluationCoverage: MetricDelta;
  providerReliability: MetricDelta;
  rateLimitCount: MetricDelta;
  providerErrorCount: MetricDelta;
  qualityFailureCount: MetricDelta;
  hallucinationFailureCount?: MetricDelta; // Legacy alias for backwards compatibility
  avgLatencyMs: MetricDelta;
  medianLatencyMs?: MetricDelta;
  p95LatencyMs?: MetricDelta;
  inputTokens: MetricDelta;
  outputTokens: MetricDelta;
  reasoningTokens?: MetricDelta;
  cachedTokens?: MetricDelta;
  totalTokens: MetricDelta;
  estimatedCostUsd: MetricDelta;
  errorRate: MetricDelta;
}

export interface ComparisonReport {
  id: string;
  title: string;
  timestamp: string;
  datasetId: string;
  datasetName: string;
  totalCases: number;
  baseline: {
    provider: ProviderType;
    model: string;
    promptVersion?: string;
    temperature?: number;
  };
  candidate: {
    provider: ProviderType;
    model: string;
    promptVersion?: string;
    temperature?: number;
  };
  winner: ComparisonWinner;
  winnerReason: string;
  metrics: MetricComparison;
  qualityDelta: number | null;
  tokenDelta: number | null;
  latencyDelta: number | null;
  costDelta: number | null;
  regressionStatus: 'REGRESSION_DETECTED' | 'NO_REGRESSION' | 'INSUFFICIENT_EVIDENCE';
  confidenceScore: number;
  evidence: string[];
  recommendation: RecommendationVerdict;
  recommendationReason: string;
  actionItems: string[];
  executionMode?: RunExecutionMode; // 'LIVE' | 'SAVED' | 'REFERENCE'
  provenance?: RunProvenance;
  evidenceStrength?: EvidenceStrength;
  evidenceStrengthReason?: string;
  benchmarkCompletion?: import('../domain/types').BenchmarkCompletionSummary;
  releaseGates?: import('../domain/types').ReleaseGateResult[];
  overallGateStatus?: 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'PASS WITH WARNINGS';
  dimensions?: import('../domain/types').DimensionalTradeoffs;
  isPreliminary?: boolean;
  regressionCategories?: RegressionCategory[];
  limitations?: string[];
  minimumEvaluatedCases?: number;
  hasUnequalSampleSizes?: boolean;
  sampleSizeWarning?: string;
  latencyPercentileWarning?: string;
  semanticEvaluationStatus?: import('../domain/types').EvaluationEvidenceState;
  llmJudgeStatus?: import('../domain/types').EvaluationEvidenceState;
  factualityGroundednessStatus?: import('../domain/types').EvaluationEvidenceState;
  groundednessApplicableCases?: number;
  groundednessEvaluatedCases?: number;
  groundednessFailedCases?: number;
  groundednessAvgScore?: number | null;
  judgeCostUsd?: number | null;
  benchmarkCostUsd?: number | null;
  totalInfrastructureCostUsd?: number | null;
  judgeModel?: string;
  judgeEvaluatedCases?: number;
  safetyBreakdown?: import('../domain/types').SafetyBreakdownSummary;
}

export interface EvaluationWeights {
  correctnessWeight?: number; // default 0.40
  qualityWeight?: number;     // default 0.25
  latencyWeight?: number;     // default 0.15
  costWeight?: number;        // default 0.10
  safetyWeight?: number;      // default 0.10
}

export interface GenerateComparisonOptions {
  datasetId: string;
  datasetName: string;
  baselineVersion: ModelVersion;
  candidateVersion: ModelVersion;
  caseResults: TestCaseResult[];
  runMetrics?: import('../domain/types').MetricSummary;
  settings?: RegressionSettings;
  weights?: EvaluationWeights;
  executionMode?: RunExecutionMode;
  provenance?: RunProvenance;
}

export function calculateDelta(
  metric: string,
  baselineValue: number | null | undefined,
  candidateValue: number | null | undefined,
  unit: string,
  higherIsBetter: boolean,
  description: string,
  decimalsArg?: number
): MetricDelta {
  const decimals = decimalsArg !== undefined ? decimalsArg : (unit === '$' ? 6 : 4);

  if (baselineValue === null || baselineValue === undefined || candidateValue === null || candidateValue === undefined) {
    const cleanBaseline =
      baselineValue !== null && baselineValue !== undefined ? Number(baselineValue.toFixed(decimals)) : null;
    const cleanCandidate =
      candidateValue !== null && candidateValue !== undefined ? Number(candidateValue.toFixed(decimals)) : null;
    return {
      metric,
      baselineValue: cleanBaseline,
      candidateValue: cleanCandidate,
      unit,
      absoluteDelta: null,
      percentageDelta: null,
      isImprovement: null,
      description,
      rawBaselineValue: baselineValue ?? null,
      rawCandidateValue: candidateValue ?? null,
    };
  }

  const cleanBaseline = Number(baselineValue.toFixed(decimals));
  const cleanCandidate = Number(candidateValue.toFixed(decimals));

  const rawDiff = candidateValue - baselineValue;
  const rawPercentage =
    baselineValue !== 0
      ? (rawDiff / baselineValue) * 100
      : candidateValue !== 0
      ? 100
      : 0;

  const absoluteDelta = Number(rawDiff.toFixed(decimals));
  const percentageDelta = Number(rawPercentage.toFixed(1));

  const isZeroDelta = rawDiff === 0 || absoluteDelta === 0;
  const isImprovement = isZeroDelta
    ? false
    : higherIsBetter
    ? absoluteDelta > 0
    : absoluteDelta < 0;

  const assessment: 'IMPROVEMENT' | 'REGRESSION' | 'PARITY' = isZeroDelta
    ? 'PARITY'
    : higherIsBetter
    ? absoluteDelta > 0
      ? 'IMPROVEMENT'
      : 'REGRESSION'
    : absoluteDelta < 0
    ? 'IMPROVEMENT'
    : 'REGRESSION';

  return {
    metric,
    baselineValue: cleanBaseline,
    candidateValue: cleanCandidate,
    unit,
    absoluteDelta,
    percentageDelta,
    isImprovement,
    assessment,
    description,
    rawBaselineValue: baselineValue,
    rawCandidateValue: candidateValue,
  };
}

export function generateComparisonReport(
  optionsOrBaseline: GenerateComparisonOptions | ModelVersion,
  candidateVersionArg?: ModelVersion,
  caseResultsArg?: TestCaseResult[],
  settingsArg?: any,
  datasetNameArg?: string
): ComparisonReport {
  let options: GenerateComparisonOptions;
  if ('caseResults' in optionsOrBaseline) {
    options = optionsOrBaseline;
  } else {
    options = {
      baselineVersion: optionsOrBaseline as ModelVersion,
      candidateVersion: candidateVersionArg!,
      caseResults: caseResultsArg || [],
      datasetId: 'dataset-benchmark',
      datasetName: datasetNameArg || 'Benchmark Suite',
      settings: settingsArg,
    };
  }

  const {
    datasetId,
    datasetName,
    baselineVersion,
    candidateVersion,
    caseResults,
    settings = {
      minAccuracyPercent: 95.0,
      maxAccuracyDegradationPercent: 2.0,
      maxLatencyIncreasePercent: 20.0,
      maxFailureRatePercent: 5.0,
    },
    weights = {
      correctnessWeight: 0.4,
      qualityWeight: 0.25,
      latencyWeight: 0.15,
      costWeight: 0.1,
      safetyWeight: 0.1,
    },
  } = options;

  const totalCases = caseResults.length;

  if (totalCases === 0) {
    return createEmptyReport(datasetId, datasetName, baselineVersion, candidateVersion);
  }

  // Ensure every case in caseResults has groundednessEvaluation populated if missing
  for (const r of caseResults) {
    if (!r.groundednessEvaluation && (r.candidateOutput || r.expectedOutput)) {
      const syntheticCase: TestCase = {
        id: r.testCaseId,
        name: r.testCaseName || r.testCaseId,
        category: r.category || 'Tool Calling',
        severity: r.severity || 'medium',
        input: r.input || '',
        expectedOutput: r.expectedOutput || '',
        evaluatorType: 'exact_match',
        evaluatorConfig: (r as any).evaluatorConfig,
        tags: [],
        createdAt: '',
      };
      try {
        r.groundednessEvaluation = evaluateGroundedness({
          testCase: syntheticCase,
          actualOutput: r.candidateOutput || '',
          judgeScore: r.llmJudgeEvaluation || null,
        });
      } catch {
        // ignore
      }
    }
  }

  // 1. Compute aggregations
  let bPassed = 0;
  let cPassed = 0;
  let bEvaluatedCount = 0;
  let cEvaluatedCount = 0;
  let bRateLimitCount = 0;
  let cRateLimitCount = 0;
  let bProviderErrorCount = 0;
  let cProviderErrorCount = 0;
  let bReliableCount = 0;
  let cReliableCount = 0;
  let bQualitySum = 0;
  let cQualitySum = 0;
  let bSuccessfulLatencySum = 0;
  let cSuccessfulLatencySum = 0;
  let bInputTokens = 0;
  let cInputTokens = 0;
  let bOutputTokens = 0;
  let cOutputTokens = 0;
  let bTotalTokens = 0;
  let cTotalTokens = 0;
  let bReasoningTokens = 0;
  let cReasoningTokens = 0;
  let bCachedTokens = 0;
  let cCachedTokens = 0;
  let bTotalCost = 0;
  let cTotalCost = 0;
  let bErrors = 0;
  let cErrors = 0;
  let bQualityFailures = 0;
  let cQualityFailures = 0;
  let bAuthCount = 0;
  let cAuthCount = 0;
  let regressedCasesCount = 0;
  let criticalRegressedCount = 0;
  let improvedCasesCount = 0;

  let hasReasoningData = false;
  let hasCachedData = false;

  for (const r of caseResults) {
    const bStatus = r.baselineExecutionStatus;
    const cStatus = r.candidateExecutionStatus;

    const bIsRateLimit = bStatus === 'PROVIDER_RATE_LIMIT' || r.baselineUsage?.error?.status === 429;
    const cIsRateLimit = cStatus === 'PROVIDER_RATE_LIMIT' || r.candidateUsage?.error?.status === 429;
    if (bIsRateLimit) bRateLimitCount++;
    if (cIsRateLimit) cRateLimitCount++;

    const bIsAuthError =
      bStatus === 'AUTHENTICATION_ERROR' ||
      r.failureCategory === 'PROVIDER_AUTHENTICATION' ||
      r.baselineUsage?.error?.status === 401 ||
      r.baselineUsage?.error?.status === 403 ||
      (r.baselineErrorDetail && r.baselineErrorDetail.category === 'AUTHENTICATION');
    const cIsAuthError =
      cStatus === 'AUTHENTICATION_ERROR' ||
      r.failureCategory === 'PROVIDER_AUTHENTICATION' ||
      r.candidateUsage?.error?.status === 401 ||
      r.candidateUsage?.error?.status === 403 ||
      (r.candidateErrorDetail && r.candidateErrorDetail.category === 'AUTHENTICATION');
    if (bIsAuthError) bAuthCount++;
    if (cIsAuthError) cAuthCount++;

    const bIsOtherError =
      (bStatus &&
        bStatus !== 'PASS' &&
        bStatus !== 'QUALITY_FAILURE' &&
        bStatus !== 'PROVIDER_RATE_LIMIT') ||
      (r.baselineUsage?.error && r.baselineUsage?.error?.status !== 429);
    const cIsOtherError =
      (cStatus &&
        cStatus !== 'PASS' &&
        cStatus !== 'QUALITY_FAILURE' &&
        cStatus !== 'PROVIDER_RATE_LIMIT') ||
      (r.candidateUsage?.error && r.candidateUsage?.error?.status !== 429);
    if (bIsOtherError) bProviderErrorCount++;
    if (cIsOtherError) cProviderErrorCount++;

    const bIsEvaluated = r.baselineQualityEvaluated !== undefined
      ? r.baselineQualityEvaluated === true
      : (bStatus === 'PASS' || bStatus === 'QUALITY_FAILURE');
    const cIsEvaluated = r.candidateQualityEvaluated !== undefined
      ? r.candidateQualityEvaluated === true
      : (cStatus === 'PASS' || cStatus === 'QUALITY_FAILURE');

    if (bIsEvaluated) {
      bEvaluatedCount++;
      bReliableCount++;
      const bScore = r.baselineScore ?? (r.baselineOutput === r.expectedOutput ? 1.0 : 0.0);
      bQualitySum += bScore;
      if (r.baselineScore !== null && r.baselineScore !== undefined ? r.baselineScore >= 0.8 : bStatus === 'PASS') {
        bPassed++;
      } else {
        bQualityFailures++;
      }
      if (r.baselineLatencyMs !== null && r.baselineLatencyMs !== undefined) {
        bSuccessfulLatencySum += r.baselineLatencyMs;
      }
    }

    if (cIsEvaluated) {
      cEvaluatedCount++;
      cReliableCount++;
      const cScore = r.candidateScore ?? (r.passed ? 1.0 : 0.0);
      cQualitySum += cScore;
      if (r.passed === true) {
        cPassed++;
      } else if (r.passed === false) {
        cQualityFailures++;
      }
      if (r.candidateLatencyMs !== null && r.candidateLatencyMs !== undefined) {
        cSuccessfulLatencySum += r.candidateLatencyMs;
      }
    }

    // Regressions evaluated ONLY on scenarios where both received valid model responses
    if (bIsEvaluated && cIsEvaluated) {
      const bScore = r.baselineScore ?? (r.baselineOutput === r.expectedOutput ? 1.0 : 0.0);
      const bPass = bScore >= 0.8;
      const cPass = r.passed;

      if (bPass && !cPass) {
        regressedCasesCount++;
        if (r.severity === 'critical' || r.category === 'Policy Gate' || r.category === 'Safety') {
          criticalRegressedCount++;
        }
      }
      if (!bPass && cPass) {
        improvedCasesCount++;
      }
    }

    // Usage records
    if (r.baselineUsage) {
      bInputTokens += r.baselineUsage.inputTokens || 0;
      bOutputTokens += r.baselineUsage.outputTokens || 0;
      bTotalTokens += r.baselineUsage.totalTokens !== undefined
        ? r.baselineUsage.totalTokens
        : ((r.baselineUsage.inputTokens || 0) + (r.baselineUsage.outputTokens || 0));
      if (r.baselineUsage.reasoningTokens !== undefined) {
        bReasoningTokens += r.baselineUsage.reasoningTokens;
        hasReasoningData = true;
      }
      if (r.baselineUsage.cachedTokens !== undefined) {
        bCachedTokens += r.baselineUsage.cachedTokens;
        hasCachedData = true;
      }
      bTotalCost += r.baselineUsage.estimatedCostUsd || 0;
      if (r.baselineUsage.error) bErrors++;
    }

    if (r.candidateUsage) {
      cInputTokens += r.candidateUsage.inputTokens || 0;
      cOutputTokens += r.candidateUsage.outputTokens || 0;
      cTotalTokens += r.candidateUsage.totalTokens !== undefined
        ? r.candidateUsage.totalTokens
        : ((r.candidateUsage.inputTokens || 0) + (r.candidateUsage.outputTokens || 0));
      if (r.candidateUsage.reasoningTokens !== undefined) {
        cReasoningTokens += r.candidateUsage.reasoningTokens;
        hasReasoningData = true;
      }
      if (r.candidateUsage.cachedTokens !== undefined) {
        cCachedTokens += r.candidateUsage.cachedTokens;
        hasCachedData = true;
      }
      cTotalCost += r.candidateUsage.estimatedCostUsd || 0;
      if (r.candidateUsage.error) cErrors++;
    }
  }

  // 2. Derive Normalized Metrics
  const runMetrics = options.runMetrics;

  // Use canonical runMetrics if supplied, otherwise fallback to local calculation
  const bEvaluated = runMetrics?.baselineEvaluatedCases !== undefined ? runMetrics.baselineEvaluatedCases : bEvaluatedCount;
  const cEvaluated = runMetrics?.candidateEvaluatedCases !== undefined ? runMetrics.candidateEvaluatedCases : cEvaluatedCount;

  // 1. Pass Rate: binary criteria satisfaction strictly over successfully evaluated cases
  const bPassRate = runMetrics?.baselinePassRate !== undefined
    ? runMetrics.baselinePassRate
    : (bEvaluated > 0 ? (bPassed / bEvaluated) * 100 : null);
  const cPassRate = runMetrics?.candidatePassRate !== undefined
    ? runMetrics.candidatePassRate
    : (cEvaluated > 0 ? (cPassed / cEvaluated) * 100 : null);

  // 2. Quality Score: continuous / weighted evaluator score strictly over successfully evaluated cases
  const bQualityScore = runMetrics?.baselineQualityScore !== undefined
    ? runMetrics.baselineQualityScore
    : (bEvaluated > 0 ? (bQualitySum / bEvaluated) * 100 : null);
  const cQualityScore = runMetrics?.candidateQualityScore !== undefined
    ? runMetrics.candidateQualityScore
    : (cEvaluated > 0 ? (cQualitySum / cEvaluated) * 100 : null);

  const bCoverage = (bEvaluated / totalCases) * 100;
  const cCoverage = (cEvaluated / totalCases) * 100;
  const bReliability = (bReliableCount / totalCases) * 100;
  const cReliability = (cReliableCount / totalCases) * 100;

  // Latency calculated ONLY from actual successful provider requests!
  const bAvgLatency = runMetrics?.baselineMeanSuccessfulLatencyMs !== undefined
    ? runMetrics.baselineMeanSuccessfulLatencyMs
    : (bEvaluated > 0 ? Math.round(bSuccessfulLatencySum / bEvaluated) : null);
  const cAvgLatency = runMetrics?.candidateMeanSuccessfulLatencyMs !== undefined
    ? runMetrics.candidateMeanSuccessfulLatencyMs
    : (cEvaluated > 0 ? Math.round(cSuccessfulLatencySum / cEvaluated) : null);

  const bMedianLatency = runMetrics?.baselineMedianLatencyMs !== undefined
    ? runMetrics.baselineMedianLatencyMs
    : null;
  const cMedianLatency = runMetrics?.candidateMedianLatencyMs !== undefined
    ? runMetrics.candidateMedianLatencyMs
    : null;

  const bP95Latency = runMetrics?.baselineP95LatencyMs !== undefined
    ? runMetrics.baselineP95LatencyMs
    : null;
  const cP95Latency = runMetrics?.candidateP95LatencyMs !== undefined
    ? runMetrics.candidateP95LatencyMs
    : null;

  const bErrorRate = (bErrors / totalCases) * 100;
  const cErrorRate = (cErrors / totalCases) * 100;

  const bCostVal = runMetrics?.baselineEstimatedCost !== undefined
    ? runMetrics.baselineEstimatedCost
    : (bEvaluated > 0 ? bTotalCost : null);
  const cCostVal = runMetrics?.candidateEstimatedCost !== undefined
    ? runMetrics.candidateEstimatedCost
    : (cEvaluated > 0 ? cTotalCost : null);

  const bTokensVal = runMetrics?.baselineTotalTokens !== undefined
    ? runMetrics.baselineTotalTokens
    : (bEvaluated > 0 ? bTotalTokens : null);
  const cTokensVal = runMetrics?.candidateTotalTokens !== undefined
    ? runMetrics.candidateTotalTokens
    : (cEvaluated > 0 ? cTotalTokens : null);

  const minCoverage = settings.minEvaluationCoveragePercent ?? 80.0;
  const isInsufficientCoverage = bCoverage < minCoverage || cCoverage < minCoverage;

  const metrics: MetricComparison = {
    correctness: calculateDelta('Correctness Rate', bPassRate, cPassRate, '%', true, 'Exact match and criteria satisfaction rate on evaluated responses'),
    passRate: calculateDelta('Pass Rate', bPassRate, cPassRate, '%', true, 'Proportion of evaluated scenarios meeting acceptance thresholds (binary pass/fail)'),
    qualityScore: calculateDelta('Quality Score', bQualityScore, cQualityScore, 'pts', true, 'Continuous evaluator score across evaluated criteria'),
    evaluationCoverage: calculateDelta('Evaluation Coverage', bCoverage, cCoverage, '%', true, 'Proportion of dataset scenarios that completed with valid model responses'),
    providerReliability: calculateDelta('Provider Reliability', bReliability, cReliability, '%', true, 'Operational request success rate excluding HTTP 429 quota exhaustion and gateway errors'),
    rateLimitCount: calculateDelta('Rate Limit Failures (429)', bRateLimitCount, cRateLimitCount, 'cases', false, 'Number of requests throttled by upstream provider quota limits'),
    providerErrorCount: calculateDelta('Provider Errors', bProviderErrorCount, cProviderErrorCount, 'cases', false, 'Non-429 operational errors including timeouts, auth, and network failures'),
    qualityFailureCount: calculateDelta('Quality Failures', bQualityFailures, cQualityFailures, 'cases', false, 'Total evaluated cases failing validation or criteria checks'),
    avgLatencyMs: calculateDelta('Mean Latency (Successful)', bAvgLatency, cAvgLatency, 'ms', false, 'Average response time of successful model responses only (excludes 429/errors)'),
    inputTokens: calculateDelta('Input Tokens', bEvaluated > 0 ? bInputTokens : null, cEvaluated > 0 ? cInputTokens : null, 'tok', false, 'Total prompt tokens ingested across successfully evaluated cases (failed/rate-limited requests contribute 0 tokens)'),
    outputTokens: calculateDelta('Output Tokens', bEvaluated > 0 ? bOutputTokens : null, cEvaluated > 0 ? cOutputTokens : null, 'tok', false, 'Total tokens generated across successfully evaluated cases'),
    totalTokens: calculateDelta('Total Tokens', bTokensVal, cTokensVal, 'tok', false, 'Authoritative total token volume reported by providers across successfully evaluated cases (never double-counted)'),
    estimatedCostUsd: calculateDelta('Estimated Run Cost', bCostVal, cCostVal, '$', false, 'Total cost normalized across provider pricing schedules (percentage computed from exact unrounded values)'),
    errorRate: calculateDelta('Provider Error Rate', bErrorRate, cErrorRate, '%', false, 'Rate of network, rate limit, or proxy failures'),
  };

  if (bMedianLatency !== null || cMedianLatency !== null) {
    metrics.medianLatencyMs = calculateDelta(
      'Median Latency (Successful)',
      bMedianLatency,
      cMedianLatency,
      'ms',
      false,
      'Median response time of successful model responses only (excludes 429/errors)'
    );
  }

  if (bP95Latency !== null || cP95Latency !== null) {
    metrics.p95LatencyMs = calculateDelta(
      'P95 Latency (Tail)',
      bP95Latency,
      cP95Latency,
      'ms',
      false,
      '95th percentile response time of successful model responses only'
    );
  }

  if (hasReasoningData) {
    metrics.reasoningTokens = calculateDelta(
      'Provider-Reported Reasoning/Thinking Telemetry',
      bEvaluatedCount > 0 ? bReasoningTokens : null,
      cEvaluatedCount > 0 ? cReasoningTokens : null,
      'tok',
      false,
      'Provider token semantics may differ; this telemetry is not assumed to be additive or directly comparable.'
    );
  }

  if (hasCachedData) {
    metrics.cachedTokens = calculateDelta(
      'Cached Tokens',
      bEvaluatedCount > 0 ? bCachedTokens : null,
      cEvaluatedCount > 0 ? cCachedTokens : null,
      'tok',
      true,
      'Prompt cached tokens receiving pricing discounts'
    );
  }

  // 3. Overall Winner Determination
  let winner: ComparisonWinner = 'tie';
  let winnerReason = '';

  const datasetRequiredCases =
    settings.requiredBenchmarkCases ??
    ((datasetName && datasetName.includes('Checkout Reliability'))
      ? (totalCases >= 27 ? totalCases : 27)
      : totalCases > 0 ? totalCases : 27);
  const isPreliminary = cEvaluatedCount < datasetRequiredCases;

  if (bEvaluatedCount === 0 || cEvaluatedCount === 0) {
    winner = 'tie';
    winnerReason = 'Inconclusive comparison: One or both configurations produced zero evaluated responses due to provider failure or rate-limiting.';
  } else if (isPreliminary) {
    winner = 'tie';
    winnerReason = `Preliminary subset (${cEvaluatedCount}/${datasetRequiredCases} scenarios evaluated). No comparison winner is certified until the full benchmark completes.`;
  } else if (isInsufficientCoverage) {
    winner = 'tie';
    winnerReason = `Inconclusive comparison: Evaluation coverage is below required threshold (${minCoverage}%). Baseline: ${bCoverage.toFixed(1)}% (${bEvaluatedCount}/${totalCases} evaluated, ${bRateLimitCount} rate-limited), Candidate: ${cCoverage.toFixed(1)}% (${cEvaluatedCount}/${totalCases} evaluated, ${cRateLimitCount} rate-limited).`;
  } else if (criticalRegressedCount > 0) {
    winner = 'baseline';
    winnerReason = `Baseline retained dominance: Candidate introduced ${criticalRegressedCount} critical safety/policy regression(s).`;
  } else {
    // Normalized composite scores (0 to 100)
    const normBLatencyScore = Math.max(0, 100 - ((bAvgLatency ?? 0) / 30));
    const normCLatencyScore = Math.max(0, 100 - ((cAvgLatency ?? 0) / 30));
    const normBCostScore = Math.max(0, 100 - ((bTotalCost ?? 0) * 500));
    const normCCostScore = Math.max(0, 100 - ((cTotalCost ?? 0) * 500));
    const normBSafetyScore = Math.max(0, 100 - (bEvaluatedCount > 0 ? (bQualityFailures / bEvaluatedCount) * 100 : 0));
    const normCSafetyScore = Math.max(0, 100 - (cEvaluatedCount > 0 ? (cQualityFailures / cEvaluatedCount) * 100 : 0));

    const bComposite =
      ((bPassRate ?? 0) * (weights.correctnessWeight ?? 0.4)) +
      ((bQualityScore ?? 0) * (weights.qualityWeight ?? 0.25)) +
      (normBLatencyScore * (weights.latencyWeight ?? 0.15)) +
      (normBCostScore * (weights.costWeight ?? 0.1)) +
      (normBSafetyScore * (weights.safetyWeight ?? 0.1));

    const cComposite =
      ((cPassRate ?? 0) * (weights.correctnessWeight ?? 0.4)) +
      ((cQualityScore ?? 0) * (weights.qualityWeight ?? 0.25)) +
      (normCLatencyScore * (weights.latencyWeight ?? 0.15)) +
      (normCCostScore * (weights.costWeight ?? 0.1)) +
      (normCSafetyScore * (weights.safetyWeight ?? 0.1));

    const deltaScore = cComposite - bComposite;

    if (deltaScore > 1.5) {
      winner = 'candidate';
      winnerReason = `Candidate outperformed baseline by +${deltaScore.toFixed(1)} weighted points (higher quality & reliability).`;
    } else if (deltaScore < -1.5) {
      winner = 'baseline';
      winnerReason = `Baseline demonstrated higher overall reliability (+${Math.abs(deltaScore).toFixed(1)} weighted score lead).`;
    } else {
      winner = 'tie';
      winnerReason = 'Candidate and baseline performed within 1.5% parity across accuracy, latency, and cost.';
    }
  }

  // 4. Canonical Release Decision & Evidence
  const hasUnequalSampleSizes = bEvaluatedCount !== cEvaluatedCount;
  const sampleSizeWarning = hasUnequalSampleSizes
    ? `Unequal evaluation sample sizes: Baseline evaluated ${bEvaluatedCount} cases, Candidate evaluated ${cEvaluatedCount} cases.`
    : undefined;
  const latencyPercentileWarning = totalCases < 20
    ? 'Low sample size for percentile interpretation (N < 20). Tail latency is unstable.'
    : undefined;

  const releaseOutcome = evaluateReleaseDecision({
    metrics: {
      totalCases,
      sampleSize: totalCases,
      evidenceStrength: calculateEvidenceStrength(cEvaluatedCount),
      evidenceStrengthReason: getEvidenceStrengthReason(cEvaluatedCount, datasetRequiredCases, 100),
      baselinePassed: bPassed,
      candidatePassed: cPassed,
      baselineAccuracy: bPassRate,
      candidateAccuracy: cPassRate,
      accuracyDelta: (cPassRate !== null && bPassRate !== null) ? cPassRate - bPassRate : null,
      baselineAvgLatencyMs: bAvgLatency,
      candidateAvgLatencyMs: cAvgLatency,
      latencyDeltaPercent: (bAvgLatency !== null && cAvgLatency !== null && bAvgLatency > 0) ? Math.round(((cAvgLatency - bAvgLatency) / bAvgLatency) * 100) : null,
      baselineEstimatedCost: bCostVal,
      candidateEstimatedCost: cCostVal,
      regressedCasesCount,
      improvedCasesCount,
      baselineEvaluatedCases: bEvaluatedCount,
      candidateEvaluatedCases: cEvaluatedCount,
      baselineEvaluationCoverage: bCoverage,
      candidateEvaluationCoverage: cCoverage,
      baselinePassRate: bPassRate,
      candidatePassRate: cPassRate,
      baselineQualityScore: bQualityScore,
      candidateQualityScore: cQualityScore,
      qualityScoreDelta: (cQualityScore !== null && bQualityScore !== null) ? cQualityScore - bQualityScore : null,
      isInsufficientCoverage,
      hasUnequalSampleSizes,
      sampleSizeWarning,
      latencyPercentileWarning,
      minimumEvaluatedCases: settings.minimumEvaluatedCases ?? 100,
      baselineTotalTokens: bTokensVal,
      candidateTotalTokens: cTokensVal,
      authenticationFailures: cAuthCount,
    },
    settings,
    caseResults,
    datasetName,
  });

  const failedGates = releaseOutcome.gates.filter((g) => g.status === 'FAIL');
  const tempQualityDelta =
    bQualityScore !== null && cQualityScore !== null
      ? Number((cQualityScore - bQualityScore).toFixed(1))
      : null;
  if (winner === 'candidate' && failedGates.length > 0 && tempQualityDelta !== null && tempQualityDelta > 0) {
    const failedGateNames = failedGates.map((g) => g.gate).join(', ');
    winnerReason = `Candidate achieved relative quality improvement (+${tempQualityDelta.toFixed(1)} pts vs baseline), but failed production release gates (${failedGateNames}).`;
  }

  // Map recommendation directly from canonical release decision outcome
  let recommendation: RecommendationVerdict;
  switch (releaseOutcome.decision) {
    case 'BLOCK':
      recommendation = 'BLOCK RELEASE';
      break;
    case 'INSUFFICIENT_EVIDENCE':
      recommendation = 'INSUFFICIENT EVIDENCE';
      break;
    case 'REGRESSION_DETECTED':
      recommendation = 'REGRESSION DETECTED';
      break;
    case 'SHIP_WITH_CONDITIONS':
      recommendation = 'SHIP WITH CONDITIONS';
      break;
    case 'SHIP':
      recommendation = 'SHIP';
      break;
    case 'NO_REGRESSION':
      recommendation = 'NO REGRESSION';
      break;
    default:
      recommendation = 'INSUFFICIENT EVIDENCE';
  }

  const recommendationReason = releaseOutcome.reason || releaseOutcome.summary;
  let regressionStatus: 'REGRESSION_DETECTED' | 'NO_REGRESSION' | 'INSUFFICIENT_EVIDENCE' = 'NO_REGRESSION';
  if (bEvaluatedCount === 0 || cEvaluatedCount === 0 || releaseOutcome.decision === 'INSUFFICIENT_EVIDENCE') {
    regressionStatus = 'INSUFFICIENT_EVIDENCE';
  } else if (releaseOutcome.decision === 'REGRESSION_DETECTED') {
    regressionStatus = 'REGRESSION_DETECTED';
  } else if (releaseOutcome.decision === 'BLOCK') {
    regressionStatus = releaseOutcome.isRegression ? 'REGRESSION_DETECTED' : 'INSUFFICIENT_EVIDENCE';
  } else {
    regressionStatus = 'NO_REGRESSION';
  }

  const actionItems = [...releaseOutcome.actionItems];
  const evidence: string[] = [
    releaseOutcome.summary,
    ...releaseOutcome.violatedRules,
  ];

  if (isInsufficientCoverage) {
    evidence.push(`Baseline evaluation coverage: ${bCoverage.toFixed(1)}% (${bEvaluatedCount}/${totalCases} scenarios completed).`);
    evidence.push(`Candidate evaluation coverage: ${cCoverage.toFixed(1)}% (${cEvaluatedCount}/${totalCases} scenarios completed).`);
  }

  // Benchmark-Completion & Evidence Strength Aware Confidence Score Scaling:
  let sampleConfidence = 0;
  if (isInsufficientCoverage || cEvaluatedCount === 0) {
    sampleConfidence = 15;
    evidence.push(`Evidence Strength: INSUFFICIENT (${Math.min(bCoverage, cCoverage).toFixed(1)}% coverage < ${minCoverage}% threshold).`);
  } else if (isPreliminary) {
    sampleConfidence = Math.min(48, Math.round((cEvaluatedCount / datasetRequiredCases) * 45));
    evidence.push(`Evidence Strength: LOW — ${releaseOutcome.evidenceStrengthReason}`);
  } else if (releaseOutcome.evidenceStrength === 'MODERATE') {
    sampleConfidence = 78 + Math.min(10, Math.round(((cEvaluatedCount - datasetRequiredCases) / 73) * 10));
    evidence.push(`Evidence Strength: MODERATE — ${releaseOutcome.evidenceStrengthReason}`);
  } else {
    sampleConfidence = 92 + Math.min(6, Math.round(((cEvaluatedCount - 100) / 400) * 6));
    evidence.push(`Evidence Strength: STRONG — ${releaseOutcome.evidenceStrengthReason}`);
  }

  const penalty = isInsufficientCoverage ? 0 : cErrorRate * 0.8;
  const confidenceScore = Math.max(10, Math.min(99, Math.round(sampleConfidence - penalty)));

  const qualityDelta =
    bQualityScore !== null && cQualityScore !== null
      ? Number((cQualityScore - bQualityScore).toFixed(1))
      : null;
  const tokenDelta =
    bTokensVal !== null && cTokensVal !== null ? cTokensVal - bTokensVal : null;
  const latencyDelta =
    bAvgLatency !== null && cAvgLatency !== null
      ? Math.round(cAvgLatency - bAvgLatency)
      : null;
  const costDelta =
    bCostVal !== null && cCostVal !== null
      ? Number((cCostVal - bCostVal).toFixed(6))
      : null;

  const caseApplicableGroundedness = caseResults.filter((r) => r.groundednessEvaluation && r.groundednessEvaluation.status !== 'NOT_APPLICABLE').length;
  const groundednessApplicableCases =
    caseApplicableGroundedness > 0
      ? caseApplicableGroundedness
      : (options.runMetrics?.groundednessApplicableCases ?? 0);

  const caseEvaluatedGroundedness = caseResults.filter((r) => r.groundednessEvaluation && r.groundednessEvaluation.status === 'EXECUTED').length;
  const groundednessEvaluatedCases =
    caseEvaluatedGroundedness > 0
      ? caseEvaluatedGroundedness
      : (options.runMetrics?.groundednessEvaluatedCases ?? 0);

  const caseFailedGroundedness = caseResults.filter((r) => r.groundednessEvaluation && r.groundednessEvaluation.status === 'EXECUTED' && !r.groundednessEvaluation.passed).length;
  const groundednessFailedCases =
    caseFailedGroundedness > 0
      ? caseFailedGroundedness
      : (options.runMetrics?.groundednessFailedCases ?? 0);

  const validGroundednessScores = caseResults
    .filter((r) => r.groundednessEvaluation?.score !== null && r.groundednessEvaluation?.score !== undefined)
    .map((r) => r.groundednessEvaluation!.score!);
  const groundednessAvgScore =
    validGroundednessScores.length > 0
      ? Number((validGroundednessScores.reduce((a, b) => a + b, 0) / validGroundednessScores.length).toFixed(3))
      : (options.runMetrics?.groundednessAvgScore !== undefined ? options.runMetrics.groundednessAvgScore : null);

  const factualityGroundednessStatus: import('../domain/types').EvaluationEvidenceState =
    groundednessEvaluatedCases > 0
      ? 'EXECUTED'
      : options.runMetrics?.factualityGroundednessStatus === 'EXECUTED'
      ? 'EXECUTED'
      : caseResults.some((r) => r.groundednessEvaluation?.status === 'NOT_APPLICABLE')
      ? 'NOT_APPLICABLE'
      : (options.runMetrics?.factualityGroundednessStatus && options.runMetrics.factualityGroundednessStatus !== 'NOT_CONFIGURED'
          ? options.runMetrics.factualityGroundednessStatus
          : 'NOT_CONFIGURED');

  return {
    id: `rep-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    title: `${baselineVersion.name} vs ${candidateVersion.name}`,
    timestamp: new Date().toISOString(),
    datasetId,
    datasetName,
    totalCases,
    baseline: {
      provider: baselineVersion.provider,
      model: baselineVersion.modelIdentifier,
      promptVersion: baselineVersion.promptVersion,
      temperature: baselineVersion.temperature,
    },
    candidate: {
      provider: candidateVersion.provider,
      model: candidateVersion.modelIdentifier,
      promptVersion: candidateVersion.promptVersion,
      temperature: candidateVersion.temperature,
    },
    winner,
    winnerReason,
    metrics,
    qualityDelta,
    tokenDelta,
    latencyDelta,
    costDelta,
    regressionStatus,
    confidenceScore,
    evidence,
    recommendation,
    recommendationReason,
    actionItems,
    executionMode: options.executionMode || 'SAVED',
    provenance: options.provenance,
    evidenceStrength: releaseOutcome.evidenceStrength,
    evidenceStrengthReason: releaseOutcome.evidenceStrengthReason,
    benchmarkCompletion: releaseOutcome.benchmarkCompletion,
    releaseGates: releaseOutcome.gates,
    overallGateStatus: releaseOutcome.overallGateStatus,
    dimensions: releaseOutcome.dimensions,
    isPreliminary,
    regressionCategories: releaseOutcome.regressionCategories,
    limitations: releaseOutcome.limitations,
    minimumEvaluatedCases: settings.minimumEvaluatedCases ?? 100,
    hasUnequalSampleSizes,
    sampleSizeWarning,
    latencyPercentileWarning,
    semanticEvaluationStatus: options.runMetrics?.semanticEvaluationStatus || (caseResults.some((r) => r.semanticEvaluation) ? 'EXECUTED' : 'NOT_CONFIGURED'),
    llmJudgeStatus: options.runMetrics?.llmJudgeStatus || (caseResults.some((r) => r.llmJudgeEvaluation && !r.llmJudgeEvaluation.error) ? 'EXECUTED' : caseResults.some((r) => r.llmJudgeEvaluation?.error) ? 'FAILED' : 'NOT_CONFIGURED'),
    factualityGroundednessStatus,
    groundednessApplicableCases,
    groundednessEvaluatedCases,
    groundednessFailedCases,
    groundednessAvgScore,
    judgeCostUsd: options.runMetrics?.judgeEstimatedCost ?? null,
    benchmarkCostUsd: ((options.runMetrics?.baselineEstimatedCost || 0) + (options.runMetrics?.candidateEstimatedCost || 0)) || null,
    totalInfrastructureCostUsd: options.runMetrics?.totalInfrastructureCost ?? null,
    judgeModel: options.runMetrics?.judgeModel || caseResults.find((r) => r.llmJudgeEvaluation)?.llmJudgeEvaluation?.judgeModel,
    judgeEvaluatedCases: options.runMetrics?.judgeEvaluatedCases ?? caseResults.filter((r) => r.llmJudgeEvaluation && !r.llmJudgeEvaluation.error).length,
    safetyBreakdown: releaseOutcome.safetyBreakdown,
  };
}

export function createEmptyReport(
  datasetId: string,
  datasetName: string,
  baselineVersion: ModelVersion,
  candidateVersion: ModelVersion
): ComparisonReport {
  const dummyDelta = (name: string): MetricDelta => ({
    metric: name,
    baselineValue: null,
    candidateValue: null,
    unit: '',
    absoluteDelta: null,
    percentageDelta: null,
    isImprovement: null,
    assessment: 'PARITY',
    description: '',
  });

  return {
    id: `rep-empty-${Date.now()}`,
    title: `${baselineVersion.name} vs ${candidateVersion.name}`,
    timestamp: new Date().toISOString(),
    datasetId,
    datasetName,
    totalCases: 0,
    baseline: {
      provider: baselineVersion.provider,
      model: baselineVersion.modelIdentifier,
    },
    candidate: {
      provider: candidateVersion.provider,
      model: candidateVersion.modelIdentifier,
    },
    winner: 'tie',
    winnerReason: 'No test scenarios evaluated.',
    metrics: {
      correctness: dummyDelta('Correctness'),
      passRate: dummyDelta('Pass Rate'),
      qualityScore: dummyDelta('Quality Score'),
      evaluationCoverage: dummyDelta('Evaluation Coverage'),
      providerReliability: dummyDelta('Provider Reliability'),
      rateLimitCount: dummyDelta('Rate Limit Failures (429)'),
      providerErrorCount: dummyDelta('Provider Errors'),
      qualityFailureCount: dummyDelta('Quality Failures'),
      avgLatencyMs: dummyDelta('Latency'),
      inputTokens: dummyDelta('Input Tokens'),
      outputTokens: dummyDelta('Output Tokens'),
      totalTokens: dummyDelta('Total Tokens'),
      estimatedCostUsd: dummyDelta('Cost'),
      errorRate: dummyDelta('Error Rate'),
    },
    qualityDelta: null,
    tokenDelta: null,
    latencyDelta: null,
    costDelta: null,
    regressionStatus: 'INSUFFICIENT_EVIDENCE',
    confidenceScore: 0,
    evidence: ['No cases in dataset'],
    recommendation: 'INSUFFICIENT EVIDENCE',
    recommendationReason: 'Empty dataset.',
    actionItems: ['Add test cases to dataset.'],
    executionMode: 'SAVED',
    evidenceStrength: 'NONE',
    evidenceStrengthReason: 'Zero test scenarios evaluated.',
    benchmarkCompletion: {
      status: 'PRELIMINARY_SUBSET',
      evaluatedCases: 0,
      requiredCases: 27,
      isComplete: false,
      label: '0/27 scenarios evaluated',
    },
    releaseGates: [],
    overallGateStatus: 'INCONCLUSIVE',
    dimensions: {
      quality: 'PARITY',
      latency: 'PARITY',
      cost: 'PARITY',
      reliability: 'PARITY',
    },
    isPreliminary: true,
    regressionCategories: [],
    limitations: [
      'Empty dataset; 0 scenarios evaluated.',
      'Deterministic criteria only; semantic reasoning not evaluated.',
      'Factuality / Groundedness evaluator not configured.',
    ],
    hasUnequalSampleSizes: false,
    semanticEvaluationStatus: 'NOT_CONFIGURED',
    llmJudgeStatus: 'NOT_CONFIGURED',
    factualityGroundednessStatus: 'NOT_CONFIGURED',
    groundednessApplicableCases: 0,
    groundednessEvaluatedCases: 0,
    groundednessFailedCases: 0,
    groundednessAvgScore: null,
  };
}
