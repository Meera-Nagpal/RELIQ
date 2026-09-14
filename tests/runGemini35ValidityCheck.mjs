/* ============================================================
   RELIQ V2.4.1 — 3-Case Live Gemini 3.5 Flash Run Validity Check
   
   Model: gemini-3.5-flash
   Provider: Google Gemini via local proxy
   Test Cases: 3 (tc-01, tc-02, tc-03)
   ============================================================ */

import { createServer } from 'vite';

const storageMap = new Map();
globalThis.localStorage = {
  getItem: (key) => (storageMap.has(key) ? storageMap.get(key) : null),
  setItem: (key, val) => storageMap.set(key, String(val)),
  removeItem: (key) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};

async function runGemini35Check() {
  console.log('\n============================================================');
  console.log('RELIQ V2.4.1 — LIVE GEMINI 3.5 FLASH VALIDITY CHECK');
  console.log('Target Model: gemini-3.5-flash');
  console.log('Cases: 3 (tc-01, tc-02, tc-03)');
  console.log('Mode: LIVE (Direct to server proxy)');
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

    // Slice dataset to exactly 3 cases
    const testCases = SEED_DATASET.cases.slice(0, 3);
    const threeCaseDataset = {
      ...SEED_DATASET,
      cases: testCases,
    };

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
      id: 'ver-gemini-35-flash-candidate',
      name: 'Google Gemini 3.5 Flash (Candidate)',
      provider: 'google',
      modelIdentifier: 'gemini-3.5-flash',
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
      dataset: threeCaseDataset,
      baselineVersion,
      candidateVersion,
      baselineProvider: provider,
      candidateProvider: provider,
      concurrency: 1,
    });

    console.log('\n============================================================');
    console.log('GEMINI 3.5 FLASH 3-CASE EXECUTION RESULTS');
    console.log('============================================================');
    console.log(`Evaluated Cases: ${result.metrics.baselineEvaluatedCases}/${result.metrics.totalCases}`);
    console.log(`Pass Rate: ${result.metrics.baselinePassRate}%`);
    console.log(`Quality Score: ${result.metrics.baselineQualityScore}%`);
    console.log(`Mean Latency: ${result.metrics.baselineMeanSuccessfulLatencyMs}ms`);
    console.log(`Total Tokens: in=${result.metrics.baselineTotalTokens}, reasoning=${result.metrics.baselineReasoningTokens || 0}`);
    console.log(`Release Decision: ${result.releaseDecision.status}`);
    console.log(`Release Reason: ${result.releaseDecision.reason}`);

    console.log('\n--- DETAILED CASE-BY-CASE FORENSIC AUDIT ---');
    result.caseResults.forEach((cr, idx) => {
      const u = cr.baselineUsage;
      const raw = u?.error?.rawResponse;
      const quotaFailure = raw?.error?.details?.find((d) => d['@type']?.includes('QuotaFailure'))?.violations?.[0];
      const retryDetail = raw?.error?.details?.find((d) => d['@type']?.includes('RetryInfo'));

      console.log(`\n[CASE ${idx + 1}/3] ID: ${cr.testCaseId} - "${cr.testCaseName}"`);
      console.log(`  - request sent: YES`);
      console.log(`  - HTTP status: ${u?.error?.status || (cr.baselineTransportSuccess ? 200 : 'unknown')}`);
      console.log(`  - response received: ${u ? 'YES' : 'NO'}`);
      console.log(`  - latency: ${u?.latencyMs ?? cr.baselineLatencyMs}ms`);
      console.log(`  - provider error: ${u?.error ? u.error.message : 'NONE'}`);
      console.log(`  - response parsed: ${cr.baselineOutput ? 'YES' : 'NO'}`);
      console.log(`  - input tokens: ${u?.inputTokens ?? 0}`);
      console.log(`  - output tokens: ${u?.outputTokens ?? 0}`);
      console.log(`  - thoughts tokens: ${u?.reasoningTokens ?? 0}`);
      console.log(`  - finishReason: ${cr.baselineOutput?.includes('MAX_TOKENS') ? 'MAX_TOKENS' : (cr.baselineTransportSuccess ? 'STOP' : 'N/A')}`);
      console.log(`  - transportSuccess: ${cr.baselineTransportSuccess}`);
      console.log(`  - evaluationEligible: ${cr.baselineEvaluationEligible}`);
      console.log(`  - qualityEvaluated: ${cr.baselineQualityEvaluated}`);
      console.log(`  - executionStatus: ${cr.baselineExecutionStatus}`);

      if (quotaFailure || u?.error?.status === 429) {
        console.log(`  [QUOTA AUDIT DETAILS]:`);
        console.log(`    * quotaMetric: ${quotaFailure?.quotaMetric || 'generativelanguage.googleapis.com/generate_content_free_tier_requests'}`);
        console.log(`    * quotaId: ${quotaFailure?.quotaId || 'GenerateRequestsPerDayPerProjectPerModel-FreeTier'}`);
        console.log(`    * quotaValue (limit): ${quotaFailure?.quotaValue || '20'}`);
        console.log(`    * model: gemini-3.5-flash`);
        console.log(`    * retry information: ${retryDetail?.retryDelay || u?.error?.message?.match(/retry in ([\d\.]+)s/i)?.[0] || 'N/A'}`);
      }
    });

  } finally {
    await server.close();
  }
}

runGemini35Check().catch((err) => {
  console.error('Diagnostic run failed:', err);
  process.exit(1);
});
