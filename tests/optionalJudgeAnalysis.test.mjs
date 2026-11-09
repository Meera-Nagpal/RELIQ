/* ============================================================
   RELIQ — Optional LLM Judge Analysis Regression Test Suite
   
   Verifies:
   1. Default benchmark mode makes ZERO judge API calls.
   2. Enabling optional judge uses the selected registered model.
   3. Disabling judge does not affect official benchmark scoring.
   4. Judge HTTP 500 failure does not fail official benchmark execution.
   5. Judge results cannot overwrite the official winner.
   6. Registered judge models and historical results remain fully compatible.
   ============================================================ */

import assert from 'node:assert';
import { createServer } from 'vite';

async function runTests() {
  console.log('\n============================================================');
  console.log('RELIQ OPTIONAL LLM JUDGE ANALYSIS REGRESSION SUITE');
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

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${err.stack || err.message}`);
      failed++;
    }
  }

  try {
    const { EvaluationRunner } = await server.ssrLoadModule('/src/evaluation/runner.ts');
    const { getEligibleJudgeModels, validateJudgeConfiguration } = await server.ssrLoadModule('/src/evaluation/judgeRegistry.ts');
    const { calculateV3ModelScore, DEFAULT_V3_WEIGHTS } = await server.ssrLoadModule('/src/evaluation/v3ScoringEngine.ts');
    const { generateComparisonReport } = await server.ssrLoadModule('/src/evaluation/comparator.ts');

    const sampleDataset = {
      id: 'ds-test-optional',
      name: 'Optional Judge Verification Suite',
      cases: [
        {
          id: 'tc-det-1',
          name: 'Exact Match Extraction',
          category: 'Data Extraction',
          input: 'Extract user email from header',
          expectedOutput: 'user@example.com',
          evaluatorType: 'exact_match',
          severity: 'high',
          createdAt: '2026-01-01',
        },
        {
          id: 'tc-qual-1',
          name: 'Open-ended Reasoning',
          category: 'Reasoning',
          input: 'Explain why database indexing improves query latency.',
          expectedOutput: 'B-tree index lookups provide O(log n) access time reducing table scans.',
          evaluatorType: 'normalized_text',
          severity: 'medium',
          createdAt: '2026-01-01',
        },
      ],
    };

    const baselineVersion = {
      id: 'v_base',
      name: 'Baseline Model',
      provider: 'groq',
      modelIdentifier: 'qwen/qwen3.8-27b',
      promptVersion: '1.0',
      systemPrompt: '',
      temperature: 0.1,
      createdAt: '',
    };

    const candidateVersion = {
      id: 'v_cand',
      name: 'Candidate Model',
      provider: 'groq',
      modelIdentifier: 'openai/gpt-oss-120b',
      promptVersion: '1.0',
      systemPrompt: '',
      temperature: 0.1,
      createdAt: '',
    };

    // -------------------------------------------------------------
    // Test 1: Default benchmark makes ZERO judge API calls
    // -------------------------------------------------------------
    await test('1. Default benchmark mode makes ZERO judge API calls and sets NOT_CONFIGURED', async () => {
      let judgeApiCalls = 0;
      const customFetch = async () => {
        judgeApiCalls++;
        throw new Error('Judge API should not be called in default benchmark mode');
      };

      const mockProvider = {
        providerType: 'mock',
        generate: async (req) => ({
          output: (req.input || '').includes('email')
            ? 'user@example.com'
            : 'B-tree index lookups provide O(log n) access time reducing full table scans.',
          usage: { inputTokens: 40, outputTokens: 25, totalTokens: 65, latencyMs: 250 },
          isDemoMode: false,
        }),
      };

      const runner = new EvaluationRunner();
      // Notice judgeConfig is omitted / undefined by default
      const run = await runner.run({
        dataset: sampleDataset,
        baselineVersion,
        candidateVersion,
        baselineProvider: mockProvider,
        candidateProvider: mockProvider,
        customFetch,
        bypassCache: true,
      });

      assert.strictEqual(judgeApiCalls, 0, 'Must make exactly 0 judge API calls when judge is not enabled');
      assert.strictEqual(run.metrics.llmJudgeStatus, 'NOT_CONFIGURED', 'llmJudgeStatus must be NOT_CONFIGURED');
      assert.strictEqual(run.metrics.judgeApiCalls, 0, 'judgeApiCalls metric must be 0');
      assert.strictEqual(run.metrics.judgeEvaluatedCases, 0, 'judgeEvaluatedCases metric must be 0');
      assert.strictEqual(run.caseResults[0].llmJudgeEvaluation, null, 'Case llmJudgeEvaluation must be null');
      assert.strictEqual(run.caseResults[1].llmJudgeEvaluation, null, 'Case llmJudgeEvaluation must be null');
    });

    // -------------------------------------------------------------
    // Test 2: Enabling optional judge uses the selected registered model
    // -------------------------------------------------------------
    await test('2. Enabling optional judge uses the selected registered judge model and records analysis', async () => {
      let judgeCallsMade = 0;
      let requestedJudgeModel = null;

      const mockFetch = async (url, init) => {
        judgeCallsMade++;
        const parsedBody = JSON.parse(init.body);
        requestedJudgeModel = parsedBody.model;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{
              message: {
                content: JSON.stringify({
                  response1: { correctness: 5, instructionAdherence: 5, relevance: 5, completeness: 5, groundedness: 5, safety: 5, overall: 5, reason: 'Accurate and comprehensive explanation.' },
                  response2: { correctness: 5, instructionAdherence: 5, relevance: 5, completeness: 5, groundedness: 5, safety: 5, overall: 5, reason: 'Accurate and comprehensive explanation.' },
                  comparison: { preferred: 'TIE', reason: 'Both models answered correctly.' },
                }),
              },
            }],
          }),
        };
      };

      const mockProvider = {
        providerType: 'mock',
        generate: async (req) => ({
          output: (req.input || '').includes('email')
            ? 'user@example.com'
            : 'B-tree index lookups provide O(log n) access time reducing full table scans.',
          usage: { inputTokens: 40, outputTokens: 25, totalTokens: 65, latencyMs: 250 },
          isDemoMode: false,
        }),
      };

      const runner = new EvaluationRunner();
      const run = await runner.run({
        dataset: sampleDataset,
        baselineVersion,
        candidateVersion,
        judgeConfig: {
          enabled: true,
          provider: 'groq',
          modelIdentifier: 'allam-2-7b',
        },
        baselineProvider: mockProvider,
        candidateProvider: mockProvider,
        customFetch: mockFetch,
        bypassCache: true,
      });

      assert.strictEqual(requestedJudgeModel, 'allam-2-7b', 'Selected registered judge model must be passed to provider');
      assert.strictEqual(run.metrics.llmJudgeStatus, 'EXECUTED', 'llmJudgeStatus must be EXECUTED');
      assert.strictEqual(run.metrics.judgeModel, 'allam-2-7b', 'judgeModel metric must match selected model');
      assert.strictEqual(run.caseResults[1].llmJudgeEvaluation.judgeModel, 'allam-2-7b');
      assert.strictEqual(run.caseResults[1].llmJudgeEvaluation.overall, 5);
    });

    // -------------------------------------------------------------
    // Test 3: Disabling judge does not affect official scoring
    // -------------------------------------------------------------
    await test('3. Disabling judge produces identical official scores as running with judge enabled', async () => {
      const mockProvider = {
        providerType: 'mock',
        generate: async (req) => ({
          output: (req.input || '').includes('email')
            ? 'user@example.com'
            : 'B-tree index lookups provide O(log n) access time reducing full table scans.',
          usage: { inputTokens: 40, outputTokens: 25, totalTokens: 65, latencyMs: 250 },
          isDemoMode: false,
        }),
      };

      const mockFetchWithLowJudge = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                response1: { correctness: 1, instructionAdherence: 1, relevance: 1, completeness: 1, groundedness: 1, safety: 1, overall: 1, reason: 'Harsh judge opinion' },
                response2: { correctness: 1, instructionAdherence: 1, relevance: 1, completeness: 1, groundedness: 1, safety: 1, overall: 1, reason: 'Harsh judge opinion' },
                comparison: { preferred: 'TIE', reason: 'Equal' },
              }),
            },
          }],
        }),
      });

      const runner = new EvaluationRunner();

      // Run 1: Judge Disabled
      const runWithoutJudge = await runner.run({
        dataset: sampleDataset,
        baselineVersion,
        candidateVersion,
        baselineProvider: mockProvider,
        candidateProvider: mockProvider,
        bypassCache: true,
      });

      // Run 2: Judge Enabled (returning harsh 1/5 ratings)
      const runWithJudge = await runner.run({
        dataset: sampleDataset,
        baselineVersion,
        candidateVersion,
        judgeConfig: { enabled: true, provider: 'groq', modelIdentifier: 'allam-2-7b' },
        baselineProvider: mockProvider,
        candidateProvider: mockProvider,
        customFetch: mockFetchWithLowJudge,
        bypassCache: true,
      });

      // Assert case-level official scores and pass status are 100% IDENTICAL
      for (let i = 0; i < sampleDataset.cases.length; i++) {
        const cWithout = runWithoutJudge.caseResults[i];
        const cWith = runWithJudge.caseResults[i];

        assert.strictEqual(cWithout.candidateScore, cWith.candidateScore, `Case ${i} candidateScore must match exactly`);
        assert.strictEqual(cWithout.baselineScore, cWith.baselineScore, `Case ${i} baselineScore must match exactly`);
        assert.strictEqual(cWithout.passed, cWith.passed, `Case ${i} passed status must match exactly`);
      }

      // Assert official V3 composite scores are 100% IDENTICAL
      const v3ScoreWithout = calculateV3ModelScore({
        modelRole: 'candidate',
        modelIdentifier: candidateVersion.modelIdentifier,
        provider: candidateVersion.provider,
        caseResults: runWithoutJudge.caseResults,
        totalCasesCount: sampleDataset.cases.length,
        evaluatedCasesCount: sampleDataset.cases.length,
        coveragePercent: 100,
        meanLatencyMs: 250,
        medianLatencyMs: 250,
        p95LatencyMs: 250,
        totalCostUsd: 0.001,
        totalTokens: 130,
        rateLimitFailuresCount: 0,
        infrastructureFailuresCount: 0,
        criticalSafetyFailuresCount: 0,
      }, DEFAULT_V3_WEIGHTS);

      const v3ScoreWith = calculateV3ModelScore({
        modelRole: 'candidate',
        modelIdentifier: candidateVersion.modelIdentifier,
        provider: candidateVersion.provider,
        caseResults: runWithJudge.caseResults,
        totalCasesCount: sampleDataset.cases.length,
        evaluatedCasesCount: sampleDataset.cases.length,
        coveragePercent: 100,
        meanLatencyMs: 250,
        medianLatencyMs: 250,
        p95LatencyMs: 250,
        totalCostUsd: 0.001,
        totalTokens: 130,
        rateLimitFailuresCount: 0,
        infrastructureFailuresCount: 0,
        criticalSafetyFailuresCount: 0,
      }, DEFAULT_V3_WEIGHTS);

      assert.strictEqual(
        v3ScoreWithout.compositeScore100,
        v3ScoreWith.compositeScore100,
        'Official 100-pt V3 composite score must be identical regardless of judge execution'
      );
    });

    // -------------------------------------------------------------
    // Test 4: Judge HTTP 500 failure does not fail the official benchmark
    // -------------------------------------------------------------
    await test('4. Judge HTTP 500 error does not fail the official benchmark run', async () => {
      const mockFetch500 = async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Groq 500 error in judge model',
      });

      const mockProvider = {
        providerType: 'mock',
        generate: async () => ({
          output: 'B-tree index lookups provide O(log n) access time reducing table scans.',
          usage: { inputTokens: 40, outputTokens: 25, totalTokens: 65, latencyMs: 250 },
          isDemoMode: false,
        }),
      };

      const runner = new EvaluationRunner();
      const run = await runner.run({
        dataset: sampleDataset,
        baselineVersion,
        candidateVersion,
        judgeConfig: { enabled: true, provider: 'groq', modelIdentifier: 'allam-2-7b' },
        baselineProvider: mockProvider,
        candidateProvider: mockProvider,
        customFetch: mockFetch500,
        bypassCache: true,
      });

      assert.strictEqual(run.metrics.llmJudgeStatus, 'FAILED', 'llmJudgeStatus must be FAILED on judge 500');
      assert.strictEqual(run.metrics.judgeErrorCases, 1, 'judgeErrorCases must be recorded');
      assert.ok(run.caseResults && run.caseResults.length === 2, 'Benchmark run itself must complete with all case results');
      assert.ok(run.caseResults[1].llmJudgeEvaluation.error.includes('500'), 'Case must record judge error details');
      assert.strictEqual(run.caseResults[1].passed, true, 'Model pass status must not fail due to judge 500 error');
    });

    // -------------------------------------------------------------
    // Test 5: Judge results cannot overwrite the official winner
    // -------------------------------------------------------------
    await test('5. Judge results cannot overwrite official winner determination', async () => {
      // Candidate performs better on objective evaluation (Candidate: 1.0, Baseline: 0.5)
      // Judge falsely prefers Baseline
      const mockFetchBiasedForBaseline = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                response1: { correctness: 5, instructionAdherence: 5, relevance: 5, completeness: 5, groundedness: 5, safety: 5, overall: 5, reason: 'Superb' },
                response2: { correctness: 1, instructionAdherence: 1, relevance: 1, completeness: 1, groundedness: 1, safety: 1, overall: 1, reason: 'Terrible' },
                comparison: { preferred: 'BASELINE', reason: 'Biased preference for baseline' },
              }),
            },
          }],
        }),
      });

      const dataset10Cases = {
        id: 'ds-10',
        name: '10 Cases Dataset',
        cases: Array.from({ length: 12 }, (_, i) => ({
          id: `tc-${i}`,
          name: `Scenario ${i}`,
          category: 'Data Extraction',
          input: `Case ${i}`,
          expectedOutput: 'CORRECT',
          evaluatorType: 'exact_match',
          severity: 'medium',
          createdAt: '2026-01-01',
        })),
      };

      const baselineProvider = {
        providerType: 'mock',
        generate: async () => ({
          output: 'WRONG',
          usage: { inputTokens: 40, outputTokens: 20, totalTokens: 60, latencyMs: 500 },
          isDemoMode: false,
        }),
      };

      const candidateProvider = {
        providerType: 'mock',
        generate: async () => ({
          output: 'CORRECT',
          usage: { inputTokens: 40, outputTokens: 20, totalTokens: 60, latencyMs: 300 },
          isDemoMode: false,
        }),
      };

      const runner = new EvaluationRunner();
      const run = await runner.run({
        dataset: dataset10Cases,
        baselineVersion,
        candidateVersion,
        judgeConfig: { enabled: true, provider: 'groq', modelIdentifier: 'allam-2-7b' },
        baselineProvider,
        candidateProvider,
        customFetch: mockFetchBiasedForBaseline,
        bypassCache: true,
      });

      const report = generateComparisonReport({
        baselineVersion,
        candidateVersion,
        dataset: dataset10Cases,
        caseResults: run.caseResults,
        runMetrics: run.metrics,
      });

      // The Candidate had 100% exact match correctness; Baseline had 0%.
      // Biased judge preferred BASELINE, but official winner MUST BE CANDIDATE_WIN!
      assert.strictEqual(
        report.v3Scoring.winner,
        'candidate',
        'Official winner must be candidate based on objective scoring; biased judge cannot overturn winner'
      );
      assert.ok(
        report.v3Scoring.overallDelta > 0,
        'Candidate overall delta must be positive'
      );
    });

    // -------------------------------------------------------------
    // Test 6: Registered judge models & validation compatibility
    // -------------------------------------------------------------
    await test('6. Registered judge models and configuration validation remain intact without hardcoding', () => {
      const eligible = getEligibleJudgeModels('openai/gpt-oss-20b', 'openai/gpt-oss-120b');
      assert.ok(eligible.length > 0, 'Eligible judge models must be available in registry');

      // Check that self-judging is flagged
      const conflictValidation = validateJudgeConfiguration(
        { enabled: true, provider: 'groq', modelIdentifier: 'qwen/qwen3.8-27b' },
        'qwen/qwen3.8-27b',
        'openai/gpt-oss-120b'
      );
      assert.strictEqual(conflictValidation.valid, false, 'Self-judging must be rejected');

      // Check valid independent judge
      const validValidation = validateJudgeConfiguration(
        { enabled: true, provider: 'groq', modelIdentifier: 'allam-2-7b' },
        'qwen/qwen3.8-27b',
        'openai/gpt-oss-120b'
      );
      assert.strictEqual(validValidation.valid, true, 'Independent judge must be valid');

      // Check disabled judge is always valid
      const disabledValidation = validateJudgeConfiguration(
        { enabled: false, provider: 'groq', modelIdentifier: 'qwen/qwen3.8-27b' },
        'qwen/qwen3.8-27b',
        'openai/gpt-oss-120b'
      );
      assert.strictEqual(disabledValidation.valid, true, 'Disabled judge configuration must always be valid');
    });

  } finally {
    await server.close();
  }

  console.log(`\n============================================================`);
  console.log(`OPTIONAL JUDGE REGRESSION SUITE: ${passed} passed, ${failed} failed`);
  console.log(`============================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test suite failed with error:', err);
  process.exit(1);
});
