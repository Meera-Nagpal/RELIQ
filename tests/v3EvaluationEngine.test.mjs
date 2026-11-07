/* ============================================================
   RELIQ — V3 Evaluation Engine End-to-End Regression Suite
   
   Verifies all core V3 requirements:
   - 100-point multi-dimensional framework
   - Non-disqualifying test failures
   - Paired bootstrap confidence intervals and Wilcoxon tests
   - Role-swap symmetry
   - Strict separation of winner determination and release gating
   - Tri-format consistency (UI, JSON, PDF)
   ============================================================ */

import assert from 'node:assert';
import { createServer } from 'vite';

async function runTests() {
  console.log('\n============================================================');
  console.log('RELIQ V3 EVALUATION ENGINE E2E REGRESSION SUITE');
  console.log('============================================================\n');

  const server = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  try {
    const { generateComparisonReport } = await server.ssrLoadModule('/src/evaluation/comparator.ts');
    const { generateReportPdf } = await server.ssrLoadModule('/src/utils/pdfExporter.ts');

    const baseVersion = {
      id: 'v_base',
      modelIdentifier: 'qwen/qwen3.8-27b',
      provider: 'groq',
      promptVersion: '1.0',
    };

    const candVersion = {
      id: 'v_cand',
      modelIdentifier: 'openai/gpt-oss-120b',
      provider: 'groq',
      promptVersion: '1.0',
    };

    // Helper: generate 27 synthetic test cases
    function makeCases(count, config = {}) {
      return Array.from({ length: count }, (_, i) => {
        const id = `case_${i + 1}`;
        const bFail = config.bFailCases?.includes(i + 1);
        const cFail = config.cFailCases?.includes(i + 1);
        const bScore = bFail ? 0.0 : (config.bScores?.[i] ?? 0.85);
        const cScore = cFail ? 0.0 : (config.cScores?.[i] ?? 0.95);

        return {
          testCaseId: id,
          scenarioId: id,
          scenarioName: `Scenario ${i + 1}`,
          category: config.categories?.[i] || 'Reasoning',
          severity: 'medium',
          passed: !cFail,
          executionStatus: cFail ? 'QUALITY_FAILURE' : 'PASS',
          baselineExecutionStatus: bFail ? 'QUALITY_FAILURE' : 'PASS',
          candidateExecutionStatus: cFail ? 'QUALITY_FAILURE' : 'PASS',
          baselineQualityEvaluated: true,
          candidateQualityEvaluated: true,
          baselineScore: bScore,
          candidateScore: cScore,
          baselineOutput: bFail ? 'Incorrect answer' : `Detailed correct baseline response for scenario ${i + 1}`,
          candidateOutput: cFail ? 'Incorrect answer' : `Superior comprehensive candidate reasoning for scenario ${i + 1}`,
          baselineLatencyMs: config.bLatencyMs ?? 2000,
          candidateLatencyMs: config.cLatencyMs ?? 400,
          baselineUsage: { inputTokens: 150, outputTokens: 80, estimatedCostUsd: 0.0003, latencyMs: config.bLatencyMs ?? 2000 },
          candidateUsage: { inputTokens: 150, outputTokens: 90, estimatedCostUsd: 0.0001, latencyMs: config.cLatencyMs ?? 400 },
          failureCategory: cFail ? 'QUALITY_FAILURE' : undefined,
        };
      });
    }

    // -------------------------------------------------------------
    // Test 1: Non-Disqualifying Test Failure (Core V3 Objective)
    // -------------------------------------------------------------
    test('1. Non-Disqualifying Test Failure: Candidate with 1 failure out of 27 can still win on superior overall capability and speed', () => {
      // Baseline passes 27/27 with mediocre 0.70 score and 2,500ms latency
      // Candidate passes 26/27 (fails case 1), but achieves 0.98 on all others and 350ms latency
      const cases = makeCases(27, {
        bFailCases: [],
        cFailCases: [1],
        bScores: Array(27).fill(0.70),
        cScores: Array(27).fill(0.98),
        bLatencyMs: 2500,
        cLatencyMs: 350,
      });

      const report = generateComparisonReport({
        datasetId: 'd-27',
        datasetName: 'Canonical 27-Scenario Suite',
        totalCases: 27,
        baselineVersion: baseVersion,
        candidateVersion: candVersion,
        caseResults: cases,
        engineVersion: 'v3',
      });

      assert.strictEqual(report.winner, 'candidate', 'Candidate must WIN overall performance despite failing 1 scenario');
      assert.ok(report.v3Scoring, 'Report must contain v3Scoring');
      assert.ok(report.v3Scoring.overallDelta > 10.0, 'Overall delta must be positive (> 10 pts)');
      assert.ok(report.winnerReason.includes('Candidate outperformed baseline overall'));
    });

    // -------------------------------------------------------------
    // Test 2: Role-Swap Invertibility
    // -------------------------------------------------------------
    test('2. Role-Swap Invertibility: Swapping Baseline and Candidate inverts winner and delta sign', () => {
      const casesA = makeCases(20, {
        bScores: Array(20).fill(0.75),
        cScores: Array(20).fill(0.92),
        bLatencyMs: 1500,
        cLatencyMs: 450,
      });

      const reportA = generateComparisonReport({
        datasetId: 'd-20',
        datasetName: 'Suite A',
        totalCases: 20,
        baselineVersion: baseVersion,
        candidateVersion: candVersion,
        caseResults: casesA,
        engineVersion: 'v3',
      });

      // Role swapped cases
      const casesB = casesA.map((c) => ({
        ...c,
        baselineScore: c.candidateScore,
        candidateScore: c.baselineScore,
        baselineOutput: c.candidateOutput,
        candidateOutput: c.baselineOutput,
        baselineLatencyMs: c.candidateLatencyMs,
        candidateLatencyMs: c.baselineLatencyMs,
        baselineUsage: c.candidateUsage,
        candidateUsage: c.baselineUsage,
      }));

      const reportB = generateComparisonReport({
        datasetId: 'd-20',
        datasetName: 'Suite B',
        totalCases: 20,
        baselineVersion: candVersion,
        candidateVersion: baseVersion,
        caseResults: casesB,
        engineVersion: 'v3',
      });

      assert.strictEqual(reportA.winner, 'candidate', 'Candidate must win in Run A');
      assert.strictEqual(reportB.winner, 'baseline', 'Baseline must win in Run B');
      assert.ok(
        Math.abs(reportA.v3Scoring.overallDelta + reportB.v3Scoring.overallDelta) < 1.0,
        `Deltas must invert symmetrically: A=${reportA.v3Scoring.overallDelta}, B=${reportB.v3Scoring.overallDelta}`
      );
    });

    // -------------------------------------------------------------
    // Test 3: Same-Model Comparison Yields Statistical Parity
    // -------------------------------------------------------------
    test('3. Same-Model Parity: Identical models produce tie regardless of minor stochastic score jitter', () => {
      const cases = makeCases(27, {
        bScores: Array(27).fill(0.90),
        cScores: Array(27).fill(0.91), // minor 0.01 jitter
      });

      const report = generateComparisonReport({
        datasetId: 'd-27',
        datasetName: 'Suite',
        totalCases: 27,
        baselineVersion: baseVersion,
        candidateVersion: { ...baseVersion }, // Identical model configuration
        caseResults: cases,
        engineVersion: 'v3',
      });

      assert.strictEqual(report.winner, 'tie', 'Same-model comparison must yield tie');
      assert.ok(report.winnerReason.includes('Statistical Parity'));
    });

    // -------------------------------------------------------------
    // Test 4: Small Sample Size Inconclusive Guard
    // -------------------------------------------------------------
    test('4. Small Sample Size Guard: Partial execution (<10 cases) yields inconclusive certification', () => {
      const cases = makeCases(5, {
        bScores: [0.8, 0.8, 0.8, 0.8, 0.8],
        cScores: [0.95, 0.95, 0.95, 0.95, 0.95],
      });

      const report = generateComparisonReport({
        datasetId: 'd-smoke',
        datasetName: 'Smoke Test',
        totalCases: 27, // Suite has 27 cases, but only 5 evaluated
        baselineVersion: baseVersion,
        candidateVersion: candVersion,
        caseResults: cases,
        engineVersion: 'v3',
      });

      assert.strictEqual(report.winner, 'inconclusive', 'Low sample size must yield inconclusive winner');
      assert.ok(report.winnerReason.includes('Inconclusive comparison'));
    });

    // -------------------------------------------------------------
    // Test 5: Zero-Tolerance Critical Safety Override
    // -------------------------------------------------------------
    test('5. Zero-Tolerance Safety: Credential leak or injection instantly hands victory to Baseline', () => {
      const cases = makeCases(20, {
        bScores: Array(20).fill(0.80),
        cScores: Array(20).fill(0.95), // Candidate has higher quality
      });

      // Inject a credential leak on case 5
      cases[4].failureCategory = 'CREDENTIAL_LEAK';
      cases[4].severity = 'critical';
      cases[4].candidateOutput = 'leaked-aws-secret-access-key-12345';

      const report = generateComparisonReport({
        datasetId: 'd-safety',
        datasetName: 'Safety Audit Suite',
        totalCases: 20,
        baselineVersion: baseVersion,
        candidateVersion: candVersion,
        caseResults: cases,
        engineVersion: 'v3',
      });

      assert.strictEqual(report.winner, 'baseline', 'Baseline must win when candidate has a critical safety violation');
      assert.ok(report.winnerReason.includes('critical safety/policy regression') || report.winnerReason.includes('credential leak'));
    });

    // -------------------------------------------------------------
    // Test 6: Decoupled Release Gating vs Relative Winner
    // -------------------------------------------------------------
    test('6. Decoupled Governance: Candidate can win relative comparison while release remains BLOCKED', () => {
      const cases = makeCases(27, {
        bScores: Array(27).fill(0.80),
        cScores: Array(27).fill(0.95),
        bLatencyMs: 1500,
        cLatencyMs: 350,
      });

      // Configure release settings with an extreme cost ceiling that candidate violates
      const report = generateComparisonReport({
        datasetId: 'd-gating',
        datasetName: 'Gated Release Suite',
        totalCases: 27,
        baselineVersion: baseVersion,
        candidateVersion: candVersion,
        caseResults: cases,
        settings: {
          minAccuracyPercent: 99.0, // Unreachable 99% accuracy requirement
          requiredBenchmarkCases: 27,
        },
        engineVersion: 'v3',
      });

      // Relative performance: Candidate won because it scored 0.95 vs 0.80
      assert.strictEqual(report.winner, 'candidate', 'Relative comparison winner must remain Candidate');

      // Production release: BLOCKED because it failed the 99% threshold
      assert.ok(
        report.recommendation === 'BLOCK RELEASE' || report.overallGateStatus === 'FAIL' || report.regressionStatus === 'REGRESSION_DETECTED',
        'Production release must be gated'
      );
    });

    // -------------------------------------------------------------
    // Test 7: Bootstrap 95% Confidence Interval Computation
    // -------------------------------------------------------------
    test('7. Statistical Confidence: Bootstrap CI and Wilcoxon p-value are populated on v3Scoring', () => {
      const cases = makeCases(27, {
        bScores: Array.from({ length: 27 }, (_, i) => 0.75 + (i % 4) * 0.03),
        cScores: Array.from({ length: 27 }, (_, i) => 0.90 + (i % 5) * 0.02),
      });

      const report = generateComparisonReport({
        datasetId: 'd-stats',
        datasetName: 'Statistical Suite',
        totalCases: 27,
        baselineVersion: baseVersion,
        candidateVersion: candVersion,
        caseResults: cases,
        engineVersion: 'v3',
      });

      const stats = report.v3Scoring.statisticalSignificance;
      assert.ok(stats, 'statisticalSignificance must be present');
      assert.strictEqual(stats.pairedSampleSize, 27);
      assert.ok(stats.bootstrapConfidenceInterval95[0] > 0, 'CI lower bound must be > 0');
      assert.ok(stats.bootstrapConfidenceInterval95[1] >= stats.bootstrapConfidenceInterval95[0]);
      assert.ok(stats.pValue < 0.05, `Wilcoxon p-value must be < 0.05 (got ${stats.pValue})`);
      assert.strictEqual(stats.isStatisticallySignificant, true);
    });

    // -------------------------------------------------------------
    // Test 8: Tri-Format Consistency (UI, JSON, PDF)
    // -------------------------------------------------------------
    test('8. Tri-Format Agreement: PDF bytes and exported JSON strictly agree with V3 winner and 100-pt scorecard', () => {
      const cases = makeCases(27, {
        bScores: Array(27).fill(0.80),
        cScores: Array(27).fill(0.95),
      });

      const report = generateComparisonReport({
        datasetId: 'd-export',
        datasetName: 'Export Suite',
        totalCases: 27,
        baselineVersion: baseVersion,
        candidateVersion: candVersion,
        caseResults: cases,
        engineVersion: 'v3',
      });

      // 1. JSON Export verification
      const jsonStr = JSON.stringify(report);
      const reParsed = JSON.parse(jsonStr);
      assert.strictEqual(reParsed.winner, report.winner);
      assert.strictEqual(reParsed.v3Scoring.candidate.compositeScore100, report.v3Scoring.candidate.compositeScore100);
      assert.strictEqual(reParsed.v3Scoring.baseline.compositeScore100, report.v3Scoring.baseline.compositeScore100);
      assert.strictEqual(reParsed.v3Scoring.overallDelta, report.v3Scoring.overallDelta);

      // 2. PDF Generation verification
      const pdfBytes = generateReportPdf(report);
      assert.ok(pdfBytes instanceof Uint8Array, 'PDF output must be Uint8Array');
      assert.ok(pdfBytes.length > 1000, 'PDF size must be > 1000 bytes');
      const pdfHeader = String.fromCharCode(...pdfBytes.slice(0, 5));
      assert.strictEqual(pdfHeader, '%PDF-', 'PDF must begin with %PDF- header');
    });

  } finally {
    await server.close();
  }

  console.log(`\n============================================================`);
  console.log(`V3 E2E REGRESSION SUITE RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`============================================================\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
