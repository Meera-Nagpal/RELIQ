/* ============================================================
   RELIQ V2.3.2 — Gemini 3.5 Flash 10-Case Token-Budget Audit
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

async function run10CaseAudit() {
  console.log('\n============================================================');
  console.log('RELIQ V2.3.2 — GEMINI 3.5 FLASH 10-CASE TOKEN-BUDGET AUDIT');
  console.log('Model: gemini-3.5-flash | maxOutputTokens: 2048 | Cases: 10');
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
      id: 'ver-gemini-35-baseline',
      name: 'Google Gemini 3.5 Flash Baseline',
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
      id: 'ver-gemini-35-candidate',
      name: 'Google Gemini 3.5 Flash Candidate',
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
    const runResult = await runner.run({
      project: SEED_PROJECT,
      dataset: SEED_DATASET,
      baselineVersion,
      candidateVersion,
      baselineProvider: provider,
      candidateProvider: provider,
      maxCases: 10,
      concurrency: 1,
      onProgress: (current, total, latestCaseName) => {
        const pct = Math.round((current / total) * 100);
        process.stdout.write(`\r[PROGRESS] ${current}/${total} (${pct}%) - ${latestCaseName || ''}           `);
      },
    });

    console.log('\n\n============================================================');
    console.log('10-CASE AUDIT EXECUTION COMPLETE');
    console.log('============================================================');

    const detailedCases = [];
    let maxTokensCount = 0;
    let stopCount = 0;
    let otherFinishCount = 0;
    let totalThinkingTokens = 0;
    let totalCandidateTokens = 0;
    let maxThinkingTokens = 0;
    let maxCandidateTokens = 0;

    for (let i = 0; i < runResult.caseResults.length; i++) {
      const cr = runResult.caseResults[i];
      const rawResp = cr.candidateUsage?.rawResponse || {};
      const candidateObj = rawResp.candidates?.[0] || {};
      const finishReason = candidateObj.finishReason || (cr.candidateUsage?.error ? 'ERROR' : 'UNKNOWN');
      const usageMetadata = rawResp.usageMetadata || {};

      const inputTokens = usageMetadata.promptTokenCount ?? cr.candidateUsage?.inputTokens ?? 0;
      const candidateTokens = usageMetadata.candidatesTokenCount ?? cr.candidateUsage?.outputTokens ?? 0;
      const thoughtsTokens = usageMetadata.thoughtsTokenCount ?? cr.candidateUsage?.reasoningTokens ?? 0;
      const totalTokens = usageMetadata.totalTokenCount ?? cr.candidateUsage?.totalTokens ?? 0;
      const latencyMs = cr.candidateLatencyMs ?? 0;
      const isEligible = !cr.candidateUsage?.error;
      const isQualityEvaluated = Boolean(cr.candidateScore !== undefined && !cr.candidateUsage?.error);
      const isPassed = Boolean(cr.passed);

      if (finishReason === 'MAX_TOKENS') maxTokensCount++;
      else if (finishReason === 'STOP') stopCount++;
      else otherFinishCount++;

      totalThinkingTokens += thoughtsTokens;
      totalCandidateTokens += candidateTokens;
      if (thoughtsTokens > maxThinkingTokens) maxThinkingTokens = thoughtsTokens;
      if (candidateTokens > maxCandidateTokens) maxCandidateTokens = candidateTokens;

      const record = {
        index: i + 1,
        testCaseId: cr.testCaseId,
        testCaseName: cr.testCaseName,
        category: cr.category,
        finishReason,
        inputTokens,
        candidateTokens,
        thoughtsTokens,
        totalTokens,
        sumTokens: thoughtsTokens + candidateTokens,
        latencyMs,
        evaluationEligible: isEligible,
        qualityEvaluated: isQualityEvaluated,
        passed: isPassed,
        score: cr.candidateScore,
        failureReason: cr.failureReason || null,
        outputSnippet: (cr.candidateOutput || '').slice(0, 120).replace(/\n/g, ' '),
      };
      detailedCases.push(record);
    }

    const n = detailedCases.length;
    const maxTokensPct = ((maxTokensCount / n) * 100).toFixed(1);
    const stopPct = ((stopCount / n) * 100).toFixed(1);
    const avgThinking = Math.round(totalThinkingTokens / n);
    const avgCandidate = Math.round(totalCandidateTokens / n);

    console.log('\n--- PER-CASE AUDIT TABLE ---');
    console.table(detailedCases.map(c => ({
      Case: `${c.index}. ${c.testCaseId}`,
      Finish: c.finishReason,
      In: c.inputTokens,
      Out: c.candidateTokens,
      Thinking: c.thoughtsTokens,
      'Out+Think': c.sumTokens,
      Total: c.totalTokens,
      Latency: `${c.latencyMs}ms`,
      Eligible: c.evaluationEligible ? 'YES' : 'NO',
      QualityEval: c.qualityEvaluated ? 'YES' : 'NO',
      Passed: c.passed ? 'PASS' : 'FAIL',
    })));

    console.log('\n--- TOKEN BUDGET STATISTICAL SUMMARY ---');
    console.log(`Total Cases Evaluated: ${n}`);
    console.log(`Finish Reason STOP: ${stopCount} / ${n} (${stopPct}%)`);
    console.log(`Finish Reason MAX_TOKENS: ${maxTokensCount} / ${n} (${maxTokensPct}%)`);
    console.log(`Other Finish Reason: ${otherFinishCount} / ${n}`);
    console.log(`Average Thinking Tokens: ${avgThinking}`);
    console.log(`Average Candidate/Output Tokens: ${avgCandidate}`);
    console.log(`Max Thinking Tokens: ${maxThinkingTokens}`);
    console.log(`Max Candidate/Output Tokens: ${maxCandidateTokens}`);
    console.log(`Max Combined (Thinking + Candidate): ${Math.max(...detailedCases.map(c => c.sumTokens))}`);

    const auditData = {
      timestamp: new Date().toISOString(),
      model: 'gemini-3.5-flash',
      configuredMaxOutputTokens: 2048,
      totalCases: n,
      summary: {
        maxTokensCount,
        maxTokensPct: parseFloat(maxTokensPct),
        stopCount,
        stopPct: parseFloat(stopPct),
        avgThinking,
        avgCandidate,
        maxThinkingTokens,
        maxCandidateTokens,
        maxCombined: Math.max(...detailedCases.map(c => c.sumTokens)),
      },
      cases: detailedCases,
    };

    const outPath = path.resolve(process.cwd(), 'scratch', 'gemini35_10case_token_audit.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(auditData, null, 2));
    console.log(`\nSaved audit records to: ${outPath}`);

    return auditData;
  } finally {
    await server.close();
  }
}

run10CaseAudit().catch(err => {
  console.error('Audit execution failed:', err);
  process.exit(1);
});
