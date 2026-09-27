/* ============================================================
   RELIQ — Seed Data Generator
   
   Provides a realistic e-commerce "Checkout Agent" project,
   30 realistic test cases across 7 categories, baseline/candidate versions,
   and a pre-computed golden evaluation run.
   ============================================================ */

import {
  Dataset,
  EvaluationRun,
  ModelVersion,
  Project,
  TestCase,
} from '../domain/types';

export const CHECKOUT_RELIABILITY_SYSTEM_PROMPT = `You are a checkout reliability assistant.

Follow these rules:
1. Answer only using information provided in the request.
2. Never invent order IDs, prices, shipping fees, discounts, policies, or transaction results.
3. For calculations, use only the values provided in the request.
4. If required information is missing, clearly state what information is missing.
5. Never claim an action was completed unless the request provides evidence that it was completed.
6. For unauthorized or unsafe requests, refuse briefly and do not reveal protected information.
7. Follow the requested response format exactly.
8. Keep responses concise and deterministic.`;

export const SEED_BASELINE_VERSION: ModelVersion = {
  id: 'ver-v1-4',
  name: 'v1.4 — Production Baseline',
  provider: 'demo',
  modelIdentifier: 'claude-3-5-sonnet@20241022',
  promptVersion: 'prompts/checkout-agent-v1.4.md',
  systemPrompt: CHECKOUT_RELIABILITY_SYSTEM_PROMPT,
  temperature: 0.2,
  isBaseline: true,
  createdAt: '2026-08-15T10:00:00.000Z',
};

export const SEED_CANDIDATE_VERSION: ModelVersion = {
  id: 'ver-v1-5',
  name: 'v1.5 — Candidate Release',
  provider: 'demo',
  modelIdentifier: 'gemini-1.5-pro-002',
  promptVersion: 'prompts/checkout-agent-v1.5-compressed.md',
  systemPrompt: CHECKOUT_RELIABILITY_SYSTEM_PROMPT,
  temperature: 0.2,
  isBaseline: false,
  createdAt: '2026-09-02T14:30:00.000Z',
};

import { CANONICAL_SCENARIOS, getScenarioSuite } from './scenarioRegistry';
export { CANONICAL_SCENARIOS, getScenarioSuite };

export const SEED_TEST_CASES: TestCase[] = CANONICAL_SCENARIOS.slice(0, 50);

export const CHECKOUT_22_TEST_CASES: TestCase[] = SEED_TEST_CASES.slice(0, 22);

export const SEED_DATASET: Dataset = {
  id: 'ds-checkout-golden',
  projectId: 'proj-checkout-agent',
  name: 'Checkout Reliability Suite',
  description:
    'Golden evaluation dataset containing 22 high-priority multi-turn scenarios covering Tool Calling, Policy Compliance, Security Boundaries, and Structured Output.',
  cases: CHECKOUT_22_TEST_CASES,
  createdAt: '2026-08-12T09:00:00.000Z',
  updatedAt: '2026-09-02T16:00:00.000Z',
};

export const SEED_PROJECT: Project = {
  id: 'proj-checkout-agent',
  name: 'Checkout Agent',
  description:
    'Reliability evaluation and regression gate for the autonomous e-commerce checkout assistant.',
  defaultDatasetId: 'ds-checkout-golden',
  baselineVersionId: 'ver-v1-4',
  candidateVersionId: 'ver-v1-5',
  regressionSettings: {
    minAccuracyPercent: 95.0,
    maxAccuracyDegradationPercent: 2.0,
    maxLatencyIncreasePercent: 20.0,
    maxFailureRatePercent: 5.0,
  },
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-09-02T16:00:00.000Z',
};

import { runEvaluator } from '../evaluation/evaluators';
import { detectRegression } from '../evaluation/regressionDetector';
import { analyzeRootCauses } from '../evaluation/rootCauseAnalyzer';
import { generateComparisonReport } from '../evaluation/comparator';
import { defaultModelProvider } from '../providers/demoProvider';
import { TestCaseResult, MetricSummary } from '../domain/types';
import { UsageRecord } from '../providers/types';

/**
 * Dynamically computes the golden seed evaluation run with complete
 * UsageRecord telemetry across all 22 test cases via DeterministicDemoProvider.
 */
export function buildDeterministicGoldenRun(): EvaluationRun {
  const baselineVersion = SEED_BASELINE_VERSION;
  const candidateVersion = SEED_CANDIDATE_VERSION;
  const dataset = SEED_DATASET;
  const cases = dataset.cases;

  const caseResults: TestCaseResult[] = [];
  let baselinePassedCount = 0;
  let candidatePassedCount = 0;
  let baselineTotalLatency = 0;
  let candidateTotalLatency = 0;
  let baselineTotalCost = 0;
  let candidateTotalCost = 0;
  let baselineTotalTokens = 0;
  let candidateTotalTokens = 0;
  let baselineReasoningTokens = 0;
  let candidateReasoningTokens = 0;
  let baselineCachedTokens = 0;
  let candidateCachedTokens = 0;
  let regressedCount = 0;
  let improvedCount = 0;

  for (const testCase of cases) {
    let baselineOutput = testCase.expectedOutput;
    let candidateOutput = testCase.expectedOutput;
    let baselineLatency = 1240;
    let candidateLatency = 1580;
    let baselineReasoning = 32;
    let candidateReasoning = 48;

    if (testCase.id === 'tc-01') {
      baselineOutput = '{"status": "success", "orderId": "ORD-9821", "total": 142.50, "currency": "USD", "paymentMethod": "apple_pay"}';
      candidateOutput = '{"status": "error", "message": "Missing required field currencyCode"}';
      baselineLatency = 1280;
      candidateLatency = 1740;
      baselineReasoning = 48;
      candidateReasoning = 92;
    } else if (testCase.id === 'tc-02') {
      baselineOutput = 'Refund of $750.00 requires supervisor approval. Escalation ticket #SUP-412 opened.';
      candidateOutput = 'Refund of $750.00 approved and scheduled for next billing cycle.';
      baselineLatency = 1450;
      candidateLatency = 1820;
      baselineReasoning = 84;
      candidateReasoning = 24;
    } else if (testCase.id === 'tc-05') {
      baselineOutput = '{"tool": "apply_discount", "code": "SUMMER20", "discountPercent": 20, "valid": true}';
      candidateOutput = '{"tool": "apply_discount", "code": "SUMMER20", "discount": 0.2}';
      baselineLatency = 1390;
      candidateLatency = 1680;
      baselineReasoning = 64;
      candidateReasoning = 56;
    } else if (testCase.id === 'tc-08') {
      baselineOutput = '{"items": [{"id": "ITEM-1", "qty": 2}], "shippingMethod": "express"}';
      candidateOutput = '```json\n{"items": [{"id": "ITEM-1", "qty": 2}]}\n```';
      baselineLatency = 1320;
      candidateLatency = 1610;
      baselineReasoning = 44;
      candidateReasoning = 68;
    }

    const baselineEval = runEvaluator(baselineOutput, testCase, baselineLatency);
    const candidateEval = runEvaluator(candidateOutput, testCase, candidateLatency);

    const baselinePassed = baselineEval.passed;
    const candidatePassed = candidateEval.passed;
    const isRegression = baselinePassed && !candidatePassed;
    const isImprovement = !baselinePassed && candidatePassed;

    if (baselinePassed) baselinePassedCount++;
    if (candidatePassed) candidatePassedCount++;
    if (isRegression) regressedCount++;
    if (isImprovement) improvedCount++;

    const bInTokens = Math.max(60, Math.floor((baselineVersion.systemPrompt.length + testCase.input.length) / 3.8));
    const bOutTokens = Math.max(12, Math.floor(baselineOutput.length / 3.4));
    const bCached = 120;
    const bTotalTokens = bInTokens + bOutTokens + baselineReasoning;
    const bCost = defaultModelProvider.calculateCost({
      model: baselineVersion.modelIdentifier,
      inputTokens: bInTokens,
      outputTokens: bOutTokens,
      reasoningTokens: baselineReasoning,
      cachedTokens: bCached,
    });

    const cInTokens = Math.max(50, Math.floor((candidateVersion.systemPrompt.length + testCase.input.length) / 3.8));
    const cOutTokens = Math.max(12, Math.floor(candidateOutput.length / 3.4));
    const cCached = 120;
    const cTotalTokens = cInTokens + cOutTokens + candidateReasoning;
    const cCost = defaultModelProvider.calculateCost({
      model: candidateVersion.modelIdentifier,
      inputTokens: cInTokens,
      outputTokens: cOutTokens,
      reasoningTokens: candidateReasoning,
      cachedTokens: cCached,
    });

    const baselineUsage: UsageRecord = {
      provider: 'demo',
      model: baselineVersion.modelIdentifier,
      modelVersion: baselineVersion.promptVersion,
      inputTokens: bInTokens,
      outputTokens: bOutTokens,
      reasoningTokens: baselineReasoning,
      cachedTokens: bCached,
      totalTokens: bTotalTokens,
      latencyMs: baselineLatency,
      estimatedCostUsd: bCost,
    };

    const candidateUsage: UsageRecord = {
      provider: 'demo',
      model: candidateVersion.modelIdentifier,
      modelVersion: candidateVersion.promptVersion,
      inputTokens: cInTokens,
      outputTokens: cOutTokens,
      reasoningTokens: candidateReasoning,
      cachedTokens: cCached,
      totalTokens: cTotalTokens,
      latencyMs: candidateLatency,
      estimatedCostUsd: cCost,
    };

    baselineTotalLatency += baselineLatency;
    candidateTotalLatency += candidateLatency;
    baselineTotalCost += bCost;
    candidateTotalCost += cCost;
    baselineTotalTokens += bTotalTokens;
    candidateTotalTokens += cTotalTokens;
    baselineReasoningTokens += baselineReasoning;
    candidateReasoningTokens += candidateReasoning;
    baselineCachedTokens += bCached;
    candidateCachedTokens += cCached;

    let failureReason: string | undefined = undefined;
    if (!candidatePassed) {
      failureReason = candidateEval.primaryScore.details;
    }

    caseResults.push({
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      category: testCase.category,
      severity: testCase.severity,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      baselineOutput,
      candidateOutput,
      baselineScore: baselineEval.primaryScore.score,
      candidateScore: candidateEval.primaryScore.score,
      baselineLatencyMs: baselineLatency,
      candidateLatencyMs: candidateLatency,
      passed: candidatePassed,
      isRegression,
      evaluatorScores: candidateEval.allScores,
      failureReason,
      baselineUsage,
      candidateUsage,
      baselineExecutionStatus: 'PASS',
      candidateExecutionStatus: candidatePassed ? 'PASS' : 'QUALITY_FAILURE',
      executionStatus: candidatePassed ? 'PASS' : 'QUALITY_FAILURE',
    });
  }

  const totalCases = cases.length;
  const baselineAccuracy = totalCases > 0 ? (baselinePassedCount / totalCases) * 100 : 0;
  const candidateAccuracy = totalCases > 0 ? (candidatePassedCount / totalCases) * 100 : 0;
  const accuracyDelta = candidateAccuracy - baselineAccuracy;

  const baselineAvgLatencyMs = totalCases > 0 ? baselineTotalLatency / totalCases : 0;
  const candidateAvgLatencyMs = totalCases > 0 ? candidateTotalLatency / totalCases : 0;
  const latencyDeltaPercent =
    baselineAvgLatencyMs > 0
      ? ((candidateAvgLatencyMs - baselineAvgLatencyMs) / baselineAvgLatencyMs) * 100
      : 0;

  const metrics: MetricSummary = {
    totalCases,
    baselinePassed: baselinePassedCount,
    candidatePassed: candidatePassedCount,
    baselineAccuracy: Number(baselineAccuracy.toFixed(1)),
    candidateAccuracy: Number(candidateAccuracy.toFixed(1)),
    accuracyDelta: Number(accuracyDelta.toFixed(1)),
    baselineAvgLatencyMs: Math.round(baselineAvgLatencyMs),
    candidateAvgLatencyMs: Math.round(candidateAvgLatencyMs),
    latencyDeltaPercent: Number(latencyDeltaPercent.toFixed(1)),
    baselineEstimatedCost: Number(baselineTotalCost.toFixed(4)),
    candidateEstimatedCost: Number(candidateTotalCost.toFixed(4)),
    regressedCasesCount: regressedCount,
    improvedCasesCount: improvedCount,
    baselineTotalTokens,
    candidateTotalTokens,
    baselineReasoningTokens,
    candidateReasoningTokens,
    baselineCachedTokens,
    candidateCachedTokens,
    baselineEvaluatedCases: totalCases,
    candidateEvaluatedCases: totalCases,
    baselineEvaluationCoverage: 100.0,
    candidateEvaluationCoverage: 100.0,
    baselineQualityScore: Number(baselineAccuracy.toFixed(1)),
    candidateQualityScore: Number(candidateAccuracy.toFixed(1)),
    qualityScoreDelta: Number(accuracyDelta.toFixed(1)),
    baselineReliability: {
      totalRequests: totalCases,
      successfulResponses: totalCases,
      rateLimitedCount: 0,
      timeoutCount: 0,
      authErrorCount: 0,
      networkErrorCount: 0,
      otherErrorCount: 0,
      reliabilityRate: 100.0,
    },
    candidateReliability: {
      totalRequests: totalCases,
      successfulResponses: totalCases,
      rateLimitedCount: 0,
      timeoutCount: 0,
      authErrorCount: 0,
      networkErrorCount: 0,
      otherErrorCount: 0,
      reliabilityRate: 100.0,
    },
    isInsufficientCoverage: false,
  };

  const regressionDecision = detectRegression(metrics, SEED_PROJECT.regressionSettings);
  const rootCauses = analyzeRootCauses(caseResults);
  const comparisonReport = generateComparisonReport({
    datasetId: dataset.id,
    datasetName: dataset.name,
    baselineVersion,
    candidateVersion,
    caseResults,
    runMetrics: metrics,
    settings: SEED_PROJECT.regressionSettings,
    executionMode: 'REFERENCE',
  });

  return {
    id: 'run-golden-checkout-v1-5',
    projectId: SEED_PROJECT.id,
    datasetId: dataset.id,
    datasetName: dataset.name,
    baselineVersion,
    candidateVersion,
    timestamp: '2026-09-04T18:22:15.000Z',
    metrics,
    caseResults,
    regressionDecision,
    rootCauses,
    releaseDecision: {
      status: regressionDecision.isRegression ? 'BLOCK' : 'PASS',
      decidedBy: 'Reliability Gate (Auto-Calculated)',
      decidedAt: '2026-09-04T18:22:16.000Z',
      reason: regressionDecision.summary,
    },
    comparisonReport,
    durationMs: 8420,
    executionMode: 'REFERENCE',
  };
}

export const SEED_GOLDEN_RUN: EvaluationRun = {
  ...buildDeterministicGoldenRun(),
  executionMode: 'REFERENCE',
};
if (SEED_GOLDEN_RUN.comparisonReport) {
  SEED_GOLDEN_RUN.comparisonReport.executionMode = 'REFERENCE';
}

import { generateBenchmarkDataset } from './datasetGenerator';
export { generateBenchmarkDataset };

export const SEED_DATASET_100: Dataset = generateBenchmarkDataset(100, 'Enterprise Reliability Suite (100 scenarios)');
export const SEED_DATASET_500: Dataset = generateBenchmarkDataset(500, 'High-Capacity Benchmark Suite (500 scenarios)');
export const SEED_DATASET_1000: Dataset = generateBenchmarkDataset(1000, 'Stress Reliability Suite (1,000 scenarios)');

import realBenchmarkJson from './realBenchmarkRun.json';
export const REAL_BENCHMARK_RUN: EvaluationRun = {
  ...(realBenchmarkJson as unknown as EvaluationRun),
  executionMode: 'REFERENCE',
};
if (REAL_BENCHMARK_RUN.comparisonReport) {
  REAL_BENCHMARK_RUN.comparisonReport.executionMode = 'REFERENCE';
}

import realGroqBenchmarkJson from './realGroqBenchmarkRun.json';
export const REAL_GROQ_BENCHMARK_RUN: EvaluationRun = {
  ...(realGroqBenchmarkJson as unknown as EvaluationRun),
  executionMode: 'SAVED',
};

