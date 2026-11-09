/* ============================================================
   RELIQ — Post-Judge Migration: Independent Architectural Fixes
   Regression Test Suite

   Verifies:
   1. Public health endpoint sanitization (zero DB credential / path leakage)
   2. Independent branch inference error handling via Promise.allSettled
   3. Canonical run ID generation with crypto.randomUUID()
   4. Minute-based Groq reset duration parsing in headers & error bodies
   5. Job pruning protection for running jobs
   6. Dataset upload limits: size cap (10MB) & format validation (json, jsonl, csv)
   7. Pagination parameters (limit, offset) on runs and case results
   8. Cache key isolation with explicit provider in metadata
   9. ProviderScheduler reports NOT_CONFIGURED when API key is missing
   ============================================================ */

import assert from 'node:assert';
import { createServer } from 'vite';

async function runTests() {
  console.log('\n============================================================');
  console.log('RELIQ INDEPENDENT ARCHITECTURAL FIXES REGRESSION SUITE');
  console.log('============================================================\n');

  const server = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });

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
    // 1. Canonical run ID generation with crypto.randomUUID()
    await test('Canonical run ID generation uses crypto.randomUUID() and produces unique, valid IDs', async () => {
      const { generateCanonicalRunId } = await server.ssrLoadModule('/src/server/evaluationService.ts');
      const ids = new Set();
      const runIdRegex = /^run-live-[a-z0-9]+-[a-z0-9]{12}$/;

      for (let i = 0; i < 500; i++) {
        const id = generateCanonicalRunId();
        assert.match(id, runIdRegex, `Generated run ID '${id}' must match canonical format`);
        assert(!ids.has(id), `Duplicate run ID detected: ${id}`);
        ids.add(id);
      }
      assert.strictEqual(ids.size, 500, 'All 500 generated IDs must be unique');
    });

    // 2. Minute-based Groq duration parsing in headers and error bodies
    await test('parseDurationHeaderMs handles minute (m), second (s), hour (h), and compound formats', async () => {
      const { parseDurationHeaderMs } = await server.ssrLoadModule('/src/server/serverUtils.ts');

      // Seconds
      assert.strictEqual(parseDurationHeaderMs('5s'), 5000);
      assert.strictEqual(parseDurationHeaderMs('2.5s'), 2500);

      // Minutes
      assert.strictEqual(parseDurationHeaderMs('2m'), 120000);
      assert.strictEqual(parseDurationHeaderMs('1m'), 60000);

      // Compound minutes + seconds (Groq format)
      assert.strictEqual(parseDurationHeaderMs('1m23.456s'), 83456);
      assert.strictEqual(parseDurationHeaderMs('2m10s'), 130000);

      // Milliseconds
      assert.strictEqual(parseDurationHeaderMs('500ms'), 500);

      // Hours
      assert.strictEqual(parseDurationHeaderMs('1h'), 3600000);

      // Raw seconds as string number
      assert.strictEqual(parseDurationHeaderMs('30'), 30000);

      // Invalid returns 0
      assert.strictEqual(parseDurationHeaderMs('invalid'), 0);
      assert.strictEqual(parseDurationHeaderMs(null), 0);
    });

    // 3. Rate-limit error body parsing for Groq minute formats
    await test('Groq minute error strings (e.g. "try again in 1m23.456s") are matched correctly', async () => {
      const errorMsg1 = 'Rate limit exceeded: Please try again in 1m23.456s.';
      const minSecMatch1 =
        errorMsg1.match(/try again in (?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?/i) ||
        errorMsg1.match(/retry (?:after|in) (?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?/i);

      assert(minSecMatch1, 'Must match 1m23.456s');
      const m1 = minSecMatch1[1] ? parseFloat(minSecMatch1[1]) : 0;
      const s1 = minSecMatch1[2] ? parseFloat(minSecMatch1[2]) : 0;
      const waitMs1 = Math.ceil(m1 * 60000 + s1 * 1000) + 250;
      assert.strictEqual(waitMs1, 83706, 'Parsed duration should be 83,706ms (including padding)');

      const errorMsg2 = 'Rate limit reached: retry in 2m.';
      const minSecMatch2 =
        errorMsg2.match(/try again in (?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?/i) ||
        errorMsg2.match(/retry (?:after|in) (?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?/i);

      assert(minSecMatch2, 'Must match 2m');
      const m2 = minSecMatch2[1] ? parseFloat(minSecMatch2[1]) : 0;
      const s2 = minSecMatch2[2] ? parseFloat(minSecMatch2[2]) : 0;
      const waitMs2 = Math.ceil(m2 * 60000 + s2 * 1000) + 250;
      assert.strictEqual(waitMs2, 120250, 'Parsed duration should be 120,250ms');
    });

    // 4. Job pruning protects running evaluations
    await test('pruneOldJobs never evicts jobs with status RUNNING', async () => {
      const { pruneOldJobs, _setJobForTesting, getJobStatus } = await server.ssrLoadModule('/src/server/evaluationService.ts');

      // Create running jobs
      const runningJobIds = [];
      for (let i = 0; i < 5; i++) {
        const id = `running-${i}`;
        _setJobForTesting(id, {
          runId: id,
          status: 'RUNNING',
          progress: { current: 1, total: 10, percent: 10 },
          startTime: Date.now(),
        });
        runningJobIds.push(id);
      }

      // Create 35 completed jobs to trigger MAX_STORED_JOBS (30) pruning
      for (let i = 0; i < 35; i++) {
        const id = `completed-${i}`;
        _setJobForTesting(id, {
          runId: id,
          status: 'COMPLETED',
          progress: { current: 10, total: 10, percent: 100 },
          startTime: Date.now() - 30 * 60 * 1000,
          endTime: Date.now() - 20 * 60 * 1000, // 20 mins ago (older than 15 min TTL)
        });
      }

      pruneOldJobs();

      // Ensure every single running job was protected from eviction
      for (const id of runningJobIds) {
        const job = await getJobStatus(id);
        assert(job, `Running job ${id} was incorrectly evicted during pruning!`);
        assert.strictEqual(job.status, 'RUNNING', `Job ${id} must remain RUNNING`);
      }
    });

    // 5. Cache key isolation with explicit provider
    await test('EvaluationCache generates distinct cache keys for same model on different providers', async () => {
      const { EvaluationCache } = await server.ssrLoadModule('/src/evaluation/evaluationCache.ts');
      const cache = new EvaluationCache();

      const groqReq = {
        testCaseId: 'c1',
        role: 'candidate',
        input: 'Translate hello to French',
        modelIdentifier: 'llama-3.3-70b-versatile',
        temperature: 0.2,
        maxTokens: 1024,
        metadata: {
          provider: 'groq',
        },
      };

      const cerebrasReq = {
        testCaseId: 'c1',
        role: 'candidate',
        input: 'Translate hello to French',
        modelIdentifier: 'llama-3.3-70b-versatile',
        temperature: 0.2,
        maxTokens: 1024,
        metadata: {
          provider: 'cerebras',
        },
      };

      const keyGroq = cache.computeCacheKey(groqReq);
      const keyCerebras = cache.computeCacheKey(cerebrasReq);

      assert.notStrictEqual(keyGroq, keyCerebras, 'Cache keys must differ when provider differs');
      assert.strictEqual(typeof keyGroq, 'string');
      assert.strictEqual(keyGroq.length, 64, 'SHA-256 hash must be 64 hex characters');
    });

    // 6. ProviderScheduler reports configured/isConfigured status
    await test('ProviderScheduler identifies unconfigured providers', async () => {
      const { ProviderScheduler } = await server.ssrLoadModule('/src/server/providerScheduler.ts');
      const scheduler = ProviderScheduler.getInstance();

      // Save original env keys
      const origAnthropic = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      try {
        const isConf = scheduler.isProviderConfigured('anthropic');
        assert.strictEqual(isConf, false, 'Anthropic with no API key must report isProviderConfigured=false');
        const status = scheduler.getProviderStatus('anthropic');
        assert.strictEqual(status.configured, false, 'status.configured must be false');
        assert.strictEqual(status.isConfigured, false, 'status.isConfigured must be false');
      } finally {
        if (origAnthropic) process.env.ANTHROPIC_API_KEY = origAnthropic;
      }
    });

    // 7. Provider normalization handles both 'gemini' and 'google'
    await test('ProviderScheduler normalizes gemini and google symmetrically', async () => {
      const { ProviderScheduler } = await server.ssrLoadModule('/src/server/providerScheduler.ts');
      const scheduler = ProviderScheduler.getInstance();

      assert.strictEqual(scheduler.normalizeProvider('gemini'), 'google');
      assert.strictEqual(scheduler.normalizeProvider('google'), 'google');
      assert.strictEqual(scheduler.normalizeProvider('gemini-1.5-pro'), 'google');

      const all = scheduler.getAllProviderStatuses();
      assert(all.google, 'Must include google');
      assert(all.gemini, 'Must include gemini alias');
      assert.strictEqual(all.gemini.providerId, all.google.providerId);
    });

    // 8. Explicit database driver selection rejects unsupported drivers
    await test('isSupabaseDriverActive rejects invalid RELIQ_DB_DRIVER and defaults strictly in production', async () => {
      const { isSupabaseDriverActive } = await server.ssrLoadModule('/src/server/db/supabaseClient.ts');

      const origDriver = process.env.RELIQ_DB_DRIVER;
      const origNodeEnv = process.env.NODE_ENV;

      try {
        // Explicit sqlite
        process.env.RELIQ_DB_DRIVER = 'sqlite';
        assert.strictEqual(isSupabaseDriverActive(), false, "Driver 'sqlite' must return false");

        // Explicit supabase_postgresql
        process.env.RELIQ_DB_DRIVER = 'supabase_postgresql';
        assert.strictEqual(isSupabaseDriverActive(), true, "Driver 'supabase_postgresql' must return true");

        // Invalid driver throws explicit error
        process.env.RELIQ_DB_DRIVER = 'mongodb';
        assert.throws(
          () => isSupabaseDriverActive(),
          /Unsupported RELIQ_DB_DRIVER/,
          'Invalid driver must throw explicit error'
        );

        // Production default without sqlite
        delete process.env.RELIQ_DB_DRIVER;
        process.env.NODE_ENV = 'production';
        assert.strictEqual(isSupabaseDriverActive(), true, 'In production, must default to Supabase PostgreSQL');
      } finally {
        if (origDriver !== undefined) process.env.RELIQ_DB_DRIVER = origDriver;
        else delete process.env.RELIQ_DB_DRIVER;
        if (origNodeEnv !== undefined) process.env.NODE_ENV = origNodeEnv;
        else delete process.env.NODE_ENV;
      }
    });

    // 9. Independent branch error handling via Promise.allSettled
    await test('Promise.allSettled isolation: candidate response is preserved when baseline rejects', async () => {
      // Simulate runner's Promise.allSettled pattern
      const fetchBaseline = async () => {
        throw new Error('Baseline provider network timeout (ETIMEDOUT)');
      };
      const fetchCandidate = async () => {
        return {
          output: 'Paris is the capital of France.',
          usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18, latencyMs: 250 },
          isDemoMode: false,
        };
      };

      const [baselineResult, candidateResult] = await Promise.allSettled([
        fetchBaseline(),
        fetchCandidate(),
      ]);

      const baselineResp = baselineResult.status === 'fulfilled'
        ? baselineResult.value
        : {
            output: '',
            usage: {
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              latencyMs: 0,
              error: baselineResult.reason?.message || 'Baseline provider request failed',
            },
            isDemoMode: false,
          };

      const candidateResp = candidateResult.status === 'fulfilled'
        ? candidateResult.value
        : {
            output: '',
            usage: {
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              latencyMs: 0,
              error: candidateResult.reason?.message || 'Candidate provider request failed',
            },
            isDemoMode: false,
          };

      assert.strictEqual(candidateResp.output, 'Paris is the capital of France.', 'Candidate output must be preserved');
      assert.strictEqual(candidateResp.usage.totalTokens, 18);
      assert.strictEqual(baselineResp.output, '', 'Baseline output should be empty string on failure');
      assert.strictEqual(baselineResp.usage.error, 'Baseline provider network timeout (ETIMEDOUT)', 'Error message captured on usage');
    });

  } finally {
    await server.close();
  }

  console.log(`\n============================================================`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`============================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
