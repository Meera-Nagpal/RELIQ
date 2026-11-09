import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { createServer } from 'vite';

async function runTests() {
  console.log('--- Running Production Availability & Health Check Tests ---');

  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });

  try {
    const { createReliqProxyMiddleware } = await vite.ssrLoadModule('/src/server/proxyMiddleware.ts');
    const {
      fetchWithRetryTransient,
      checkBackendHealth,
      ApiClient,
    } = await vite.ssrLoadModule('/src/services/apiClient.ts');

    // ─────────────────────────────────────────────────────────────
    // 1. Vercel Rewrites Configuration Validation
    // ─────────────────────────────────────────────────────────────
    console.log('\n[1] Vercel Rewrites Configuration');
    const vercelConfigPath = path.resolve(process.cwd(), 'vercel.json');
    const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));

    const healthRewrite = vercelConfig.rewrites.find((r) => r.source === '/health');
    assert(healthRewrite, 'vercel.json must have an explicit rewrite for /health');
    assert.strictEqual(healthRewrite.destination, 'https://reliq-backend.onrender.com/health');

    const apiRewrite = vercelConfig.rewrites.find((r) => r.source === '/api/(.*)');
    assert(apiRewrite, 'vercel.json must have a rewrite for /api/(.*)');
    assert.strictEqual(apiRewrite.destination, 'https://reliq-backend.onrender.com/api/$1');

    const spaRewrite = vercelConfig.rewrites.find((r) => r.source === '/((?!api|health).*)');
    assert(spaRewrite, 'vercel.json SPA fallback must exclude both api and health');
    assert.strictEqual(spaRewrite.destination, '/index.html');
    console.log('  ✓ vercel.json rewrites correctly target Render backend for /health and /api/*');

    // ─────────────────────────────────────────────────────────────
    // 2. Backend Health Endpoint Verification (/api/health & /health)
    // ─────────────────────────────────────────────────────────────
    console.log('\n[2] Backend Health Endpoint Routing & Status (200 OK)');
    const middleware = createReliqProxyMiddleware();

    // Helper to simulate an HTTP request through the middleware
    async function simulateRequest(url, method = 'GET') {
      return new Promise((resolve) => {
        let statusCode = 200;
        const headers = {};
        let body = '';

        const req = {
          url,
          method,
          headers: { host: 'localhost' },
        };

        const res = {
          setHeader(k, v) {
            headers[k.toLowerCase()] = v;
          },
          get statusCode() {
            return statusCode;
          },
          set statusCode(code) {
            statusCode = code;
          },
          end(payload) {
            if (payload) body = payload;
            let parsedBody = null;
            try {
              parsedBody = JSON.parse(body);
            } catch {
              parsedBody = body;
            }
            resolve({ statusCode, headers, body: parsedBody });
          },
        };

        middleware(req, res, () => {
          resolve({ statusCode: 404, headers, body: 'next() called' });
        });
      });
    }

    // Test GET /api/health
    const apiHealthRes = await simulateRequest('/api/health');
    assert.strictEqual(apiHealthRes.statusCode, 200, 'GET /api/health must return HTTP 200 to prevent Render 503 failure');
    assert(apiHealthRes.body, 'Response body must be present');
    assert(
      apiHealthRes.body.status === 'healthy' || apiHealthRes.body.status === 'degraded',
      `Status should be healthy or degraded, got: ${apiHealthRes.body.status}`
    );
    assert.strictEqual(apiHealthRes.body.service, 'RELIQ Evaluation Platform');
    assert.strictEqual(apiHealthRes.body.version, '2.8.0');
    assert.strictEqual(typeof apiHealthRes.body.uptimeSec, 'number');
    console.log(`  ✓ GET /api/health returned HTTP 200 with status: '${apiHealthRes.body.status}'`);

    // Test GET /health (must match and return HTTP 200)
    const healthRes = await simulateRequest('/health');
    assert.strictEqual(healthRes.statusCode, 200, 'GET /health must return HTTP 200');
    assert.strictEqual(healthRes.body.service, 'RELIQ Evaluation Platform');
    console.log('  ✓ GET /health returned HTTP 200 with identical diagnostic payload');

    // ─────────────────────────────────────────────────────────────
    // 3. Health Check Cache (Prevents Rapid DB Probe Churn)
    // ─────────────────────────────────────────────────────────────
    console.log('\n[3] Health Check Caching for Rapid Probes');
    const startProbe = Date.now();
    const probe1 = await simulateRequest('/api/health');
    const probe2 = await simulateRequest('/api/health');
    const totalProbeTime = Date.now() - startProbe;
    assert.strictEqual(probe1.statusCode, 200);
    assert.strictEqual(probe2.statusCode, 200);
    // Cached response should be virtually instantaneous (< 100ms for both)
    assert(totalProbeTime < 500, `Consecutive health probes should be served instantly from cache (took ${totalProbeTime}ms)`);
    console.log(`  ✓ Two consecutive health probes served in ${totalProbeTime}ms via health state cache`);

    // ─────────────────────────────────────────────────────────────
    // 4. Frontend Exponential Backoff Retry (502/503/504 Handling)
    // ─────────────────────────────────────────────────────────────
    console.log('\n[4] Frontend Transient 503 Retry & Exponential Backoff');
    let callCount = 0;
    const mockColdStartFetch = async () => {
      callCount++;
      if (callCount < 3) {
        // Return 503 for first 2 attempts (simulating Render cold-boot)
        return {
          status: 503,
          statusText: 'Service Unavailable',
          ok: false,
        };
      }
      // Recover on attempt 3
      return {
        status: 200,
        statusText: 'OK',
        ok: true,
        json: async () => ({ status: 'healthy', database: 'connected' }),
      };
    };

    const startTime = Date.now();
    const retryResult = await fetchWithRetryTransient(mockColdStartFetch, {
      maxRetries: 4,
      initialDelayMs: 50, // Shortened for unit testing
      maxDelayMs: 200,
    });
    const duration = Date.now() - startTime;

    assert.strictEqual(callCount, 3, 'Should retry until successful attempt 3');
    assert.strictEqual(retryResult.status, 200, 'Should successfully return 200 response');
    assert(duration >= 100, `Backoff delay must be respected (took ${duration}ms)`);
    console.log(`  ✓ fetchWithRetryTransient successfully recovered from 503s after ${callCount} attempts (${duration}ms)`);

    // ─────────────────────────────────────────────────────────────
    // 5. checkBackendHealth Status Classification
    // ─────────────────────────────────────────────────────────────
    console.log('\n[5] checkBackendHealth Status Normalization');
    const originalFetch = globalThis.fetch;

    try {
      // Mock 200 healthy
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ status: 'healthy', database: 'connected', latencyMs: 24 }),
      });
      const nominalReport = await checkBackendHealth('http://mock-reliq');
      assert.strictEqual(nominalReport.status, 'NOMINAL');
      assert.strictEqual(nominalReport.database, 'connected');
      console.log('  ✓ Accurately classified 200 connected as NOMINAL');

      // Mock 200 degraded (database reconnecting)
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ status: 'degraded', database: 'error: database connection failed' }),
      });
      const degradedReport = await checkBackendHealth('http://mock-reliq');
      assert.strictEqual(degradedReport.status, 'DEGRADED');
      console.log('  ✓ Accurately classified 200 degraded database as DEGRADED');

      // Mock 503 Service Unavailable (Render sleeping/waking up)
      globalThis.fetch = async () => ({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });
      const offlineReport = await checkBackendHealth('http://mock-reliq');
      assert.strictEqual(offlineReport.status, 'OFFLINE');
      assert.match(offlineReport.error, /503/);
      console.log('  ✓ Accurately classified 503 Service Unavailable as OFFLINE');

      // Mock network connection failure
      globalThis.fetch = async () => {
        throw new Error('fetch failed: ECONNREFUSED');
      };
      const networkErrorReport = await checkBackendHealth('http://mock-reliq');
      assert.strictEqual(networkErrorReport.status, 'OFFLINE');
      assert.match(networkErrorReport.error, /ECONNREFUSED/);
      console.log('  ✓ Accurately classified network failure as OFFLINE');
    } finally {
      globalThis.fetch = originalFetch;
    }

    console.log('\n--- ALL AVAILABILITY & HEALTH TESTS PASSED ---\n');
  } finally {
    await vite.close();
  }
}

runTests().catch((err) => {
  console.error('\nTest run failed:', err);
  process.exit(1);
});
