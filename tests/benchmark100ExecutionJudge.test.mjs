/* ============================================================
   RELIQ — 100-Case Execution, Release Gate & Judge Test Suite
   
   Directly validates all 15 requirements from Section 12:
   1. 27-case dataset expected total = 27
   2. 100-case dataset expected total = 100
   3. 100/100 completion
   4. Benchmark Completion uses selected dataset total
   5. Evaluation Coverage uses selected dataset total
   6. PDF report uses selected dataset total
   7. JSON report uses selected dataset total
   8. Diagnostic evidence uses selected dataset total
   9. Independent judge: qwen/qwen3.8-27b executes successfully
   10. Judge unavailable: FAILED, not NOT_CONFIGURED
   11. Judge disabled: NOT_CONFIGURED
   12. Judge independence: judge != baseline, judge != candidate
   13. Overall gate: blocking failure => BLOCK/FAIL
   14. Overall gate: only warnings => PASS WITH WARNINGS
   15. PASS + BLOCK UI labels are displayed separately
   ============================================================ */

import assert from 'node:assert';
import fs from 'node:fs';

export async function runBenchmark100ExecutionJudgeTests({ test, asyncTest }, server) {
  console.log('\n------------------------------------------------------------');
  console.log('RELIQ 100-CASE EXECUTION, RELEASE GATE & LLM JUDGE TEST SUITE');
  console.log('------------------------------------------------------------\n');

  const { evaluateReleaseDecision } = await server.ssrLoadModule('/src/evaluation/releaseEngine.ts');
  const { generateComparisonReport, createEmptyReport } = await server.ssrLoadModule('/src/evaluation/comparator.ts');
  const {
    GROQ_MODEL_REGISTRY,
    getEligibleJudgeModels,
    getDefaultJudgeModel,
    validateJudgeConfiguration,
  } = await server.ssrLoadModule('/src/evaluation/judgeRegistry.ts');
  const { generateReportPdf } = await server.ssrLoadModule('/src/utils/pdfExporter.ts');
  const { generateBenchmarkDataset } = await server.ssrLoadModule('/src/data/datasetGenerator.ts');

  // Helper baseline metrics
  const createMockMetrics = (overrides = {}) => ({
    evaluatedCases: 100,
    candidateEvaluatedCases: 100,
    baselineEvaluatedCases: 100,
    candidateQualityScore: 92.5,
    baselineQualityScore: 90.0,
    candidatePassRate: 92.0,
    baselinePassRate: 88.0,
    candidateCoveragePercent: 100.0,
    baselineCoveragePercent: 100.0,
    candidateOperationalFailureRate: 0.0,
    baselineOperationalFailureRate: 0.0,
    avgLatencyCandidate: 1200,
    avgLatencyBaseline: 1150,
    candidateEstimatedCost: 0.005,
    baselineEstimatedCost: 0.004,
    llmJudgeStatus: 'EXECUTED',
    judgeModel: 'qwen/qwen3.8-27b',
    ...overrides,
  });

  // -------------------------------------------------------------
  // Test 1: 27-case dataset expected total = 27
  // -------------------------------------------------------------
  test('1. 27-case dataset: expected total = 27', () => {
    const outcome = evaluateReleaseDecision({
      totalCases: 27,
      candidateEvaluated: 27,
      baselineEvaluated: 27,
      metrics: createMockMetrics({
        evaluatedCases: 27,
        candidateEvaluatedCases: 27,
        baselineEvaluatedCases: 27,
      }),
      caseResults: [],
      datasetName: 'Checkout Reliability Suite',
    });

    assert.strictEqual(outcome.benchmarkCompletion.requiredCases, 27, 'Required cases must be 27 for 27-case dataset');
  });

  // -------------------------------------------------------------
  // Test 2: 100-case dataset expected total = 100
  // -------------------------------------------------------------
  test('2. 100-case dataset: expected total = 100', () => {
    const outcome = evaluateReleaseDecision({
      totalCases: 100,
      candidateEvaluated: 100,
      baselineEvaluated: 100,
      metrics: createMockMetrics(),
      caseResults: [],
      datasetName: 'Enterprise Reliability Suite (100 scenarios)',
    });

    assert.strictEqual(outcome.benchmarkCompletion.requiredCases, 100, 'Required cases must be 100 for 100-case dataset (not 27!)');
  });

  // -------------------------------------------------------------
  // Test 3: 100/100 completion calculation
  // -------------------------------------------------------------
  test('3. 100/100 completion: full benchmark complete', () => {
    const outcome = evaluateReleaseDecision({
      totalCases: 100,
      candidateEvaluated: 100,
      baselineEvaluated: 100,
      metrics: createMockMetrics(),
      caseResults: [],
      datasetName: 'Checkout Reliability Suite (Scaled to 100)',
    });

    assert.strictEqual(outcome.benchmarkCompletion.isComplete, true, 'Benchmark must be marked complete');
    assert.strictEqual(outcome.benchmarkCompletion.status, 'FULL_BENCHMARK_COMPLETE', 'Status must be FULL_BENCHMARK_COMPLETE');
    assert.strictEqual(outcome.benchmarkCompletion.evaluatedCases, 100, 'Evaluated cases must be 100');
    assert.strictEqual(outcome.benchmarkCompletion.requiredCases, 100, 'Required cases must be 100');
    assert.ok(outcome.benchmarkCompletion.label.includes('100/100'), `Label must include 100/100, got ${outcome.benchmarkCompletion.label}`);
  });

  // -------------------------------------------------------------
  // Test 4: Benchmark Completion gate uses selected dataset total
  // -------------------------------------------------------------
  test('4. Benchmark Completion uses selected dataset total', () => {
    const outcome100 = evaluateReleaseDecision({
      totalCases: 100,
      candidateEvaluated: 100,
      baselineEvaluated: 100,
      metrics: createMockMetrics(),
      caseResults: [],
      datasetName: 'Enterprise Reliability Suite (100 scenarios)',
    });

    const completionGate100 = outcome100.gates.find((g) => g.gate === 'Benchmark Completion');
    assert.ok(completionGate100, 'Benchmark Completion gate must exist');
    assert.strictEqual(completionGate100.observed, '100/100 scenarios', 'Observed must be 100/100 scenarios');
    assert.strictEqual(completionGate100.threshold, '>= 100 scenarios', 'Threshold must be >= 100 scenarios');
    assert.strictEqual(completionGate100.status, 'PASS', 'Status must be PASS');

    const outcome27 = evaluateReleaseDecision({
      totalCases: 27,
      candidateEvaluated: 27,
      baselineEvaluated: 27,
      metrics: createMockMetrics({ evaluatedCases: 27, candidateEvaluatedCases: 27, baselineEvaluatedCases: 27 }),
      caseResults: [],
      datasetName: 'Checkout Reliability Suite',
    });

    const completionGate27 = outcome27.gates.find((g) => g.gate === 'Benchmark Completion');
    assert.strictEqual(completionGate27.observed, '27/27 scenarios', 'Observed must be 27/27 scenarios');
    assert.strictEqual(completionGate27.threshold, '>= 27 scenarios', 'Threshold must be >= 27 scenarios');
  });

  // -------------------------------------------------------------
  // Test 5: Evaluation Coverage uses selected dataset total
  // -------------------------------------------------------------
  test('5. Evaluation Coverage uses selected dataset total', () => {
    const outcome = evaluateReleaseDecision({
      totalCases: 100,
      candidateEvaluated: 100,
      baselineEvaluated: 100,
      metrics: createMockMetrics({ candidateCoveragePercent: 100.0 }),
      caseResults: [],
      datasetName: 'Enterprise Reliability Suite (100 scenarios)',
    });

    const coverageGate = outcome.gates.find((g) => g.gate === 'Evaluation Coverage');
    assert.ok(coverageGate, 'Evaluation Coverage gate must exist');
    assert.strictEqual(coverageGate.observed, '100.0%', 'Observed coverage must be 100.0%');
    assert.strictEqual(coverageGate.status, 'PASS', 'Status must be PASS');
  });

  // -------------------------------------------------------------
  // Test 6: PDF report uses selected dataset total
  // -------------------------------------------------------------
  test('6. PDF report uses selected dataset total (100 required cases)', () => {
    const mockReport = {
      id: 'test-100-run',
      title: '100-Case Benchmark Comparison',
      datasetName: 'Enterprise Reliability Suite (100 scenarios)',
      totalCases: 100,
      baseline: { provider: 'groq', model: 'openai/gpt-oss-20b' },
      candidate: { provider: 'groq', model: 'openai/gpt-oss-120b' },
      recommendation: 'SHIP',
      evidenceStrength: 'STRONG',
      qualityDelta: 4.0,
      benchmarkCompletion: {
        status: 'FULL_BENCHMARK_COMPLETE',
        evaluatedCases: 100,
        requiredCases: 100,
        isComplete: true,
        label: 'FULL BENCHMARK COMPLETE (100/100 Scenarios Evaluated)',
      },
      metrics: {
        passRate: { metric: 'Pass Rate', baselineValue: 88, candidateValue: 92, delta: 4 },
        avgLatencyMs: { metric: 'Mean Latency (Successful)', baselineValue: 1100, candidateValue: 1200, delta: 100 },
        estimatedCostUsd: { metric: 'Estimated Run Cost', baselineValue: 0.004, candidateValue: 0.005, delta: 0.001 },
        evaluationCoverage: { metric: 'Evaluation Coverage', baselineValue: 100, candidateValue: 100, delta: 0 },
      },
      releaseGates: [
        {
          gate: 'Benchmark Completion',
          category: 'COMPLETION',
          status: 'PASS',
          observed: '100/100 scenarios',
          threshold: '>= 100 scenarios',
          details: 'Full 100-scenario benchmark executed.',
          isBlocking: true,
        },
      ],
      overallGateStatus: 'PASS',
      winner: 'candidate',
      winnerReason: 'Candidate demonstrated quality improvement across full 100-scenario benchmark.',
    };

    const pdfBytes = generateReportPdf(mockReport);
    const pdfText = new TextDecoder('latin1').decode(pdfBytes);

    // Verifies PDF contains 100 / 100 required benchmark cases, NOT 27
    assert.ok(pdfText.includes('100 / 100 required benchmark cases'), 'PDF must display "100 / 100 required benchmark cases"');
    assert.ok(!pdfText.includes('100 / 27 required benchmark cases'), 'PDF must NOT display "100 / 27 required benchmark cases"');
  });

  // -------------------------------------------------------------
  // Test 7: JSON report uses selected dataset total
  // -------------------------------------------------------------
  test('7. JSON report uses selected dataset total', () => {
    const report = generateComparisonReport({
      runId: 'json-100-test',
      datasetId: 'ds-benchmark-100',
      datasetName: 'Enterprise Reliability Suite (100 scenarios)',
      totalCases: 100,
      baselineVersion: { id: 'base-1', name: 'Baseline', provider: 'groq', modelIdentifier: 'openai/gpt-oss-20b' },
      candidateVersion: { id: 'cand-1', name: 'Candidate', provider: 'groq', modelIdentifier: 'openai/gpt-oss-120b' },
      caseResults: Array.from({ length: 100 }, (_, i) => ({
        testCaseId: `tc-${i + 1}`,
        testCaseName: `Test Case ${i + 1}`,
        baselineExecutionStatus: 'PASS',
        candidateExecutionStatus: 'PASS',
        isPassed: true,
        baselineLatencyMs: 1000,
        candidateLatencyMs: 1100,
      })),
      runMetrics: {
        totalCases: 100,
        evaluatedCases: 100,
        candidateEvaluatedCases: 100,
        baselineEvaluatedCases: 100,
      },
    });

    const jsonStr = JSON.stringify(report);
    const parsed = JSON.parse(jsonStr);

    assert.strictEqual(parsed.totalCases, 100, 'JSON report totalCases must be 100');
    assert.strictEqual(parsed.benchmarkCompletion.requiredCases, 100, 'JSON report benchmarkCompletion.requiredCases must be 100');
    assert.strictEqual(parsed.benchmarkCompletion.evaluatedCases, 100, 'JSON report benchmarkCompletion.evaluatedCases must be 100');
    assert.strictEqual(parsed.benchmarkCompletion.isComplete, true, 'Benchmark must be complete');
  });

  // -------------------------------------------------------------
  // Test 8: Diagnostic evidence uses selected dataset total
  // -------------------------------------------------------------
  test('8. Diagnostic evidence uses selected dataset total', () => {
    const outcome = evaluateReleaseDecision({
      totalCases: 100,
      candidateEvaluated: 100,
      baselineEvaluated: 100,
      metrics: createMockMetrics(),
      caseResults: [],
      datasetName: 'Enterprise Reliability Suite (100 scenarios)',
    });

    assert.strictEqual(outcome.evidenceStrength, 'STRONG', 'Evidence strength for N=100 must be STRONG');
    assert.ok(outcome.evidenceStrengthReason.includes('100'), 'Evidence strength reason must reference sample size 100');
  });

  // -------------------------------------------------------------
  // Test 9: Independent judge: qwen/qwen3.8-27b executes successfully
  // -------------------------------------------------------------
  test('9. Independent judge: qwen/qwen3.8-27b executes successfully', () => {
    // Check registry descriptor
    const descriptor = GROQ_MODEL_REGISTRY['qwen/qwen3.8-27b'];
    assert.ok(descriptor, 'qwen/qwen3.8-27b descriptor must exist in GROQ_MODEL_REGISTRY');
    assert.strictEqual(descriptor.isJudgeEligible, true, 'qwen/qwen3.8-27b must be eligible');
    assert.strictEqual(descriptor.recommendedForJudge, true, 'qwen/qwen3.8-27b must be recommended for judge');

    // Check compound models are not recommended
    assert.strictEqual(GROQ_MODEL_REGISTRY['groq/compound'].recommendedForJudge, false, 'groq/compound must not be recommended');
    assert.strictEqual(GROQ_MODEL_REGISTRY['groq/compound-mini']?.recommendedForJudge, false, 'groq/compound-mini must not be recommended');

    // Check getDefaultJudgeModel returns qwen/qwen3.8-27b
    const defaultJudge = getDefaultJudgeModel('openai/gpt-oss-20b', 'openai/gpt-oss-120b');
    assert.ok(defaultJudge, 'Default judge must exist');
    assert.strictEqual(defaultJudge.id, 'qwen/qwen3.8-27b', 'Default judge must be qwen/qwen3.8-27b');

    // Evaluate gate with EXECUTED judge
    const outcome = evaluateReleaseDecision({
      totalCases: 100,
      candidateEvaluated: 100,
      baselineEvaluated: 100,
      metrics: createMockMetrics({
        llmJudgeStatus: 'EXECUTED',
        judgeModel: 'qwen/qwen3.8-27b',
      }),
      caseResults: [],
      datasetName: 'Enterprise Reliability Suite (100 scenarios)',
    });

    const judgeGate = outcome.gates.find((g) => g.gate === 'Secondary Judge Verification');
    assert.ok(judgeGate, 'Secondary Judge Verification gate must exist');
    assert.strictEqual(judgeGate.status, 'PASS', 'Gate status must be PASS');
    assert.strictEqual(judgeGate.observed, 'EXECUTED', 'Observed must be EXECUTED');
    assert.ok(judgeGate.details.includes('qwen/qwen3.8-27b'), `Details must identify judge model qwen/qwen3.8-27b, got: ${judgeGate.details}`);
  });

  // -------------------------------------------------------------
  // Test 10: Judge unavailable: FAILED, not NOT_CONFIGURED
  // -------------------------------------------------------------
  test('10. Judge unavailable: FAILED, not NOT_CONFIGURED', () => {
    const outcome = evaluateReleaseDecision({
      totalCases: 100,
      candidateEvaluated: 100,
      baselineEvaluated: 100,
      metrics: createMockMetrics({
        llmJudgeStatus: 'FAILED',
        judgeModel: 'qwen/qwen3.8-27b',
      }),
      caseResults: [],
      datasetName: 'Enterprise Reliability Suite (100 scenarios)',
    });

    const judgeGate = outcome.gates.find((g) => g.gate === 'Secondary Judge Verification');
    assert.ok(judgeGate, 'Secondary Judge Verification gate must exist');
    assert.strictEqual(judgeGate.status, 'FAIL', 'Judge failure must produce FAIL gate status');
    assert.strictEqual(judgeGate.observed, 'FAILED', 'Observed must be FAILED (not NOT_CONFIGURED)');

    // Also verify comparator report does not drop failed judge to NOT_CONFIGURED
    const report = generateComparisonReport({
      runId: 'judge-fail-test',
      datasetId: 'ds-benchmark-100',
      totalCases: 10,
      baselineVersion: { id: 'b1', name: 'B', provider: 'groq', modelIdentifier: 'openai/gpt-oss-20b' },
      candidateVersion: { id: 'c1', name: 'C', provider: 'groq', modelIdentifier: 'openai/gpt-oss-120b' },
      caseResults: [
        {
          testCaseId: 'tc-1',
          testCaseName: 'TC1',
          baselineExecutionStatus: 'SUCCESS',
          candidateExecutionStatus: 'SUCCESS',
          isPassed: true,
          llmJudgeEvaluation: {
            error: 'HTTP 404: model not found',
            correctness: 0,
            instructionAdherence: 0,
            relevance: 0,
            completeness: 0,
            groundedness: 0,
            safety: 0,
            overall: 0,
            reason: 'Judge provider error',
          },
        },
      ],
      runMetrics: {
        totalCases: 10,
        evaluatedCases: 1,
        candidateEvaluatedCases: 1,
        baselineEvaluatedCases: 1,
        llmJudgeStatus: 'FAILED',
      },
    });

    assert.strictEqual(report.llmJudgeStatus, 'FAILED', 'Comparator report must preserve FAILED judge status');
  });

  // -------------------------------------------------------------
  // Test 11: Judge disabled: NOT_CONFIGURED
  // -------------------------------------------------------------
  test('11. Judge disabled: NOT_CONFIGURED', () => {
    const outcome = evaluateReleaseDecision({
      totalCases: 100,
      candidateEvaluated: 100,
      baselineEvaluated: 100,
      metrics: createMockMetrics({
        llmJudgeStatus: 'NOT_CONFIGURED',
        judgeModel: undefined,
      }),
      caseResults: [],
      datasetName: 'Enterprise Reliability Suite (100 scenarios)',
    });

    const judgeGate = outcome.gates.find((g) => g.gate === 'Secondary Judge Verification');
    assert.ok(judgeGate, 'Secondary Judge Verification gate must exist');
    assert.strictEqual(judgeGate.status, 'NOT_APPLICABLE', 'Disabled judge must be NOT_APPLICABLE');
    assert.strictEqual(judgeGate.observed, 'NOT_CONFIGURED', 'Observed must be NOT_CONFIGURED');
  });

  // -------------------------------------------------------------
  // Test 12: Judge independence: judge != baseline, judge != candidate
  // -------------------------------------------------------------
  test('12. Judge independence: judge != baseline, judge != candidate', () => {
    const baseModel = 'openai/gpt-oss-20b';
    const candModel = 'openai/gpt-oss-120b';

    // Baseline collision
    const resBase = validateJudgeConfiguration(
      { enabled: true, provider: 'groq', modelIdentifier: baseModel },
      baseModel,
      candModel
    );
    assert.strictEqual(resBase.valid, false, 'Judge matching baseline must be invalid');
    assert.ok(resBase.error.includes('cannot be the baseline model'), `Error must mention baseline: ${resBase.error}`);

    // Candidate collision
    const resCand = validateJudgeConfiguration(
      { enabled: true, provider: 'groq', modelIdentifier: candModel },
      baseModel,
      candModel
    );
    assert.strictEqual(resCand.valid, false, 'Judge matching candidate must be invalid');
    assert.ok(resCand.error.includes('cannot be the candidate model'), `Error must mention candidate: ${resCand.error}`);

    // Valid independent judge
    const resValid = validateJudgeConfiguration(
      { enabled: true, provider: 'groq', modelIdentifier: 'qwen/qwen3.8-27b' },
      baseModel,
      candModel
    );
    assert.strictEqual(resValid.valid, true, 'Independent judge must be valid');
  });

  // -------------------------------------------------------------
  // Test 13: Overall gate: blocking failure => BLOCK/FAIL
  // -------------------------------------------------------------
  test('13. Overall gate: blocking failure => BLOCK/FAIL', () => {
    // Candidate quality degraded significantly (-20 pts drop, exceeding tolerance)
    const outcome = evaluateReleaseDecision({
      totalCases: 100,
      candidateEvaluated: 100,
      baselineEvaluated: 100,
      metrics: createMockMetrics({
        candidateQualityScore: 70.0,
        baselineQualityScore: 90.0,
        candidatePassRate: 70.0,
        baselinePassRate: 90.0,
      }),
      caseResults: [],
      datasetName: 'Enterprise Reliability Suite (100 scenarios)',
    });

    const degradationGate = outcome.gates.find((g) => g.gate === 'Quality Degradation Limit');
    assert.ok(degradationGate, 'Quality Degradation Limit gate must exist');
    assert.strictEqual(degradationGate.status, 'FAIL', 'Quality Degradation Limit status must be FAIL');
    assert.strictEqual(degradationGate.isBlocking, true, 'Quality Degradation Limit must be isBlocking: true');
    assert.strictEqual(outcome.overallGateStatus, 'FAIL', 'Overall gate status must be FAIL when blocking gate fails');
  });

  // -------------------------------------------------------------
  // Test 14: Overall gate: only warnings => PASS WITH WARNINGS
  // -------------------------------------------------------------
  test('14. Overall gate: only warnings => PASS WITH WARNINGS', () => {
    // Candidate has cost regression (+60%), but all blocking gates pass
    const outcome = evaluateReleaseDecision({
      totalCases: 100,
      candidateEvaluated: 100,
      baselineEvaluated: 100,
      metrics: createMockMetrics({
        candidateEstimatedCost: 0.016, // > +50% cost increase
        baselineEstimatedCost: 0.010,
        candidateQualityScore: 92.0,
        baselineQualityScore: 90.0,
      }),
      caseResults: [],
      datasetName: 'Enterprise Reliability Suite (100 scenarios)',
    });

    const costGate = outcome.gates.find((g) => g.gate === 'Cost Threshold');
    assert.ok(costGate, 'Cost Threshold gate must exist');
    assert.strictEqual(costGate.status, 'WARNING', 'Cost Threshold status must be WARNING');
    assert.strictEqual(costGate.isBlocking, false, 'Cost Threshold must be isBlocking: false');
    assert.strictEqual(outcome.overallGateStatus, 'PASS WITH WARNINGS', 'Overall gate status must be PASS WITH WARNINGS');
  });

  // -------------------------------------------------------------
  // Test 15: PASS + BLOCK UI labels are displayed separately
  // -------------------------------------------------------------
  test('15. PASS + BLOCK UI labels are displayed separately', () => {
    // Read ComparisonReportModal.tsx source code to verify structural separation
    const modalSrc = fs.readFileSync('src/app/components/ComparisonReportModal.tsx', 'utf8');

    // Must NOT have combined PASS [BLOCK] in single line / tag
    assert.ok(modalSrc.includes('STATUS:'), 'ComparisonReportModal must include explicit STATUS: label');
    assert.ok(modalSrc.includes('ON FAILURE:'), 'ComparisonReportModal must include explicit ON FAILURE: label');
    assert.ok(!modalSrc.includes("'{gate.status} [BLOCK]'"), 'Must not contain concatenated status and block string');

    // Read pdfExporter.ts source code to verify distinct ACTION column
    const pdfSrc = fs.readFileSync('src/utils/pdfExporter.ts', 'utf8');
    assert.ok(pdfSrc.includes("'ACTION'"), 'pdfExporter must include distinct ACTION table column header');
    assert.ok(pdfSrc.includes("'STATUS'"), 'pdfExporter must include distinct STATUS table column header');
  });

  // -------------------------------------------------------------
  // Test 16: Blocking Gate Aggregation & Precedence: Quality Improved but Absolute Quality & Latency Gates Failed
  // -------------------------------------------------------------
  test('16. Blocking Gate Aggregation: Quality improved but Minimum Quality & Latency fail => BLOCK & required summary', () => {
    const outcome = evaluateReleaseDecision({
      totalCases: 27,
      candidateEvaluated: 27,
      baselineEvaluated: 27,
      metrics: {
        totalCases: 27,
        sampleSize: 27,
        baselinePassed: 6,
        candidatePassed: 9,
        baselineAccuracy: 22.2,
        candidateAccuracy: 33.3,
        accuracyDelta: 11.1,
        baselineEvaluatedCases: 27,
        candidateEvaluatedCases: 27,
        baselineEvaluationCoverage: 100,
        candidateEvaluationCoverage: 100,
        baselinePassRate: 22.2,
        candidatePassRate: 33.3,
        baselineQualityScore: 28.5,
        candidateQualityScore: 48.4,
        qualityScoreDelta: 19.9,
        baselineAvgLatencyMs: 654,
        candidateAvgLatencyMs: 795,
        latencyDeltaPercent: 22,
        baselineEstimatedCost: 0.0019,
        candidateEstimatedCost: 0.0074,
        regressedCasesCount: 0,
        improvedCasesCount: 3,
      },
      settings: {
        minAccuracyPercent: 95.0,
        maxAccuracyDegradationPercent: 2.0,
        maxLatencyIncreasePercent: 20.0,
        maxFailureRatePercent: 5.0,
        requiredBenchmarkCases: 27,
      },
      caseResults: [],
      datasetName: 'Checkout Reliability Suite',
    });

    // 1. Gate verification
    const degradationGate = outcome.gates.find((g) => g.gate === 'Quality Degradation Limit');
    assert.strictEqual(degradationGate.status, 'PASS');
    assert.strictEqual(degradationGate.isBlocking, true);

    const minQualityGate = outcome.gates.find((g) => g.gate === 'Minimum Quality Threshold');
    assert.strictEqual(minQualityGate.status, 'FAIL');
    assert.strictEqual(minQualityGate.isBlocking, true);

    const latencyGate = outcome.gates.find((g) => g.gate === 'Latency Threshold');
    assert.strictEqual(latencyGate.status, 'FAIL');
    assert.strictEqual(latencyGate.isBlocking, true);

    const costGate = outcome.gates.find((g) => g.gate === 'Cost Threshold');
    assert.strictEqual(costGate.status, 'WARNING');
    assert.strictEqual(costGate.isBlocking, false);

    // 2. Relative quality direction is decoupled and preserved as IMPROVEMENT
    assert.strictEqual(outcome.dimensions.quality, 'IMPROVEMENT');
    assert.strictEqual(outcome.isRegression, false);

    // 3. Absolute release decision & overall gate status
    assert.strictEqual(outcome.decision, 'BLOCK');
    assert.strictEqual(outcome.overallGateStatus, 'FAIL');

    // 4. Exact summary requirement
    assert.strictEqual(
      outcome.summary,
      'Candidate quality improved relative to baseline, but release is blocked because absolute quality and latency gates failed.'
    );
  });
}
