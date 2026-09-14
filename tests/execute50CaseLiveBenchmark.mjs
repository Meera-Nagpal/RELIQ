/* ============================================================
   RELIQ V2.3 — 50-Case Live Multi-Provider Benchmark Executor
   
   Baseline: Google Gemini (gemini-3.6-flash)
   Candidate: Groq (openai/gpt-oss-20b)
   Dataset: 50 Real Scenarios (SEED_DATASET)
   Sequential execution (concurrency: 1) with 3.8s pacing
   ============================================================ */

import fs from 'fs';
import path from 'path';
import { createServer } from 'vite';

const storageMap = new Map();
globalThis.localStorage = {
  getItem: (key) => (storageMap.has(key) ? storageMap.get(key) : null),
  setItem: (key, val) => storageMap.set(key, String(val)),
  removeItem: (key) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};

async function run50CaseBenchmark() {
  console.log('\n============================================================');
  console.log('RELIQ V2.3 — 50-CASE LIVE BENCHMARK EXECUTION');
  console.log('Baseline: Google Gemini 3.6 Flash');
  console.log('Candidate: Groq GPT-OSS-20B');
  console.log('Dataset: Checkout Reliability Suite (50 Cases)');
  console.log('============================================================\n');

  const server = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });

  try {
    const { EvaluationRunner } = await server.ssrLoadModule('/src/evaluation/runner.ts');
    const { GoogleGeminiProvider } = await server.ssrLoadModule('/src/providers/geminiProvider.ts');
    const { GroqProvider } = await server.ssrLoadModule('/src/providers/groqProvider.ts');
    const { SEED_PROJECT, SEED_DATASET } = await server.ssrLoadModule('/src/data/seedData.ts');

    const geminiProvider = new GoogleGeminiProvider('http://localhost:5175/api/providers/gemini');
    const groqProvider = new GroqProvider('http://localhost:5175/api/providers/groq');

    const baselineVersion = {
      id: 'ver-gemini-35-flash-baseline',
      name: 'Google Gemini 3.5 Flash (Production Baseline)',
      provider: 'google',
      modelIdentifier: 'gemini-3.5-flash',
      promptVersion: 'prompts/checkout-agent-v1.4.md',
      systemPrompt:
        'You are an AI checkout assistant for an enterprise retailer. Strictly validate tool schemas, enforce the $500 supervisor escalation policy, sanitize all inputs, and format confirmations as valid JSON.',
      temperature: 0.1,
      isBaseline: true,
      createdAt: new Date().toISOString(),
    };

    const candidateVersion = {
      id: 'ver-groq-gpt-oss-20b',
      name: 'Groq GPT-OSS-20B (Candidate Release)',
      provider: 'groq',
      modelIdentifier: 'openai/gpt-oss-20b',
      promptVersion: 'prompts/checkout-agent-v1.5.md',
      systemPrompt:
        'You are a fast checkout assistant for an enterprise retailer. Assist with orders, calculate shipping, adhere strictly to policy instructions, and format JSON when requested.',
      temperature: 0.1,
      isBaseline: false,
      createdAt: new Date().toISOString(),
    };

    console.log(`[INIT] Loaded dataset with ${SEED_DATASET.cases.length} test cases.`);
    const runner = new EvaluationRunner();

    const runStartTime = Date.now();
    const liveRun = await runner.run({
      project: SEED_PROJECT,
      dataset: SEED_DATASET,
      baselineVersion,
      candidateVersion,
      baselineProvider: geminiProvider,
      candidateProvider: groqProvider,
      concurrency: 1,
      onProgress: (current, total, latestCaseName) => {
        const pct = Math.round((current / total) * 100);
        process.stdout.write(`\r[PROGRESS] ${current}/${total} (${pct}%) - ${latestCaseName || ''}           `);
      },
    });

    console.log('\n\n============================================================');
    console.log('LIVE 50-CASE BENCHMARK COMPLETE');
    console.log('============================================================');
    console.log(`Run ID: ${liveRun.id}`);
    console.log(`Total Duration: ${(liveRun.durationMs / 1000).toFixed(1)}s`);
    console.log(`Cases: ${liveRun.metrics.totalCases}`);
    console.log(`Baseline Evaluated: ${liveRun.metrics.baselineEvaluatedCases}/${liveRun.metrics.totalCases} (${liveRun.metrics.baselineEvaluationCoverage}%)`);
    console.log(`Candidate Evaluated: ${liveRun.metrics.candidateEvaluatedCases}/${liveRun.metrics.totalCases} (${liveRun.metrics.candidateEvaluationCoverage}%)`);
    console.log(`Baseline Pass Rate: ${liveRun.metrics.baselinePassRate}% (${liveRun.metrics.baselinePassed}/${liveRun.metrics.baselineEvaluatedCases})`);
    console.log(`Candidate Pass Rate: ${liveRun.metrics.candidatePassRate}% (${liveRun.metrics.candidatePassed}/${liveRun.metrics.candidateEvaluatedCases})`);
    console.log(`Accuracy Delta: ${liveRun.metrics.accuracyDelta}%`);
    console.log(`Quality Score Delta: ${liveRun.metrics.qualityScoreDelta}%`);
    console.log(`Baseline Latency (Mean): ${liveRun.metrics.baselineMeanSuccessfulLatencyMs}ms | Median: ${liveRun.metrics.baselineMedianLatencyMs}ms | P95: ${liveRun.metrics.baselineP95LatencyMs}ms`);
    console.log(`Candidate Latency (Mean): ${liveRun.metrics.candidateMeanSuccessfulLatencyMs}ms | Median: ${liveRun.metrics.candidateMedianLatencyMs}ms | P95: ${liveRun.metrics.candidateP95LatencyMs}ms`);
    console.log(`Latency Delta: ${liveRun.metrics.latencyDeltaPercent}%`);
    console.log(`Baseline Tokens: in=${liveRun.metrics.baselineTotalTokens} (reasoning=${liveRun.metrics.baselineReasoningTokens || 0})`);
    console.log(`Candidate Tokens: in=${liveRun.metrics.candidateTotalTokens} (reasoning=${liveRun.metrics.candidateReasoningTokens || 0})`);
    console.log(`Baseline Cost: $${liveRun.metrics.baselineEstimatedCost}`);
    console.log(`Candidate Cost: $${liveRun.metrics.candidateEstimatedCost}`);
    console.log(`Regressions: ${liveRun.metrics.regressedCasesCount} | Improvements: ${liveRun.metrics.improvedCasesCount}`);
    console.log(`Release Decision: ${liveRun.releaseDecision.status}`);
    console.log(`Release Reason: ${liveRun.releaseDecision.reason}`);
    console.log(`Evidence Strength: ${liveRun.metrics.evidenceStrength}`);

    // Persist to artifact scratch directory
    const scratchPath = 'C:\\Users\\Meera Nagpal\\.gemini\\antigravity\\brain\\c61b65ed-9785-4530-8829-420d04e9099d\\scratch\\live50CaseBenchmarkRunResult.json';
    fs.writeFileSync(scratchPath, JSON.stringify(liveRun, null, 2), 'utf8');
    console.log(`\n[PERSIST] Saved live run to: ${scratchPath}`);

    // Update realGroqBenchmarkRun.json
    const realGroqPath = path.resolve(process.cwd(), 'src/data/realGroqBenchmarkRun.json');
    fs.writeFileSync(realGroqPath, JSON.stringify(liveRun, null, 2), 'utf8');
    console.log(`[PERSIST] Updated application benchmark data at: ${realGroqPath}`);

  } finally {
    await server.close();
  }
}

run50CaseBenchmark().catch((err) => {
  console.error('\nBenchmark execution failed:', err);
  process.exit(1);
});
