/* ============================================================
   RELIQ — Hybrid Evaluation & Intelligent Judge Optimization Tests
   
   Proves:
   1. Objective test cases do not trigger unnecessary judge calls.
   2. Qualitative test cases receive complete, multi-dimensional judge evaluations.
   3. Both models receive symmetric evaluation (blind, order-randomized, zero leakage).
   4. Cached results are reused ONLY when all relevant inputs and configurations match.
   5. Judge failures are reported separately from model failures (deterministic fallback).
   6. Judge tokens, API calls, cache hits, and costs are tracked strictly separately.
   ============================================================ */

import assert from 'node:assert';
import { createServer } from 'vite';

async function runTests() {
  console.log('\n============================================================');
  console.log('RELIQ HYBRID EVALUATION & INTELLIGENT JUDGE OPTIMIZATION TEST SUITE');
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
    const {
      LLMJudgeEvaluator,
      categorizeEvaluationRequirement,
      computeJudgeFingerprint,
      judgeCache,
    } = await server.ssrLoadModule('/src/evaluation/llmJudgeEvaluator.ts');

    const { EvaluationRunner } = await server.ssrLoadModule('/src/evaluation/runner.ts');
    const { generateComparisonReport } = await server.ssrLoadModule('/src/evaluation/comparator.ts');

    // -------------------------------------------------------------
    // Test 1: Benchmark Categorization (Objective vs Qualitative)
    // -------------------------------------------------------------
    await test('1. Categorization: Identifies objective vs qualitative benchmark cases correctly', () => {
      // Objective cases
      assert.strictEqual(
        categorizeEvaluationRequirement({
          category: 'Structured Output',
          evaluatorType: 'json_validity',
          expectedOutput: '{"orderId":"123"}',
        }),
        'objective',
        'Structured Output with JSON validity must be categorized as objective'
      );

      assert.strictEqual(
        categorizeEvaluationRequirement({
          category: 'Data Extraction',
          evaluatorType: 'exact_match',
          expectedOutput: '42',
        }),
        'objective',
        'Exact match extraction must be categorized as objective'
      );

      assert.strictEqual(
        categorizeEvaluationRequirement({
          category: 'Safety Boundary',
          evaluatorType: 'behavioral_safety',
          expectedOutput: 'I cannot provide private keys.',
        }),
        'objective',
        'Deterministic behavioral safety must be categorized as objective'
      );

      // Qualitative cases
      assert.strictEqual(
        categorizeEvaluationRequirement({
          category: 'Multi-step Reasoning',
          evaluatorType: 'keyword_criteria',
          expectedOutput: 'Detailed step-by-step reasoning plan.',
        }),
        'qualitative',
        'Multi-step reasoning must be categorized as qualitative'
      );

      assert.strictEqual(
        categorizeEvaluationRequirement({
          category: 'Instruction Following',
          evaluatorType: 'normalized_text',
          expectedOutput: 'Long open-ended response conforming to multiple instructions.',
        }),
        'qualitative',
        'Instruction following without exact match must be categorized as qualitative'
      );

      assert.strictEqual(
        categorizeEvaluationRequirement({
          category: 'Preference Alignment',
          evaluatorType: 'llm_judge',
          expectedOutput: 'Preferred assistant response.',
          metadata: { chosen: 'Good answer', rejected: 'Bad answer' },
        }),
        'qualitative',
        'Preference / RLHF cases must be categorized as qualitative'
      );
    });

    // -------------------------------------------------------------
    // Test 2: Objective Cases Skip Judge Calls
    // -------------------------------------------------------------
    await test('2. Objective Case Bypass: Objective test cases skip LLM judging with deterministic ground truth', async () => {
      let judgeCalls = 0;
      const mockFetch = async (url, init) => {
        judgeCalls++;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{
              message: {
                content: JSON.stringify({
                  response1: { correctness: 5, instructionAdherence: 5, relevance: 5, completeness: 5, groundedness: 5, safety: 5, overall: 5, reason: 'Great' },
                  response2: { correctness: 5, instructionAdherence: 5, relevance: 5, completeness: 5, groundedness: 5, safety: 5, overall: 5, reason: 'Great' },
                  comparison: { preferred: 'TIE', reason: 'Equal' },
                }),
              },
            }],
          }),
        };
      };

      const runner = new EvaluationRunner();
      const mockProvider = {
        providerType: 'mock',
        generate: async () => ({
          output: '{"status": "success", "orderId": "ORD-101"}',
          usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70, latencyMs: 120 },
          isDemoMode: false,
        }),
      };

      const objectiveDataset = {
        id: 'ds-obj',
        name: 'Objective Test Dataset',
        cases: [
          {
            id: 'tc-obj-1',
            name: 'Strict JSON Validation',
            category: 'Structured Output',
            input: 'Generate order confirmation for ORD-101',
            expectedOutput: '{"status": "success", "orderId": "ORD-101"}',
            evaluatorType: 'json_validity',
            evaluatorConfig: { requiredJsonKeys: ['status', 'orderId'] },
            severity: 'high',
            tags: ['json'],
            createdAt: '2026-01-01',
          },
        ],
      };

      const run = await runner.run({
        dataset: objectiveDataset,
        baselineVersion: {
          id: 'v1',
          name: 'Baseline Model',
          provider: 'groq',
          modelIdentifier: 'qwen/qwen3.8-27b',
          promptVersion: '1.0',
          systemPrompt: '',
          temperature: 0.1,
          createdAt: '',
        },
        candidateVersion: {
          id: 'v2',
          name: 'Candidate Model',
          provider: 'groq',
          modelIdentifier: 'openai/gpt-oss-120b',
          promptVersion: '1.0',
          systemPrompt: '',
          temperature: 0.1,
          createdAt: '',
        },
        judgeConfig: { enabled: true, provider: 'groq', modelIdentifier: 'allam-2-7b' },
        baselineProvider: mockProvider,
        candidateProvider: mockProvider,
        customFetch: mockFetch,
        bypassCache: true,
      });

      // Verify judge was NOT called for objective case
      assert.strictEqual(judgeCalls, 0, 'Objective test case must NOT make any LLM judge API calls');
      assert.strictEqual(run.metrics.judgeSkippedCases, 1, 'judgeSkippedCases must be incremented to 1');
      assert.strictEqual(run.caseResults[0].judgeSkipped, true, 'Case result must mark judgeSkipped: true');
      assert.strictEqual(run.caseResults[0].evaluationRequirement, 'objective', 'evaluationRequirement must be objective');
      assert.strictEqual(run.caseResults[0].passed, true, 'Deterministic evaluation must succeed');
    });

    // -------------------------------------------------------------
    // Test 3: Qualitative Cases Receive Complete Joint Evaluations
    // -------------------------------------------------------------
    await test('3. Qualitative Joint Evaluation: Evaluates Baseline and Candidate in ONE request with randomized order', async () => {
      let judgeRequestsMade = 0;
      let observedBody = null;

      const mockFetch = async (url, init) => {
        judgeRequestsMade++;
        observedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{
              message: {
                content: JSON.stringify({
                  response1: { correctness: 5, instructionAdherence: 5, relevance: 5, completeness: 5, groundedness: 5, safety: 5, overall: 5.0, reason: 'Flawless reasoning.' },
                  response2: { correctness: 3, instructionAdherence: 3, relevance: 4, completeness: 3, groundedness: 4, safety: 5, overall: 3.5, reason: 'Missed sub-clause.' },
                  comparison: { preferred: '1', reason: 'Response 1 provided deeper, more rigorous steps.' },
                }),
              },
            }],
            usage: { prompt_tokens: 180, completion_tokens: 65 },
          }),
        };
      };

      judgeCache.clear();

      const testCase = {
        id: 'tc-qual-1',
        name: 'Multi-Step Database Migration Plan',
        category: 'Multi-step Reasoning',
        input: 'Order of execution: DB migration must precede API deploy, and API deploy must precede Smoke Test. Emit dependency plan.',
        expectedOutput: '1. Database Migration -> 2. API Deployment -> 3. Automated Smoke Tests.',
        evaluatorType: 'normalized_text',
        severity: 'high',
        tags: ['multi-step-reasoning'],
        createdAt: '2026-01-01',
      };

      const result = await LLMJudgeEvaluator.evaluateJointPair({
        testCase,
        baselineOutput: 'First run DB migration, then API deploy, then run smoke tests.',
        candidateOutput: 'Plan: DB migration -> API deploy -> Smoke test verification.',
        judgeConfig: { enabled: true, provider: 'groq', modelIdentifier: 'allam-2-7b' },
        customFetch: mockFetch,
        bypassCache: true,
      });

      // 1. Exactly ONE judge request evaluated both models
      assert.strictEqual(judgeRequestsMade, 1, 'Joint evaluation must make exactly 1 API call for both models');
      assert.strictEqual(result.apiCallsMade, 1);
      assert.strictEqual(typeof result.orderSwapped, 'boolean');

      // 2. Blind anonymous presentation
      const promptText = observedBody.messages[1].content;
      assert.ok(promptText.includes('[Response 1]:'), 'Prompt must use anonymized [Response 1] header');
      assert.ok(promptText.includes('[Response 2]:'), 'Prompt must use anonymized [Response 2] header');
      assert.ok(!promptText.includes('Candidate Model') && !promptText.includes('Baseline Model'), 'No model identity leakage');
      assert.ok(!promptText.includes('qwen') && !promptText.includes('gpt-oss'), 'No model identifier leakage');

      // 3. Multi-dimensional criteria scores for both models
      assert.strictEqual(typeof result.baselineScore.correctness, 'number');
      assert.strictEqual(typeof result.baselineScore.instructionAdherence, 'number');
      assert.strictEqual(typeof result.baselineScore.relevance, 'number');
      assert.strictEqual(typeof result.baselineScore.completeness, 'number');
      assert.strictEqual(typeof result.baselineScore.groundedness, 'number');
      assert.strictEqual(typeof result.baselineScore.safety, 'number');
      assert.strictEqual(typeof result.baselineScore.overall, 'number');

      assert.strictEqual(typeof result.candidateScore.correctness, 'number');
      assert.strictEqual(typeof result.candidateScore.instructionAdherence, 'number');
      assert.strictEqual(typeof result.candidateScore.relevance, 'number');
      assert.strictEqual(typeof result.candidateScore.completeness, 'number');
      assert.strictEqual(typeof result.candidateScore.groundedness, 'number');
      assert.strictEqual(typeof result.candidateScore.safety, 'number');
      assert.strictEqual(typeof result.candidateScore.overall, 'number');

      // 4. Verification that orderSwapped properly assigns scores to baseline vs candidate
      if (result.orderSwapped) {
        // response1 was candidate (score 5.0), response2 was baseline (score 3.5)
        assert.strictEqual(result.candidateScore.overall, 5.0);
        assert.strictEqual(result.baselineScore.overall, 3.5);
        assert.strictEqual(result.comparison.winner, 'candidate');
      } else {
        // response1 was baseline (score 5.0), response2 was candidate (score 3.5)
        assert.strictEqual(result.baselineScore.overall, 5.0);
        assert.strictEqual(result.candidateScore.overall, 3.5);
        assert.strictEqual(result.comparison.winner, 'baseline');
      }
    });

    // -------------------------------------------------------------
    // Test 4: Judge Caching Reuses Results Only When Inputs Match
    // -------------------------------------------------------------
    await test('4. Judge Caching: Cached results reused on identical fingerprint; new calls on changed input/model', async () => {
      judgeCache.clear();
      let fetchCalls = 0;

      const mockFetch = async () => {
        fetchCalls++;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{
              message: {
                content: JSON.stringify({
                  response1: { correctness: 5, instructionAdherence: 5, relevance: 5, completeness: 5, groundedness: 5, safety: 5, overall: 5.0, reason: 'Cached evaluation.' },
                  response2: { correctness: 4, instructionAdherence: 4, relevance: 4, completeness: 4, groundedness: 5, safety: 5, overall: 4.2, reason: 'Good answer.' },
                  comparison: { preferred: '1', reason: 'Slightly better.' },
                }),
              },
            }],
            usage: { prompt_tokens: 150, completion_tokens: 60 },
          }),
        };
      };

      const testCase = {
        id: 'tc-cache-1',
        name: 'Context Retention Ambiguity',
        category: 'Context Retention',
        input: 'Turn 1: Address is 742 Evergreen. Turn 2: What is the delivery date?',
        expectedOutput: 'Estimated delivery to 742 Evergreen is Tuesday.',
        evaluatorType: 'normalized_text',
        severity: 'medium',
        tags: ['context-retention'],
        createdAt: '2026-01-01',
      };

      const baselineOutput = 'Delivery to 742 Evergreen is Tuesday.';
      const candidateOutput = 'Your package arrives Tuesday at 742 Evergreen.';
      const judgeConfig = { enabled: true, provider: 'groq', modelIdentifier: 'qwen/qwen3.8-27b', temperature: 0.1 };

      // First call -> Cache Miss -> Executes API Call
      const res1 = await LLMJudgeEvaluator.evaluateJointPair({
        testCase,
        baselineOutput,
        candidateOutput,
        judgeConfig,
        customFetch: mockFetch,
        bypassCache: false,
        concurrency: 1,
      });

      assert.strictEqual(fetchCalls, 1, 'First call must fetch from provider');
      assert.strictEqual(res1.isCached, false);
      assert.strictEqual(res1.apiCallsMade, 1);

      // Second call with IDENTICAL parameters -> Cache Hit -> 0 API Calls
      const res2 = await LLMJudgeEvaluator.evaluateJointPair({
        testCase,
        baselineOutput,
        candidateOutput,
        judgeConfig,
        customFetch: mockFetch,
        bypassCache: false,
        concurrency: 1,
      });

      assert.strictEqual(fetchCalls, 1, 'Second call must hit cache with 0 additional API calls');
      assert.strictEqual(res2.isCached, true, 'Result must be flagged isCached: true');
      assert.strictEqual(res2.apiCallsMade, 0);
      assert.strictEqual(res2.baselineScore.overall, res1.baselineScore.overall);
      assert.strictEqual(res2.candidateScore.overall, res1.candidateScore.overall);

      // Third call with DIFFERENT candidateOutput -> Cache Miss -> Executes API Call
      const res3 = await LLMJudgeEvaluator.evaluateJointPair({
        testCase,
        baselineOutput,
        candidateOutput: 'Completely different candidate answer with different length.',
        judgeConfig,
        customFetch: mockFetch,
        bypassCache: false,
        concurrency: 1,
      });

      assert.strictEqual(fetchCalls, 2, 'Changed output must trigger a new API call');
      assert.strictEqual(res3.isCached, false);
      assert.strictEqual(res3.apiCallsMade, 1);

      // Fourth call with DIFFERENT judge model -> Cache Miss -> Executes API Call
      const res4 = await LLMJudgeEvaluator.evaluateJointPair({
        testCase,
        baselineOutput,
        candidateOutput,
        judgeConfig: { ...judgeConfig, modelIdentifier: 'openai/gpt-oss-120b' },
        customFetch: mockFetch,
        bypassCache: false,
        concurrency: 1,
      });

      assert.strictEqual(fetchCalls, 3, 'Different judge model must trigger a new API call');
      assert.strictEqual(res4.isCached, false);
    });

    // -------------------------------------------------------------
    // Test 5: Judge Failures are Reported Separately from Model Failures
    // -------------------------------------------------------------
    await test('5. Resilient Fallback: Judge 500 error falls back to deterministic score without failing model', async () => {
      // Mock fetch returning HTTP 500 Internal Server Error for Judge
      const failingJudgeFetch = async () => ({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error from upstream judge provider',
      });

      const runner = new EvaluationRunner();
      const mockProvider = {
        providerType: 'mock',
        generate: async () => ({
          output: 'Step 1: DB Migration. Step 2: API Deploy. Step 3: Smoke Test.',
          usage: { inputTokens: 40, outputTokens: 25, totalTokens: 65, latencyMs: 150 },
          isDemoMode: false,
        }),
      };

      const qualitativeDataset = {
        id: 'ds-qual',
        name: 'Qualitative Fallback Dataset',
        cases: [
          {
            id: 'tc-fallback-1',
            name: 'Multi-Step Plan Execution',
            category: 'Multi-step Reasoning',
            input: 'DB migration, API deploy, Smoke test plan.',
            expectedOutput: 'Step 1: DB Migration. Step 2: API Deploy. Step 3: Smoke Test.',
            evaluatorType: 'normalized_text',
            severity: 'high',
            tags: ['multi-step-reasoning'],
            createdAt: '2026-01-01',
          },
        ],
      };

      const run = await runner.run({
        dataset: qualitativeDataset,
        baselineVersion: {
          id: 'v1',
          name: 'Baseline Model',
          provider: 'groq',
          modelIdentifier: 'qwen/qwen3.8-27b',
          promptVersion: '1.0',
          systemPrompt: '',
          temperature: 0.1,
          createdAt: '',
        },
        candidateVersion: {
          id: 'v2',
          name: 'Candidate Model',
          provider: 'groq',
          modelIdentifier: 'openai/gpt-oss-120b',
          promptVersion: '1.0',
          systemPrompt: '',
          temperature: 0.1,
          createdAt: '',
        },
        judgeConfig: { enabled: true, provider: 'groq', modelIdentifier: 'allam-2-7b' },
        baselineProvider: mockProvider,
        candidateProvider: mockProvider,
        customFetch: failingJudgeFetch,
        bypassCache: true,
      });

      const caseResult = run.caseResults[0];

      // 1. Model response succeeded and passed deterministic evaluation
      assert.strictEqual(caseResult.candidateExecutionStatus, 'PASS', 'Model response must be PASS');
      assert.strictEqual(caseResult.passed, true, 'Test case must pass based on valid deterministic ground truth');

      // 2. Judge failure is isolated and explicitly reported
      assert.ok(caseResult.llmJudgeEvaluation, 'Judge evaluation record must exist');
      assert.ok(caseResult.llmJudgeEvaluation.error, 'Judge evaluation must record error');
      assert.ok(
        caseResult.llmJudgeEvaluation.error.includes('HTTP 500') ||
        caseResult.llmJudgeEvaluation.reason.includes('Judge'),
        'Error must capture HTTP 500'
      );

      // 3. Fallback to deterministic scoring without fabricated judge score
      assert.strictEqual(caseResult.finalEvaluation?.decisionLayer, 'DETERMINISTIC', 'Decision layer must fall back to DETERMINISTIC');
      assert.strictEqual(caseResult.candidateScore, 1.0, 'Primary deterministic score must be preserved');
    });

    // -------------------------------------------------------------
    // Test 6: Separate Telemetry Tracking & Report Aggregation
    // -------------------------------------------------------------
    await test('6. Telemetry & Provenance: Judge tokens, API calls, cache hits, and costs tracked separately', async () => {
      judgeCache.clear();

      let calls = 0;
      const mockFetch = async () => {
        calls++;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{
              message: {
                content: JSON.stringify({
                  response1: { correctness: 5, instructionAdherence: 5, relevance: 5, completeness: 5, groundedness: 5, safety: 5, overall: 5.0, reason: 'Great' },
                  response2: { correctness: 5, instructionAdherence: 5, relevance: 5, completeness: 5, groundedness: 5, safety: 5, overall: 5.0, reason: 'Great' },
                  comparison: { preferred: 'TIE', reason: 'Equal' },
                }),
              },
            }],
            usage: { prompt_tokens: 200, completion_tokens: 50 },
          }),
        };
      };

      const runner = new EvaluationRunner();
      const mockProvider = {
        providerType: 'mock',
        generate: async () => ({
          output: 'Step 1: DB Migration. Step 2: API Deploy. Step 3: Smoke Test.',
          usage: { inputTokens: 40, outputTokens: 25, totalTokens: 65, estimatedCostUsd: 0.0001, latencyMs: 150 },
          isDemoMode: false,
        }),
      };

      const mixedDataset = {
        id: 'ds-mixed',
        name: 'Mixed Hybrid Dataset',
        cases: [
          // Case 1: Objective (should skip judge)
          {
            id: 'tc-1-obj',
            name: 'Order JSON Schema',
            category: 'Structured Output',
            input: 'Get order',
            expectedOutput: '{"orderId":"1"}',
            evaluatorType: 'json_validity',
            evaluatorConfig: { requiredJsonKeys: ['orderId'] },
            severity: 'medium',
            tags: ['json'],
            createdAt: '2026-01-01',
          },
          // Case 2: Qualitative (should call judge once)
          {
            id: 'tc-2-qual',
            name: 'Deployment Steps',
            category: 'Multi-step Reasoning',
            input: 'Deployment DAG',
            expectedOutput: 'Step 1: DB Migration. Step 2: API Deploy. Step 3: Smoke Test.',
            evaluatorType: 'normalized_text',
            severity: 'high',
            tags: ['multi-step-reasoning'],
            createdAt: '2026-01-01',
          },
          // Case 3: Qualitative duplicate of Case 2 (should hit cache)
          {
            id: 'tc-3-qual-repeat',
            name: 'Deployment Steps Duplicate',
            category: 'Multi-step Reasoning',
            input: 'Deployment DAG',
            expectedOutput: 'Step 1: DB Migration. Step 2: API Deploy. Step 3: Smoke Test.',
            evaluatorType: 'normalized_text',
            severity: 'high',
            tags: ['multi-step-reasoning'],
            createdAt: '2026-01-01',
          },
        ],
      };

      const run = await runner.run({
        dataset: mixedDataset,
        baselineVersion: {
          id: 'v1',
          name: 'Baseline Model',
          provider: 'groq',
          modelIdentifier: 'qwen/qwen3.8-27b',
          promptVersion: '1.0',
          systemPrompt: '',
          temperature: 0.1,
          createdAt: '',
        },
        candidateVersion: {
          id: 'v2',
          name: 'Candidate Model',
          provider: 'groq',
          modelIdentifier: 'openai/gpt-oss-120b',
          promptVersion: '1.0',
          systemPrompt: '',
          temperature: 0.1,
          createdAt: '',
        },
        judgeConfig: { enabled: true, provider: 'groq', modelIdentifier: 'allam-2-7b' },
        baselineProvider: mockProvider,
        candidateProvider: mockProvider,
        customFetch: mockFetch,
        bypassCache: false,
        concurrency: 1,
      });

      // Verify exact accounting:
      // Case 1: Skipped -> judgeSkippedCases = 1
      // Case 2: Evaluated -> judgeApiCalls = 1
      // Case 3: Cached -> judgeCacheHits = 1
      assert.strictEqual(run.metrics.judgeSkippedCases, 1, '1 objective case must be skipped');
      assert.strictEqual(run.metrics.judgeApiCalls, 1, 'Exactly 1 judge API call made');
      assert.strictEqual(run.metrics.judgeCacheHits, 1, 'Exactly 1 judge cache hit');
      assert.strictEqual(calls, 1, 'Mock fetch called exactly once');

      // Verify token tracking
      assert.strictEqual(run.metrics.judgeInputTokens, 200, 'Judge input tokens tracked accurately');
      assert.strictEqual(run.metrics.judgeOutputTokens, 50, 'Judge output tokens tracked accurately');
      assert.strictEqual(run.metrics.judgeTotalTokens, 250, 'Judge total tokens tracked accurately');

      // Verify provenance contains judge telemetry
      assert.strictEqual(run.provenance.judgeApiCalls, 1);
      assert.strictEqual(run.provenance.judgeCacheHits, 1);
      assert.strictEqual(run.provenance.judgeSkippedCases, 1);

      // Verify comparison report contains judge telemetry
      const rep = run.comparisonReport;
      assert.ok(rep, 'Comparison report must be generated');
      assert.strictEqual(rep.judgeApiCalls, 1);
      assert.strictEqual(rep.judgeCacheHits, 1);
      assert.strictEqual(rep.judgeSkippedCases, 1);
      assert.strictEqual(rep.judgeTotalTokens, 250);
    });

  } finally {
    await server.close();
  }

  console.log(`\nTest Summary: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
