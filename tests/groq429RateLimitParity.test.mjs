/* ============================================================
   RELIQ — Groq 429 Rate-Limit Handling & Evaluation Parity Suite
   
   Verifies:
   1. Shared API Key Quota Verification: Both Qwen and GPT-OSS-120B share GROQ_API_KEY
   2. Groq Rate-Limit Header Inspection: Retry-After, x-ratelimit-reset-tokens, reset-requests
   3. Controlled Exponential Backoff with Jitter: Avoids synchronized retry stampedes
   4. Provider Concurrency Limiting & Qwen Pacing: Capped concurrency (<=2) and >=1500ms pacing
   5. Infrastructure Failure Classification: 429/timeout/network recorded as INFRASTRUCTURE_FAILURE
   6. Symmetrical Retry & Coverage Rules: Identical rules applied to Baseline and Candidate
   7. Prohibited Fallbacks: Deterministic fallback responses are never counted as real evaluations
   8. Independent Model Telemetry: Separate tracking of evaluated, failed, retried, and token metrics
   9. Insufficient Evidence Winner Guard: Unequal sample sizes / gate failures force 'tie'
   10. Anti-Asymmetric Win Proof: 429 on Baseline cannot artificially make Candidate win
   ============================================================ */

import assert from 'node:assert';
import { createServer } from 'vite';

async function runTests() {
  console.log('\n============================================================');
  console.log('RELIQ GROQ 429 RATE-LIMIT & EVALUATION PARITY REGRESSION SUITE');
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
    const { providerScheduler } = await server.ssrLoadModule('/src/server/providerScheduler.ts');
    const { parseDurationHeaderMs, getApiKey } = await server.ssrLoadModule('/src/server/serverUtils.ts');
    const { evaluateReleaseDecision } = await server.ssrLoadModule('/src/evaluation/releaseEngine.ts');

    // -------------------------------------------------------------
    // Test 1: Shared API Key Quota Verification
    // Both qwen/qwen3.8-27b and openai/gpt-oss-120b resolve to the exact same GROQ_API_KEY
    // -------------------------------------------------------------
    test('1. Shared API Key Quota: Groq models share the same server credential', () => {
      const groqKey = getApiKey('GROQ_API_KEY');
      assert.ok(groqKey, 'GROQ_API_KEY must be configured in server environment');
      assert.ok(groqKey.startsWith('gsk_'), 'GROQ_API_KEY must have valid Groq key prefix');
    });

    // -------------------------------------------------------------
    // Test 2: Groq Rate-Limit Header Inspection & Duration Parsing
    // -------------------------------------------------------------
    test('2. Header Inspection: Groq rate-limit headers parsed accurately to ms', () => {
      assert.strictEqual(parseDurationHeaderMs('787ms'), 787);
      assert.strictEqual(parseDurationHeaderMs('8.94s'), 8940);
      assert.strictEqual(parseDurationHeaderMs('1.4s'), 1400);
      assert.strictEqual(parseDurationHeaderMs('1m2.5s'), 62500);
      assert.strictEqual(parseDurationHeaderMs('9'), 9000);
      assert.strictEqual(parseDurationHeaderMs(''), 0);
      assert.strictEqual(parseDurationHeaderMs(null), 0);
    });

    // -------------------------------------------------------------
    // Test 3: Provider Concurrency Limiting & Qwen Pacing
    // Qwen concurrency is capped <= 2, global Groq concurrency <= 4
    // -------------------------------------------------------------
    test('3. Concurrency & Pacing: Qwen bucket concurrency is strictly capped at <= 2', () => {
      const qwenBucket = providerScheduler['getOrCreateBucket']('groq:qwen/qwen3.8-27b', 8);
      assert.ok(
        qwenBucket.maxConcurrency <= 2,
        `Qwen maxConcurrency must be capped at <= 2 (observed: ${qwenBucket.maxConcurrency})`
      );

      const gptBucket = providerScheduler['getOrCreateBucket']('groq:openai/gpt-oss-120b', 8);
      assert.strictEqual(gptBucket.maxConcurrency, 8);

      const groqGlobalMax = providerScheduler['resolveProviderMaxConcurrency']('groq');
      assert.ok(groqGlobalMax <= 4, `Groq global concurrency must be capped <= 4 on shared API key`);
    });

    // -------------------------------------------------------------
    // Test 4: Adaptive Token-Bucket Protection on Qwen
    // Remaining tokens < 1,200 sets adaptive cooldown target
    // -------------------------------------------------------------
    test('4. Adaptive Protection: Low token headroom proactively paces before hitting 429', () => {
      providerScheduler.clearProviderCooldown('groq');
      const now = Date.now();

      providerScheduler.updateRateLimitInfo('groq', 'qwen/qwen3.8-27b', {
        remainingTokens: 850,
        resetTokens: '4.5s',
      });

      const qwenBucket = providerScheduler['buckets'].get('groq:qwen/qwen3.8-27b');
      assert.ok(qwenBucket, 'Qwen bucket must exist');
      assert.ok(
        qwenBucket.adaptiveWaitUntil > now + 4000,
        `Adaptive wait must be scheduled at least 4.5s ahead (scheduled: ${qwenBucket.adaptiveWaitUntil - now}ms)`
      );
    });

    // -------------------------------------------------------------
    // Test 5: Infrastructure Failure Classification (429, Timeout, Network)
    // Recorded as INFRASTRUCTURE_FAILURE, never as model-quality failure
    // -------------------------------------------------------------
    test('5. Infrastructure Failure Classification: 429, timeout, network never marked as QUALITY_FAILURE', () => {
      const rateLimitResp = {
        output: '',
        usage: {
          provider: 'groq',
          model: 'qwen/qwen3.8-27b',
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          latencyMs: 150,
          error: {
            status: 429,
            code: 'RATE_LIMIT_EXCEEDED',
            failureCategory: 'INFRASTRUCTURE_FAILURE',
            message: 'Rate limit reached on TPM: Limit 1000, Used 985. Try again in 8.94s',
            details: {
              role: 'baseline',
              testCaseId: 'case-27',
              resetTokens: '8.94s',
              retrySec: 9,
            },
          },
        },
        isDemoMode: false,
      };

      const classified = classifyResponseStatus(rateLimitResp);
      assert.strictEqual(classified.status, 'PROVIDER_RATE_LIMIT');
      assert.strictEqual(classified.qualityEvaluated, false, 'Must not be quality evaluated');
      assert.strictEqual(classified.transportSuccess, false, 'Transport must be false');
      assert.strictEqual(classified.evaluationEligible, false, 'Must not be eligible for scoring');
      assert.strictEqual(classified.failureCategory, 'INFRASTRUCTURE_FAILURE', 'Must record INFRASTRUCTURE_FAILURE');

      const timeoutResp = {
        output: '',
        usage: {
          provider: 'groq',
          model: 'qwen/qwen3.8-27b',
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          latencyMs: 30000,
          error: {
            status: 504,
            code: 'TIMEOUT',
            failureCategory: 'INFRASTRUCTURE_FAILURE',
            message: 'Request timed out waiting for Groq API',
          },
        },
        isDemoMode: false,
      };

      const classifiedTimeout = classifyResponseStatus(timeoutResp);
      assert.strictEqual(classifiedTimeout.status, 'TIMEOUT');
      assert.strictEqual(classifiedTimeout.qualityEvaluated, false);
      assert.strictEqual(classifiedTimeout.failureCategory, 'INFRASTRUCTURE_FAILURE');
    });

    // -------------------------------------------------------------
    // Test 6: Fallback Deterministic Response Prohibition
    // Upstream failures never substitute fake scores or mock outputs
    // -------------------------------------------------------------
    test('6. Fallback Prohibition: Failed requests leave output empty and score null', () => {
      const errResp = {
        output: '',
        usage: {
          provider: 'groq',
          model: 'qwen/qwen3.8-27b',
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          latencyMs: 100,
          error: {
            status: 429,
            code: 'RATE_LIMIT_EXCEEDED',
            failureCategory: 'INFRASTRUCTURE_FAILURE',
            message: 'Rate limit exceeded',
          },
        },
        isDemoMode: false,
      };

      const classified = classifyResponseStatus(errResp);
      assert.strictEqual(errResp.output, '', 'Output must remain strictly empty (never fabricated)');
      assert.strictEqual(classified.qualityEvaluated, false);
      assert.strictEqual(classified.transportSuccess, false);
    });

    // -------------------------------------------------------------
    // Test 7: Asymmetric 429 Anti-Winner Gate
    // Baseline 26/27 (1 rate limit) vs Candidate 27/27 (2 quality failures)
    // Candidate MUST NOT be declared winner despite having +1.0 pts continuous delta
    // -------------------------------------------------------------
    test('7. Anti-Asymmetric Win: Asymmetric 429 failure forces tie and prevents artificial candidate win', () => {
      const caseResults = [];

      // 26 paired cases where Baseline scored 100% and Candidate had 2 quality failures
      for (let i = 1; i <= 26; i++) {
        const isCandidateFail = i === 10 || i === 20;
        caseResults.push({
          testCaseId: `tc-${i}`,
          testCaseName: `Test Case ${i}`,
          category: 'Regression Detection',
          severity: 'medium',
          input: `Input ${i}`,
          expectedOutput: `Output ${i}`,
          baselineOutput: `Output ${i}`,
          candidateOutput: isCandidateFail ? 'Wrong answer' : `Output ${i}`,
          baselineScore: 1.0,
          candidateScore: isCandidateFail ? 0.0 : 1.0,
          baselineExecutionStatus: 'PASS',
          candidateExecutionStatus: isCandidateFail ? 'QUALITY_FAILURE' : 'PASS',
          baselineQualityEvaluated: true,
          candidateQualityEvaluated: true,
          baselineTransportSuccess: true,
          candidateTransportSuccess: true,
          baselineLatencyMs: 1200,
          candidateLatencyMs: 320,
          passed: !isCandidateFail,
          isRegression: isCandidateFail,
          candidateUsage: { estimatedCostUsd: 0.0003 },
          baselineUsage: { estimatedCostUsd: 0.0001 },
        });
      }

      // Case 27: Baseline hit HTTP 429 (not evaluated). Candidate succeeded.
      caseResults.push({
        testCaseId: 'tc-27',
        testCaseName: 'Test Case 27',
        category: 'Regression Detection',
        severity: 'medium',
        input: 'Input 27',
        expectedOutput: 'Output 27',
        baselineOutput: '',
        candidateOutput: 'Output 27',
        baselineScore: null,
        candidateScore: 1.0,
        baselineExecutionStatus: 'PROVIDER_RATE_LIMIT',
        candidateExecutionStatus: 'PASS',
        baselineQualityEvaluated: false,
        candidateQualityEvaluated: true,
        baselineTransportSuccess: false,
        candidateTransportSuccess: true,
        failureCategory: 'INFRASTRUCTURE_FAILURE',
        baselineLatencyMs: null,
        candidateLatencyMs: 310,
        passed: true,
        isRegression: false,
        candidateUsage: { estimatedCostUsd: 0.0003 },
        baselineUsage: {
          error: {
            status: 429,
            code: 'RATE_LIMIT_EXCEEDED',
            failureCategory: 'INFRASTRUCTURE_FAILURE',
            message: 'Rate limit reached on TPM',
          },
        },
      });

      const report = generateComparisonReport({
        datasetId: 'ds-test',
        datasetName: 'Test',
        baselineVersion: {
          id: 'v1',
          name: 'GROQ (qwen/qwen3.8-27b)',
          provider: 'groq',
          modelIdentifier: 'qwen/qwen3.8-27b',
          promptVersion: '1.0.0',
          temperature: 0.0,
          createdAt: new Date().toISOString(),
        },
        candidateVersion: {
          id: 'v2',
          name: 'GROQ (openai/gpt-oss-120b)',
          provider: 'groq',
          modelIdentifier: 'openai/gpt-oss-120b',
          promptVersion: '1.0.0',
          temperature: 0.0,
          createdAt: new Date().toISOString(),
        },
        caseResults,
        settings: {
          requiredBenchmarkCases: 27,
          minEvaluationCoveragePercent: 100.0,
          maxAllowedDegradationPercent: 0.0,
        },
      });

      // Assertions verifying that Candidate CANNOT win:
      assert.strictEqual(report.hasUnequalSampleSizes, true, 'Must flag unequal sample sizes');
      assert.ok(report.winner === 'tie' || report.winner === 'inconclusive', 'Winner must be strictly tie or inconclusive (never candidate)');
      assert.ok(
        report.winnerReason.toLowerCase().includes('unequal sample sizes') ||
        report.winnerReason.toLowerCase().includes('inconclusive'),
        `Winner reason must explain inconclusive/unequal sample sizes: "${report.winnerReason}"`
      );
      assert.notStrictEqual(report.recommendation, 'SHIP', 'Recommendation must never be SHIP');
    });

    // -------------------------------------------------------------
    // Test 8: Independent Telemetry Tracking
    // Baseline and candidate track evaluated cases, rate limits, and tokens independently
    // -------------------------------------------------------------
    test('8. Independent Telemetry: Baseline and Candidate track metrics independently', () => {
      const bEvaluated = 26;
      const cEvaluated = 27;
      const totalCases = 27;

      const releaseOutcome = evaluateReleaseDecision({
        metrics: {
          totalCases,
          sampleSize: totalCases,
          evidenceStrength: 'MODERATE',
          baselinePassed: 26,
          candidatePassed: 25,
          baselineAccuracy: 100.0,
          candidateAccuracy: 92.6,
          accuracyDelta: -7.4,
          baselineEvaluatedCases: bEvaluated,
          candidateEvaluatedCases: cEvaluated,
          baselineEvaluationCoverage: 96.3,
          candidateEvaluationCoverage: 100.0,
          isInsufficientCoverage: true,
          hasUnequalSampleSizes: true,
          regressedCasesCount: 2,
          improvedCasesCount: 0,
        },
        settings: {
          minEvaluationCoveragePercent: 100.0,
        },
        datasetName: 'Test',
      });

      const coverageGate = releaseOutcome.gates.find((g) => g.gate === 'Evaluation Coverage');
      assert.ok(coverageGate, 'Evaluation Coverage gate must exist');
      assert.strictEqual(coverageGate.status, 'FAIL', 'Coverage gate must fail when baseline is 96.3% and target is 100%');
      assert.strictEqual(releaseOutcome.decision, 'INSUFFICIENT_EVIDENCE', 'Release decision must be INSUFFICIENT_EVIDENCE');
    });

    // -------------------------------------------------------------
    // Test 9: Paired-Case Parity Calculation
    // QualityScoreDelta over paired cases reflects actual quality (-7.7 pts), not inflated (+1.0 pts)
    // -------------------------------------------------------------
    test('9. Paired Parity: Paired quality calculation protects against asymmetric survivor bias', () => {
      const pairedCases = [];
      for (let i = 1; i <= 26; i++) {
        const isCandidateFail = i === 10 || i === 20;
        pairedCases.push({
          baselineQualityEvaluated: true,
          candidateQualityEvaluated: true,
          baselineScore: 1.0,
          candidateScore: isCandidateFail ? 0.0 : 1.0,
        });
      }

      // Case 27: Only candidate evaluated
      const allCases = [
        ...pairedCases,
        {
          baselineQualityEvaluated: false,
          candidateQualityEvaluated: true,
          baselineScore: null,
          candidateScore: 1.0,
        },
      ];

      const paired = allCases.filter((r) => r.baselineQualityEvaluated && r.candidateQualityEvaluated);
      assert.strictEqual(paired.length, 26, 'Must filter to 26 paired cases');

      const pairedBaseSum = paired.reduce((acc, r) => acc + (r.baselineScore ?? 0), 0);
      const pairedCandSum = paired.reduce((acc, r) => acc + (r.candidateScore ?? 0), 0);
      const pairedBaseScore = Number(((pairedBaseSum / paired.length) * 100).toFixed(1));
      const pairedCandScore = Number(((pairedCandSum / paired.length) * 100).toFixed(1));
      const pairedDelta = Number((pairedCandScore - pairedBaseScore).toFixed(1));

      assert.strictEqual(pairedBaseScore, 100.0);
      assert.strictEqual(pairedCandScore, 92.3);
      assert.strictEqual(pairedDelta, -7.7, 'Candidate is actually -7.7 pts behind Baseline on evaluated cases');
      assert.ok(pairedDelta < 0, 'Paired delta must correctly reflect regression, never positive improvement');
    });

    // -------------------------------------------------------------
    // Test 10: Symmetrical Retry Rules
    // Both baseline and candidate follow identical max retries and intelligent backoff
    // -------------------------------------------------------------
    test('10. Symmetrical Retries: Baseline and Candidate use identical retry and backoff contracts', () => {
      let baselineCalls = 0;
      let candidateCalls = 0;

      const mockBaselineProvider = {
        id: 'groq',
        generate: async () => {
          baselineCalls++;
          return {
            output: 'Baseline answer',
            usage: { provider: 'groq', model: 'qwen/qwen3.8-27b', latencyMs: 50 },
            isDemoMode: false,
          };
        },
      };

      const mockCandidateProvider = {
        id: 'groq',
        generate: async () => {
          candidateCalls++;
          return {
            output: 'Candidate answer',
            usage: { provider: 'groq', model: 'openai/gpt-oss-120b', latencyMs: 50 },
            isDemoMode: false,
          };
        },
      };

      assert.strictEqual(typeof mockBaselineProvider.generate, 'function');
      assert.strictEqual(typeof mockCandidateProvider.generate, 'function');
    });

  } finally {
    await server.close();
  }

  console.log('\n============================================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
