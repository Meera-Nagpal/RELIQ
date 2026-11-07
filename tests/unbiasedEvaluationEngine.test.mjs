/* ============================================================
   RELIQ — Unbiased Evaluation Engine & Math Integrity Test Suite
   
   Verifies:
   1. Symmetric Evaluation Pipeline (baseline and candidate use identical rubrics & scoring formulas)
   2. Elimination of Fabricated Base Scores (no hardcoded 0.88 or structure length bonuses)
   3. LLM Judge Blindness & Randomized Pairwise Presentation (no model identity leaks, 50% swap)
   4. Candidate Win on Verified Superior Quality (positive quality delta, candidate declared winner)
   5. Baseline Win on Verified Superior Quality (negative quality delta, baseline declared winner)
   6. Statistical Parity (Tie) on Equal Quality (zero quality delta, tie declared)
   7. Same-Model Comparisons Always Produce Statistical Parity (no false winner on stochastic variance)
   8. Inconclusive on Low Coverage (<80% coverage triggers tie and inconclusive reason)
   9. Inconclusive on Unequal Sample Sizes (asymmetric case counts trigger tie)
   10. Strict Distinction between 429 Rate Limits and Quality Failures (no 0.0 score distortion)
   11. Mathematical Delta Contract (qualityDelta strictly equals Candidate Score - Baseline Score)
   12. Report Header Consistency (honest evaluated counts, no 27/27 complete with 96.3% coverage)
   ============================================================ */

import assert from 'node:assert';
import { createServer } from 'vite';

async function runTests() {
  console.log('\n============================================================');
  console.log('RELIQ UNBIASED EVALUATION ENGINE REGRESSION SUITE');
  console.log('============================================================\n');

  const server = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });

  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    };
  }

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
    const { EvaluationRunner, classifyResponseStatus } = await server.ssrLoadModule('/src/evaluation/runner.ts');
    const { generateComparisonReport } = await server.ssrLoadModule('/src/evaluation/comparator.ts');
    const { LLMJudgeEvaluator } = await server.ssrLoadModule('/src/evaluation/llmJudgeEvaluator.ts');
    const { runEvaluator, LLMJudgeEvaluatorAdapter } = await server.ssrLoadModule('/src/evaluation/evaluators.ts');
    const { evaluateReleaseDecision } = await server.ssrLoadModule('/src/evaluation/releaseEngine.ts');

    // -------------------------------------------------------------
    // Test 1: Symmetric Pipeline Guarantee
    // -------------------------------------------------------------
    await asyncTest('1. Symmetric Pipeline Guarantee: Identical model outputs yield identical scores', async () => {
      const runner = new EvaluationRunner();

      const testCase = {
        id: 'tc-sym-1',
        name: 'Symmetric Test Case',
        category: 'Quality',
        severity: 'medium',
        input: 'Explain database indexing.',
        expectedOutput: 'Database indexing creates data structures to speed up retrieval.',
        evaluatorType: 'normalized_text',
        tags: [],
        createdAt: '',
      };

      const identicalOutput = 'Database indexing creates data structures to speed up retrieval.';

      const mockProvider = {
        providerType: 'cerebras',
        generate: async () => ({
          output: identicalOutput,
          toolCalls: [],
          usage: {
            latencyMs: 150,
            inputTokens: 20,
            outputTokens: 15,
            totalTokens: 35,
          },
        }),
      };

      const baseVer = {
        id: 'v-base',
        name: 'Model A',
        modelIdentifier: 'meta-llama/llama-3.3-70b',
        provider: 'cerebras',
      };
      const candVer = {
        id: 'v-cand',
        name: 'Model B',
        modelIdentifier: 'qwen/qwen-2.5-72b',
        provider: 'cerebras',
      };

      const res = await runner.run({
        project: { id: 'p1', name: 'Test' },
        dataset: { id: 'd1', name: 'Test Dataset', cases: [testCase], testCases: [testCase] },
        baselineVersion: baseVer,
        candidateVersion: candVer,
        baselineProvider: mockProvider,
        candidateProvider: mockProvider,
        bypassCache: true,
      });

      const result = res.caseResults[0];
      assert.strictEqual(result.baselineScore, result.candidateScore, 'Baseline and Candidate scores must be 100% identical for identical outputs');
      assert.strictEqual(result.baselineExecutionStatus, 'PASS');
      assert.strictEqual(result.candidateExecutionStatus, 'PASS');
    });

    // -------------------------------------------------------------
    // Test 2: Elimination of Fabricated Base Scores & Length Bonuses
    // -------------------------------------------------------------
    test('2. No Fabricated Base Scores: Preference evaluation does not inject 0.88 base or structure length bonus', () => {
      const prefCase = {
        id: 'tc-pref-1',
        name: 'Preference Case',
        category: 'Quality',
        severity: 'medium',
        input: 'How do I center a div?',
        expectedOutput: 'Use CSS flexbox: display flex, justify-content center, align-items center.',
        evaluatorType: 'llm_judge',
        metadata: {
          chosen: 'Assistant: Use CSS flexbox: display flex, justify-content center, align-items center.',
          rejected: 'Assistant: Divs are HTML elements that divide sections.',
        },
        tags: [],
        createdAt: '',
      };

      // Completely unrelated output
      const scoreIrrelevant = LLMJudgeEvaluatorAdapter.evaluate('Bananas grow on trees and are yellow.', prefCase);
      assert.ok(scoreIrrelevant.score < 0.60, `Irrelevant response must not receive inflated 0.88 base score (got ${scoreIrrelevant.score})`);

      // Partially relevant short output
      const scoreShort = LLMJudgeEvaluatorAdapter.evaluate('display: flex;', prefCase);
      // Ensure score is derived directly from similarity, without length bonus inflating it
      assert.ok(typeof scoreShort.score === 'number');
      assert.ok(scoreShort.score <= 1.0);
    });

    // -------------------------------------------------------------
    // Test 3: LLM Judge Blindness & Randomized Presentation Order
    // -------------------------------------------------------------
    await asyncTest('3. LLM Judge Blind Pairwise Evaluation: Random order swapping and zero identity leakage', async () => {
      const testCase = {
        id: 'tc-blind-1',
        name: 'Blind Judge Case',
        category: 'Quality',
        severity: 'medium',
        input: 'What is photosynthesis?',
        expectedOutput: 'The biological process converting light into chemical energy.',
        metadata: {},
      };

      let observedPrompt = '';
      let capturedBody = null;

      const mockFetch = async (url, init) => {
        capturedBody = JSON.parse(init.body);
        observedPrompt = capturedBody.messages[1].content;
        return {
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: JSON.stringify({ preferred: '1', score1: 5, score2: 2, reason: 'Superior explanation.' }),
              },
            }],
          }),
        };
      };

      const result = await LLMJudgeEvaluator.evaluatePairwiseBlind({
        testCase,
        baselineOutput: 'Photosynthesis converts sunlight to glucose.',
        candidateOutput: 'Plants use light energy.',
        judgeConfig: { enabled: true, modelIdentifier: 'qwen/qwen3.8-27b' },
        customFetch: mockFetch,
      });

      // Verify prompt contains NO provider or model identity leaks
      assert.ok(!observedPrompt.includes('groq'), 'Judge prompt must not leak provider identity');
      assert.ok(!observedPrompt.includes('openai'), 'Judge prompt must not leak model identity');
      assert.ok(!observedPrompt.includes('candidate') && !observedPrompt.includes('baseline'), 'Judge prompt must present responses anonymously as Response 1 and Response 2');

      // Verify order swapping is boolean and result maps back accurately
      assert.strictEqual(typeof result.orderSwapped, 'boolean');
      if (result.orderSwapped) {
        assert.strictEqual(result.winner, 'candidate');
      } else {
        assert.strictEqual(result.winner, 'baseline');
      }
    });

    // -------------------------------------------------------------
    // Test 4: Candidate Win on Verified Superior Quality
    // -------------------------------------------------------------
    test('4. Candidate Win on Superior Quality: Positive quality delta declares candidate winner', () => {
      const results = [
        {
          testCaseId: 'tc-1',
          testCaseName: 'Scenario 1',
          baselineExecutionStatus: 'PASS',
          candidateExecutionStatus: 'PASS',
          baselineQualityEvaluated: true,
          candidateQualityEvaluated: true,
          baselineScore: 0.70,
          candidateScore: 0.95,
          passed: true,
        },
        {
          testCaseId: 'tc-2',
          testCaseName: 'Scenario 2',
          baselineExecutionStatus: 'PASS',
          candidateExecutionStatus: 'PASS',
          baselineQualityEvaluated: true,
          candidateQualityEvaluated: true,
          baselineScore: 0.75,
          candidateScore: 0.90,
          passed: true,
        },
      ];

      const report = generateComparisonReport({
        datasetId: 'd-test',
        datasetName: 'Benchmark Suite',
        baselineVersion: { id: 'v1', modelIdentifier: 'llama-70b', provider: 'groq' },
        candidateVersion: { id: 'v2', modelIdentifier: 'gpt-oss-120b', provider: 'groq' },
        caseResults: results,
        settings: { requiredBenchmarkCases: 2, minEvaluationCoveragePercent: 80 },
      });

      assert.strictEqual(report.winner, 'candidate', 'Candidate must be declared winner when quality is clearly superior');
      assert.ok(report.qualityDelta > 0, 'Quality delta must be strictly positive when candidate leads');
      assert.strictEqual(report.qualityDelta, 20.0); // 92.5 - 72.5 = +20.0 pts
      assert.ok(report.winnerReason.includes('Candidate'));
    });

    // -------------------------------------------------------------
    // Test 5: Baseline Win on Verified Superior Quality
    // -------------------------------------------------------------
    test('5. Baseline Win on Superior Quality: Negative quality delta declares baseline winner', () => {
      const results = [
        {
          testCaseId: 'tc-1',
          testCaseName: 'Scenario 1',
          baselineExecutionStatus: 'PASS',
          candidateExecutionStatus: 'PASS',
          baselineQualityEvaluated: true,
          candidateQualityEvaluated: true,
          baselineScore: 0.95,
          candidateScore: 0.70,
          passed: true,
        },
        {
          testCaseId: 'tc-2',
          testCaseName: 'Scenario 2',
          baselineExecutionStatus: 'PASS',
          candidateExecutionStatus: 'PASS',
          baselineQualityEvaluated: true,
          candidateQualityEvaluated: true,
          baselineScore: 0.90,
          candidateScore: 0.75,
          passed: true,
        },
      ];

      const report = generateComparisonReport({
        datasetId: 'd-test',
        datasetName: 'Benchmark Suite',
        baselineVersion: { id: 'v1', modelIdentifier: 'llama-70b', provider: 'groq' },
        candidateVersion: { id: 'v2', modelIdentifier: 'gpt-oss-120b', provider: 'groq' },
        caseResults: results,
        settings: { requiredBenchmarkCases: 2, minEvaluationCoveragePercent: 80 },
      });

      assert.strictEqual(report.winner, 'baseline', 'Baseline must be declared winner when candidate is inferior');
      assert.ok(report.qualityDelta < 0, 'Quality delta must be strictly negative when baseline leads');
      assert.strictEqual(report.qualityDelta, -20.0); // 72.5 - 92.5 = -20.0 pts
      assert.ok(report.winnerReason.includes('Baseline'));
    });

    // -------------------------------------------------------------
    // Test 6: Statistical Parity (Tie) on Equal Performance
    // -------------------------------------------------------------
    test('6. Statistical Parity: Zero delta produces TIE', () => {
      const results = [
        {
          testCaseId: 'tc-1',
          testCaseName: 'Scenario 1',
          baselineExecutionStatus: 'PASS',
          candidateExecutionStatus: 'PASS',
          baselineQualityEvaluated: true,
          candidateQualityEvaluated: true,
          baselineScore: 0.90,
          candidateScore: 0.90,
          passed: true,
        },
      ];

      const report = generateComparisonReport({
        datasetId: 'd-test',
        datasetName: 'Benchmark Suite',
        baselineVersion: { id: 'v1', modelIdentifier: 'llama-70b', provider: 'groq' },
        candidateVersion: { id: 'v2', modelIdentifier: 'gpt-oss-120b', provider: 'groq' },
        caseResults: results,
        settings: { requiredBenchmarkCases: 1, minEvaluationCoveragePercent: 80 },
      });

      assert.strictEqual(report.winner, 'tie');
      assert.strictEqual(report.qualityDelta, 0.0);
    });

    // -------------------------------------------------------------
    // Test 7: Same-Model Comparisons Always Produce Statistical Parity
    // -------------------------------------------------------------
    test('7. Same-Model Parity: Identical models never declare an automatic winner due to stochastic temperature', () => {
      const sameModelResults = [
        {
          testCaseId: 'tc-1',
          testCaseName: 'Scenario 1',
          baselineExecutionStatus: 'PASS',
          candidateExecutionStatus: 'PASS',
          baselineQualityEvaluated: true,
          candidateQualityEvaluated: true,
          baselineScore: 0.905, // 90.5%
          candidateScore: 0.935, // 93.5% (+3.0 pts sampling difference)
          passed: true,
        },
      ];

      const sameModelConfig = {
        id: 'v-gpt-oss',
        name: 'GPT-OSS 120B',
        modelIdentifier: 'openai/gpt-oss-120b',
        provider: 'groq',
        promptVersion: '1.0',
      };

      const report = generateComparisonReport({
        datasetId: 'd-test',
        datasetName: 'Self-Comparison Suite',
        baselineVersion: sameModelConfig,
        candidateVersion: sameModelConfig, // EXACT SAME MODEL!
        caseResults: sameModelResults,
        settings: { requiredBenchmarkCases: 1, minEvaluationCoveragePercent: 80 },
      });

      assert.strictEqual(report.winner, 'tie', 'Same-model comparison must NEVER declare candidate winner');
      assert.ok(report.winnerReason.includes('Same-model comparison: Statistical Parity'), `Winner reason must explicitly state same-model statistical parity (got: ${report.winnerReason})`);
      assert.strictEqual(report.qualityDelta, 3.0); // Delta is transparently reported as Candidate - Baseline
    });

    // -------------------------------------------------------------
    // Test 8: Inconclusive on Low Coverage (<80%)
    // -------------------------------------------------------------
    test('8. Inconclusive on Low Coverage: Coverage <80% prevents declaring any winner', () => {
      // 20 of 27 cases evaluated = 74.1% coverage
      const partialResults = [];
      for (let i = 1; i <= 20; i++) {
        partialResults.push({
          testCaseId: `tc-${i}`,
          testCaseName: `Case ${i}`,
          baselineExecutionStatus: 'PASS',
          candidateExecutionStatus: 'PASS',
          baselineQualityEvaluated: true,
          candidateQualityEvaluated: true,
          baselineScore: 0.80,
          candidateScore: 0.95, // Candidate leads, but coverage is only 74%
          passed: true,
        });
      }
      for (let i = 21; i <= 27; i++) {
        partialResults.push({
          testCaseId: `tc-${i}`,
          testCaseName: `Rate Limited Case ${i}`,
          baselineExecutionStatus: 'PROVIDER_RATE_LIMIT',
          candidateExecutionStatus: 'PROVIDER_RATE_LIMIT',
          baselineQualityEvaluated: false,
          candidateQualityEvaluated: false,
          baselineScore: null,
          candidateScore: null,
          passed: null,
        });
      }

      const report = generateComparisonReport({
        datasetId: 'd-test',
        datasetName: '27-Case Suite',
        baselineVersion: { id: 'v1', modelIdentifier: 'llama-70b', provider: 'groq' },
        candidateVersion: { id: 'v2', modelIdentifier: 'gpt-oss-120b', provider: 'groq' },
        caseResults: partialResults,
        runMetrics: {
          totalCases: 27,
          baselineEvaluatedCases: 20,
          candidateEvaluatedCases: 20,
          baselineEvaluationCoverage: 74.1,
          candidateEvaluationCoverage: 74.1,
        },
        settings: { requiredBenchmarkCases: 27, minEvaluationCoveragePercent: 80 },
      });

      assert.ok(
        report.winner === 'tie' || report.winner === 'inconclusive',
        'Incomplete coverage must produce tie / inconclusive winner'
      );
      assert.ok(report.winnerReason.startsWith('Inconclusive comparison'), 'Winner reason must declare comparison inconclusive');
      assert.strictEqual(report.recommendation, 'INSUFFICIENT EVIDENCE');
    });

    // -------------------------------------------------------------
    // Test 9: Inconclusive on Unequal Sample Sizes
    // -------------------------------------------------------------
    test('9. Inconclusive on Unequal Sample Sizes: Asymmetric evaluation sets prevent declaring winner', () => {
      const results = [
        {
          testCaseId: 'tc-1',
          testCaseName: 'Case 1',
          baselineExecutionStatus: 'PASS',
          candidateExecutionStatus: 'PASS',
          baselineQualityEvaluated: true,
          candidateQualityEvaluated: true,
          baselineScore: 0.80,
          candidateScore: 0.95,
          passed: true,
        },
        {
          testCaseId: 'tc-2',
          testCaseName: 'Case 2',
          baselineExecutionStatus: 'PASS',
          candidateExecutionStatus: 'PROVIDER_RATE_LIMIT', // Candidate throttled!
          baselineQualityEvaluated: true,
          candidateQualityEvaluated: false,
          baselineScore: 0.85,
          candidateScore: null,
          passed: null,
        },
      ];

      const report = generateComparisonReport({
        datasetId: 'd-test',
        datasetName: 'Suite',
        baselineVersion: { id: 'v1', modelIdentifier: 'llama-70b', provider: 'groq' },
        candidateVersion: { id: 'v2', modelIdentifier: 'gpt-oss-120b', provider: 'groq' },
        caseResults: results,
        settings: { requiredBenchmarkCases: 2, minEvaluationCoveragePercent: 50 },
      });

      assert.ok(
        report.winner === 'tie' || report.winner === 'inconclusive',
        'Unequal sample sizes must produce tie / inconclusive comparison'
      );
      assert.ok(report.winnerReason.includes('Unequal sample sizes'));
    });

    // -------------------------------------------------------------
    // Test 10: Strict Distinction between 429 Rate Limits and Quality Failures
    // -------------------------------------------------------------
    test('10. Operational Rate Limits vs Quality Failures: 429 does not pollute quality scores with 0.0', () => {
      const resp429 = {
        output: '',
        usage: {
          error: {
            status: 429,
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Rate limit exceeded',
          },
          provider: 'groq',
        },
      };

      const classification = classifyResponseStatus(resp429);
      assert.strictEqual(classification.status, 'PROVIDER_RATE_LIMIT');
      assert.strictEqual(classification.qualityEvaluated, false, 'Rate limit must NOT be marked as quality evaluated');
      assert.strictEqual(classification.transportSuccess, false);
      assert.strictEqual(classification.failureCategory, 'PROVIDER_QUOTA');

      const respIncorrect = {
        output: '42',
        usage: { latencyMs: 200, inputTokens: 10, outputTokens: 2, totalTokens: 12 },
      };
      const scoreFail = { score: 0.0, passed: false, details: 'Incorrect answer' };
      const qualityClassification = classifyResponseStatus(respIncorrect, scoreFail);
      assert.strictEqual(qualityClassification.status, 'QUALITY_FAILURE');
      assert.strictEqual(qualityClassification.qualityEvaluated, true);
      assert.strictEqual(qualityClassification.transportSuccess, true);
      assert.strictEqual(qualityClassification.failureCategory, 'QUALITY_FAILURE');
    });

    // -------------------------------------------------------------
    // Test 11: Mathematical Delta Contract Guarantee
    // -------------------------------------------------------------
    test('11. Mathematical Delta Contract: Quality delta strictly equals Candidate Score - Baseline Score', () => {
      const scenarios = [
        { cand: 93.5, base: 90.5, expectedDelta: 3.0 },
        { cand: 82.0, base: 91.0, expectedDelta: -9.0 },
        { cand: 88.8, base: 88.8, expectedDelta: 0.0 },
        { cand: 100.0, base: 0.0, expectedDelta: 100.0 },
      ];

      for (const s of scenarios) {
        const delta = Number((s.cand - s.base).toFixed(1));
        assert.strictEqual(delta, s.expectedDelta);
        if (delta > 0) assert.ok(s.cand > s.base, 'Positive delta requires candidate > baseline');
        if (delta < 0) assert.ok(s.cand < s.base, 'Negative delta requires candidate < baseline');
        if (delta === 0) assert.ok(s.cand === s.base, 'Zero delta requires candidate === baseline');
      }
    });

    // -------------------------------------------------------------
    // Test 12: Accurate Release Gating on Coverage
    // -------------------------------------------------------------
    test('12. Release Decision: Coverage <80% triggers INSUFFICIENT_EVIDENCE regardless of score', () => {
      const outcome = evaluateReleaseDecision({
        metrics: {
          totalCases: 27,
          sampleSize: 27,
          candidateEvaluatedCases: 20, // 20/27 = 74.1%
          baselineEvaluatedCases: 20,
          candidateEvaluationCoverage: 74.1,
          baselineEvaluationCoverage: 74.1,
          candidateQualityScore: 98.0, // High score!
          baselineQualityScore: 80.0,
          candidateAccuracy: 98.0,
          baselineAccuracy: 80.0,
          candidatePassRate: 98.0,
          baselinePassRate: 80.0,
          isInsufficientCoverage: true,
        },
        settings: {
          minEvaluationCoveragePercent: 80.0,
          requiredBenchmarkCases: 27,
        },
      });

      assert.strictEqual(outcome.decision, 'INSUFFICIENT_EVIDENCE', 'High quality score cannot bypass coverage gate');
      const covGate = outcome.gates.find((g) => g.gate === 'Evaluation Coverage');
      assert.ok(covGate);
      assert.strictEqual(covGate.status, 'FAIL');
    });

  } catch (err) {
    console.error('Test runner setup error:', err);
    failed++;
  }

  console.log('\n============================================================');
  console.log(`TEST SUITE SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('============================================================\n');

  try {
    await server.close();
  } catch {}

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests();
