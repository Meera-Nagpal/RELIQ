import assert from 'assert';
import { createServer } from 'vite';

async function runTests() {
  console.log('--- Running Security, Pagination, Judge & SHA-256 Tests ---');
  process.env.RELIQ_DB_DRIVER = 'sqlite';

  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });

  try {
    const {
      modelsMatch,
      normalizeModelName,
      validateJudgeConfiguration,
      getEligibleJudgeModels,
    } = await vite.ssrLoadModule('/src/evaluation/judgeRegistry.ts');

    const { computeDatasetContentHash } = await vite.ssrLoadModule('/src/data/datasetImporter.ts');
    const { evaluationDbService } = await vite.ssrLoadModule('/src/server/services/evaluationDbService.ts');
    const { ApiClient } = await vite.ssrLoadModule('/src/services/apiClient.ts');

    // ─────────────────────────────────────────────────────────────
    // 1. Model Matching & Self-Judging Prevention
    // ─────────────────────────────────────────────────────────────
    console.log('\n[1] Model Matching & Self-Judging Prevention');

    assert.strictEqual(normalizeModelName('groq/openai/gpt-oss-20b'), 'gpt-oss-20b');
    assert.strictEqual(normalizeModelName('openai/gpt-oss-20b'), 'gpt-oss-20b');
    assert.strictEqual(normalizeModelName('gpt-oss-20b'), 'gpt-oss-20b');
    assert.strictEqual(normalizeModelName('cerebras/gpt-oss-120b'), 'gpt-oss-120b');
    assert.strictEqual(normalizeModelName('qwen/qwen3.8-27b'), 'qwen3.8-27b');
    console.log('  ✓ normalizeModelName correctly strips known provider prefixes');

    assert.strictEqual(modelsMatch('openai/gpt-oss-20b', 'gpt-oss-20b'), true);
    assert.strictEqual(modelsMatch('groq/openai/gpt-oss-20b', 'openai/gpt-oss-20b'), true);
    assert.strictEqual(modelsMatch('qwen/qwen3.8-27b', 'qwen3.8-27b'), true);
    assert.strictEqual(modelsMatch('qwen/qwen3.8-27b', 'openai/gpt-oss-20b'), false);
    console.log('  ✓ modelsMatch correctly detects model equivalence across format variants');

    const resBaseline = validateJudgeConfiguration(
      { enabled: true, provider: 'groq', modelIdentifier: 'openai/gpt-oss-20b' },
      'gpt-oss-20b',
      'qwen/qwen3.8-27b'
    );
    assert.strictEqual(resBaseline.valid, false);
    assert.match(resBaseline.error, /Self-judging detected/i);

    const resCandidate = validateJudgeConfiguration(
      { enabled: true, provider: 'groq', modelIdentifier: 'qwen/qwen3.8-27b' },
      'openai/gpt-oss-20b',
      'qwen3.8-27b'
    );
    assert.strictEqual(resCandidate.valid, false);
    assert.match(resCandidate.error, /Self-judging detected/i);

    const resValid = validateJudgeConfiguration(
      { enabled: true, provider: 'groq', modelIdentifier: 'qwen/qwen3.8-27b' },
      'openai/gpt-oss-20b',
      'openai/gpt-oss-120b'
    );
    assert.strictEqual(resValid.valid, true);
    console.log('  ✓ validateJudgeConfiguration enforces self-judging prevention across formats');

    const eligible = getEligibleJudgeModels('openai/gpt-oss-20b', 'qwen/qwen3.8-27b');
    assert.strictEqual(eligible.some((m) => modelsMatch(m.id, 'gpt-oss-20b')), false);
    assert.strictEqual(eligible.some((m) => modelsMatch(m.id, 'qwen3.8-27b')), false);
    assert.strictEqual(eligible.some((m) => m.id.includes('120b')), false);
    console.log('  ✓ getEligibleJudgeModels excludes baseline, candidate, and 120B models');

    // ─────────────────────────────────────────────────────────────
    // 2. Full SHA-256 Dataset Hashing & Provenance
    // ─────────────────────────────────────────────────────────────
    console.log('\n[2] Full SHA-256 Dataset Hashing & Provenance');

    const sample = '{"id":"tc-1","input":"hello world"}';
    const hash = computeDatasetContentHash(sample);
    assert.strictEqual(typeof hash, 'string');
    assert.strictEqual(hash.length, 64, 'Must be a 64-character hexadecimal SHA-256 string');
    assert.match(hash, /^[a-f0-9]{64}$/i, 'Must contain only hexadecimal characters');

    // Standard SHA-256 test vectors:
    const emptyHash = computeDatasetContentHash('');
    assert.strictEqual(emptyHash, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

    const abcHash = computeDatasetContentHash('abc');
    assert.strictEqual(abcHash, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    console.log('  ✓ computeDatasetContentHash produces standard 64-char hex digests matching FIPS 180-4 vectors');

    // ─────────────────────────────────────────────────────────────
    // 3. Run-Detail Payload Optimization & Pagination
    // ─────────────────────────────────────────────────────────────
    console.log('\n[3] Run-Detail Payload Optimization & Pagination');

    // Test getEvaluationRuns strips caseResults for compact list payloads
    const runsList = evaluationDbService.getEvaluationRuns();
    assert.ok(Array.isArray(runsList), 'Should return array of runs');
    if (runsList.length > 0) {
      assert.deepStrictEqual(runsList[0].caseResults, [], 'List endpoint runs must omit caseResults to prevent multi-megabyte payloads');
      console.log(`  ✓ getEvaluationRuns returned ${runsList.length} runs with stripped caseResults for compact transmission`);
    }

    // ─────────────────────────────────────────────────────────────
    // 4. Frontend ApiClient Retry Handling
    // ─────────────────────────────────────────────────────────────
    console.log('\n[4] Frontend ApiClient Retry Handling');

    let callCount = 0;
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ error: 'Service Unavailable' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const client = new ApiClient();
      const res = await client.get('/api/test-transient');
      assert.strictEqual(callCount, 2, 'Should have retried once after 503');
      assert.strictEqual(res.success, true);
      console.log('  ✓ ApiClient successfully retried and recovered after transient 503 error');
    } finally {
      globalThis.fetch = originalFetch;
    }

    console.log('\nALL SECURITY, PAGINATION, JUDGE & SHA-256 TESTS PASSED!');
  } finally {
    await vite.close();
  }
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
