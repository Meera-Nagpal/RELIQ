/* ============================================================
   RELIQ — Root Cause Analysis Engine (Rule-Based Diagnostics)
   
   Transparently clusters failed cases, isolates root cause patterns,
   and provides actionable developer recommendations.
   ============================================================ */

import { DiagnosticClassification, RootCauseFinding, TestCaseResult } from '../domain/types';

/**
 * Analyzes failure patterns across test case results to produce
 * structured root-cause findings with explicit diagnostic classification,
 * observed evidence, and clear heuristic inference separation.
 */
export function analyzeRootCauses(results: TestCaseResult[]): RootCauseFinding[] {
  const failedCases = results.filter(
    (r) =>
      r.passed === false ||
      r.isRegression ||
      (r.executionStatus && r.executionStatus !== 'PASS') ||
      r.baselineExecutionStatus === 'PROVIDER_RATE_LIMIT' ||
      r.candidateExecutionStatus === 'PROVIDER_RATE_LIMIT' ||
      r.failureCategory !== undefined
  );
  if (failedCases.length === 0) return [];

  const findings: RootCauseFinding[] = [];
  let findingId = 1;

  // 0. Cluster: Upstream Provider Authentication Failure (HTTP 401/403)
  const authCases = results.filter(
    (r) =>
      r.failureCategory === 'PROVIDER_AUTHENTICATION' ||
      r.candidateExecutionStatus === 'AUTHENTICATION_ERROR' ||
      r.baselineExecutionStatus === 'AUTHENTICATION_ERROR' ||
      r.candidateUsage?.error?.status === 401 ||
      r.baselineUsage?.error?.status === 401 ||
      r.candidateUsage?.error?.status === 403 ||
      r.baselineUsage?.error?.status === 403 ||
      (r.candidateErrorDetail && r.candidateErrorDetail.category === 'AUTHENTICATION') ||
      (r.baselineErrorDetail && r.baselineErrorDetail.category === 'AUTHENTICATION') ||
      (r.failureReason && (r.failureReason.includes('401') || r.failureReason.toLowerCase().includes('authentication') || r.failureReason.toLowerCase().includes('api key')))
  );

  if (authCases.length > 0) {
    const caseIds = authCases.map((c) => c.testCaseId);
    findings.push({
      id: `rc-${findingId++}`,
      suspectedCause: 'Upstream Provider API Authentication Failure (HTTP 401/403)',
      category: 'System',
      affectedCaseIds: caseIds,
      affectedCaseCount: authCases.length,
      confidenceScore: 100,
      diagnosticConfidence: 'Observed (HTTP Telemetry)',
      classification: 'OBSERVED',
      evidence: [
        `[OBSERVED] HTTP 401/403 received from upstream provider API for ${authCases.length} request(s).`,
        `[OBSERVED] Provider authentication failure: API key missing, invalid, or unauthorized.`,
        `[CONFIRMED] No model output was available.`,
        `[NOT EVALUATED] Model quality could not be evaluated.`,
        `[NOT DETERMINABLE] Quality regression is not determinable.`,
      ],
      inference: 'Provider rejected API requests during authentication. This is an operational credential configuration error, not a model quality regression.',
      recommendation:
        'Verify provider API keys in environment settings (.env) or proxy headers, and ensure required organization permissions are active.',
    });
  }

  // 0.1 Cluster: Upstream Provider Quota Exhaustion / Rate Limit (HTTP 429)
  const rateLimitCases = results.filter(
    (r) =>
      r.failureCategory === 'PROVIDER_QUOTA' ||
      r.candidateExecutionStatus === 'PROVIDER_RATE_LIMIT' ||
      r.baselineExecutionStatus === 'PROVIDER_RATE_LIMIT' ||
      r.candidateUsage?.error?.status === 429 ||
      r.baselineUsage?.error?.status === 429 ||
      (r.candidateErrorDetail && r.candidateErrorDetail.category === 'RATE_LIMIT') ||
      (r.baselineErrorDetail && r.baselineErrorDetail.category === 'RATE_LIMIT')
  );

  if (rateLimitCases.length > 0) {
    const caseIds = rateLimitCases.map((c) => c.testCaseId);
    findings.push({
      id: `rc-${findingId++}`,
      suspectedCause: 'Upstream Provider API Quota Exhaustion or Rate Limiting (HTTP 429)',
      category: 'System',
      affectedCaseIds: caseIds,
      affectedCaseCount: rateLimitCases.length,
      confidenceScore: 99,
      diagnosticConfidence: 'Observed (HTTP Telemetry)',
      classification: 'OBSERVED',
      evidence: [
        `[OBSERVED] ${rateLimitCases.length} request(s) received HTTP 429 / RESOURCE_EXHAUSTED from upstream provider API.`,
        'Affected cases were isolated from quality scores and flagged as PROVIDER_RATE_LIMIT.',
      ],
      inference: 'Upstream provider throttled requests due to project RPM/TPM limits. This is an operational availability bottleneck, not model quality failure.',
      recommendation:
        'Increase provider quota / tier, implement request pacing/backoff, or configure fallback provider routing.',
    });
  }

  // Quality-evaluated cases only for downstream quality diagnostic clustering (excludes operational provider failures)
  const isOperationalFailure = (r: TestCaseResult) =>
    r.failureCategory === 'PROVIDER_AUTHENTICATION' ||
    r.failureCategory === 'PROVIDER_QUOTA' ||
    r.failureCategory === 'PROVIDER_NETWORK' ||
    r.failureCategory === 'PROVIDER_SERVER_ERROR' ||
    r.failureCategory === 'MALFORMED_RESPONSE' ||
    r.candidateExecutionStatus === 'AUTHENTICATION_ERROR' ||
    r.candidateExecutionStatus === 'PROVIDER_RATE_LIMIT' ||
    r.candidateExecutionStatus === 'TIMEOUT' ||
    r.candidateExecutionStatus === 'NETWORK_ERROR' ||
    r.candidateExecutionStatus === 'PROVIDER_ERROR' ||
    r.candidateQualityEvaluated === false ||
    Boolean(r.candidateUsage?.error && r.candidateUsage.error.status !== undefined && r.candidateUsage.error.status >= 400);

  const qualityEvaluatedFailedCases = failedCases.filter((r) => !isOperationalFailure(r));

  // 1. Cluster: JSON & Schema Formatting Failures
  const jsonFailures = qualityEvaluatedFailedCases.filter(
    (r) =>
      r.category === 'Structured Output' ||
      r.evaluatorScores.some(
        (s) => s.evaluatorType === 'json_validity' && !s.passed
      ) ||
      (r.failureReason && r.failureReason.toLowerCase().includes('json'))
  );

  if (jsonFailures.length > 0) {
    const caseIds = jsonFailures.map((c) => c.testCaseId);
    const confidence = Math.min(95, 60 + jsonFailures.length * 7);
    findings.push({
      id: `rc-${findingId++}`,
      suspectedCause: 'Candidate response format or JSON schema validation failure',
      category: 'Structured Output',
      affectedCaseIds: caseIds,
      affectedCaseCount: jsonFailures.length,
      confidenceScore: confidence,
      diagnosticConfidence: 'Confirmed Deterministic',
      classification: 'CONFIRMED_DETERMINISTIC',
      evidence: [
        `${jsonFailures.length} test case(s) failed deterministic JSON parser or required schema key checks.`,
        `Sample failure on ${jsonFailures[0]?.testCaseId}: ${jsonFailures[0]?.failureReason || 'Malformed JSON payload'}.`,
      ],
      inference: 'Deterministic comparison confirmed omitted schema keys. Hypothesis [HEURISTIC]: Prompt formatting instructions may lack few-shot JSON schema examples.',
      recommendation:
        'Reinforce the structured output JSON schema in the system preamble, or add a post-processing validator before passing output to client applications.',
    });
  }

  // 2. Cluster: Tool Calling & Parameter Mismatch
  const toolFailures = qualityEvaluatedFailedCases.filter(
    (r) =>
      r.category === 'Tool Calling' ||
      (r.failureReason &&
        (r.failureReason.toLowerCase().includes('tool') ||
          r.failureReason.toLowerCase().includes('parameter') ||
          r.failureReason.toLowerCase().includes('schema')))
  );

  if (toolFailures.length > 0) {
    const caseIds = toolFailures.map((c) => c.testCaseId);
    const confidence = Math.min(92, 65 + toolFailures.length * 6);
    findings.push({
      id: `rc-${findingId++}`,
      suspectedCause: 'Tool call schema parameter drift or type mismatch',
      category: 'Tool Calling',
      affectedCaseIds: caseIds,
      affectedCaseCount: toolFailures.length,
      confidenceScore: confidence,
      diagnosticConfidence: 'High (Heuristic)',
      classification: 'HEURISTIC',
      evidence: [
        `${toolFailures.length} tool invocation test(s) failed parameter validation compared to expected criteria.`,
        `Cases such as ${toolFailures.map((t) => t.testCaseId).slice(0, 3).join(', ')} failed validation.`,
      ],
      inference: '[HEURISTIC / HYPOTHESIS] Candidate model may have emitted altered parameter names or omitted required arguments in tool calls.',
      recommendation:
        'Verify tool definition schemas in the candidate prompt. Provide explicit parameter type annotations and few-shot tool call invocations.',
    });
  }

  // 3. Cluster: Policy Gate & Instruction Compliance
  const policyFailures = qualityEvaluatedFailedCases.filter(
    (r) =>
      r.category === 'Policy Gate' ||
      (r.failureReason &&
        (r.failureReason.toLowerCase().includes('policy') ||
          r.failureReason.toLowerCase().includes('supervisor') ||
          r.failureReason.toLowerCase().includes('approval') ||
          r.failureReason.toLowerCase().includes('missing required terms')))
  );

  if (policyFailures.length > 0) {
    const caseIds = policyFailures.map((c) => c.testCaseId);
    const confidence = Math.min(88, 55 + policyFailures.length * 8);
    findings.push({
      id: `rc-${findingId++}`,
      suspectedCause: 'Policy gate compliance failure or missing mandatory authorization keywords',
      category: 'Policy Gate',
      affectedCaseIds: caseIds,
      affectedCaseCount: policyFailures.length,
      confidenceScore: confidence,
      diagnosticConfidence: 'Moderate (Heuristic)',
      classification: 'HEURISTIC',
      evidence: [
        `${policyFailures.length} policy gate test(s) failed mandatory condition checks.`,
        'Model response failed to contain required escalation/authorization keywords.',
      ],
      inference: '[HEURISTIC / HYPOTHESIS] Candidate configuration may have reduced policy constraint priority in the system prompt.',
      recommendation:
        'Restore uncompressed safety preamble directives. Ensure authorization boundary keywords are explicitly pinned in the system instructions.',
    });
  }

  // 4. Cluster: Latency Spikes (Valid model outputs only)
  const latencyFailures = failedCases.filter(
    (r) =>
      r.candidateLatencyMs !== null &&
      r.candidateLatencyMs !== undefined &&
      r.baselineLatencyMs !== null &&
      r.baselineLatencyMs !== undefined &&
      r.candidateTransportSuccess === true &&
      (r.candidateLatencyMs > r.baselineLatencyMs * 1.3 ||
        r.evaluatorScores?.some((s) => s.evaluatorType === 'latency' && !s.passed))
  );

  if (latencyFailures.length > 0) {
    const caseIds = latencyFailures.map((c) => c.testCaseId);
    findings.push({
      id: `rc-${findingId++}`,
      suspectedCause: 'Candidate round-trip latency exceeded baseline threshold',
      category: 'System',
      affectedCaseIds: caseIds,
      affectedCaseCount: latencyFailures.length,
      confidenceScore: 84,
      diagnosticConfidence: 'Observed Metric Spikes',
      classification: 'OBSERVED',
      evidence: [
        `${latencyFailures.length} request(s) exhibited observed round-trip latency increases greater than 30% over baseline.`,
        `Average candidate round-trip latency was ${(
          latencyFailures.reduce((acc, c) => acc + (c.candidateLatencyMs ?? 0), 0) /
          latencyFailures.length
        ).toFixed(0)}ms.`,
      ],
      inference: 'Increased round-trip time reflects combined network latency, queuing delays, and model generation time.',
      recommendation:
        'Evaluate whether candidate reasoning depth or generation tokens increase latency. Consider token limits or streaming responses.',
    });
  }

  // 5. Cluster: Quota, Credit & Rate Limit Exhaustion
  const quotaFailures = failedCases.filter(
    (r) =>
      r.candidateUsage?.error?.code === 'insufficient_quota' ||
      r.candidateUsage?.error?.code === 'credit_balance_exhausted' ||
      r.candidateUsage?.error?.status === 429 ||
      r.candidateUsage?.error?.status === 400 ||
      (r.failureReason &&
        (r.failureReason.toLowerCase().includes('quota') ||
          r.failureReason.toLowerCase().includes('credit') ||
          r.failureReason.toLowerCase().includes('rate limit') ||
          r.failureReason.toLowerCase().includes('balance is too low')))
  );

  if (quotaFailures.length > 0 && !findings.some((f) => f.suspectedCause.includes('Quota'))) {
    const caseIds = quotaFailures.map((c) => c.testCaseId);
    findings.push({
      id: `rc-${findingId++}`,
      suspectedCause: 'Provider API quota, credit balance exhaustion, or rate limiting',
      category: 'System',
      affectedCaseIds: caseIds,
      affectedCaseCount: quotaFailures.length,
      confidenceScore: 99,
      diagnosticConfidence: 'Observed (HTTP Telemetry)',
      classification: 'OBSERVED',
      evidence: [
        `[OBSERVED] ${quotaFailures.length} request(s) failed due to provider quota/credit exhaustion.`,
        `Provider error: ${quotaFailures[0]?.candidateUsage?.error?.message || quotaFailures[0]?.failureReason || 'Account balance exhausted'}.`,
      ],
      inference: 'Upstream gateway returned HTTP 429/400 explicitly citing credit, quota, or rate limits.',
      recommendation:
        'Add credits to provider billing organization, verify spending limits, or configure fallback provider failover.',
    });
  }

  // 6. Cluster: Token Truncation & Output Limit
  const truncationFailures = qualityEvaluatedFailedCases.filter(
    (r) =>
      r.candidateOutput?.endsWith('...') ||
      r.evaluatorScores?.some((s) => s.evaluatorType === 'response_length' && !s.passed) ||
      (r.failureReason &&
        (r.failureReason.toLowerCase().includes('truncat') ||
          r.failureReason.toLowerCase().includes('token limit') ||
          r.failureReason.toLowerCase().includes('length')))
  );

  if (truncationFailures.length > 0) {
    const caseIds = truncationFailures.map((c) => c.testCaseId);
    findings.push({
      id: `rc-${findingId++}`,
      suspectedCause: 'Model output truncated due to insufficient maxOutputTokens or token budget',
      category: 'Edge Cases',
      affectedCaseIds: caseIds,
      affectedCaseCount: truncationFailures.length,
      confidenceScore: 88,
      diagnosticConfidence: 'Moderate (Heuristic)',
      classification: 'HEURISTIC',
      evidence: [
        `${truncationFailures.length} test case(s) suffered from output truncation or length bound violations.`,
      ],
      inference: '[HEURISTIC / HYPOTHESIS] Model generation appears to have hit max_tokens boundary before completing structured response.',
      recommendation:
        'Increase maxOutputTokens parameter in generationConfig to accommodate reasoning tokens and complete output payloads.',
    });
  }

  // 7. Cluster: Safety Refusal & Guardrail Boundaries
  const safetyFailures = failedCases.filter(
    (r) =>
      (r.category === 'Safety' ||
        r.failureCategory === 'SAFETY_POLICY_FAILURE' ||
        r.failureCategory === 'PROMPT_INJECTION_FAILURE' ||
        r.failureCategory === 'CREDENTIAL_LEAK' ||
        r.failureCategory === 'REFUSAL_CRITERIA_MISMATCH' ||
        (r.failureReason &&
          (r.failureReason.toLowerCase().includes('safety') ||
            r.failureReason.toLowerCase().includes('refusal') ||
            r.failureReason.toLowerCase().includes('prohibited')))) &&
      r.failureCategory !== 'PROVIDER_AUTHENTICATION' &&
      r.failureCategory !== 'PROVIDER_QUOTA'
  );
  if (safetyFailures.length > 0) {
    const caseIds = safetyFailures.map((c) => c.testCaseId);
    findings.push({
      id: `rc-${findingId++}`,
      suspectedCause: 'Model returned refusal response or failed safety guardrail',
      category: 'Safety',
      affectedCaseIds: caseIds,
      affectedCaseCount: safetyFailures.length,
      confidenceScore: 75,
      diagnosticConfidence: 'Cause Not Determinable',
      classification: 'OBSERVED',
      evidence: [
        `${safetyFailures.length} case(s) observed returning refusal strings.`,
        'The model returned a refusal.',
      ],
      inference: 'Possible safety/capability over-trigger or policy filter rejection.',
      recommendation:
        'Test stricter task framing or inspect provider-side safety configuration.',
    });
  }

  // 8. Cluster: Reference Criterion Mismatch (NOT "Hallucination")
  const factFailures = qualityEvaluatedFailedCases.filter(
    (r) =>
      r.category === 'Domain Knowledge' ||
      r.category === 'Retrieval' ||
      (r.failureReason &&
        (r.failureReason.toLowerCase().includes('fact') ||
          r.failureReason.toLowerCase().includes('missing required terms') ||
          r.failureReason.toLowerCase().includes('keyword') ||
          r.failureReason.toLowerCase().includes('does not match expected')))
  );
  if (factFailures.length > 0 && !findings.some((f) => f.category === 'Domain Knowledge')) {
    const caseIds = factFailures.map((c) => c.testCaseId);
    findings.push({
      id: `rc-${findingId++}`,
      suspectedCause: 'Reference criterion mismatch or missing domain keywords',
      category: 'Domain Knowledge',
      affectedCaseIds: caseIds,
      affectedCaseCount: factFailures.length,
      confidenceScore: 90,
      diagnosticConfidence: 'Confirmed Deterministic (Keyword Check)',
      classification: 'CONFIRMED_DETERMINISTIC',
      evidence: [
        `${factFailures.length} case(s) produced responses missing configured reference keywords.`,
        'Both responses failed the configured exact keyword criterion.',
      ],
      inference: 'The configured reference criterion was not reproduced. This represents an exact keyword criteria failure; it is not evaluated as factual hallucination.',
      recommendation:
        'Verify whether reference keywords in dataset are comprehensive, or configure a semantic / groundedness evaluation pipeline.',
    });
  }

  return findings;
}
