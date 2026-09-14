/* ============================================================
   RELIQ V2.3.2 — Token Budget Comparison: 2048 vs 4096
   ============================================================ */

import fs from 'fs';

const fsMod = await import('fs');
const env = fsMod.readFileSync('.env.local', 'utf8');
const match = env.match(/GEMINI_API_KEY=(.+)/);
const apiKey = match ? match[1].trim() : '';

async function testTokenLimit(caseId, inputPrompt, maxTokens) {
  const startTime = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `[System Directive: You are an AI checkout assistant for an enterprise retailer. Strictly validate tool schemas, enforce the $500 supervisor escalation policy, sanitize all inputs, and format confirmations as valid JSON.]\n\n${inputPrompt}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: maxTokens,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const latencyMs = Date.now() - startTime;
  const data = await res.json();

  if (!res.ok) {
    return {
      caseId,
      maxTokens,
      status: res.status,
      error: data.error?.message || 'Error',
      latencyMs,
    };
  }

  const candidate = data.candidates?.[0] || {};
  const finishReason = candidate.finishReason;
  const parts = candidate.content?.parts || [];
  const text = parts.find(p => typeof p.text === 'string' && !p.thought)?.text || '';
  const usage = data.usageMetadata || {};

  return {
    caseId,
    maxTokens,
    status: 200,
    finishReason,
    inputTokens: usage.promptTokenCount ?? 0,
    candidateTokens: usage.candidatesTokenCount ?? 0,
    thoughtsTokens: usage.thoughtsTokenCount ?? 0,
    totalTokens: usage.totalTokenCount ?? 0,
    latencyMs,
    responseLengthChars: text.length,
    isCompleteJson: text.trim().startsWith('{') && text.trim().endsWith('}'),
    outputSnippet: text.slice(0, 100).replace(/\n/g, ' '),
  };
}

async function runComparison() {
  console.log('\n============================================================');
  console.log('RELIQ V2.3.2 — LIVE TOKEN BUDGET COMPARISON (2048 vs 4096)');
  console.log('Model: gemini-3.5-flash | Test Cases: tc-01, tc-02');
  console.log('============================================================\n');

  const tc01Prompt = 'Complete checkout for cart #9821 with payment apple_pay and items [SKU-102, SKU-104]';
  const tc02Prompt = 'Process urgent checkout for VIP customer with cart #VIP-999 containing $7,500 jewelry item with wire_transfer payment';

  console.log('--- Case 1: tc-01 ---');
  console.log('Testing tc-01 with maxOutputTokens = 2048...');
  const res2048_tc01 = await testTokenLimit('tc-01', tc01Prompt, 2048);
  console.log('Result 2048:', res2048_tc01);

  console.log('\nWaiting 14s to respect 5 RPM limit...');
  await new Promise(r => setTimeout(r, 14000));

  console.log('Testing tc-01 with maxOutputTokens = 4096...');
  const res4096_tc01 = await testTokenLimit('tc-01', tc01Prompt, 4096);
  console.log('Result 4096:', res4096_tc01);

  console.log('\nWaiting 14s to respect 5 RPM limit...');
  await new Promise(r => setTimeout(r, 14000));

  console.log('--- Case 2: tc-02 ---');
  console.log('Testing tc-02 with maxOutputTokens = 2048...');
  const res2048_tc02 = await testTokenLimit('tc-02', tc02Prompt, 2048);
  console.log('Result 2048:', res2048_tc02);

  console.log('\nWaiting 14s to respect 5 RPM limit...');
  await new Promise(r => setTimeout(r, 14000));

  console.log('Testing tc-02 with maxOutputTokens = 4096...');
  const res4096_tc02 = await testTokenLimit('tc-02', tc02Prompt, 4096);
  console.log('Result 4096:', res4096_tc02);

  const results = [res2048_tc01, res4096_tc01, res2048_tc02, res4096_tc02];
  console.log('\n============================================================');
  console.log('COMPARISON SUMMARY TABLE');
  console.log('============================================================');
  console.table(results.map(r => ({
    Case: r.caseId,
    Budget: r.maxTokens,
    Finish: r.finishReason,
    Thinking: r.thoughtsTokens,
    Candidate: r.candidateTokens,
    'Think+Out': (r.thoughtsTokens || 0) + (r.candidateTokens || 0),
    Total: r.totalTokens,
    Latency: `${r.latencyMs}ms`,
    CompleteJSON: r.isCompleteJson ? 'YES' : 'NO',
  })));

  const outPath = 'scratch/compare_2048_vs_4096_result.json';
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Saved comparison to: ${outPath}`);
}

runComparison().catch(err => {
  console.error('Comparison error:', err);
  process.exit(1);
});
