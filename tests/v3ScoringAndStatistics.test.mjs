/* ============================================================
   RELIQ — V3 Scoring and Statistics Unit Tests
   ============================================================ */

import assert from 'node:assert';
import { createServer } from 'vite';

async function runTests() {
  console.log('\n============================================================');
  console.log('RELIQ V3 SCORING AND STATISTICAL ENGINE TESTS');
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
    const {
      computeBootstrapCI,
      computeWilcoxonSignedRank,
      computeEffectSizeCohenD,
      evaluateStatisticalSignificance,
      determineV3Winner,
    } = await server.ssrLoadModule('/src/evaluation/statisticalComparator.ts');

    const {
      normalizeWeights,
      calculateV3ModelScore,
      calculateV3ScoreComparison,
      DEFAULT_V3_WEIGHTS,
    } = await server.ssrLoadModule('/src/evaluation/v3ScoringEngine.ts');

    // Test 1: Weight Normalization
    test('1. Weight normalization guarantees exactly 100.0 total points', () => {
      const defaultWeights = normalizeWeights();
      const sumDefault = Object.values(defaultWeights).reduce((a, b) => a + b, 0);
      assert.strictEqual(Math.round(sumDefault), 100);

      // Custom weights that sum to 50 should be doubled
      const custom = normalizeWeights({
        reasoningQuality: 10,
        factualCorrectness: 10,
        instructionAdherence: 5,
        relevanceCompleteness: 5,
        safetyCompliance: 2.5,
        behavioralConsistency: 2.5,
        latency: 5,
        providerReliability: 4,
        costEfficiency: 3.5,
        tokenEfficiency: 2.5,
      });
      const sumCustom = Object.values(custom).reduce((a, b) => a + b, 0);
      assert.strictEqual(Math.round(sumCustom), 100);
      assert.strictEqual(custom.reasoningQuality, 20);
    });

    // Test 2: Bootstrap Confidence Interval
    test('2. Bootstrap CI captures true mean difference within 95% interval', () => {
      // Deltas with true mean = +5.0 and standard deviation = 2.0
      const deltas = [3, 4, 5, 6, 7, 4, 5, 6, 5, 5, 6, 4, 5, 7, 3, 5, 6, 4, 5, 6];
      const [lower, upper] = computeBootstrapCI(deltas, 1000, 0.05);
      assert.ok(lower > 3.5, `Lower bound ${lower} should be > 3.5`);
      assert.ok(upper < 6.5, `Upper bound ${upper} should be < 6.5`);
      assert.ok(lower < upper, `Lower ${lower} must be less than upper ${upper}`);
    });

    // Test 3: Wilcoxon Signed-Rank Test
    test('3. Wilcoxon signed-rank test differentiates significance from parity', () => {
      // Significant positive differences
      const posDeltas = [2.0, 3.5, 1.8, 4.0, 2.5, 3.0, 1.5, 2.2, 3.1, 2.8, 1.9, 2.4, 3.3, 2.7, 3.0];
      const pSignificant = computeWilcoxonSignedRank(posDeltas);
      assert.ok(pSignificant < 0.01, `Expected p < 0.01, got ${pSignificant}`);

      // Symmetric differences centered at zero (pure parity)
      const zeroDeltas = [-2, 2, -1, 1, -3, 3, -0.5, 0.5, -1.5, 1.5, -2.5, 2.5, 0, 0, 0];
      const pParity = computeWilcoxonSignedRank(zeroDeltas);
      assert.ok(pParity > 0.80, `Expected p > 0.80 for symmetric differences, got ${pParity}`);
    });

    // Test 4: Single Model Scoring & Dimension Bounds
    test('4. V3 model score calculates within [0, 100] with all sub-dimensions bounded', () => {
      const mockCases = Array.from({ length: 20 }, (_, i) => ({
        testCaseId: `tc-${i}`,
        baselineQualityEvaluated: true,
        candidateQualityEvaluated: true,
        candidateScore: 0.95,
        baselineScore: 0.80,
        passed: true,
        baselineExecutionStatus: 'PASS',
        candidateExecutionStatus: 'PASS',
        candidateOutput: 'Valid detailed response with clear reasoning.',
        baselineOutput: 'Basic short response.',
      }));

      const modelData = {
        modelRole: 'candidate',
        modelIdentifier: 'gpt-oss-120b',
        provider: 'groq',
        caseResults: mockCases,
        totalCasesCount: 20,
        evaluatedCasesCount: 20,
        coveragePercent: 100.0,
        meanLatencyMs: 400,
        medianLatencyMs: 350,
        p95LatencyMs: 650,
        totalCostUsd: 0.002,
        totalTokens: 2500,
        rateLimitFailuresCount: 0,
        infrastructureFailuresCount: 0,
        criticalSafetyFailuresCount: 0,
      };

      const score = calculateV3ModelScore(modelData, DEFAULT_V3_WEIGHTS);
      assert.ok(score.compositeScore100 >= 0 && score.compositeScore100 <= 100);
      assert.ok(score.quality.totalQualityScore >= 0 && score.quality.totalQualityScore <= 70);
      assert.ok(score.operational.totalOperationalScore >= 0 && score.operational.totalOperationalScore <= 30);
      assert.ok(score.compositeScore100 > 85, `High-performing model should score > 85, got ${score.compositeScore100}`);
    });

    // Test 5: Hard Safety Veto
    test('5. Hard safety failure reduces safety dimension to 0.0 points', () => {
      const mockCases = [
        {
          testCaseId: 'tc-leak',
          candidateQualityEvaluated: true,
          candidateScore: 0.9,
          failureCategory: 'CREDENTIAL_LEAK',
          candidateOutput: 'sk-proj-1234567890abcdef',
        },
      ];

      const modelData = {
        modelRole: 'candidate',
        modelIdentifier: 'leaky-model',
        provider: 'groq',
        caseResults: mockCases,
        totalCasesCount: 1,
        evaluatedCasesCount: 1,
        coveragePercent: 100.0,
        meanLatencyMs: 300,
        medianLatencyMs: 300,
        p95LatencyMs: 300,
        totalCostUsd: 0.001,
        totalTokens: 100,
        rateLimitFailuresCount: 0,
        infrastructureFailuresCount: 0,
        criticalSafetyFailuresCount: 1,
      };

      const score = calculateV3ModelScore(modelData, DEFAULT_V3_WEIGHTS);
      assert.strictEqual(score.quality.safetyCompliance, 0.0, 'Safety score must be 0 on critical safety failure');
    });

    // Test 6: Non-Disqualifying Test Failure (The Core V3 Objective!)
    test('6. Model can fail 1 test case out of 27 and still win if overall performance is superior', () => {
      // 27 test cases:
      // Candidate passes 26/27 (fails case 0), but achieves 98% quality on all others + 400ms latency + lower cost
      // Baseline passes 27/27, but achieves only 65% quality on all cases + 2,500ms latency
      const cases = Array.from({ length: 27 }, (_, i) => ({
        testCaseId: `tc-${i}`,
        baselineQualityEvaluated: true,
        candidateQualityEvaluated: true,
        baselineScore: 0.65,
        candidateScore: i === 0 ? 0.0 : 0.98, // Candidate fails 1 case
        passed: i !== 0,
        baselineExecutionStatus: 'PASS',
        candidateExecutionStatus: i === 0 ? 'QUALITY_FAILURE' : 'PASS',
        candidateOutput: i === 0 ? 'Incorrect' : 'Superb high-quality response with complete logical reasoning.',
        baselineOutput: 'Passable but mediocre answer.',
      }));

      const baselineData = {
        modelRole: 'baseline',
        modelIdentifier: 'slow-mediocre-model',
        provider: 'groq',
        caseResults: cases,
        totalCasesCount: 27,
        evaluatedCasesCount: 27,
        coveragePercent: 100.0,
        meanLatencyMs: 2500,
        medianLatencyMs: 2400,
        p95LatencyMs: 3800,
        totalCostUsd: 0.015,
        totalTokens: 6000,
        rateLimitFailuresCount: 0,
        infrastructureFailuresCount: 0,
        criticalSafetyFailuresCount: 0,
      };

      const candidateData = {
        modelRole: 'candidate',
        modelIdentifier: 'fast-superior-model',
        provider: 'groq',
        caseResults: cases,
        totalCasesCount: 27,
        evaluatedCasesCount: 27,
        coveragePercent: 100.0,
        meanLatencyMs: 400,
        medianLatencyMs: 380,
        p95LatencyMs: 550,
        totalCostUsd: 0.003,
        totalTokens: 3500,
        rateLimitFailuresCount: 0,
        infrastructureFailuresCount: 0,
        criticalSafetyFailuresCount: 0,
      };

      const comparison = calculateV3ScoreComparison({
        baselineData,
        candidateData,
        caseResults: cases,
      });

      // In V2, candidate would LOSE or TIE because pass rate was 96.3% vs 100%.
      // In V3, candidate WINS because overall score is decisively superior!
      assert.strictEqual(
        comparison.winner,
        'candidate',
        `Candidate must WIN overall despite 1 failed case (got winner: ${comparison.winner}, candScore: ${comparison.candidate.compositeScore100}, baseScore: ${comparison.baseline.compositeScore100})`
      );
      assert.ok(
        comparison.overallDelta > 15.0,
        `Candidate overall delta should be > +15 pts, got ${comparison.overallDelta}`
      );
    });

    // Test 7: Role-Swap Mathematical Invertibility
    test('7. Role-swap mathematically reverses the winner and delta sign', () => {
      const cases = Array.from({ length: 20 }, (_, i) => ({
        testCaseId: `tc-${i}`,
        baselineQualityEvaluated: true,
        candidateQualityEvaluated: true,
        baselineScore: 0.70,
        candidateScore: 0.90,
        passed: true,
        baselineExecutionStatus: 'PASS',
        candidateExecutionStatus: 'PASS',
        candidateOutput: 'Candidate high-quality response.',
        baselineOutput: 'Baseline standard response.',
      }));

      const modelA = {
        modelRole: 'baseline',
        modelIdentifier: 'model-a',
        provider: 'groq',
        caseResults: cases,
        totalCasesCount: 20,
        evaluatedCasesCount: 20,
        coveragePercent: 100.0,
        meanLatencyMs: 1500,
        medianLatencyMs: 1400,
        p95LatencyMs: 2200,
        totalCostUsd: 0.010,
        totalTokens: 4000,
        rateLimitFailuresCount: 0,
        infrastructureFailuresCount: 0,
        criticalSafetyFailuresCount: 0,
      };

      const modelB = {
        modelRole: 'candidate',
        modelIdentifier: 'model-b',
        provider: 'groq',
        caseResults: cases,
        totalCasesCount: 20,
        evaluatedCasesCount: 20,
        coveragePercent: 100.0,
        meanLatencyMs: 500,
        medianLatencyMs: 450,
        p95LatencyMs: 700,
        totalCostUsd: 0.004,
        totalTokens: 3000,
        rateLimitFailuresCount: 0,
        infrastructureFailuresCount: 0,
        criticalSafetyFailuresCount: 0,
      };

      // Comparison 1: Model A as Baseline, Model B as Candidate
      const comp1 = calculateV3ScoreComparison({
        baselineData: modelA,
        candidateData: modelB,
        caseResults: cases,
      });

      // Comparison 2: Model B as Baseline, Model A as Candidate
      const swappedCases = cases.map((c) => ({
        ...c,
        baselineScore: c.candidateScore,
        candidateScore: c.baselineScore,
        baselineOutput: c.candidateOutput,
        candidateOutput: c.baselineOutput,
      }));

      const comp2 = calculateV3ScoreComparison({
        baselineData: { ...modelB, modelRole: 'baseline', caseResults: swappedCases },
        candidateData: { ...modelA, modelRole: 'candidate', caseResults: swappedCases },
        caseResults: swappedCases,
      });

      assert.strictEqual(comp1.winner, 'candidate', 'Model B must win as candidate');
      assert.strictEqual(comp2.winner, 'baseline', 'Model B must win as baseline (so candidate loses)');
      assert.ok(
        Math.abs(comp1.overallDelta + comp2.overallDelta) < 1.0,
        `Deltas must be approximately symmetric: comp1=${comp1.overallDelta}, comp2=${comp2.overallDelta}`
      );
    });

    // Test 8: Insufficient Coverage / Low Sample Size Guard
    test('8. Insufficient coverage (<80%) or low sample size (<10) results in inconclusive winner', () => {
      const smallCases = Array.from({ length: 5 }, (_, i) => ({
        testCaseId: `tc-${i}`,
        baselineQualityEvaluated: true,
        candidateQualityEvaluated: true,
        baselineScore: 0.70,
        candidateScore: 0.95,
        passed: true,
        baselineExecutionStatus: 'PASS',
        candidateExecutionStatus: 'PASS',
        candidateOutput: 'Candidate response',
        baselineOutput: 'Baseline response',
      }));

      const smallData = {
        modelRole: 'candidate',
        modelIdentifier: 'model-small',
        provider: 'groq',
        caseResults: smallCases,
        totalCasesCount: 5,
        evaluatedCasesCount: 5,
        coveragePercent: 100.0,
        meanLatencyMs: 500,
        medianLatencyMs: 500,
        p95LatencyMs: 500,
        totalCostUsd: 0.001,
        totalTokens: 500,
        rateLimitFailuresCount: 0,
        infrastructureFailuresCount: 0,
        criticalSafetyFailuresCount: 0,
      };

      const comp = calculateV3ScoreComparison({
        baselineData: { ...smallData, modelRole: 'baseline' },
        candidateData: smallData,
        caseResults: smallCases,
      });

      assert.strictEqual(
        comp.winner,
        'inconclusive',
        `Sample size N=5 must produce 'inconclusive' winner, got: ${comp.winner}`
      );
      assert.ok(comp.winnerReason.toLowerCase().includes('inconclusive'));
    });

  } finally {
    await server.close();
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
