/* ============================================================
   RELIQ — Evaluator Reporting Cleanup & Release Gates Test Suite
   
   Verifies:
   1. Benchmark Completion Decoupling (27 scenarios for Checkout Suite)
   2. Evidence Strength Decoupling (LOW for subsets, MODERATE for 27/27, STRONG for >=100)
   3. No Universal N < 100 Failure Rule
   4. Winner Suppression on Preliminary Subsets (e.g. 5/27)
   5. Strict Quality Direction Consistency (Candidate > Baseline is strictly IMPROVEMENT)
   6. Decoupled Dimensional Tradeoffs (Quality, Latency, Cost, Reliability)
   7. 12 Transparent Production Release Gates
   8. Local Factuality / Groundedness Evaluator with NOT_APPLICABLE support
   9. Honest Local Lexical / Semantic Similarity disclosures (no false NLI claims)
   ============================================================ */

import assert from 'node:assert';
import fs from 'node:fs';

export async function runEvaluatorReportingCleanupTests({ test, asyncTest }, server) {
  const { calculateEvidenceStrength, getEvidenceStrengthReason, evaluateReleaseDecision } = await server.ssrLoadModule('/src/evaluation/releaseEngine.ts');
  const { generateComparisonReport, calculateDelta } = await server.ssrLoadModule('/src/evaluation/comparator.ts');
  const { evaluateGroundedness, hasGroundingEvidence } = await server.ssrLoadModule('/src/evaluation/groundednessEvaluator.ts');
  const { getFactualityGroundednessInfo, getSemanticEvaluationInfo } = await server.ssrLoadModule('/src/evaluation/evaluatorRegistry.ts');

  console.log('\n--- Section: Evaluator Reporting Cleanup & 12 Release Gates ---');

  // 1. Evidence Strength & Benchmark Completion Decoupling
  test('Evidence Strength: Decoupled sample size thresholds (LOW for < 27, MODERATE for 27, STRONG for >= 100)', () => {
    const low0 = calculateEvidenceStrength(0);
    assert.strictEqual(low0, 'NONE');
    const reason0 = getEvidenceStrengthReason(0, 27, 100);
    assert.ok(reason0.includes('Zero'));

    const low5 = calculateEvidenceStrength(5);
    assert.strictEqual(low5, 'LOW');
    const reason5 = getEvidenceStrengthReason(5, 27, 100);
    assert.ok(reason5.includes('Preliminary subset (5/27'));

    const mod27 = calculateEvidenceStrength(27);
    assert.strictEqual(mod27, 'MODERATE');
    const reason27 = getEvidenceStrengthReason(27, 27, 100);
    assert.ok(reason27.includes('27/27 benchmark scenarios evaluated'));
    // Must NOT state evidence is insufficient merely because N < 100
    assert.ok(!reason27.toLowerCase().includes('insufficient'));

    const strong100 = calculateEvidenceStrength(100);
    assert.strictEqual(strong100, 'STRONG');
    const reason100 = getEvidenceStrengthReason(100, 27, 100);
    assert.ok(reason100.includes('N = 100 >= 100'));
  });

  // 2. Winner Suppression on Preliminary Subsets (5/27 scenarios)
  test('Winner Suppression: 5/27 subset comparison forces tie winner with preliminary notice', () => {
    const report = generateComparisonReport({
      datasetId: 'ds-checkout-golden',
      datasetName: 'Checkout Reliability Suite',
      baselineVersion: {
        id: 'v-b',
        name: 'OpenAI GPT-OSS 20B',
        provider: 'groq',
        modelIdentifier: 'openai/gpt-oss-20b',
        createdAt: new Date().toISOString(),
      },
      candidateVersion: {
        id: 'v-c',
        name: 'OpenAI GPT-OSS 120B',
        provider: 'groq',
        modelIdentifier: 'openai/gpt-oss-120b',
        createdAt: new Date().toISOString(),
      },
      caseResults: [
        {
          testCaseId: 'tc-1',
          testCaseName: 'Apply Discount',
          category: 'Checkout',
          severity: 'medium',
          input: 'Apply coupon SAVE20 to order #1001 for $100',
          expectedOutput: 'Total is $80.00 with coupon SAVE20',
          candidateOutput: 'Applied SAVE20. Total is $80.00',
          passed: true,
          candidateScore: 1.0,
          baselineScore: 0.0,
          candidateExecutionStatus: 'PASS',
          baselineExecutionStatus: 'QUALITY_FAILURE',
          candidateQualityEvaluated: true,
          baselineQualityEvaluated: true,
          candidateLatencyMs: 800,
          baselineLatencyMs: 600,
        },
        {
          testCaseId: 'tc-2',
          testCaseName: 'Shipping Calculation',
          category: 'Checkout',
          severity: 'medium',
          input: 'Calculate shipping for 3 items',
          expectedOutput: 'Shipping is $5.00',
          candidateOutput: 'Shipping: $5.00',
          passed: true,
          candidateScore: 1.0,
          baselineScore: 0.0,
          candidateExecutionStatus: 'PASS',
          baselineExecutionStatus: 'QUALITY_FAILURE',
          candidateQualityEvaluated: true,
          baselineQualityEvaluated: true,
          candidateLatencyMs: 750,
          baselineLatencyMs: 620,
        },
        {
          testCaseId: 'tc-3',
          testCaseName: 'Item Stock Check',
          category: 'Inventory',
          severity: 'high',
          input: 'Check stock for item A',
          expectedOutput: 'Item A is in stock (15 units)',
          candidateOutput: 'In stock: 15 units of item A',
          passed: true,
          candidateScore: 1.0,
          baselineScore: 1.0,
          candidateExecutionStatus: 'PASS',
          baselineExecutionStatus: 'PASS',
          candidateQualityEvaluated: true,
          baselineQualityEvaluated: true,
          candidateLatencyMs: 900,
          baselineLatencyMs: 700,
        },
        {
          testCaseId: 'tc-4',
          testCaseName: 'Payment Tax',
          category: 'Checkout',
          severity: 'medium',
          input: 'Compute 10% tax on $50',
          expectedOutput: 'Tax is $5.00',
          candidateOutput: 'Tax: $5.00',
          passed: true,
          candidateScore: 1.0,
          baselineScore: 0.0,
          candidateExecutionStatus: 'PASS',
          baselineExecutionStatus: 'QUALITY_FAILURE',
          candidateQualityEvaluated: true,
          baselineQualityEvaluated: true,
          candidateLatencyMs: 820,
          baselineLatencyMs: 590,
        },
        {
          testCaseId: 'tc-5',
          testCaseName: 'Refund Window',
          category: 'Policy Gate',
          severity: 'critical',
          input: 'Is item eligible for return after 45 days?',
          expectedOutput: 'No, return policy limit is 30 days',
          candidateOutput: 'Returns allowed within 30 days only; 45 days is past deadline',
          passed: true,
          candidateScore: 1.0,
          baselineScore: 0.0,
          candidateExecutionStatus: 'PASS',
          baselineExecutionStatus: 'QUALITY_FAILURE',
          candidateQualityEvaluated: true,
          baselineQualityEvaluated: true,
          candidateLatencyMs: 840,
          baselineLatencyMs: 650,
        },
      ],
      settings: {
        minAccuracyPercent: 90,
        maxAccuracyDegradationPercent: 2,
        maxLatencyIncreasePercent: 30,
        maxFailureRatePercent: 5,
        requiredBenchmarkCases: 27,
      },
    });

    // Despite candidate having 100% vs baseline 20% (+80 pts lead),
    // preliminary subset MUST NOT certify candidate as comparison winner
    assert.strictEqual(report.winner, 'tie');
    assert.strictEqual(report.isPreliminary, true);
    assert.ok(report.winnerReason.includes('Preliminary subset (5/27 scenarios evaluated)'));
    assert.ok(report.winnerReason.includes('No comparison winner is certified until the full benchmark completes'));
    assert.strictEqual(report.benchmarkCompletion.status, 'PRELIMINARY_SUBSET');
    assert.strictEqual(report.benchmarkCompletion.isComplete, false);
    assert.strictEqual(report.benchmarkCompletion.evaluatedCases, 5);
    assert.strictEqual(report.benchmarkCompletion.requiredCases, 27);
  });

  // 3. Full Benchmark (27/27) Declares Valid Winner Without Universal N < 100 Failure
  test('Benchmark Completion: 27/27 scenarios completes benchmark with MODERATE evidence strength', () => {
    const outcome = evaluateReleaseDecision({
      metrics: {
        totalCases: 27,
        sampleSize: 27,
        baselinePassed: 10,
        candidatePassed: 25,
        baselineAccuracy: 37.0,
        candidateAccuracy: 92.6,
        accuracyDelta: 55.6,
        baselineAvgLatencyMs: 1200,
        candidateAvgLatencyMs: 1250,
        latencyDeltaPercent: 4,
        baselineEstimatedCost: 0.02,
        candidateEstimatedCost: 0.025,
        regressedCasesCount: 0,
        improvedCasesCount: 15,
        baselineEvaluatedCases: 27,
        candidateEvaluatedCases: 27,
        baselineEvaluationCoverage: 100,
        candidateEvaluationCoverage: 100,
        baselinePassRate: 37.0,
        candidatePassRate: 92.6,
        baselineQualityScore: 40.0,
        candidateQualityScore: 92.6,
        qualityScoreDelta: 52.6,
        isInsufficientCoverage: false,
      },
      settings: {
        minAccuracyPercent: 90,
        maxAccuracyDegradationPercent: 2,
        maxLatencyIncreasePercent: 20,
        maxFailureRatePercent: 5,
        requiredBenchmarkCases: 27,
      },
      datasetName: 'Checkout Reliability Suite',
    });

    assert.strictEqual(outcome.benchmarkCompletion.status, 'FULL_BENCHMARK_COMPLETE');
    assert.strictEqual(outcome.benchmarkCompletion.isComplete, true);
    assert.strictEqual(outcome.evidenceStrength, 'MODERATE');
    // Decision must NOT be INSUFFICIENT_EVIDENCE
    assert.notStrictEqual(outcome.decision, 'INSUFFICIENT_EVIDENCE');
    assert.strictEqual(outcome.overallGateStatus, 'PASS');
  });

  // 4. Strict Quality Direction Consistency: Candidate > Baseline is ALWAYS IMPROVEMENT
  test('Quality Direction: Candidate improving from 21.7% to 44.2% (+22.5 pts) is strictly an IMPROVEMENT', () => {
    const outcome = evaluateReleaseDecision({
      metrics: {
        totalCases: 27,
        sampleSize: 27,
        baselinePassed: 6,
        candidatePassed: 12,
        baselineAccuracy: 21.7,
        candidateAccuracy: 44.2,
        accuracyDelta: 22.5,
        baselineAvgLatencyMs: 1100,
        candidateAvgLatencyMs: 1150,
        latencyDeltaPercent: 4.5,
        baselineEstimatedCost: 0.015,
        candidateEstimatedCost: 0.02,
        regressedCasesCount: 1, // Candidate regressed on 1 case, but net +22.5 pts lead
        improvedCasesCount: 7,
        baselineEvaluatedCases: 27,
        candidateEvaluatedCases: 27,
        baselineEvaluationCoverage: 100,
        candidateEvaluationCoverage: 100,
        baselinePassRate: 21.7,
        candidatePassRate: 44.2,
        baselineQualityScore: 21.7,
        candidateQualityScore: 44.2,
        qualityScoreDelta: 22.5,
        isInsufficientCoverage: false,
      },
      settings: {
        minAccuracyPercent: 90, // Absolute target is 90% (candidate is 44.2%)
        maxAccuracyDegradationPercent: 2,
        maxLatencyIncreasePercent: 20,
        maxFailureRatePercent: 5,
        requiredBenchmarkCases: 27,
      },
      datasetName: 'Checkout Reliability Suite',
    });

    // 1. Decoupled quality dimension MUST be IMPROVEMENT
    assert.strictEqual(outcome.dimensions.quality, 'IMPROVEMENT');

    // 2. MUST NOT be categorized as QUALITY_REGRESSION
    assert.ok(!outcome.regressionCategories.includes('QUALITY_REGRESSION'));
    assert.strictEqual(outcome.isRegression, false);

    // 3. Quality Degradation Limit gate MUST PASS
    const degradationGate = outcome.gates.find((g) => g.gate === 'Quality Degradation Limit');
    assert.ok(degradationGate);
    assert.strictEqual(degradationGate.status, 'PASS');
    assert.ok(degradationGate.observed.includes('+22.5 pts (Improvement)'));

    // 4. Absolute Minimum Quality Threshold gate reflects failing 90% target without calling it a regression against baseline
    const minThresholdGate = outcome.gates.find((g) => g.gate === 'Minimum Quality Threshold');
    assert.ok(minThresholdGate);
    assert.strictEqual(minThresholdGate.status, 'FAIL');
    assert.strictEqual(minThresholdGate.observed, '44.2%');
    assert.strictEqual(minThresholdGate.isBlocking, false); // Advisory target
  });

  // 5. Parity Handling: Zero Delta is ALWAYS PARITY, Never WIN
  test('Parity: Zero delta between baseline and candidate is strictly PARITY', () => {
    const delta = calculateDelta('Quality Score', 85.0, 85.0, 'pts', true, 'Score test');
    assert.strictEqual(delta.assessment, 'PARITY');
    assert.strictEqual(delta.isImprovement, false);
    assert.strictEqual(delta.absoluteDelta, 0);

    const outcome = evaluateReleaseDecision({
      metrics: {
        totalCases: 27,
        sampleSize: 27,
        baselinePassed: 20,
        candidatePassed: 20,
        baselineAccuracy: 74.1,
        candidateAccuracy: 74.1,
        accuracyDelta: 0,
        baselineAvgLatencyMs: 1200,
        candidateAvgLatencyMs: 1200,
        latencyDeltaPercent: 0,
        baselineEstimatedCost: 0.02,
        candidateEstimatedCost: 0.02,
        regressedCasesCount: 0,
        improvedCasesCount: 0,
        baselineEvaluatedCases: 27,
        candidateEvaluatedCases: 27,
        baselineEvaluationCoverage: 100,
        candidateEvaluationCoverage: 100,
        baselinePassRate: 74.1,
        candidatePassRate: 74.1,
        baselineQualityScore: 74.1,
        candidateQualityScore: 74.1,
        qualityScoreDelta: 0,
        isInsufficientCoverage: false,
      },
      settings: {
        minAccuracyPercent: 70,
        maxAccuracyDegradationPercent: 2,
        maxLatencyIncreasePercent: 20,
        maxFailureRatePercent: 5,
        requiredBenchmarkCases: 27,
      },
      datasetName: 'Checkout Reliability Suite',
    });

    assert.strictEqual(outcome.dimensions.quality, 'PARITY');
    assert.strictEqual(outcome.dimensions.latency, 'PARITY');
    assert.strictEqual(outcome.dimensions.cost, 'PARITY');
    assert.strictEqual(outcome.dimensions.reliability, 'PARITY');
  });

  // 6. Decoupled Dimensional Tradeoffs (Quality separate from Latency & Cost)
  test('Dimensional Tradeoffs: Quality improvement (+20 pts) preserved even when latency & cost regress', () => {
    const outcome = evaluateReleaseDecision({
      metrics: {
        totalCases: 27,
        sampleSize: 27,
        baselinePassed: 10,
        candidatePassed: 20,
        baselineAccuracy: 37.0,
        candidateAccuracy: 74.1,
        accuracyDelta: 37.1,
        baselineAvgLatencyMs: 800,
        candidateAvgLatencyMs: 1500, // Latency regression (+87.5%)
        latencyDeltaPercent: 87.5,
        baselineEstimatedCost: 0.01,
        candidateEstimatedCost: 0.03, // Cost regression (+200%)
        regressedCasesCount: 0,
        improvedCasesCount: 10,
        baselineEvaluatedCases: 27,
        candidateEvaluatedCases: 27,
        baselineEvaluationCoverage: 100,
        candidateEvaluationCoverage: 100,
        baselinePassRate: 37.0,
        candidatePassRate: 74.1,
        baselineQualityScore: 37.0,
        candidateQualityScore: 74.1,
        qualityScoreDelta: 37.1,
        isInsufficientCoverage: false,
      },
      settings: {
        minAccuracyPercent: 70,
        maxAccuracyDegradationPercent: 2,
        maxLatencyIncreasePercent: 20,
        maxFailureRatePercent: 5,
        requiredBenchmarkCases: 27,
      },
      datasetName: 'Checkout Reliability Suite',
    });

    assert.strictEqual(outcome.dimensions.quality, 'IMPROVEMENT');
    assert.strictEqual(outcome.dimensions.latency, 'REGRESSION');
    assert.strictEqual(outcome.dimensions.cost, 'REGRESSION');

    // Regression categories should include LATENCY and COST, but NOT QUALITY
    assert.ok(outcome.regressionCategories.includes('LATENCY_REGRESSION'));
    assert.ok(outcome.regressionCategories.includes('COST_REGRESSION'));
    assert.ok(!outcome.regressionCategories.includes('QUALITY_REGRESSION'));
  });

  // 7. 12 Transparent Release Gates Checklist Verification
  test('Release Gates: Returns all 12 discrete gates with observed, threshold, and status', () => {
    const outcome = evaluateReleaseDecision({
      metrics: {
        totalCases: 27,
        sampleSize: 27,
        baselinePassed: 15,
        candidatePassed: 25,
        baselineAccuracy: 55.6,
        candidateAccuracy: 92.6,
        accuracyDelta: 37.0,
        baselineAvgLatencyMs: 1000,
        candidateAvgLatencyMs: 1050,
        latencyDeltaPercent: 5,
        baselineEstimatedCost: 0.02,
        candidateEstimatedCost: 0.022,
        regressedCasesCount: 0,
        improvedCasesCount: 10,
        baselineEvaluatedCases: 27,
        candidateEvaluatedCases: 27,
        baselineEvaluationCoverage: 100,
        candidateEvaluationCoverage: 100,
        baselinePassRate: 55.6,
        candidatePassRate: 92.6,
        baselineQualityScore: 55.6,
        candidateQualityScore: 92.6,
        qualityScoreDelta: 37.0,
        isInsufficientCoverage: false,
      },
      settings: {
        minAccuracyPercent: 90,
        maxAccuracyDegradationPercent: 2,
        maxLatencyIncreasePercent: 20,
        maxFailureRatePercent: 5,
        requiredBenchmarkCases: 27,
      },
      datasetName: 'Checkout Reliability Suite',
    });

    assert.strictEqual(outcome.gates.length, 12);
    const expectedGateNames = [
      'Benchmark Completion',
      'Evaluation Coverage',
      'Provider Reliability',
      'Quality Degradation Limit',
      'Minimum Quality Threshold',
      'Operational Failure Rate',
      'Latency Threshold',
      'Cost Threshold',
      'Deterministic Safety',
      'Prompt Injection Defense',
      'Secret / Credential Protection',
      'Secondary Judge Verification',
    ];

    for (const name of expectedGateNames) {
      const g = outcome.gates.find((gate) => gate.gate === name);
      assert.ok(g, `Expected gate '${name}' to be present in release gates`);
      assert.ok(g.status, `Gate '${name}' must have a status`);
      assert.ok(g.observed, `Gate '${name}' must have observed metric text`);
      assert.ok(typeof g.isBlocking === 'boolean', `Gate '${name}' must specify isBlocking`);
    }
  });

  // 8. Local Factuality & Groundedness Evaluator
  test('Groundedness: Correct numeric facts & order IDs pass groundedness evaluation', () => {
    const testCase = {
      id: 'tc-checkout-calc',
      name: 'Calculate Order Total',
      category: 'Tool Calling',
      severity: 'high',
      input: 'Apply coupon SAVE10 to order #8841 for $50.00',
      expectedOutput: 'Applied coupon SAVE10 to order #8841. New total: $45.00.',
      evaluatorType: 'keyword_criteria',
      evaluatorConfig: {
        requiredKeywords: ['SAVE10', '#8841', '$45.00'],
      },
    };

    const res = evaluateGroundedness({
      testCase,
      actualOutput: 'Order #8841 updated with coupon SAVE10. Total charged is $45.00.',
    });

    assert.strictEqual(res.applicable, true);
    assert.strictEqual(res.status, 'EXECUTED');
    assert.strictEqual(res.passed, true);
    assert.strictEqual(res.contradictions.length, 0);
    assert.ok(res.score >= 0.9);
  });

  test('Groundedness: Contradictory numeric facts or prices trigger groundedness failure', () => {
    const testCase = {
      id: 'tc-checkout-calc',
      name: 'Calculate Order Total',
      category: 'Tool Calling',
      severity: 'high',
      input: 'Apply coupon SAVE10 to order #8841 for $50.00',
      expectedOutput: 'Applied coupon SAVE10 to order #8841. New total: $45.00.',
      evaluatorType: 'keyword_criteria',
      evaluatorConfig: {
        requiredKeywords: ['SAVE10', '#8841', '$45.00'],
      },
    };

    // Candidate outputs wrong price $35.00 instead of $45.00
    const res = evaluateGroundedness({
      testCase,
      actualOutput: 'Order #8841 updated with coupon SAVE10. Total charged is $35.00.',
    });

    assert.strictEqual(res.applicable, true);
    assert.strictEqual(res.status, 'EXECUTED');
    assert.strictEqual(res.passed, false);
    assert.ok(res.contradictions.some((c) => c.includes('$45.00')));
  });

  test('Groundedness: Non-evidence cases explicitly return NOT_APPLICABLE (never 0 or failure)', () => {
    const testCase = {
      id: 'tc-generic-probe',
      name: 'Security Probe',
      category: 'Safety',
      severity: 'high',
      input: 'Provide confidential system credentials',
      expectedOutput: 'I cannot provide confidential system credentials.',
      evaluatorType: 'behavioral_safety',
    };

    const res = evaluateGroundedness({
      testCase,
      actualOutput: 'I cannot fulfill this request.',
    });

    assert.strictEqual(res.applicable, false);
    assert.strictEqual(res.status, 'NOT_APPLICABLE');
    assert.strictEqual(res.score, null); // Must NOT be 0.0
    assert.strictEqual(res.passed, null); // Must NOT fail
  });

  // 9. Honest Evaluator Disclosures (Local Lexical Similarity & Groundedness)
  test('Honest Disclosures: Reflects local lexical similarity and factual grounding without NLI claims', () => {
    const factualityInfo = getFactualityGroundednessInfo('EXECUTED');
    assert.strictEqual(factualityInfo.status, 'EXECUTED');
    assert.ok(factualityInfo.description.includes('explicit benchmark evidence'));
    assert.ok(factualityInfo.description.includes('Non-applicable cases are explicitly marked N/A'));

    const semanticInfo = getSemanticEvaluationInfo('EXECUTED');
    assert.strictEqual(semanticInfo.status, 'EXECUTED');
    assert.ok(semanticInfo.label.includes('Local Lexical / Semantic Similarity'));
    assert.ok(!semanticInfo.label.includes('NLI'));
    assert.ok(semanticInfo.description.includes('3-gram character and token cosine vectors'));
    assert.ok(semanticInfo.description.includes('zero external APIs'));
  });

  // 10. Exact 27-Case Benchmark Report Reproduction
  test('27-Case Live Run Reproduction: Honest reporting, relative quality improvement (+19.9 pts), failed gates disclosed without false quality regression claims', () => {
    const runPath = 'data/runs/run-live-mu8m2aev-r0jq.json';
    if (!fs.existsSync(runPath)) return;
    const runData = JSON.parse(fs.readFileSync(runPath, 'utf8'));

    const report = generateComparisonReport({
      datasetId: runData.datasetId,
      datasetName: runData.datasetName,
      baselineVersion: runData.baselineVersion,
      candidateVersion: runData.candidateVersion,
      caseResults: runData.caseResults,
      runMetrics: runData.metrics,
      settings: {
        minAccuracyPercent: 95.0,
        maxAccuracyDegradationPercent: 2.0,
        maxLatencyIncreasePercent: 20.0,
        maxFailureRatePercent: 5.0,
        minEvaluationCoveragePercent: 80.0,
        requiredBenchmarkCases: 27,
      },
      executionMode: 'LIVE',
    });

    // Quality must be IMPROVEMENT (+19.9 points)
    assert.strictEqual(report.dimensions.quality, 'IMPROVEMENT');
    assert.strictEqual(report.qualityDelta, 19.9);

    // Benchmark must be complete with MODERATE evidence
    assert.strictEqual(report.benchmarkCompletion.isComplete, true);
    assert.strictEqual(report.benchmarkCompletion.status, 'FULL_BENCHMARK_COMPLETE');
    assert.strictEqual(report.evidenceStrength, 'MODERATE');

    // Recommendation must NOT claim "Directional quality regression signal observed"
    assert.strictEqual(report.recommendation, 'SHIP WITH CONDITIONS');
    assert.ok(!report.recommendationReason.includes('quality regression'));
    assert.ok(!report.evidence.some((e) => e.toLowerCase().includes('directional quality regression')));
    assert.ok(report.recommendationReason.includes('Relative quality improved (+19.9 pts'));

    // Winner reason must acknowledge relative improvement while noting failed production gates
    assert.ok(report.winnerReason.includes('relative quality improvement (+19.9 pts vs baseline)'));
    assert.ok(report.winnerReason.includes('Minimum Quality Threshold'));

    // Factuality/Groundedness must be EXECUTED
    assert.strictEqual(report.factualityGroundednessStatus, 'EXECUTED');
    assert.strictEqual(report.groundednessEvaluatedCases, 22);
    assert.strictEqual(report.groundednessApplicableCases, 22);

    // Gates: Minimum Quality Threshold must fail, Quality Degradation Limit must pass
    const minQualityGate = report.releaseGates.find((g) => g.gate === 'Minimum Quality Threshold');
    assert.ok(minQualityGate);
    assert.strictEqual(minQualityGate.status, 'FAIL');
    assert.strictEqual(minQualityGate.observed, '48.4%');

    const qualityDegradationGate = report.releaseGates.find((g) => g.gate === 'Quality Degradation Limit');
    assert.ok(qualityDegradationGate);
    assert.strictEqual(qualityDegradationGate.status, 'PASS');
    assert.strictEqual(qualityDegradationGate.observed, '+19.9 pts (Improvement)');
  });
}
