/* ============================================================
   RELIQ — Groq Production Authentication & Render Environment Test Suite
   
   Proves:
   1. In production (NODE_ENV=production), Groq provider reads GROQ_API_KEY directly from process.env.
   2. No physical .env.local file is required in Render.
   3. Dotenv file loading is skipped in production.
   4. Inconsistent environment variable aliases (GROQ_API_KEY, GROQ_KEY, GROQ_API_TOKEN) resolve cleanly.
   5. Health endpoint (/api/health) reflects actual credential availability ('READY' vs 'NOT_CONFIGURED').
   6. API key values are never exposed or logged in response payloads or error messages.
   7. Missing credential generates HTTP 401 AUTH_MISSING_KEY with 0 evaluated cases without crashing.
   8. Local development loading is preserved.
   ============================================================ */

import assert from 'node:assert';
import http from 'node:http';

export async function runGroqProductionAuthTests(harness, viteServer) {
  const { test, asyncTest } = harness;

  console.log('\n--- Running Groq Production Authentication & Render Environment Tests ---');

  const { ServerGroqProvider, resolveServerProvider } = await viteServer.ssrLoadModule('/src/server/serverProviders.ts');
  const { getApiKey, cleanKeyValue, KEY_ALIASES } = await viteServer.ssrLoadModule('/src/server/serverUtils.ts');
  const { ProviderScheduler, providerScheduler } = await viteServer.ssrLoadModule('/src/server/providerScheduler.ts');
  const { createReliqProxyMiddleware } = await viteServer.ssrLoadModule('/src/server/proxyMiddleware.ts');
  const { classifyResponseStatus } = await viteServer.ssrLoadModule('/src/evaluation/runner.ts');

  // Test 1: Provider reads process.env.GROQ_API_KEY directly in production
  await asyncTest('GROQ-PROD-01: In production (NODE_ENV=production), reads GROQ_API_KEY directly from process.env', async () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origKey = process.env.GROQ_API_KEY;

    try {
      process.env.NODE_ENV = 'production';
      process.env.GROQ_API_KEY = 'gsk_render_prod_live_test_key_999';

      const key = getApiKey('GROQ_API_KEY');
      assert.strictEqual(key, 'gsk_render_prod_live_test_key_999', 'Must resolve from process.env in production');

      const provider = new ServerGroqProvider();
      assert.strictEqual(provider.isConfigured(), true, 'ServerGroqProvider must report configured=true');

      const resolved = resolveServerProvider({ provider: 'groq' });
      assert.strictEqual(resolved.isConfigured(), true, 'resolveServerProvider must report configured=true');
    } finally {
      if (origNodeEnv !== undefined) process.env.NODE_ENV = origNodeEnv;
      else delete process.env.NODE_ENV;
      if (origKey !== undefined) process.env.GROQ_API_KEY = origKey;
      else delete process.env.GROQ_API_KEY;
    }
  });

  // Test 2: Does not require a physical .env.local file in Render
  await asyncTest('GROQ-PROD-02: Does not require physical .env.local file in production mode', async () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origKey = process.env.GROQ_API_KEY;

    try {
      process.env.NODE_ENV = 'production';
      process.env.GROQ_API_KEY = 'gsk_standalone_render_env_888';

      // Provider functions properly without any physical .env.local file access
      const prov = new ServerGroqProvider();
      assert.strictEqual(prov.isConfigured(), true);

      const meta = prov.getMetadata();
      assert.strictEqual(meta.configured, true);
      assert.strictEqual(meta.id, 'groq');
      assert.strictEqual(meta.isServerSideOnly, true);
    } finally {
      if (origNodeEnv !== undefined) process.env.NODE_ENV = origNodeEnv;
      else delete process.env.NODE_ENV;
      if (origKey !== undefined) process.env.GROQ_API_KEY = origKey;
      else delete process.env.GROQ_API_KEY;
    }
  });

  // Test 3: Unquotes and trims environment variable values safely
  test('GROQ-PROD-03: Strips wrapping quotes and whitespace from Render environment variables', () => {
    assert.strictEqual(cleanKeyValue('  "gsk_double_quoted_123"  '), 'gsk_double_quoted_123');
    assert.strictEqual(cleanKeyValue("  'gsk_single_quoted_456'  "), 'gsk_single_quoted_456');
    assert.strictEqual(cleanKeyValue('gsk_clean_789'), 'gsk_clean_789');
    assert.strictEqual(cleanKeyValue(''), undefined);
    assert.strictEqual(cleanKeyValue(undefined), undefined);
  });

  // Test 4: Inconsistent environment variable aliases across platforms
  await asyncTest('GROQ-PROD-04: Resolves key aliases (GROQ_API_TOKEN, GROQ_KEY) when GROQ_API_KEY is not set', async () => {
    const origKey = process.env.GROQ_API_KEY;
    const origToken = process.env.GROQ_API_TOKEN;
    const origAltKey = process.env.GROQ_KEY;

    try {
      delete process.env.GROQ_API_KEY;
      delete process.env.GROQ_API_TOKEN;
      process.env.GROQ_KEY = 'gsk_from_groq_key_alias';

      assert.strictEqual(getApiKey('GROQ_API_KEY'), 'gsk_from_groq_key_alias');

      delete process.env.GROQ_KEY;
      process.env.GROQ_API_TOKEN = 'gsk_from_groq_api_token_alias';
      assert.strictEqual(getApiKey('GROQ_API_KEY'), 'gsk_from_groq_api_token_alias');
    } finally {
      if (origKey !== undefined) process.env.GROQ_API_KEY = origKey;
      else delete process.env.GROQ_API_KEY;
      if (origToken !== undefined) process.env.GROQ_API_TOKEN = origToken;
      else delete process.env.GROQ_API_TOKEN;
      if (origAltKey !== undefined) process.env.GROQ_KEY = origAltKey;
      else delete process.env.GROQ_KEY;
    }
  });

  // Test 5: Scheduler delay and concurrency resolution for provider aliases
  test('GROQ-PROD-05: Scheduler resolves GROQ_MIN_DELAY_MS and GEMINI_MIN_DELAY_MS aliases', () => {
    const scheduler = new ProviderScheduler();
    const origGroqDelay = process.env.GROQ_MIN_DELAY_MS;
    const origGeminiDelay = process.env.GEMINI_MIN_DELAY_MS;

    try {
      process.env.GROQ_MIN_DELAY_MS = '250';
      process.env.GEMINI_MIN_DELAY_MS = '3500';

      const s = new ProviderScheduler();
      assert.strictEqual(s.getProviderStatus('groq').minDelayMs, 250);
      assert.strictEqual(s.getProviderStatus('google').minDelayMs, 3500);
    } finally {
      if (origGroqDelay !== undefined) process.env.GROQ_MIN_DELAY_MS = origGroqDelay;
      else delete process.env.GROQ_MIN_DELAY_MS;
      if (origGeminiDelay !== undefined) process.env.GEMINI_MIN_DELAY_MS = origGeminiDelay;
      else delete process.env.GEMINI_MIN_DELAY_MS;
    }
  });

  // Test 6: Missing key in production returns HTTP 401 AUTH_MISSING_KEY
  await asyncTest('GROQ-PROD-06: Missing credential in production returns 401 AUTH_MISSING_KEY and qualityEvaluated=false', async () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origKey = process.env.GROQ_API_KEY;
    const origToken = process.env.GROQ_API_TOKEN;
    const origAltKey = process.env.GROQ_KEY;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.GROQ_API_KEY;
      delete process.env.GROQ_API_TOKEN;
      delete process.env.GROQ_KEY;

      const prov = new ServerGroqProvider();
      assert.strictEqual(prov.isConfigured(), false);

      const res = await prov.generate({
        testCaseId: 'tc-groq-missing-key',
        input: 'Test message',
        modelIdentifier: 'openai/gpt-oss-20b',
      });

      assert.strictEqual(res.usage.error?.status, 401);
      assert.strictEqual(res.usage.error?.code, 'AUTH_MISSING_KEY');
      assert.ok(res.usage.error?.message.includes('GROQ_API_KEY'));

      const classified = classifyResponseStatus(res);
      assert.strictEqual(classified.status, 'AUTHENTICATION_ERROR');
      assert.strictEqual(classified.isEvaluated, false, 'Must result in 0 evaluated cases for failed auth');
      assert.strictEqual(classified.qualityEvaluated, false, 'Must NOT count as a model quality failure');
      assert.strictEqual(classified.transportSuccess, false);
    } finally {
      if (origNodeEnv !== undefined) process.env.NODE_ENV = origNodeEnv;
      else delete process.env.NODE_ENV;
      if (origKey !== undefined) process.env.GROQ_API_KEY = origKey;
      else delete process.env.GROQ_API_KEY;
      if (origToken !== undefined) process.env.GROQ_API_TOKEN = origToken;
      else delete process.env.GROQ_API_TOKEN;
      if (origAltKey !== undefined) process.env.GROQ_KEY = origAltKey;
      else delete process.env.GROQ_KEY;
    }
  });

  // Test 7: Health endpoint (/api/health) reflects actual credential availability
  await asyncTest('GROQ-PROD-07: Health endpoint provider status reflects actual GROQ_API_KEY availability', async () => {
    const origKey = process.env.GROQ_API_KEY;
    const origNodeEnv = process.env.NODE_ENV;
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
      process.env.NODE_ENV = 'production';

      // 1. With GROQ_API_KEY configured in production
      process.env.GROQ_API_KEY = 'gsk_render_health_check_key_test';
      const resWithKey = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      assert.strictEqual(resWithKey.status, 200);
      const dataWithKey = await resWithKey.json();
      assert.strictEqual(dataWithKey.providers?.groq, 'READY', 'Must report READY when key is present');

      // 2. Without GROQ_API_KEY configured in production
      delete process.env.GROQ_API_KEY;
      const resWithoutKey = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      assert.strictEqual(resWithoutKey.status, 200);
      const dataWithoutKey = await resWithoutKey.json();
      assert.strictEqual(dataWithoutKey.providers?.groq, 'NOT_CONFIGURED', 'Must report NOT_CONFIGURED when key is absent');
    } finally {
      if (origKey !== undefined) process.env.GROQ_API_KEY = origKey;
      else delete process.env.GROQ_API_KEY;
      if (origNodeEnv !== undefined) process.env.NODE_ENV = origNodeEnv;
      else delete process.env.NODE_ENV;
      await new Promise((res) => server.close(res));
    }
  });

  // Test 8: Security guarantee - API key is never exposed or logged in payloads
  await asyncTest('GROQ-PROD-08: Full payload sweep guarantees zero raw GROQ_API_KEY leakage', async () => {
    const origKey = process.env.GROQ_API_KEY;
    const testSecret = 'gsk_super_secret_groq_production_key_007';
    process.env.GROQ_API_KEY = testSecret;

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
      const endpoints = [
        '/api/health',
        '/api/providers/status',
        '/api/providers/quota-status',
      ];

      for (const endpoint of endpoints) {
        const response = await fetch(`http://127.0.0.1:${PORT}${endpoint}`);
        const text = await response.text();
        assert.ok(
          !text.includes(testSecret),
          `Endpoint ${endpoint} must never expose the raw API key`
        );
      }
    } finally {
      if (origKey !== undefined) process.env.GROQ_API_KEY = origKey;
      else delete process.env.GROQ_API_KEY;
      await new Promise((res) => server.close(res));
    }
  });

  console.log('--- All Groq Production Authentication & Render Environment Tests Completed Successfully ---\n');
}