/* ============================================================
   RELIQ — Cloud Migration & Evaluation Engine Upgrade Test Suite
   
   Covers:
   - Supabase client initialization & environment resolution
   - Evaluation cache deterministic SHA-256 keys, storage, & bypass
   - Auth endpoints (/api/auth/status, /api/auth/me, /api/auth/signout)
   - Upgraded /api/health endpoint with databaseType & caching
   - Zero credential leakage verification
   ============================================================ */

import assert from 'node:assert';
import http from 'node:http';
import { createServer } from 'vite';

export async function runCloudMigrationTests(testRunner, existingVite) {
  let vite = existingVite;
  let shouldCloseVite = false;

  if (!vite) {
    vite = await createServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    shouldCloseVite = true;
  }

  const { test, asyncTest } = testRunner;
  console.log('\n--- Running Cloud Migration & Evaluation Upgrade Tests ---');

  const { isSupabaseConfigured, getSupabaseUrl } = await vite.ssrLoadModule('/src/server/db/supabaseClient.ts');
  const { evaluationCache } = await vite.ssrLoadModule('/src/evaluation/evaluationCache.ts');
  const { createReliqProxyMiddleware } = await vite.ssrLoadModule('/src/server/proxyMiddleware.ts');

  // Test 1: Supabase Configuration Check
  test('CLOUD-01: isSupabaseConfigured returns boolean and resolves URL safely', () => {
    const isConfig = isSupabaseConfigured();
    assert.strictEqual(typeof isConfig, 'boolean');
    const url = getSupabaseUrl();
    if (url) {
      assert.ok(url.startsWith('https://'), 'Supabase URL must start with https://');
    }
  });

  // Test 2: Evaluation Cache Deterministic SHA-256 Key
  test('CLOUD-02: evaluationCache generates identical SHA-256 hash for identical requests', () => {
    const req1 = {
      testCaseId: 'tc-01',
      input: 'Apply 15% discount code SAVE15 to cart',
      modelIdentifier: 'qwen/qwen3.8-27b',
      temperature: 0.2,
      metadata: { provider: 'groq' },
    };
    const req2 = {
      testCaseId: 'tc-01-clone',
      input: 'Apply 15% discount code SAVE15 to cart',
      modelIdentifier: 'qwen/qwen3.8-27b',
      temperature: 0.2,
      metadata: { provider: 'groq' },
    };

    const key1 = evaluationCache.computeCacheKey(req1);
    const key2 = evaluationCache.computeCacheKey(req2);
    assert.strictEqual(key1, key2, 'Cache keys must match for identical prompts and models');
    assert.strictEqual(key1.length, 64, 'SHA-256 hash must be 64 hex characters');
  });

  // Test 3: Evaluation Cache Memory Storage and Fast Retrieval
  await asyncTest('CLOUD-03: evaluationCache stores and retrieves cached model response with 1ms latency', async () => {
    const req = {
      testCaseId: 'tc-cache-test',
      input: 'Check cart total with tax',
      modelIdentifier: 'gpt-oss-120b',
      temperature: 0.2,
      metadata: { provider: 'cerebras' },
    };
    const fakeResp = {
      output: 'Cart total with 8% sales tax is $108.00.',
      usage: {
        model: 'gpt-oss-120b',
        provider: 'cerebras',
        inputTokens: 25,
        outputTokens: 14,
        totalTokens: 39,
        latencyMs: 420,
      },
    };

    await evaluationCache.set(req, fakeResp);

    const cached = await evaluationCache.get(req);
    assert.ok(cached, 'Cached response must exist');
    assert.strictEqual(cached.output, 'Cart total with 8% sales tax is $108.00.');
    assert.strictEqual(cached.usage.latencyMs, 1, 'Cached response latency should be 1ms');
  });

  // Test 4: Evaluation Cache Bypass Option
  await asyncTest('CLOUD-04: evaluationCache get with bypass=true returns null', async () => {
    const req = {
      testCaseId: 'tc-cache-bypass',
      input: 'Verify policy with fresh data',
      modelIdentifier: 'claude-3-5-sonnet',
      temperature: 0.2,
      metadata: { provider: 'anthropic' },
    };
    const fakeResp = {
      output: 'Policy requires customer authorization.',
      usage: {
        model: 'claude-3-5-sonnet',
        provider: 'anthropic',
        inputTokens: 15,
        outputTokens: 8,
        totalTokens: 23,
        latencyMs: 350,
      },
    };

    await evaluationCache.set(req, fakeResp);

    // Bypass check
    const bypassResult = await evaluationCache.get(req, true);
    assert.strictEqual(bypassResult, null, 'Cache bypass must return null to force fresh execution');
  });

  // Test 5: Error Responses Are Not Cached
  await asyncTest('CLOUD-05: evaluationCache does not cache error or rate-limited responses', async () => {
    const req = {
      testCaseId: 'tc-error-cache',
      input: 'Trigger 429 rate limit',
      modelIdentifier: 'gemini-1.5-pro',
      temperature: 0.2,
      metadata: { provider: 'gemini' },
    };
    const errorResp = {
      output: '',
      usage: {
        model: 'gemini-1.5-pro',
        provider: 'gemini',
        latencyMs: 120,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Quota exceeded for gemini',
          status: 429,
        },
      },
    };

    await evaluationCache.set(req, errorResp);
    const lookup = await evaluationCache.get(req);
    assert.strictEqual(lookup, null, 'Error responses must never be cached');
  });

  // Test 6: Auth Status Endpoint
  await asyncTest('CLOUD-06: GET /api/auth/status returns auth capability metadata', async () => {
    const middleware = createReliqProxyMiddleware();
    const server = http.createServer((req, res) => {
      middleware(req, res, () => {
        res.statusCode = 404;
        res.end();
      });
    });

    const PORT = 3198;
    await new Promise((res) => server.listen(PORT, '127.0.0.1', res));

    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/api/auth/status`);
      assert.strictEqual(response.status, 200);
      const data = await response.json();
      assert.ok('enabled' in data, 'Must indicate whether auth is enabled');
      assert.ok('provider' in data, 'Must indicate auth provider');
    } finally {
      server.close();
    }
  });

  // Test 7: Auth Me Endpoint Without Token
  await asyncTest('CLOUD-07: GET /api/auth/me without token returns unauthenticated status safely', async () => {
    const middleware = createReliqProxyMiddleware();
    const server = http.createServer((req, res) => {
      middleware(req, res, () => {
        res.statusCode = 404;
        res.end();
      });
    });

    const PORT = 3197;
    await new Promise((res) => server.listen(PORT, '127.0.0.1', res));

    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/api/auth/me`);
      assert.strictEqual(response.status, 200);
      const data = await response.json();
      assert.strictEqual(data.authenticated, false);
      assert.strictEqual(data.user, null);
    } finally {
      server.close();
    }
  });

  // Test 8: Health Endpoint Includes Upgraded Cloud & Database Metadata
  await asyncTest('CLOUD-08: GET /api/health includes databaseType, version 2.8.0, and zero secrets', async () => {
    const middleware = createReliqProxyMiddleware();
    const server = http.createServer((req, res) => {
      middleware(req, res, () => {
        res.statusCode = 404;
        res.end();
      });
    });

    const PORT = 3196;
    await new Promise((res) => server.listen(PORT, '127.0.0.1', res));

    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      assert.strictEqual(response.status, 200);
      const data = await response.json();
      assert.strictEqual(data.status, 'healthy');
      assert.ok(data.databaseType === 'sqlite' || data.databaseType === 'supabase_postgresql');
      assert.strictEqual(data.version, '2.8.0');
      assert.ok(data.auth, 'Must include auth metadata');
      assert.ok(data.caching, 'Must include caching metadata');

      const raw = JSON.stringify(data);
      assert.ok(!raw.includes('gsk_'), 'Must never leak Groq key');
      assert.ok(!raw.includes('csk-'), 'Must never leak Cerebras key');
      assert.ok(!raw.includes('AQ.'), 'Must never leak Gemini key');
      assert.ok(!raw.includes('sb_secret_'), 'Must never leak Supabase secret');
    } finally {
      server.close();
    }
  });

  console.log('--- All Cloud Migration & Evaluation Upgrade Tests Completed Successfully ---\n');

  if (shouldCloseVite) {
    await vite.close();
  }
}
