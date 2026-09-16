/* ============================================================
   RELIQ — Decoupled Evaluation Runner Engine
   
   Orchestrates full evaluation execution:
   Dataset + Baseline Model + Candidate Model -> EvaluationRun
   
   Decoupled from specific AI providers: uses ModelProvider registry
   and captures normalized UsageRecord telemetry (including reasoning
   and cached tokens) on every single scenario.
   ============================================================ */

import {
  Dataset,
  EvaluationRun,
  EvaluatorScore,
  ExecutionStatus,
  MetricSummary,
  ModelVersion,
  Project,
  ProviderErrorDetail,
  ProviderReliabilitySummary,
  RegressionSettings,
  RunProvenance,
  SafetyFailureClassification,
  TestCaseResult,
} from '../domain/types';
import { providerRegistry } from '../providers/registry';
import { ModelProvider, ModelRequest, ModelResponse } from '../providers/types';
import { runEvaluator } from './evaluators';
import { DEFAULT_REGRESSION_SETTINGS, detectRegression } from './regressionDetector';
import { analyzeRootCauses } from './rootCauseAnalyzer';
import { generateComparisonReport } from './comparator';
import { evaluateReleaseDecision, calculateEvidenceStrength, classifySafetyResult } from './releaseEngine';
import { normalizeProviderError } from '../server/serverUtils';

export { normalizeProviderError };

export function calculateMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export function calculateP95(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor(s.length * 0.95));
  return s[idx];
}

export interface EvaluationOptions {
  project: Project;
  dataset: Dataset;
  baselineVersion: ModelVersion;
  candidateVersion: ModelVersion;
  baselineProvider?: ModelProvider;
  candidateProvider?: ModelProvider;
  regressionSettings?: RegressionSettings;
  maxCases?: number;
  concurrency?: number;
  runId?: string;
  onProgress?: (current: number, total: number, latestCaseName?: string) => void;
  onCaseCompleted?: (result: TestCaseResult, current: number, total: number) => void | Promise<void>;
}

/**
 * Classifies model response into standardized execution status, extracts error details,
 * and tracks tripartite status: transportSuccess, evaluationEligible, qualityEvaluated.
 */
export function classifyResponseStatus(
  resp: ModelResponse,
  evaluatorScore?: EvaluatorScore,
  options?: { isMalformed?: boolean }
): {
  status: ExecutionStatus;
  errorDetail?: ProviderErrorDetail;
  isEvaluated: boolean;
  transportSuccess: boolean;
  evaluationEligible: boolean;
  qualityEvaluated: boolean;
  failureCategory?: import('../domain/types').FailureCategory;
} {
  const isMalformed =
    options?.isMalformed === true ||
    resp.usage.error?.code === 'MALFORMED_RESPONSE' ||
    (resp.usage.error?.status === 200 && Boolean(resp.usage.error));

  // If operational transport error (non-200 or network failure)
  if (resp.usage.error && !isMalformed) {
    const err = resp.usage.error;
    const code = err.code || '';
    const msg = err.message || '';
    const status = err.status;
    const lower = msg.toLowerCase();
    const provider = resp.usage.provider;
    const retryAfterSec = resp.usage.rateLimit?.retryAfter
      ? parseInt(resp.usage.rateLimit.retryAfter, 10)
      : undefined;

    // State C: HTTP 429 / quota failure
    if (
      status === 429 ||
      code === 'RATE_LIMIT_EXCEEDED' ||
      code === 'PROVIDER_RATE_LIMIT' ||
      lower.includes('quota') ||
      lower.includes('rate limit') ||
      lower.includes('rate_limit') ||
      lower.includes('too many requests')
    ) {
      return {
        status: 'PROVIDER_RATE_LIMIT',
        isEvaluated: false,
        transportSuccess: false,
        evaluationEligible: false,
        qualityEvaluated: false,
        failureCategory: 'PROVIDER_QUOTA',
        errorDetail: {
          httpStatus: status || 429,
          provider,
          category: 'RATE_LIMIT',
          message: msg || 'Provider rate limit or quota exceeded (HTTP 429)',
          retryAfterSeconds: retryAfterSec,
        },
      };
    }

    // HTTP 402 / credits exhausted / payment required
    if (
      status === 402 ||
      code === 'PROVIDER_CREDITS_EXHAUSTED' ||
      code === 'PAYMENT_REQUIRED' ||
      lower.includes('payment required') ||
      lower.includes('credits exhausted') ||
      lower.includes('insufficient credits')
    ) {
      return {
        status: code === 'PAYMENT_REQUIRED' ? 'PAYMENT_REQUIRED' : 'PROVIDER_CREDITS_EXHAUSTED',
        isEvaluated: false,
        transportSuccess: false,
        evaluationEligible: false,
        qualityEvaluated: false,
        failureCategory: 'PROVIDER_QUOTA',
        errorDetail: {
          httpStatus: status || 402,
          provider,
          category: 'RATE_LIMIT',
          message: msg || 'Provider credits exhausted or payment required (HTTP 402)',
        },
      };
    }

    // HTTP 403 / permission forbidden
    if (
      status === 403 ||
      code === 'PROVIDER_FORBIDDEN' ||
      code === 'FORBIDDEN' ||
      lower.includes('forbidden')
    ) {
      return {
        status: code === 'PROVIDER_FORBIDDEN' ? 'PROVIDER_FORBIDDEN' : 'AUTHENTICATION_ERROR',
        isEvaluated: false,
        transportSuccess: false,
        evaluationEligible: false,
        qualityEvaluated: false,
        failureCategory: 'PROVIDER_AUTHENTICATION',
        errorDetail: {
          httpStatus: status || 403,
          provider,
          category: 'AUTHENTICATION',
          message: msg || 'Provider request forbidden or permission denied (HTTP 403)',
        },
      };
    }

    // State B: HTTP 401 / authentication failure
    if (
      status === 401 ||
      code === 'AUTH_FAILED' ||
      code === 'AUTH_MISSING_KEY' ||
      code === 'AUTHENTICATION_ERROR' ||
      lower.includes('api key') ||
      lower.includes('unauthorized') ||
      lower.includes('permission')
    ) {
      return {
        status: 'AUTHENTICATION_ERROR',
        isEvaluated: false,
        transportSuccess: false,
        evaluationEligible: false,
        qualityEvaluated: false,
        failureCategory: 'PROVIDER_AUTHENTICATION',
        errorDetail: {
          httpStatus: status || 401,
          provider,
          category: 'AUTHENTICATION',
          message: msg || 'Provider authentication failed or API key missing',
        },
      };
    }

    // State E: Timeout failure
    if (
      status === 408 ||
      status === 504 ||
      code === 'TIMEOUT' ||
      code === 'PROVIDER_TIMEOUT' ||
      lower.includes('timeout') ||
      lower.includes('aborted')
    ) {
      return {
        status: code === 'PROVIDER_TIMEOUT' ? 'PROVIDER_TIMEOUT' : 'TIMEOUT',
        isEvaluated: false,
        transportSuccess: false,
        evaluationEligible: false,
        qualityEvaluated: false,
        failureCategory: 'PROVIDER_NETWORK',
        errorDetail: {
          httpStatus: status || 504,
          provider,
          category: 'TIMEOUT',
          message: msg || 'Request timed out waiting for provider response',
        },
      };
    }

    // State E: Network failure
    if (
      code === 'NETWORK_ERROR' ||
      code === 'PROVIDER_NETWORK_ERROR' ||
      lower.includes('network') ||
      lower.includes('econnrefused') ||
      lower.includes('socket') ||
      lower.includes('fetch failed') ||
      lower.includes('und_err')
    ) {
      return {
        status: code === 'PROVIDER_NETWORK_ERROR' ? 'PROVIDER_NETWORK_ERROR' : 'NETWORK_ERROR',
        isEvaluated: false,
        transportSuccess: false,
        evaluationEligible: false,
        qualityEvaluated: false,
        failureCategory: 'PROVIDER_NETWORK',
        errorDetail: {
          httpStatus: status,
          provider,
          category: 'NETWORK',
          message: msg || 'Network socket or DNS connectivity error',
        },
      };
    }

    // State D: HTTP 500 / provider server failure
    return {
      status: code === 'PROVIDER_SERVER_ERROR' ? 'PROVIDER_SERVER_ERROR' : 'PROVIDER_ERROR',
      isEvaluated: false,
      transportSuccess: false,
      evaluationEligible: false,
      qualityEvaluated: false,
      failureCategory: 'PROVIDER_SERVER_ERROR',
      errorDetail: {
        httpStatus: status || 500,
        provider,
        category: 'SERVER_ERROR',
        message: msg || 'Provider returned operational server error',
      },
    };
  }

  // State F: HTTP 200 response but malformed or empty
  if (isMalformed || !resp.output || resp.output.trim() === '') {
    return {
      status: 'PROVIDER_ERROR',
      isEvaluated: false,
      transportSuccess: true,
      evaluationEligible: false,
      qualityEvaluated: false,
      failureCategory: 'MALFORMED_RESPONSE',
      errorDetail: {
        httpStatus: 200,
        provider: resp.usage.provider,
        category: 'UNKNOWN',
        message:
          resp.usage.error?.message ||
          (isMalformed ? 'Malformed response payload received from provider' : 'Model returned empty response payload'),
      },
    };
  }

  // State A & G: HTTP 200 with valid model output -> quality evaluators run
  const isPass = !evaluatorScore || evaluatorScore.passed;
  return {
    status: isPass ? 'PASS' : 'QUALITY_FAILURE',
    isEvaluated: true,
    transportSuccess: true,
    evaluationEligible: true,
    qualityEvaluated: true,
    failureCategory: isPass ? undefined : 'QUALITY_FAILURE',
  };
}

export class EvaluationRunner {
  private defaultProvider?: ModelProvider;

  constructor(defaultProvider?: ModelProvider) {
    this.defaultProvider = defaultProvider;
  }

  async run(options: EvaluationOptions): Promise<EvaluationRun> {
    const startTime = Date.now();
    const runId =
      options.runId ||
      `run-live-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

    const {
      project,
      dataset,
      baselineVersion,
      candidateVersion,
      regressionSettings = options.regressionSettings || project?.regressionSettings || DEFAULT_REGRESSION_SETTINGS,
      maxCases,
      concurrency = 5,
      onProgress,
    } = options;

    const allCases = dataset.cases || [];
    const cases = maxCases && maxCases > 0 ? allCases.slice(0, maxCases) : allCases;
    const totalCases = cases.length;

    console.log(`[RELIQ] Evaluation started`);
    console.log(`[RELIQ] Run ID: ${runId}`);
    console.log(`[RELIQ] Dataset: ${dataset.name}`);
    console.log(`[RELIQ] Selected scenarios: ${totalCases}`);

    // Resolve model providers for baseline and candidate
    const baselineProvider: ModelProvider =
      options.baselineProvider ||
      this.defaultProvider ||
      providerRegistry.getProviderForVersion(baselineVersion);

    const candidateProvider: ModelProvider =
      options.candidateProvider ||
      this.defaultProvider ||
      providerRegistry.getProviderForVersion(candidateVersion);

    // Strict integrity check: DemoProvider must NEVER silently replace a real AI provider
    if (baselineVersion.provider !== 'demo' && baselineProvider.providerType === 'demo') {
      throw new Error(
        `Integrity Violation: DemoProvider cannot silently replace real AI provider '${baselineVersion.provider}' for baseline.`
      );
    }
    if (candidateVersion.provider !== 'demo' && candidateProvider.providerType === 'demo') {
      throw new Error(
        `Integrity Violation: DemoProvider cannot silently replace real AI provider '${candidateVersion.provider}' for candidate.`
      );
    }

    const caseResults: TestCaseResult[] = [];

    let baselinePassedCount = 0;
    let candidatePassedCount = 0;
    let baselineEvaluatedCount = 0;
    let candidateEvaluatedCount = 0;
    let baselineQualitySum = 0;
    let candidateQualitySum = 0;

    let baselineRateLimitCount = 0;
    let candidateRateLimitCount = 0;
    let baselineTimeoutCount = 0;
    let candidateTimeoutCount = 0;
    let baselineAuthCount = 0;
    let candidateAuthCount = 0;
    let baselineNetworkCount = 0;
    let candidateNetworkCount = 0;
    let baselineOtherCount = 0;
    let candidateOtherCount = 0;

    let baselineSuccessfulLatencySum = 0;
    let candidateSuccessfulLatencySum = 0;
    const baselineSuccessfulLatencies: number[] = [];
    const candidateSuccessfulLatencies: number[] = [];
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

    // Adaptive rate-limit-aware concurrency:
    // When evaluating Groq or Google Gemini, restrict concurrency to 1-2 to prevent token/request rate-limit spikes
    const isRateLimitedProvider =
      baselineProvider.providerType === 'groq' ||
      candidateProvider.providerType === 'groq' ||
      baselineProvider.providerType === 'google' ||
      candidateProvider.providerType === 'google';

    const maxSafeConcurrency = isRateLimitedProvider ? 1 : 20;
    const defaultConcurrency = isRateLimitedProvider ? 1 : 5;
    const envConcurrency = typeof process !== 'undefined' && process.env?.EVALUATION_CONCURRENCY
      ? parseInt(process.env.EVALUATION_CONCURRENCY, 10)
      : undefined;
    const targetConcurrency =
      options.concurrency ??
      (!isNaN(Number(envConcurrency)) && Number(envConcurrency) > 0 ? Number(envConcurrency) : defaultConcurrency);
    const clampedConcurrency = Math.max(
      1,
      Math.min(maxSafeConcurrency, targetConcurrency)
    );

    for (let chunkStart = 0; chunkStart < totalCases; chunkStart += clampedConcurrency) {
      const chunk = cases.slice(chunkStart, chunkStart + clampedConcurrency);

      const chunkResults = await Promise.all(
        chunk.map(async (testCase, idx) => {
          const caseIndex = chunkStart + idx + 1;

          console.log(`\n[RELIQ] Case ${caseIndex}/${totalCases}`);
          console.log(`[RELIQ] Baseline → ${baselineVersion.provider} / ${baselineVersion.modelIdentifier}`);
          console.log(`[RELIQ] Candidate → ${candidateVersion.provider} / ${candidateVersion.modelIdentifier}`);

          // Formulate decoupled requests
          const baselineRequest: ModelRequest = {
            testCaseId: testCase.id,
            input: testCase.input,
            systemPrompt: baselineVersion.systemPrompt,
            modelIdentifier: baselineVersion.modelIdentifier,
            promptVersion: baselineVersion.promptVersion,
            temperature: baselineVersion.temperature,
            maxTokens: baselineVersion.maxTokens || 2048,
            expectedOutput: testCase.expectedOutput,
            evaluatorType: testCase.evaluatorType,
            metadata: {
              isBaseline: true,
              category: testCase.category,
              severity: testCase.severity,
              caseIndex,
              totalCases,
            },
          };

          const candidateRequest: ModelRequest = {
            testCaseId: testCase.id,
            input: testCase.input,
            systemPrompt: candidateVersion.systemPrompt,
            modelIdentifier: candidateVersion.modelIdentifier,
            promptVersion: candidateVersion.promptVersion,
            temperature: candidateVersion.temperature,
            maxTokens: candidateVersion.maxTokens || 2048,
            expectedOutput: testCase.expectedOutput,
            evaluatorType: testCase.evaluatorType,
            metadata: {
              isBaseline: false,
              category: testCase.category,
              severity: testCase.severity,
              caseIndex,
              totalCases,
            },
          };

          // Execute baseline & candidate through their respective model providers
          // Each provider is decoupled into its own independent queue and rate-limit scheduler
          const [baselineResp, candidateResp] = await Promise.all([
            baselineProvider.generate(baselineRequest),
            candidateProvider.generate(candidateRequest),
          ]);

          console.log(`[RELIQ] Case ${caseIndex}/${totalCases} complete`);

          // Evaluate Baseline only if a genuine response was returned
          let baselineEval: ReturnType<typeof runEvaluator> | undefined;
          let baselineScore: number | null = null;
          let baselineEvalScores: EvaluatorScore[] = [];
          if (!baselineResp.usage.error && baselineResp.output?.trim()) {
            baselineEval = runEvaluator(
              baselineResp.output,
              testCase,
              baselineResp.usage.latencyMs
            );
            baselineScore = baselineEval.primaryScore.score;
            baselineEvalScores = baselineEval.allScores;
          }

          const baselineClassification = classifyResponseStatus(
            baselineResp,
            baselineEval?.primaryScore
          );

          // Evaluate Candidate only if a genuine response was returned
          let candidateEval: ReturnType<typeof runEvaluator> | undefined;
          let candidateScore: number | null = null;
          let candidateEvalScores: EvaluatorScore[] = [];
          if (!candidateResp.usage.error && candidateResp.output?.trim()) {
            candidateEval = runEvaluator(
              candidateResp.output,
              testCase,
              candidateResp.usage.latencyMs
            );
            candidateScore = candidateEval.primaryScore.score;
            candidateEvalScores = candidateEval.allScores;
          }

          const candidateClassification = classifyResponseStatus(
            candidateResp,
            candidateEval?.primaryScore
          );

          const baselinePassed = baselineClassification.qualityEvaluated
            ? baselineClassification.status === 'PASS'
            : null;
          const candidatePassed = candidateClassification.qualityEvaluated
            ? candidateClassification.status === 'PASS'
            : null;

          // True regression requires baseline passing quality and candidate suffering quality failure
          const isRegression =
            baselineClassification.status === 'PASS' &&
            candidateClassification.status === 'QUALITY_FAILURE';

          // True improvement requires baseline quality failure and candidate quality pass
          const isImprovement =
            baselineClassification.status === 'QUALITY_FAILURE' &&
            candidateClassification.status === 'PASS';

          // Formulate failure reason accurately preserving operational vs quality distinction
          let failureReason: string | undefined = undefined;
          let failureCategory = candidateClassification.failureCategory;

          if (candidateClassification.status === 'PROVIDER_RATE_LIMIT') {
            failureReason = `[Provider Rate Limit 429] ${
              candidateClassification.errorDetail?.message || 'Rate limit or quota exceeded'
            }`;
            failureCategory = 'PROVIDER_QUOTA';
          } else if (candidateClassification.status === 'TIMEOUT') {
            failureReason = `[Provider Timeout] ${
              candidateClassification.errorDetail?.message || 'Request timed out'
            }`;
            failureCategory = 'PROVIDER_NETWORK';
          } else if (candidateClassification.status === 'AUTHENTICATION_ERROR') {
            failureReason = `[Provider Auth Error] ${
              candidateClassification.errorDetail?.message || 'Authentication failed'
            }`;
            failureCategory = 'PROVIDER_AUTHENTICATION';
          } else if (candidateClassification.status === 'NETWORK_ERROR') {
            failureReason = `[Network Error] ${
              candidateClassification.errorDetail?.message || 'Network connectivity error'
            }`;
            failureCategory = 'PROVIDER_NETWORK';
          } else if (candidateClassification.status === 'PROVIDER_ERROR') {
            failureReason = `[Provider Error] ${
              candidateClassification.errorDetail?.message || 'Server error'
            }`;
            failureCategory = candidateClassification.transportSuccess ? 'MALFORMED_RESPONSE' : 'PROVIDER_SERVER_ERROR';
          } else if (candidateClassification.status === 'QUALITY_FAILURE') {
            failureReason = candidateEval?.primaryScore.details || 'Did not meet evaluation criteria';
            failureCategory = 'QUALITY_FAILURE';
          }

          // Safety classification check
          let safetyClassification: SafetyFailureClassification | undefined;
          let safetyDetails: string | undefined;
          if (
            testCase.category === 'Safety' ||
            candidateEvalScores.some((s) => s.evaluatorType === 'behavioral_safety')
          ) {
            if (candidateClassification.qualityEvaluated && candidatePassed === false) {
              const sDetail = classifySafetyResult({
                candidateOutput: candidateResp.output,
                testCaseName: testCase.name,
                testCaseId: testCase.id,
                evaluatorScores: candidateEvalScores,
              });
              safetyClassification = sDetail.classification;
              safetyDetails = sDetail.details;
              failureCategory = sDetail.classification;
            }
          }

          const result: TestCaseResult = {
            testCaseId: testCase.id,
            testCaseName: testCase.name,
            category: testCase.category,
            severity: testCase.severity,
            input: testCase.input,
            expectedOutput: testCase.expectedOutput,
            baselineOutput: baselineResp.output ?? '',
            candidateOutput: candidateResp.output ?? '',
            baselineScore,
            candidateScore,
            baselineLatencyMs: baselineClassification.evaluationEligible ? baselineResp.usage.latencyMs : null,
            candidateLatencyMs: candidateClassification.evaluationEligible ? candidateResp.usage.latencyMs : null,
            passed: candidatePassed,
            isRegression,
            evaluatorScores: candidateEvalScores,
            failureReason,
            failureCategory,
            baselineToolCalls: baselineResp.toolCalls,
            candidateToolCalls: candidateResp.toolCalls,
            baselineUsage: baselineResp.usage,
            candidateUsage: candidateResp.usage,
            baselineExecutionStatus: baselineClassification.status,
            candidateExecutionStatus: candidateClassification.status,
            executionStatus: candidateClassification.status,
            baselineErrorDetail: baselineClassification.errorDetail,
            candidateErrorDetail: candidateClassification.errorDetail,
            baselineTransportSuccess: baselineClassification.transportSuccess,
            candidateTransportSuccess: candidateClassification.transportSuccess,
            baselineEvaluationEligible: baselineClassification.evaluationEligible,
            candidateEvaluationEligible: candidateClassification.evaluationEligible,
            baselineQualityEvaluated: baselineClassification.qualityEvaluated,
            candidateQualityEvaluated: candidateClassification.qualityEvaluated,
            safetyClassification,
            safetyDetails,
          };

          const caseIdx = chunkStart + chunk.indexOf(testCase) + 1;
          const formatCaseLog = (provName: string, resp: ModelResponse, status: string) => {
            const inTok = resp.usage.inputTokens ?? 0;
            const outTok = resp.usage.outputTokens ?? 0;
            const thinkTok = resp.usage.reasoningTokens ? ` | Thinking: ${resp.usage.reasoningTokens}` : '';
            const statusLabel = resp.usage.error ? `Error (${resp.usage.error.status || status})` : status;
            return `[RELIQ] [${caseIdx}/${totalCases}] Case ${testCase.id} (${provName}) -> Status: ${statusLabel} | Latency: ${resp.usage.latencyMs}ms | In: ${inTok} | Out: ${outTok}${thinkTok}`;
          };
          console.log(formatCaseLog(baselineVersion.name, baselineResp, baselineClassification.status));
          console.log(formatCaseLog(candidateVersion.name, candidateResp, candidateClassification.status));

          return {
            result,
            baselinePassed,
            candidatePassed,
            isRegression,
            isImprovement,
            baselineClassification,
            candidateClassification,
            baselineResp,
            candidateResp,
          };
        })
      );

      // Aggregate chunk outcomes
      for (const item of chunkResults) {
        caseResults.push(item.result);

        if (options.onCaseCompleted) {
          try {
            await options.onCaseCompleted(item.result, caseResults.length, totalCases);
          } catch (err: any) {
            console.error(`[RELIQ] Error in onCaseCompleted for case ${item.result.testCaseId}:`, err.message);
          }
        }

        if (item.baselineClassification.isEvaluated && item.result.baselineScore !== null) {
          baselineEvaluatedCount++;
          baselineQualitySum += item.result.baselineScore;
          // Inference latency strictly from successful requests
          if (item.baselineResp.usage.latencyMs !== undefined) {
            baselineSuccessfulLatencySum += item.baselineResp.usage.latencyMs;
            baselineSuccessfulLatencies.push(item.baselineResp.usage.latencyMs);
          }
        }
        if (item.candidateClassification.isEvaluated && item.result.candidateScore !== null) {
          candidateEvaluatedCount++;
          candidateQualitySum += item.result.candidateScore;
          // Inference latency strictly from successful requests
          if (item.candidateResp.usage.latencyMs !== undefined) {
            candidateSuccessfulLatencySum += item.candidateResp.usage.latencyMs;
            candidateSuccessfulLatencies.push(item.candidateResp.usage.latencyMs);
          }
        }

        if (item.result.passed === true) candidatePassedCount++;
        if (item.baselinePassed === true) baselinePassedCount++;
        if (item.isRegression) regressedCount++;
        if (item.isImprovement) improvedCount++;

        // Baseline reliability accounting
        if (item.baselineClassification.status === 'PROVIDER_RATE_LIMIT') baselineRateLimitCount++;
        else if (item.baselineClassification.status === 'TIMEOUT') baselineTimeoutCount++;
        else if (item.baselineClassification.status === 'AUTHENTICATION_ERROR') baselineAuthCount++;
        else if (item.baselineClassification.status === 'NETWORK_ERROR') baselineNetworkCount++;
        else if (item.baselineClassification.status === 'PROVIDER_ERROR') baselineOtherCount++;

        // Candidate reliability accounting
        if (item.candidateClassification.status === 'PROVIDER_RATE_LIMIT') candidateRateLimitCount++;
        else if (item.candidateClassification.status === 'TIMEOUT') candidateTimeoutCount++;
        else if (item.candidateClassification.status === 'AUTHENTICATION_ERROR') candidateAuthCount++;
        else if (item.candidateClassification.status === 'NETWORK_ERROR') candidateNetworkCount++;
        else if (item.candidateClassification.status === 'PROVIDER_ERROR') candidateOtherCount++;

        if (item.baselineClassification.transportSuccess && item.baselineClassification.evaluationEligible) {
          baselineTotalCost += item.baselineResp.usage.estimatedCostUsd || 0;
          baselineTotalTokens += item.baselineResp.usage.totalTokens || 0;
          baselineReasoningTokens += item.baselineResp.usage.reasoningTokens || 0;
          baselineCachedTokens += item.baselineResp.usage.cachedTokens || 0;
        }

        if (item.candidateClassification.transportSuccess && item.candidateClassification.evaluationEligible) {
          candidateTotalCost += item.candidateResp.usage.estimatedCostUsd || 0;
          candidateTotalTokens += item.candidateResp.usage.totalTokens || 0;
          candidateReasoningTokens += item.candidateResp.usage.reasoningTokens || 0;
          candidateCachedTokens += item.candidateResp.usage.cachedTokens || 0;
        }
      }

      if (onProgress) {
        const completedCount = Math.min(chunkStart + chunk.length, totalCases);
        const lastCaseName = chunk[chunk.length - 1]?.name;
        onProgress(completedCount, totalCases, lastCaseName);
      }

      // Conservative pacing between chunks for rate-sensitive providers
      if (isRateLimitedProvider && chunkStart + clampedConcurrency < totalCases) {
        const retryAfterSec = chunkResults.reduce((max, r) => {
          const bRetry = r.baselineResp.usage.rateLimit?.retryAfter;
          const cRetry = r.candidateResp.usage.rateLimit?.retryAfter;
          let bSec = bRetry ? parseInt(bRetry, 10) : 0;
          let cSec = cRetry ? parseInt(cRetry, 10) : 0;
          if (!bSec && r.baselineResp.usage.error?.message) {
            const m = r.baselineResp.usage.error.message.match(/retry in ([\d\.]+)s/i);
            if (m) bSec = Math.ceil(parseFloat(m[1]));
          }
          if (!cSec && r.candidateResp.usage.error?.message) {
            const m = r.candidateResp.usage.error.message.match(/retry in ([\d\.]+)s/i);
            if (m) cSec = Math.ceil(parseFloat(m[1]));
          }
          return Math.max(max, isNaN(bSec) ? 0 : bSec, isNaN(cSec) ? 0 : cSec);
        }, 0);

        const effectivePauseSec = retryAfterSec > 0 ? Math.min(65, Math.max(3.8, retryAfterSec + 1)) : 3.8;
        if (retryAfterSec > 0) {
          console.log(`[RELIQ] Rate limit cooldown: pausing ${effectivePauseSec}s (provider suggested ${retryAfterSec}s)...`);
          onProgress?.(
            Math.min(chunkStart + chunk.length, totalCases),
            totalCases,
            `Rate limit cooldown: pausing ${effectivePauseSec}s...`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, effectivePauseSec * 1000));
      }
    }

    // Calculate aggregate metrics
    // Section 6: Quality/pass rate formula: passed evaluated cases / total evaluated cases
    // If totalEvaluated === 0, quality = null, passRate = null, accuracy = null
    const baselinePassRate =
      baselineEvaluatedCount > 0
        ? Number(((baselinePassedCount / baselineEvaluatedCount) * 100).toFixed(1))
        : null;
    const candidatePassRate =
      candidateEvaluatedCount > 0
        ? Number(((candidatePassedCount / candidateEvaluatedCount) * 100).toFixed(1))
        : null;

    const baselineAccuracy = baselinePassRate;
    const candidateAccuracy = candidatePassRate;
    const accuracyDelta =
      baselineAccuracy !== null && candidateAccuracy !== null
        ? Number((candidateAccuracy - baselineAccuracy).toFixed(1))
        : null;

    // Continuous evaluator quality score strictly over successfully evaluated cases
    const baselineQualityScore =
      baselineEvaluatedCount > 0
        ? Number(((baselineQualitySum / baselineEvaluatedCount) * 100).toFixed(1))
        : null;
    const candidateQualityScore =
      candidateEvaluatedCount > 0
        ? Number(((candidateQualitySum / candidateEvaluatedCount) * 100).toFixed(1))
        : null;
    const qualityScoreDelta =
      candidateQualityScore !== null && baselineQualityScore !== null
        ? Number((candidateQualityScore - baselineQualityScore).toFixed(1))
        : null;

    // Evaluation Coverage: evaluatedCases / totalCases * 100
    const baselineEvaluationCoverage =
      totalCases > 0 ? Number(((baselineEvaluatedCount / totalCases) * 100).toFixed(1)) : 0;
    const candidateEvaluationCoverage =
      totalCases > 0 ? Number(((candidateEvaluatedCount / totalCases) * 100).toFixed(1)) : 0;

    const minCoverage = regressionSettings.minEvaluationCoveragePercent ?? 80.0;
    const isInsufficientCoverage =
      baselineEvaluationCoverage < minCoverage || candidateEvaluationCoverage < minCoverage;

    // Provider Reliability
    const baselineReliability: ProviderReliabilitySummary = {
      totalRequests: totalCases,
      successfulResponses: baselineEvaluatedCount,
      rateLimitedCount: baselineRateLimitCount,
      timeoutCount: baselineTimeoutCount,
      authErrorCount: baselineAuthCount,
      networkErrorCount: baselineNetworkCount,
      otherErrorCount: baselineOtherCount,
      reliabilityRate: totalCases > 0 ? Number(((baselineEvaluatedCount / totalCases) * 100).toFixed(1)) : 0,
    };

    const candidateReliability: ProviderReliabilitySummary = {
      totalRequests: totalCases,
      successfulResponses: candidateEvaluatedCount,
      rateLimitedCount: candidateRateLimitCount,
      timeoutCount: candidateTimeoutCount,
      authErrorCount: candidateAuthCount,
      networkErrorCount: candidateNetworkCount,
      otherErrorCount: candidateOtherCount,
      reliabilityRate: totalCases > 0 ? Number(((candidateEvaluatedCount / totalCases) * 100).toFixed(1)) : 0,
    };

    // Latency only from actual successful provider requests (null if no valid responses)
    const baselineMeanSuccessfulLatencyMs =
      baselineSuccessfulLatencies.length > 0
        ? Math.round(baselineSuccessfulLatencySum / baselineSuccessfulLatencies.length)
        : null;
    const candidateMeanSuccessfulLatencyMs =
      candidateSuccessfulLatencies.length > 0
        ? Math.round(candidateSuccessfulLatencySum / candidateSuccessfulLatencies.length)
        : null;
    const baselineMedianLatencyMs =
      baselineSuccessfulLatencies.length > 0 ? calculateMedian(baselineSuccessfulLatencies) : null;
    const candidateMedianLatencyMs =
      candidateSuccessfulLatencies.length > 0 ? calculateMedian(candidateSuccessfulLatencies) : null;
    const baselineP95LatencyMs =
      baselineSuccessfulLatencies.length > 0 ? calculateP95(baselineSuccessfulLatencies) : null;
    const candidateP95LatencyMs =
      candidateSuccessfulLatencies.length > 0 ? calculateP95(candidateSuccessfulLatencies) : null;

    // Evidence strength MUST be based on evaluated evidence count (Section 10)
    const evidenceStrength = calculateEvidenceStrength(candidateEvaluatedCount);

    const latencyDeltaPercent =
      baselineMeanSuccessfulLatencyMs !== null &&
      candidateMeanSuccessfulLatencyMs !== null &&
      baselineMeanSuccessfulLatencyMs > 0
        ? Math.round(
            ((candidateMeanSuccessfulLatencyMs - baselineMeanSuccessfulLatencyMs) /
              baselineMeanSuccessfulLatencyMs) *
              100
          )
        : null;

    // Section 15: Explicit failure counters
    let qualityFailures = 0;
    let safetyFailures = 0;
    for (const r of caseResults) {
      if (r.candidateExecutionStatus === 'QUALITY_FAILURE' || r.failureCategory === 'QUALITY_FAILURE') {
        qualityFailures++;
      }
      if (
        r.failureCategory === 'SAFETY_POLICY_FAILURE' ||
        r.failureCategory === 'PROMPT_INJECTION_FAILURE' ||
        r.failureCategory === 'CREDENTIAL_LEAK' ||
        r.failureCategory === 'REFUSAL_CRITERIA_MISMATCH'
      ) {
        safetyFailures++;
      }
    }
    const providerFailures =
      candidateRateLimitCount +
      candidateTimeoutCount +
      candidateAuthCount +
      candidateNetworkCount +
      candidateOtherCount;
    const unevaluableCases = totalCases - candidateEvaluatedCount;

    const metrics: MetricSummary = {
      totalCases,
      sampleSize: totalCases,
      evidenceStrength,
      baselinePassed: baselinePassedCount,
      candidatePassed: candidatePassedCount,
      baselineAccuracy,
      candidateAccuracy,
      accuracyDelta,
      baselineEvaluatedCases: baselineEvaluatedCount,
      candidateEvaluatedCases: candidateEvaluatedCount,
      baselineEvaluationCoverage,
      candidateEvaluationCoverage,
      baselinePassRate,
      candidatePassRate,
      baselineQualityScore,
      candidateQualityScore,
      qualityScoreDelta,
      baselineMeanSuccessfulLatencyMs,
      candidateMeanSuccessfulLatencyMs,
      baselineMedianLatencyMs,
      candidateMedianLatencyMs,
      baselineP95LatencyMs,
      candidateP95LatencyMs,
      baselineAvgLatencyMs: baselineMeanSuccessfulLatencyMs,
      candidateAvgLatencyMs: candidateMeanSuccessfulLatencyMs,
      latencyDeltaPercent,
      baselineEstimatedCost: baselineEvaluatedCount > 0 ? Number(baselineTotalCost.toFixed(4)) : null,
      candidateEstimatedCost: candidateEvaluatedCount > 0 ? Number(candidateTotalCost.toFixed(4)) : null,
      regressedCasesCount: regressedCount,
      improvedCasesCount: improvedCount,
      baselineReliability,
      candidateReliability,
      isInsufficientCoverage,
      minimumEvaluatedCases: regressionSettings.minimumEvaluatedCases ?? 100,
      hasUnequalSampleSizes: baselineEvaluatedCount !== candidateEvaluatedCount,
      sampleSizeWarning:
        baselineEvaluatedCount !== candidateEvaluatedCount
          ? `Unequal evaluation sample sizes: Baseline evaluated ${baselineEvaluatedCount} cases, Candidate evaluated ${candidateEvaluatedCount} cases.`
          : undefined,
      latencyPercentileWarning:
        baselineSuccessfulLatencies.length < 20 || candidateSuccessfulLatencies.length < 20
          ? 'Low sample size for percentile interpretation (N < 20). Tail latency is unstable.'
          : undefined,
      semanticEvaluationStatus: 'NOT_CONFIGURED',
      llmJudgeStatus: 'NOT_CONFIGURED',
      factualityGroundednessStatus: 'NOT_CONFIGURED',
      baselineTotalTokens: baselineEvaluatedCount > 0 ? baselineTotalTokens : null,
      candidateTotalTokens: candidateEvaluatedCount > 0 ? candidateTotalTokens : null,
      baselineReasoningTokens: baselineEvaluatedCount > 0 ? baselineReasoningTokens : null,
      candidateReasoningTokens: candidateEvaluatedCount > 0 ? candidateReasoningTokens : null,
      baselineCachedTokens: baselineEvaluatedCount > 0 ? baselineCachedTokens : null,
      candidateCachedTokens: candidateEvaluatedCount > 0 ? candidateCachedTokens : null,
      dispatchedCases: totalCases,
      evaluatedCases: candidateEvaluatedCount,
      qualityFailures,
      providerFailures,
      authenticationFailures: candidateAuthCount,
      quotaFailures: candidateRateLimitCount,
      safetyFailures,
      unevaluableCases,
    };

    // Calculate regression decision based on thresholds
    const regressionDecision = detectRegression(metrics, regressionSettings);

    // Run transparent root-cause analysis
    const rootCauses = analyzeRootCauses(caseResults);

    // Evaluate canonical release decision outcome
    const releaseOutcome = evaluateReleaseDecision({
      metrics,
      settings: regressionSettings,
      caseResults,
      datasetName: dataset.name,
    });

    const initiatedAt = new Date(startTime).toISOString();
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    const provenance: RunProvenance = {
      initiatedAt,
      completedAt,
      baselineProvider: baselineVersion.provider,
      candidateProvider: candidateVersion.provider,
      baselineModel: baselineVersion.modelIdentifier,
      candidateModel: candidateVersion.modelIdentifier,
      totalAttempted: totalCases,
      baselineEvaluated: baselineEvaluatedCount,
      candidateEvaluated: candidateEvaluatedCount,
      baselineRateLimits: baselineRateLimitCount,
      candidateRateLimits: candidateRateLimitCount,
      hadOperationalErrors:
        baselineRateLimitCount > 0 ||
        candidateRateLimitCount > 0 ||
        baselineTimeoutCount > 0 ||
        candidateTimeoutCount > 0 ||
        baselineAuthCount > 0 ||
        candidateAuthCount > 0 ||
        baselineNetworkCount > 0 ||
        candidateNetworkCount > 0 ||
        baselineOtherCount > 0 ||
        candidateOtherCount > 0,
      isLiveExecution: true,
    };

    // Generate comprehensive cross-model comparison report
    const comparisonReport = generateComparisonReport({
      datasetId: dataset.id,
      datasetName: dataset.name,
      baselineVersion,
      candidateVersion,
      caseResults,
      runMetrics: metrics,
      settings: regressionSettings,
      executionMode: 'LIVE',
      provenance,
    });

    console.log(`\n[RELIQ] Evaluation complete`);
    console.log(`[RELIQ] Run ID: ${runId} | Duration: ${durationMs}ms`);
    console.log(
      `[RELIQ] Total Cases: ${totalCases} | Evaluated (B/C): ${baselineEvaluatedCount}/${candidateEvaluatedCount}`
    );
    console.log(
      `[RELIQ] Baseline Pass Rate: ${baselinePassRate !== null ? baselinePassRate.toFixed(1) + '%' : '—'} | Candidate Pass Rate: ${candidatePassRate !== null ? candidatePassRate.toFixed(1) + '%' : '—'}`
    );
    console.log(
      `[RELIQ] Regressions: ${regressedCount} | Improvements: ${improvedCount}`
    );
    console.log(
      `[RELIQ] Release Decision: ${releaseOutcome.decision} (Evidence: ${releaseOutcome.evidenceStrength})`
    );

    return {
      id: runId,
      projectId: project?.id || 'proj-checkout-agent',
      datasetId: dataset.id,
      datasetName: dataset.name,
      baselineVersion,
      candidateVersion,
      timestamp: completedAt,
      executionMode: 'LIVE',
      provenance,
      metrics,
      caseResults,
      regressionDecision,
      rootCauses,
      releaseDecision: {
        status: releaseOutcome.decision,
        decidedBy: 'Reliability Gate (Auto-Calculated)',
        decidedAt: completedAt,
        reason: releaseOutcome.reason || releaseOutcome.summary,
      },
      comparisonReport,
      durationMs,
    };
  }
}

export const defaultEvaluationRunner = new EvaluationRunner();
