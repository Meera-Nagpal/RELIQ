/* ============================================================
   RELIQ V2.3.1 — Gemini Live Forensic Debug Executor
   
   Executes 3 real test cases using real live Google Gemini endpoints.
   No mock data, no saved JSON, no fallback.
   Captures exact HTTP status, quota details, latency, and tokens.
   ============================================================ */

import { createServer } from 'vite';

const storageMap = new Map();
globalThis.localStorage = {
  getItem: (key) => (storageMap.has(key) ? storageMap.get(key) : null),
  setItem: (key, val) => storageMap.set(key, String(val)),
  removeItem: (key) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};

async function executeGeminiTest(modelIdentifier, label) {
  console.log('\n============================================================');
  console.log(`RELIQ V2.3.1 — LIVE GEMINI TEST (${label}: ${modelIdentifier})`);
  console.log('Mode: LIVE | Cases: 3 | Concurrency: 1');
  console.log('============================================================\n');

  const server = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });

  try {
    const { EvaluationRunner } = await server.ssrLoadModule('/src/evaluation/runner.ts');
    const { GoogleGeminiProvider } = await server.ssrLoadModule('/src/providers/geminiProvider.ts');
    const { SEED_PROJECT, SEED_DATASET } = await server.ssrLoadModule('/src/data/seedData.ts');

    const provider = new GoogleGeminiProvider('http://localhost:5175/api/providers/gemini');

    const baselineVersion = {
      id: `ver-${modelIdentifier}-baseline`,
      name: `Google Gemini (${modelIdentifier}) Baseline`,
      provider: 'google',
      modelIdentifier,
      promptVersion: 'prompts/checkout-agent-v1.4.md',
      systemPrompt:
        'You are an AI checkout assistant for an enterprise retailer. Strictly validate tool schemas, enforce the $500 supervisor escalation policy, sanitize all inputs, and format confirmations as valid JSON.',
      temperature: 0.1,
      isBaseline: true,
      createdAt: new Date().toISOString(),
    };

    const candidateVersion = {
      id: `ver-${modelIdentifier}-candidate`,
      name: `Google Gemini (${modelIdentifier}) Candidate`,
      provider: 'google',
      modelIdentifier,
      promptVersion: 'prompts/checkout-agent-v1.4.md',
      systemPrompt:
        'You are an AI checkout assistant for an enterprise retailer. Strictly validate tool schemas, enforce the $500 supervisor escalation policy, sanitize all inputs, and format confirmations as valid JSON.',
      temperature: 0.1,
      isBaseline: false,
      createdAt: new Date().toISOString(),
    };

    const runner = new EvaluationRunner();
    const result = await runner.run({
      project: SEED_PROJECT,
      dataset: SEED_DATASET,
      baselineVersion,
      candidateVersion,
      baselineProvider: provider,
      candidateProvider: provider,
      maxCases: 3,
      concurrency: 1,
    });

    console.log('\n============================================================');
    console.log(`GEMINI LIVE TEST RESULT FOR: ${modelIdentifier}`);
    console.log('============================================================');
    console.log(`Run ID: ${result.id}`);
    console.log(`Total Cases: ${result.metrics.totalCases}`);
    console.log(`Evaluated: ${result.metrics.candidateEvaluatedCases}/${result.metrics.totalCases}`);
    console.log(`Passed: ${result.metrics.candidatePassed}`);
    console.log(`Pass Rate: ${result.metrics.candidatePassRate}%`);
    console.log(`Mean Latency: ${result.metrics.candidateMeanSuccessfulLatencyMs}ms`);
    console.log(`Median Latency: ${result.metrics.candidateMedianLatencyMs}ms`);
    console.log(`Total Tokens: ${result.metrics.candidateTotalTokens}`);
    console.log(`Reasoning Tokens: ${result.metrics.candidateReasoningTokens}`);
    console.log(`Reliability Rate: ${result.metrics.candidateReliability.reliabilityRate}%`);
    console.log(`Rate Limited Count: ${result.metrics.candidateReliability.rateLimitedCount}`);
    console.log(`Evidence Strength: ${result.metrics.evidenceStrength}`);

    console.log('\nPer-Case Breakdown:');
    result.caseResults.forEach((cr, i) => {
      console.log(`Case ${i + 1} (${cr.testCaseId}):`);
      console.log(`  Candidate Status: ${cr.passed ? 'PASS' : (cr.candidateUsage?.error ? 'OPERATIONAL_ERROR' : 'QUALITY_FAILURE')}`);
      console.log(`  HTTP Status: ${cr.candidateUsage?.error?.status ?? 200}`);
      console.log(`  Error Message: ${cr.candidateUsage?.error?.message ?? 'None'}`);
      console.log(`  Latency: ${cr.candidateLatencyMs}ms`);
      console.log(`  Input Tokens: ${cr.candidateUsage?.inputTokens ?? 0}`);
      console.log(`  Output Tokens: ${cr.candidateUsage?.outputTokens ?? 0}`);
      console.log(`  Reasoning Tokens: ${cr.candidateUsage?.reasoningTokens ?? 0}`);
    });

    return result;
  } finally {
    await server.close();
  }
}

async function main() {
  // Test 1: gemini-3.6-flash (The model used in benchmark)
  console.log('\n>>> PHASE 1: Testing gemini-3.6-flash (Configured Benchmark Model) <<<');
  await executeGeminiTest('gemini-3.6-flash', 'Configured Benchmark Model');

  // Test 2: gemini-3.5-flash (Available Gemini Model with active quota)
  console.log('\n>>> PHASE 2: Testing gemini-3.5-flash (Quota-Active Model) <<<');
  await executeGeminiTest('gemini-3.5-flash', 'Quota-Active Flash Model');
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
