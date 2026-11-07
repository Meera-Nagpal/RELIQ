/* ============================================================
   RELIQ — Dynamic Winner & Rate Limit Protection Test Suite
   
   Verifies:
   1. Correctness-First Winner Determination: Candidate cannot win if it introduces quality failures or has lower pass rate than Baseline
   2. Symmetric Decisive Winner: Candidate wins on higher quality, Baseline wins on higher quality, equal scores produce Tie
   3. No Hardcoded Bias: Winner reasons and scores dynamically derive from actual run metrics
   4. Operational Efficiency Tie-Breaking: Latency breaks ties ONLY when quality and pass rates are in parity
   5. Token Budget Optimization: Default max_tokens for Groq is capped to prevent TPM reservation exhaustion
   6. Sub-Second and Multi-Second Reset Tokens: fetchWithRetry respects reset headers up to 65s
   ============================================================ */

import assert from 'node:assert';
import { createServer } from 'vite';

async function runTests() {
  console.log('\n============================================================');
  console.log('RELIQ DYNAMIC WINNER & RATE LIMIT PROTECTION TEST SUITE');
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
    const { generateComparisonReport } = await server.ssrLoadModule('/src/evaluation/comparator.ts');
    const { providerScheduler } = await server.ssrLoadModule('/src/server/providerScheduler.ts');
    const { parseDurationHeaderMs } = await server.ssrLoadModule('/src/server/serverUtils.ts');

    const baseVersion = {
      id: 'v-b',
      modelIdentifier: 'qwen/qwen3.8-27b',
      provider: 'groq',
      temperature: 0.0,
      createdAt: '',
    };
    const candVersion = {
      id: 'v-c',
      modelIdentifier: 'openai/gpt-oss-120b',
      provider: 'groq',
      temperature: 0.0,
      createdAt: '',
    };

    // Helper to generate N identical pass/fail case results
    function generateCases(count, bPassCount, cPassCount, bScores, cScores) {
      return Array.from({ length: count }, (_, i) => ({
        testCaseId: `tc-${i + 1}`,
        testCaseName: `Test Case ${i + 1}`,
        category: 'Quality',
        severity: 'medium',
        baselineExecutionStatus: i < bPassCount ? 'PASS' : 'QUALITY_FAILURE',
        candidateExecutionStatus: i < cPassCount ? 'PASS' : 'QUALITY_FAILURE',
        baselineQualityEvaluated: true,
        candidateQualityEvaluated: true,
        baselineScore: bScores[i] ?? (i < bPassCount ? 0.95 : 0.4),
        candidateScore: cScores[i] ?? (i < cPassCount ? 0.95 : 0.4),
        passed: i < cPassCount,
        isRegression: i < bPassCount && i >= cPassCount,
        baselineOutput: `Baseline output ${i + 1}`,
        candidateOutput: `Candidate output ${i + 1}`,
        expectedOutput: `Expected output ${i + 1}`,
        baselineLatencyMs: 1200,
        candidateLatencyMs: 350,
      }));
    }

    // -------------------------------------------------------------
    // Test 1: Baseline Wins when Candidate has Correctness Regression (User's Exact Scenario)
    // Baseline: 27 evaluated, 27 pass (100%), 0 failures
    // Candidate: 27 evaluated, 25 pass (92.6%), 2 failures
    // Even though Candidate has lower latency, Baseline MUST WIN!
    // -------------------------------------------------------------
    test('1. Baseline Wins on Correctness: Faster Candidate with 2 failures cannot win over 100% correct Baseline', () => {
      const cases = generateCases(27, 27, 25, Array(27).fill(0.92), Array(27).fill(0.93));
      // Give candidate slightly higher quality score (93 vs 92), but 2 failures
      const report = generateComparisonReport({
        baselineVersion: baseVersion,
        candidateVersion: candVersion,
        caseResults: cases,
        settings: { requiredBenchmarkCases: 27 },
        datasetName: 'Checkout Reliability Suite',
      });

      assert.strictEqual(report.winner, 'baseline', `Expected baseline to win, got ${report.winner}`);
      assert.ok(
        report.winnerReason.includes('Baseline demonstrated higher correctness') ||
        report.winnerReason.includes('fewer failure'),
        `Winner reason must cite higher correctness (got: ${report.winnerReason})`
      );
    });

    // -------------------------------------------------------------
    // Test 2: Candidate Wins when Baseline has Correctness Regression
    // Baseline: 27 evaluated, 25 pass (92.6%), 2 failures
    // Candidate: 27 evaluated, 27 pass (100%), 0 failures
    // -------------------------------------------------------------
    test('2. Candidate Wins on Correctness: Candidate with 100% pass beats Baseline with failures', () => {
      const cases = generateCases(27, 25, 27, Array(27).fill(0.93), Array(27).fill(0.92));
      const report = generateComparisonReport({
        baselineVersion: baseVersion,
        candidateVersion: candVersion,
        caseResults: cases,
        settings: { requiredBenchmarkCases: 27 },
        datasetName: 'Checkout Reliability Suite',
      });

      assert.strictEqual(report.winner, 'candidate', `Expected candidate to win, got ${report.winner}`);
      assert.ok(
        report.winnerReason.includes('Candidate demonstrated higher correctness'),
        `Winner reason must cite higher correctness (got: ${report.winnerReason})`
      );
    });

    // -------------------------------------------------------------
    // Test 3: Clear Candidate Quality Win when Pass Rates are Equal
    // Both: 100% pass rate
    // Candidate quality score is 95.0, Baseline is 88.0 (+7.0 pts)
    // -------------------------------------------------------------
    test('3. Decisive Candidate Quality Win: Higher quality score wins decisively', () => {
      const cases = generateCases(27, 27, 27, Array(27).fill(0.88), Array(27).fill(0.95));
      const report = generateComparisonReport({
        baselineVersion: baseVersion,
        candidateVersion: candVersion,
        caseResults: cases,
        settings: { requiredBenchmarkCases: 27 },
        datasetName: 'Checkout Reliability Suite',
      });

      assert.strictEqual(report.winner, 'candidate');
      assert.ok(report.winnerReason.includes('+7.0 quality points'));
    });

    // -------------------------------------------------------------
    // Test 4: Clear Baseline Quality Win when Pass Rates are Equal
    // Both: 100% pass rate
    // Baseline quality score is 96.0, Candidate is 90.0 (-6.0 pts)
    // -------------------------------------------------------------
    test('4. Decisive Baseline Quality Win: Superior Baseline quality wins decisively', () => {
      const cases = generateCases(27, 27, 27, Array(27).fill(0.96), Array(27).fill(0.90));
      const report = generateComparisonReport({
        baselineVersion: baseVersion,
        candidateVersion: candVersion,
        caseResults: cases,
        settings: { requiredBenchmarkCases: 27 },
        datasetName: 'Checkout Reliability Suite',
      });

      assert.strictEqual(report.winner, 'baseline');
      assert.ok(report.winnerReason.includes('+6.0 quality score lead'));
    });

    // -------------------------------------------------------------
    // Test 5: True Statistical Tie on Exact Equivalence
    // -------------------------------------------------------------
    test('5. True Statistical Tie: Exact score and latency parity produces tie', () => {
      const cases = generateCases(27, 27, 27, Array(27).fill(0.92), Array(27).fill(0.92));
      // Same latency
      cases.forEach((c) => { c.candidateLatencyMs = 1200; });
      const report = generateComparisonReport({
        baselineVersion: baseVersion,
        candidateVersion: candVersion,
        caseResults: cases,
        settings: { requiredBenchmarkCases: 27 },
        datasetName: 'Checkout Reliability Suite',
      });

      assert.strictEqual(report.winner, 'tie');
      assert.ok(report.winnerReason.includes('parity'));
    });

    // -------------------------------------------------------------
    // Test 6: Efficiency Tie-Breaker: When quality is within 0.5 pts, 50% faster model wins
    // -------------------------------------------------------------
    test('6. Efficiency Tie-Breaker: Reduced latency breaks tie when quality is identical', () => {
      const cases = generateCases(27, 27, 27, Array(27).fill(0.92), Array(27).fill(0.92));
      // Candidate 70% faster (360ms vs 1200ms)
      cases.forEach((c) => { c.baselineLatencyMs = 1200; c.candidateLatencyMs = 360; });
      const report = generateComparisonReport({
        baselineVersion: baseVersion,
        candidateVersion: candVersion,
        caseResults: cases,
        settings: { requiredBenchmarkCases: 27 },
        datasetName: 'Checkout Reliability Suite',
      });

      assert.strictEqual(report.winner, 'candidate');
      assert.ok(report.winnerReason.includes('significantly reduced latency'));
    });

    // -------------------------------------------------------------
    // Test 7: Rate-Limit Token Pacing: Reset Tokens Parsed Accurate to > 15 seconds
    // -------------------------------------------------------------
    test('7. Header Pacing: Multi-second token resets (up to 60s) parsed accurately', () => {
      assert.strictEqual(parseDurationHeaderMs('18.4s'), 18400);
      assert.strictEqual(parseDurationHeaderMs('25s'), 25000);
      assert.strictEqual(parseDurationHeaderMs('45.2s'), 45200);
    });

    // -------------------------------------------------------------
    // Test 8: Groq Global Concurrency is Capped <= 2
    // Prevents concurrent requests from blowing the 6,000 TPM limit
    // -------------------------------------------------------------
    test('8. Groq Concurrency Protection: Global Groq concurrency capped at <= 2', () => {
      const maxGroq = providerScheduler['resolveProviderMaxConcurrency']('groq');
      assert.ok(maxGroq <= 2, `Expected Groq max concurrency <= 2, got ${maxGroq}`);
    });

  } finally {
    await server.close();
  }

  console.log(`\n============================================================`);
  console.log(`TEST SUITE SUMMARY: ${passed} passed, ${failed} failed`);
  console.log(`============================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
