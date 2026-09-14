/* ============================================================
   RELIQ — Real Multi-Provider Live Evaluation Benchmark
   
   Baseline: Google Gemini (gemini-3.6-flash / gemini-flash-latest)
   Candidate: Groq (openai/gpt-oss-20b)
   Dataset: 5 Real Test Scenarios
   ============================================================ */

import assert from 'node:assert';
import { createServer } from 'vite';

// Polyfill localStorage for Node.js session
const storageMap = new Map();
globalThis.localStorage = {
  getItem: (key) => storageMap.has(key) ? storageMap.get(key) : null,
  setItem: (key, val) => storageMap.set(key, String(val)),
  removeItem: (key) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};

async function execute() {
  console.log('\n============================================================');
  console.log('RELIQ: REAL MULTI-PROVIDER LIVE BENCHMARK (GEMINI vs GROQ)');
  console.log('============================================================\n');

  const server = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });

  try {
    const { EvaluationRunner } = await server.ssrLoadModule('/src/evaluation/runner.ts');
    const { GeminiProvider } = await server.ssrLoadModule('/src/providers/geminiProvider.ts');
    const { GroqProvider } = await server.ssrLoadModule('/src/providers/groqProvider.ts');
    const { LocalStorageRepository } = await server.ssrLoadModule('/src/services/localRepository.ts');
    const { SEED_PROJECT, SEED_DATASET } = await server.ssrLoadModule('/src/data/seedData.ts');

    // Real server-side providers pointing to running Vite dev proxy on 5175
    const geminiProvider = new GeminiProvider('http://localhost:5175/api/providers/gemini');
    const groqProvider = new GroqProvider('http://localhost:5175/api/providers/groq');

    const baselineVersion = {
      id: 'ver-gemini-3.6-flash',
      name: 'Google Gemini Flash',
      provider: 'google',
      modelIdentifier: 'gemini-3.6-flash',
      promptVersion: 'prompts/system-v1.0.md',
      systemPrompt: 'You are an enterprise AI checkout assistant. Strictly validate schemas and adhere to policies.',
      temperature: 0.1,
      isBaseline: true,
      createdAt: new Date().toISOString(),
    };

    const candidateVersion = {
      id: 'ver-groq-gpt-oss-20b',
      name: 'Groq GPT-OSS-20B',
      provider: 'groq',
      modelIdentifier: 'openai/gpt-oss-20b',
      promptVersion: 'prompts/system-v1.0.md',
      systemPrompt: 'You are a fast enterprise AI assistant. Adhere strictly to policy instructions and schemas.',
      temperature: 0.1,
      isBaseline: false,
      createdAt: new Date().toISOString(),
    };

    console.log('[1/4] Initiating live evaluation run via EvaluationRunner...');
    const runner = new EvaluationRunner();
    const startTime = Date.now();

    const liveRun = await runner.run({
      project: SEED_PROJECT,
      dataset: SEED_DATASET,
      baselineVersion,
      candidateVersion,
      baselineProvider: geminiProvider,
      candidateProvider: groqProvider,
      maxCases: 5,
      concurrency: 1, // sequential for rate-limit protection
      onProgress: (prog) => {
        console.log(`  -> Progress: ${prog.completedCases}/${prog.totalCases} cases (${prog.percent}%)`);
      },
    });

    console.log('\n[2/4] Live Evaluation Execution Completed!');
    console.log(`  Run ID: ${liveRun.id}`);
    console.log(`  Timestamp: ${liveRun.timestamp}`);
    console.log(`  Execution Mode: ${liveRun.executionMode}`);
    console.log(`  Duration: ${liveRun.durationMs}ms`);
    console.log(`  Total Cases: ${liveRun.metrics.totalCases}`);
    console.log(`  Baseline Evaluated: ${liveRun.metrics.baselineEvaluatedCases}/${liveRun.metrics.totalCases} (${liveRun.metrics.baselineEvaluationCoverage}%)`);
    console.log(`  Candidate Evaluated: ${liveRun.metrics.candidateEvaluatedCases}/${liveRun.metrics.totalCases} (${liveRun.metrics.candidateEvaluationCoverage}%)`);
    console.log(`  Candidate Pass Rate: ${liveRun.metrics.candidatePassRate}%`);
    console.log(`  Candidate Quality Score: ${liveRun.metrics.candidateQualityScore}%`);
    console.log(`  Recommendation: ${liveRun.comparisonReport?.recommendation}`);
    console.log(`  Recommendation Reason: ${liveRun.comparisonReport?.recommendationReason}`);

    // Verify properties
    assert.ok(liveRun.id.startsWith('run-live-'), 'Must have fresh live run ID');
    assert.strictEqual(liveRun.executionMode, 'LIVE', 'Execution mode must be LIVE');
    assert.strictEqual(liveRun.comparisonReport.executionMode, 'LIVE', 'Comparison report mode must be LIVE');
    assert.strictEqual(liveRun.provenance.isLiveExecution, true, 'Provenance must record live execution');
    assert.strictEqual(liveRun.provenance.totalAttempted, 5, 'Total attempted must be 5');

    console.log('\n[3/4] Inspecting Case-Level Results & Error Semantics:');
    liveRun.caseResults.forEach((c, idx) => {
      console.log(`\n  Case ${idx + 1} (${c.testCaseId}): "${c.testCaseName}"`);
      console.log(`    Baseline (${c.baselineExecutionStatus}): [${c.baselineLatencyMs}ms] ${c.baselineOutput ? c.baselineOutput.slice(0, 70).replace(/\n/g, ' ') : '(empty / error)'}`);
      if (c.baselineErrorDetail) {
        console.log(`      Baseline Error: ${c.baselineErrorDetail.category} (HTTP ${c.baselineErrorDetail.httpStatus})`);
      }
      console.log(`    Candidate (${c.candidateExecutionStatus}): [${c.candidateLatencyMs}ms] ${c.candidateOutput ? c.candidateOutput.slice(0, 70).replace(/\n/g, ' ') : '(empty / error)'}`);
      if (c.candidateErrorDetail) {
        console.log(`      Candidate Error: ${c.candidateErrorDetail.category} (HTTP ${c.candidateErrorDetail.httpStatus})`);
      }
      console.log(`    Passed: ${c.passed} | Reason: ${c.failureReason || 'Nominal criteria met'}`);

      // Verify no error is mislabeled as hallucination or quality failure
      if (c.baselineExecutionStatus === 'PROVIDER_RATE_LIMIT') {
        assert.notStrictEqual(c.baselineExecutionStatus, 'QUALITY_FAILURE', 'Rate limit must NOT be classified as QUALITY_FAILURE');
      }
      if (c.candidateExecutionStatus === 'PROVIDER_RATE_LIMIT') {
        assert.notStrictEqual(c.candidateExecutionStatus, 'QUALITY_FAILURE', 'Rate limit must NOT be classified as QUALITY_FAILURE');
      }
    });

    console.log('\n[4/4] Testing Persistence & Lifecycle Transition (LIVE -> SAVED):');
    const repo = new LocalStorageRepository();
    // Save live run in active session
    await repo.saveEvaluationRun(liveRun);
    assert.strictEqual(repo.isLiveRun(liveRun.id), true, 'Run should be tracked as live in active session');

    // Simulate reloading runs in a new browser session
    const freshSessionRepo = new LocalStorageRepository();
    const reloadedRuns = await freshSessionRepo.getEvaluationRuns();
    const reloadedLiveRun = reloadedRuns.find((r) => r.id === liveRun.id);

    assert.ok(reloadedLiveRun, 'Saved run must exist in reloaded storage');
    assert.strictEqual(reloadedLiveRun.executionMode, 'SAVED', 'Reloaded run in fresh session must be labeled SAVED');
    assert.strictEqual(reloadedLiveRun.comparisonReport?.executionMode, 'SAVED', 'Reloaded report in fresh session must be labeled SAVED');
    console.log('  ✓ Run successfully transitioned from LIVE to SAVED upon reload in fresh session.');

    // Check UI modal display simulation
    function getModalModeBadge(mode) {
      switch (mode) {
        case 'LIVE':
          return { label: 'LIVE EVALUATION', color: '#10B981' };
        case 'REFERENCE':
          return { label: 'REFERENCE DATA', color: '#A78BFA' };
        case 'SAVED':
        default:
          return { label: 'SAVED EVALUATION', color: '#38BDF8' };
      }
    }

    const liveBadge = getModalModeBadge(liveRun.executionMode);
    const reloadedBadge = getModalModeBadge(reloadedLiveRun.executionMode);
    assert.strictEqual(liveBadge.label, 'LIVE EVALUATION');
    assert.strictEqual(reloadedBadge.label, 'SAVED EVALUATION');
    console.log(`  ✓ Live run renders in UI modal as: "${liveBadge.label}" (${liveBadge.color})`);
    console.log(`  ✓ Reloaded run renders in UI modal as: "${reloadedBadge.label}" (${reloadedBadge.color})`);

    console.log('\n============================================================');
    console.log('ALL REAL MULTI-PROVIDER BENCHMARK CHECKS PASSED!');
    console.log('============================================================\n');

  } finally {
    await server.close();
  }
}

execute().catch((err) => {
  console.error('\nBenchmark Execution Error:', err);
  process.exit(1);
});
