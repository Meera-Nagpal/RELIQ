/* ============================================================
   RELIQ — Core Domain Models & Types
   ============================================================ */

export type EvaluatorType =
  | 'exact_match'
  | 'normalized_text'
  | 'keyword_criteria'
  | 'json_validity'
  | 'response_length'
  | 'latency'
  | 'behavioral_safety'
  | 'llm_judge'
  | 'semantic_similarity';

export type EvaluatorCategory =
  | 'DETERMINISTIC'
  | 'SEMANTIC'
  | 'LLM_JUDGE'
  | 'OPERATIONAL'
  | 'SAFETY';

export type EvidenceStrength = 'NONE' | 'LOW' | 'MODERATE' | 'GOOD' | 'STRONG';

export type FailureCategory =
  | 'QUALITY_FAILURE'
  | 'PROVIDER_AUTHENTICATION'
  | 'PROVIDER_QUOTA'
  | 'PROVIDER_NETWORK'
  | 'PROVIDER_SERVER_ERROR'
  | 'MALFORMED_RESPONSE'
  | 'SAFETY_POLICY_FAILURE'
  | 'PROMPT_INJECTION_FAILURE'
  | 'CREDENTIAL_LEAK'
  | 'REFUSAL_CRITERIA_MISMATCH';

export type CanonicalReleaseDecision =
  | 'SHIP'
  | 'SHIP_WITH_CONDITIONS'
  | 'BLOCK'
  | 'INSUFFICIENT_EVIDENCE'
  | 'NO_REGRESSION'
  | 'REGRESSION_DETECTED';

export type SafetyFailureClassification =
  | 'SAFETY_POLICY_FAILURE'
  | 'PROMPT_INJECTION_FAILURE'
  | 'CREDENTIAL_LEAK'
  | 'REFUSAL_CRITERIA_MISMATCH';

export interface SafetyClassificationDetail {
  classification: SafetyFailureClassification;
  isActualSafetyViolation: boolean;
  secretsLeaked: boolean;
  reason: string;
  details: string;
}

export interface SafetyBreakdownSummary {
  credentialLeakCount: number;
  promptInjectionCount: number;
  safetyPolicyFailureCount: number;
  refusalCriteriaMismatchCount: number;
  totalSafetyRelatedCases: number;
  secretsLeaked: boolean;
  classifications: Array<{
    testCaseId: string;
    testCaseName: string;
    classification: SafetyFailureClassification;
    reason: string;
    isActualSafetyViolation: boolean;
  }>;
}

export type RegressionCategory =
  | 'QUALITY_REGRESSION'
  | 'QUALITY_REGRESSION_SIGNAL'
  | 'LATENCY_REGRESSION'
  | 'COST_REGRESSION'
  | 'RELIABILITY_REGRESSION'
  | 'SAFETY_REGRESSION'
  | 'SAFETY_POLICY_FAILURE'
  | 'PROMPT_INJECTION_FAILURE'
  | 'CREDENTIAL_LEAK'
  | 'REFUSAL_CRITERIA_MISMATCH'
  | 'TOKEN_REGRESSION'
  | 'COVERAGE_REGRESSION';

export interface BehavioralSafetyResult {
  passed: boolean;
  checkType: 'SECRET_LEAK' | 'REFUSAL' | 'BYPASS' | 'PROMPT_INJECTION';
  score: number;
  details: string;
  flaggedTerms?: string[];
}

export type TestCaseCategory =
  | 'Tool Calling'
  | 'Policy Gate'
  | 'Retrieval'
  | 'Safety'
  | 'Structured Output'
  | 'Multi-turn'
  | 'Domain Knowledge'
  | 'Edge Cases';

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low';

export interface TestCase {
  id: string;
  name: string;
  category: TestCaseCategory;
  input: string;
  expectedOutput: string;
  evaluatorType: EvaluatorType;
  evaluatorConfig?: {
    requiredKeywords?: string[];
    forbiddenKeywords?: string[];
    requiredJsonKeys?: string[];
    maxLength?: number;
    minLength?: number;
    maxLatencyMs?: number;
  };
  tags: string[];
  severity: SeverityLevel;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface Dataset {
  id: string;
  projectId: string;
  name: string;
  description: string;
  cases: TestCase[];
  requiredCases?: number;
  createdAt: string;
  updatedAt: string;
}

import { ProviderType, UsageRecord, NormalizedToolCall } from '../providers/types';
export type { NormalizedToolCall };

export interface ModelVersion {
  id: string;
  name: string;
  provider: ProviderType;
  modelIdentifier: string;
  promptVersion: string;
  systemPrompt: string;
  temperature: number;
  maxTokens?: number;
  isBaseline?: boolean;
  createdAt: string;
  reasoningEffort?: 'low' | 'medium' | 'high';
}

export interface RegressionSettings {
  minAccuracyPercent: number;          // e.g. 95.0
  maxAccuracyDegradationPercent: number; // e.g. 2.0 percentage points
  maxLatencyIncreasePercent: number;    // e.g. 20%
  maxFailureRatePercent: number;        // e.g. 5%
  minEvaluationCoveragePercent?: number; // e.g. 80.0% (default 80%)
  minimumEvaluatedCases?: number;        // e.g. 100 cases (legacy)
  requiredBenchmarkCases?: number;       // e.g. 27 for Checkout Reliability Suite
  strongEvidenceCases?: number;          // e.g. 100 cases for strong statistical evidence
}

export type ReleaseDecisionStatus =
  | 'PASS'
  | 'BLOCK'
  | 'PENDING'
  | 'SHIP'
  | 'SHIP_WITH_CONDITIONS'
  | 'INSUFFICIENT_EVIDENCE'
  | 'NO_REGRESSION'
  | 'REGRESSION_DETECTED';

export interface ReleaseDecision {
  status: ReleaseDecisionStatus;
  decidedBy: string;
  decidedAt?: string;
  reason?: string;
  overrideNote?: string;
}

export interface EvaluatorScore {
  evaluatorType: EvaluatorType;
  score: number;      // 0.0 to 1.0
  passed: boolean;
  details: string;
}

export type ExecutionStatus =
  | 'PASS'
  | 'QUALITY_FAILURE'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_ERROR'
  | 'PROVIDER_SERVER_ERROR'
  | 'TIMEOUT'
  | 'PROVIDER_TIMEOUT'
  | 'AUTHENTICATION_ERROR'
  | 'PROVIDER_FORBIDDEN'
  | 'PROVIDER_CREDITS_EXHAUSTED'
  | 'PAYMENT_REQUIRED'
  | 'NETWORK_ERROR'
  | 'PROVIDER_NETWORK_ERROR'
  | 'EVALUATOR_ERROR';

export interface ProviderErrorDetail {
  httpStatus?: number;
  provider: ProviderType;
  category: 'RATE_LIMIT' | 'TIMEOUT' | 'AUTHENTICATION' | 'NETWORK' | 'SERVER_ERROR' | 'UNKNOWN';
  message: string;
  retryAfterSeconds?: number;
}

export interface ProviderReliabilitySummary {
  totalRequests: number;
  successfulResponses: number; // valid model response received
  rateLimitedCount: number;
  timeoutCount: number;
  authErrorCount: number;
  networkErrorCount: number;
  otherErrorCount: number;
  reliabilityRate: number; // (successfulResponses / totalRequests) * 100
}

export interface TestCaseResult {
  testCaseId: string;
  testCaseName: string;
  category: TestCaseCategory;
  severity: SeverityLevel;
  input: string;
  expectedOutput: string;
  baselineOutput: string | null;
  candidateOutput: string | null;
  baselineScore: number | null;
  candidateScore: number | null;
  baselineLatencyMs: number | null;
  candidateLatencyMs: number | null;
  passed: boolean | null;
  isRegression: boolean;
  evaluatorScores: EvaluatorScore[];
  failureReason?: string;
  failureCategory?: FailureCategory;
  baselineToolCalls?: NormalizedToolCall[];
  candidateToolCalls?: NormalizedToolCall[];
  baselineUsage?: UsageRecord;
  candidateUsage?: UsageRecord;
  // Execution status & error semantics
  baselineExecutionStatus?: ExecutionStatus;
  candidateExecutionStatus?: ExecutionStatus;
  executionStatus?: ExecutionStatus;
  baselineErrorDetail?: ProviderErrorDetail;
  candidateErrorDetail?: ProviderErrorDetail;
  // Tripartite status fields
  baselineTransportSuccess?: boolean;
  candidateTransportSuccess?: boolean;
  baselineEvaluationEligible?: boolean;
  candidateEvaluationEligible?: boolean;
  baselineQualityEvaluated?: boolean;
  candidateQualityEvaluated?: boolean;
  safetyClassification?: SafetyFailureClassification;
  safetyDetails?: string;
  // Traceable Separate Evaluation Layers
  modelResponse?: string | null;
  deterministicEvaluation?: DeterministicEvaluationResult;
  semanticEvaluation?: SemanticEvaluationResult | null;
  groundednessEvaluation?: GroundednessResult | null;
  llmJudgeEvaluation?: LLMJudgeScore | null;
  finalEvaluation?: FinalEvaluationResult;
}

export interface GroundednessResult {
  applicable: boolean;
  status: 'EXECUTED' | 'NOT_APPLICABLE' | 'FAILED';
  score: number | null; // 0.0 to 1.0 or null if NOT_APPLICABLE
  passed: boolean | null;
  contradictions: string[];
  unsupportedClaims: string[];
  details: string;
}

export interface DeterministicEvaluationResult {
  score: number;
  passed: boolean;
  details: string;
  evaluatorType: string;
}

export interface SemanticEvaluationResult {
  similarityScore: number;
  passed: boolean;
  method: string;
  details: string;
}

export interface LLMJudgeScore {
  correctness: number;
  instructionAdherence: number;
  relevance: number;
  completeness: number;
  groundedness: number;
  safety: number;
  overall: number;
  reason: string;
  judgeModel: string;
  latencyMs?: number;
  tokens?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  costUsd?: number;
  error?: string;
}

export interface FinalEvaluationResult {
  passed: boolean | null;
  score: number | null;
  status?: 'PASS' | 'FAIL' | 'ERROR';
  decisionLayer?: 'SAFETY_VETO' | 'DETERMINISTIC' | 'SEMANTIC' | 'LLM_JUDGE';
  isSafetyVetoed?: boolean;
  summary?: string;
  failureReason?: string;
  failureCategory?: FailureCategory;
}

export interface JudgeConfig {
  enabled: boolean;
  provider: 'groq';
  modelIdentifier: string;
  temperature?: number;
  maxTokens?: number;
}

export interface RegressionDecision {
  isRegression: boolean;
  verdict: 'REGRESSION_DETECTED' | 'NO_REGRESSION' | 'INSUFFICIENT_EVIDENCE';
  summary: string;
  violatedRules: string[];
  regressionCategories?: RegressionCategory[];
}

export type DiagnosticClassification =
  | 'OBSERVED'
  | 'CONFIRMED_DETERMINISTIC'
  | 'HEURISTIC'
  | 'HYPOTHESIS';

export interface RootCauseFinding {
  id: string;
  suspectedCause: string;
  category: TestCaseCategory | 'System';
  affectedCaseIds: string[];
  affectedCaseCount: number;
  confidenceScore?: number; // legacy number if any
  diagnosticConfidence: string; // e.g. "Confirmed", "High (Heuristic)", "Moderate (Heuristic)"
  classification?: DiagnosticClassification;
  evidence: string[];
  inference?: string;
  recommendation: string;
}

export type EvaluationEvidenceState = 'NOT_CONFIGURED' | 'CONFIGURED' | 'EXECUTED' | 'FAILED' | 'NOT_APPLICABLE';

export interface BenchmarkCompletionSummary {
  status: 'FULL_BENCHMARK_COMPLETE' | 'PRELIMINARY_SUBSET';
  evaluatedCases: number;
  requiredCases: number;
  isComplete: boolean;
  label: string;
}

export interface ReleaseGateResult {
  gate: string;
  category: 'COMPLETION' | 'COVERAGE' | 'RELIABILITY' | 'QUALITY' | 'SAFETY' | 'LATENCY' | 'COST' | 'EVALUATOR';
  status: 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'NOT_APPLICABLE' | 'WARNING';
  observed: string;
  threshold?: string;
  details: string;
  isBlocking: boolean;
}

export interface DimensionalTradeoffs {
  quality: 'IMPROVEMENT' | 'REGRESSION' | 'PARITY';
  latency: 'IMPROVEMENT' | 'REGRESSION' | 'PARITY';
  cost: 'IMPROVEMENT' | 'REGRESSION' | 'PARITY';
  reliability: 'IMPROVEMENT' | 'REGRESSION' | 'PARITY';
}

export interface MetricSummary {
  totalCases: number;
  sampleSize?: number;
  evidenceStrength?: EvidenceStrength;
  evidenceStrengthReason?: string;
  benchmarkCompletion?: BenchmarkCompletionSummary;
  releaseGates?: ReleaseGateResult[];
  overallGateStatus?: 'PASS' | 'FAIL' | 'BLOCKED' | 'INCONCLUSIVE' | 'PASS WITH WARNINGS';
  dimensions?: DimensionalTradeoffs;
  baselinePassed: number;
  candidatePassed: number;
  baselineAccuracy: number | null; // 0.0 to 100.0 or null if 0 evaluated
  candidateAccuracy: number | null; // 0.0 to 100.0 or null if 0 evaluated
  accuracyDelta: number | null;    // candidate - baseline or null if unavailable
  baselineAvgLatencyMs: number | null;
  candidateAvgLatencyMs: number | null;
  latencyDeltaPercent: number | null;
  baselineEstimatedCost: number | null;
  candidateEstimatedCost: number | null;
  regressedCasesCount: number;
  improvedCasesCount: number;
  // Decoupled Evaluation Coverage, Pass Rate & Quality Score
  baselineEvaluatedCases?: number;
  candidateEvaluatedCases?: number;
  baselineEvaluationCoverage?: number; // (baselineEvaluatedCases / totalCases) * 100
  candidateEvaluationCoverage?: number; // (candidateEvaluatedCases / totalCases) * 100
  baselinePassRate?: number | null;           // Binary pass rate strictly on evaluated cases (passed / evaluated * 100) or null
  candidatePassRate?: number | null;          // Binary pass rate strictly on evaluated cases (passed / evaluated * 100) or null
  baselineQualityScore?: number | null;       // Continuous evaluator score across evaluated cases or null
  candidateQualityScore?: number | null;      // Continuous evaluator score across evaluated cases or null
  qualityScoreDelta?: number | null;          // candidateQualityScore - baselineQualityScore or null
  baselineMeanSuccessfulLatencyMs?: number | null; // Inference latency of successfully evaluated responses only
  candidateMeanSuccessfulLatencyMs?: number | null; // Inference latency of successfully evaluated responses only
  baselineMedianLatencyMs?: number | null;    // Median latency of successfully evaluated responses
  candidateMedianLatencyMs?: number | null;   // Median latency of successfully evaluated responses
  baselineP95LatencyMs?: number | null;       // P95 latency of successfully evaluated responses
  candidateP95LatencyMs?: number | null;      // P95 latency of successfully evaluated responses
  baselineReliability?: ProviderReliabilitySummary;
  candidateReliability?: ProviderReliabilitySummary;
  isInsufficientCoverage?: boolean;
  minimumEvaluatedCases?: number;
  hasUnequalSampleSizes?: boolean;
  sampleSizeWarning?: string;
  latencyPercentileWarning?: string;
  factualityGroundednessStatus?: EvaluationEvidenceState;
  groundednessApplicableCases?: number;
  groundednessEvaluatedCases?: number;
  groundednessFailedCases?: number;
  groundednessAvgScore?: number | null;
  semanticEvaluationStatus?: EvaluationEvidenceState;
  llmJudgeStatus?: EvaluationEvidenceState;
  // Token telemetry aggregations (reasoning tokens are a breakdown, not added to total)
  baselineTotalTokens?: number | null;
  candidateTotalTokens?: number | null;
  baselineReasoningTokens?: number | null;
  candidateReasoningTokens?: number | null;
  baselineCachedTokens?: number | null;
  candidateCachedTokens?: number | null;
  // Section 15: Explicit failure counters
  dispatchedCases?: number;
  evaluatedCases?: number;
  qualityFailures?: number;
  providerFailures?: number;
  authenticationFailures?: number;
  quotaFailures?: number;
  safetyFailures?: number;
  unevaluableCases?: number;
  // Judge Usage & Cost Telemetry (Strictly separate from benchmark models)
  judgeModel?: string;
  judgeEvaluatedCases?: number;
  judgeInputTokens?: number;
  judgeOutputTokens?: number;
  judgeTotalTokens?: number;
  judgeEstimatedCost?: number | null;
  judgeAvgLatencyMs?: number | null;
  totalInfrastructureCost?: number | null;
}

export type RunExecutionMode = 'LIVE' | 'SAVED' | 'REFERENCE';

export interface RunProvenance {
  initiatedAt: string;
  completedAt: string;
  baselineProvider: ProviderType;
  candidateProvider: ProviderType;
  baselineModel: string;
  candidateModel: string;
  totalAttempted: number;
  baselineEvaluated: number;
  candidateEvaluated: number;
  baselineRateLimits: number;
  candidateRateLimits: number;
  hadOperationalErrors: boolean;
  isLiveExecution: boolean;
}

export interface EvaluationRun {
  id: string;
  projectId: string;
  datasetId: string;
  datasetName: string;
  baselineVersion: ModelVersion;
  candidateVersion: ModelVersion;
  judgeConfig?: JudgeConfig;
  timestamp: string;
  executionMode?: RunExecutionMode; // 'LIVE' | 'SAVED' | 'REFERENCE'
  provenance?: RunProvenance;
  metrics: MetricSummary;
  caseResults: TestCaseResult[];
  regressionDecision: RegressionDecision;
  rootCauses: RootCauseFinding[];
  releaseDecision: ReleaseDecision;
  comparisonReport?: import('../evaluation/comparator').ComparisonReport;
  durationMs: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  defaultDatasetId?: string;
  baselineVersionId: string;
  candidateVersionId: string;
  regressionSettings: RegressionSettings;
  createdAt: string;
  updatedAt: string;
}
