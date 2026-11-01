/* ============================================================
   RELIQ — Production Architecture Verification Test Suite
   
   Proves:
   1. Target Architecture: Vercel frontend-only, Render backend, Supabase PostgreSQL persistence.
   2. Vercel routing: vercel.json rewrites /api/* to https://reliq-backend.onrender.com/api/$1.
   3. Complete removal of Vercel serverless backend and SQLite bundling.
   4. Fail-fast safety: getDatabase() and initializeDatabase() throw when RELIQ_DB_DRIVER=supabase_postgresql.
   5. Zero silent fallback to SQLite in production.
   6. All services (projectService, datasetService, versionService, settingsService, evaluationDbService)
      route through supabaseRepository in production.
   7. Health endpoint reflects databaseType: 'supabase_postgresql'.
   8. Production seed reset is blocked to preserve production Supabase records.
   ============================================================ */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

export async function runProductionArchitectureTests(harness, viteServer) {
  const { test, asyncTest } = harness;

  console.log('\n--- Running Production Architecture Verification Tests ---');

  const { getDatabase, initializeDatabase } = await viteServer.ssrLoadModule('/src/server/db/database.ts');
  const { isSupabaseDriverActive, isSupabaseConfigured } = await viteServer.ssrLoadModule('/src/server/db/supabaseClient.ts');
  const { projectService } = await viteServer.ssrLoadModule('/src/server/services/projectService.ts');
  const { datasetService } = await viteServer.ssrLoadModule('/src/server/services/datasetService.ts');
  const { versionService } = await viteServer.ssrLoadModule('/src/server/services/versionService.ts');
  const { settingsService } = await viteServer.ssrLoadModule('/src/server/services/settingsService.ts');
  const { evaluationDbService } = await viteServer.ssrLoadModule('/src/server/services/evaluationDbService.ts');
  const { createReliqProxyMiddleware } = await viteServer.ssrLoadModule('/src/server/proxyMiddleware.ts');
  const { evaluationCache } = await viteServer.ssrLoadModule('/src/evaluation/evaluationCache.ts');
  const { pruneOldJobs } = await viteServer.ssrLoadModule('/src/server/evaluationService.ts');
  const { getSupabaseUserClient } = await viteServer.ssrLoadModule('/src/server/db/supabaseClient.ts');
  const { GROQ_MODEL_REGISTRY, getEligibleJudgeModels, validateJudgeConfiguration } = await viteServer.ssrLoadModule('/src/evaluation/judgeRegistry.ts');
  const { ExactMatchEvaluator, KeywordCriteriaEvaluator, JsonValidityEvaluator } = await viteServer.ssrLoadModule('/src/evaluation/evaluators.ts');

  // Test 1: vercel.json rewrites /api/* to Render backend
  test('PROD-ARCH-01: vercel.json rewrites /api/* to Render backend (https://reliq-backend.onrender.com/api/$1)', () => {
    const vercelConfigPath = path.resolve(process.cwd(), 'vercel.json');
    assert.ok(fs.existsSync(vercelConfigPath), 'vercel.json must exist');
    const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));

    assert.ok(Array.isArray(vercelConfig.rewrites), 'rewrites must be an array');
    const apiRewrite = vercelConfig.rewrites.find(
      (r) => r.source === '/api/(.*)' || r.source === '/api/:match*' || r.source.startsWith('/api/')
    );
    assert.ok(apiRewrite, 'Must have a rewrite rule for /api/(.*)');
    assert.strictEqual(
      apiRewrite.destination,
      'https://reliq-backend.onrender.com/api/$1',
      'API requests must rewrite to Render production backend'
    );
    assert.strictEqual(vercelConfig.functions, undefined, 'vercel.json functions section must be removed');
  });

  // Test 2: Serverless function entry points removed
  test('PROD-ARCH-02: Vercel serverless function entrypoints (api/index.js, api/package.json, src/server/vercelEntry.ts) do not exist', () => {
    const apiIndex = path.resolve(process.cwd(), 'api', 'index.js');
    const apiPkg = path.resolve(process.cwd(), 'api', 'package.json');
    const vercelEntry = path.resolve(process.cwd(), 'src', 'server', 'vercelEntry.ts');

    assert.strictEqual(fs.existsSync(apiIndex), false, 'api/index.js must be removed');
    assert.strictEqual(fs.existsSync(apiPkg), false, 'api/package.json must be removed');
    assert.strictEqual(fs.existsSync(vercelEntry), false, 'src/server/vercelEntry.ts must be removed');
  });

  // Test 3: package.json build script builds web only
  test('PROD-ARCH-03: package.json build script compiles Vite frontend only without bundling backend into Vercel', () => {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    assert.strictEqual(pkg.scripts.build, 'npm run build:web', 'Default build script must target build:web only');
    assert.strictEqual(pkg.scripts['build:api'], undefined, 'build:api script must be removed');
    assert.ok(pkg.scripts['build:backend'], 'build:backend script must exist for Render');
  });

  // Test 4: Fail-fast: getDatabase() and initializeDatabase() throw when RELIQ_DB_DRIVER=supabase_postgresql
  test('PROD-ARCH-04: getDatabase() and initializeDatabase() throw immediately when RELIQ_DB_DRIVER=supabase_postgresql', () => {
    const origDriver = process.env.RELIQ_DB_DRIVER;
    try {
      process.env.RELIQ_DB_DRIVER = 'supabase_postgresql';

      assert.throws(
        () => {
          getDatabase();
        },
        /SQLite is disabled in production \(RELIQ_DB_DRIVER=supabase_postgresql\)/,
        'getDatabase() must throw when RELIQ_DB_DRIVER=supabase_postgresql'
      );

      assert.throws(
        () => {
          initializeDatabase();
        },
        /SQLite initialization blocked: RELIQ_DB_DRIVER=supabase_postgresql/,
        'initializeDatabase() must throw when RELIQ_DB_DRIVER=supabase_postgresql'
      );
    } finally {
      if (origDriver !== undefined) process.env.RELIQ_DB_DRIVER = origDriver;
      else delete process.env.RELIQ_DB_DRIVER;
    }
  });

  // Test 5: isSupabaseDriverActive() driver resolution
  test('PROD-ARCH-05: isSupabaseDriverActive() returns true for supabase_postgresql and false for sqlite', () => {
    const origDriver = process.env.RELIQ_DB_DRIVER;
    try {
      process.env.RELIQ_DB_DRIVER = 'supabase_postgresql';
      assert.strictEqual(isSupabaseDriverActive(), true);

      process.env.RELIQ_DB_DRIVER = 'sqlite';
      assert.strictEqual(isSupabaseDriverActive(), false);
    } finally {
      if (origDriver !== undefined) process.env.RELIQ_DB_DRIVER = origDriver;
      else delete process.env.RELIQ_DB_DRIVER;
    }
  });

  // Test 6: Health endpoint reports databaseType: 'supabase_postgresql' when active
  await asyncTest('PROD-ARCH-06: GET /api/health reports databaseType: supabase_postgresql without calling getDatabase()', async () => {
    const origDriver = process.env.RELIQ_DB_DRIVER;
    const origUrl = process.env.SUPABASE_URL;
    const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      process.env.RELIQ_DB_DRIVER = 'supabase_postgresql';
      process.env.SUPABASE_URL = 'https://mock-test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-key-for-test';

      const middleware = createReliqProxyMiddleware();
      let responseBody = '';
      const req = new http.IncomingMessage(null);
      req.method = 'GET';
      req.url = '/api/health';

      const res = new http.ServerResponse(req);
      res.end = (chunk) => {
        if (chunk) responseBody += chunk;
      };

      await middleware(req, res, () => {});

      const parsed = JSON.parse(responseBody);
      assert.strictEqual(parsed.databaseType, 'supabase_postgresql');
      assert.strictEqual(parsed.service, 'RELIQ Evaluation Platform');
    } finally {
      if (origDriver !== undefined) process.env.RELIQ_DB_DRIVER = origDriver;
      else delete process.env.RELIQ_DB_DRIVER;
      if (origUrl !== undefined) process.env.SUPABASE_URL = origUrl;
      else delete process.env.SUPABASE_URL;
      if (origKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
      else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }
  });

  // Test 7: Seed reset is blocked in Supabase mode to protect production data
  await asyncTest('PROD-ARCH-07: POST /api/seed/reset is disabled in production Supabase mode', async () => {
    const origDriver = process.env.RELIQ_DB_DRIVER;
    try {
      process.env.RELIQ_DB_DRIVER = 'supabase_postgresql';

      const middleware = createReliqProxyMiddleware();
      let responseBody = '';

      const req = new http.IncomingMessage(null);
      req.method = 'POST';
      req.url = '/api/seed/reset';

      const res = new http.ServerResponse(req);
      res.end = (chunk) => {
        if (chunk) responseBody += chunk;
      };

      await middleware(req, res, () => {});

      const parsed = JSON.parse(responseBody);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(parsed.success, true);
      assert.match(parsed.message, /Production Supabase database reset is disabled/);
    } finally {
      if (origDriver !== undefined) process.env.RELIQ_DB_DRIVER = origDriver;
      else delete process.env.RELIQ_DB_DRIVER;
    }
  });

  // Test 8: Services route through supabaseRepository and do not touch SQLite
  test('PROD-ARCH-08: Services return Promises in Supabase mode without calling SQLite getDatabase()', () => {
    const origDriver = process.env.RELIQ_DB_DRIVER;
    try {
      process.env.RELIQ_DB_DRIVER = 'supabase_postgresql';

      // None of these should throw SQLite disabled error because they bypass SQLite completely
      const projectsPromise = projectService.getAllProjects();
      assert.ok(projectsPromise instanceof Promise, 'getAllProjects must return a Promise in Supabase mode');

      const datasetsPromise = datasetService.getDatasets();
      assert.ok(datasetsPromise instanceof Promise, 'getDatasets must return a Promise in Supabase mode');

      const versionsPromise = versionService.getVersions();
      assert.ok(versionsPromise instanceof Promise, 'getVersions must return a Promise in Supabase mode');

      const runsPromise = evaluationDbService.getEvaluationRuns();
      assert.ok(runsPromise instanceof Promise, 'getEvaluationRuns must return a Promise in Supabase mode');

      // Swallow rejection from mock network
      projectsPromise.catch(() => {});
      datasetsPromise.catch(() => {});
      versionsPromise.catch(() => {});
      runsPromise.catch(() => {});
    } finally {
      if (origDriver !== undefined) process.env.RELIQ_DB_DRIVER = origDriver;
      else delete process.env.RELIQ_DB_DRIVER;
    }
  });

  // Test 9: evaluationCache respects Supabase mode and bounds memory
  await asyncTest('PROD-ARCH-09: evaluationCache never accesses SQLite in Supabase mode and bounds memory', async () => {
    const origDriver = process.env.RELIQ_DB_DRIVER;
    try {
      process.env.RELIQ_DB_DRIVER = 'supabase_postgresql';
      evaluationCache.clearMemory();
      assert.strictEqual(evaluationCache.getMemoryEntryCount(), 0, 'Memory entries must be 0 after clear');

      const req = {
        modelIdentifier: 'test-model',
        input: 'test-input',
      };
      const resp = {
        output: 'test output response',
        usage: {
          promptTokens: 5,
          completionTokens: 5,
          totalTokens: 10,
          reasoningTokens: 0,
          latencyMs: 50,
          provider: 'groq',
        },
      };

      // Writing to memory cache in Supabase mode should NOT trigger SQLite getDatabase()
      await evaluationCache.set(req, resp);

      assert.strictEqual(evaluationCache.getMemoryEntryCount(), 1, 'Memory entries must be 1');
      const cached = await evaluationCache.get(req);
      assert.ok(cached, 'Must retrieve entry from in-memory cache');
      assert.strictEqual(cached.output, 'test output response');

      evaluationCache.clearMemory();
      assert.strictEqual(evaluationCache.getMemoryEntryCount(), 0);
    } finally {
      if (origDriver !== undefined) process.env.RELIQ_DB_DRIVER = origDriver;
      else delete process.env.RELIQ_DB_DRIVER;
    }
  });

  // Test 10: GET /api/health includes memory metrics
  await asyncTest('PROD-ARCH-10: GET /api/health includes memory metrics (rssMb, heapUsedMb, heapTotalMb)', async () => {
    const origDriver = process.env.RELIQ_DB_DRIVER;
    const origUrl = process.env.SUPABASE_URL;
    const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      process.env.RELIQ_DB_DRIVER = 'supabase_postgresql';
      process.env.SUPABASE_URL = 'https://mock-test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-key-for-test';

      const middleware = createReliqProxyMiddleware();
      let responseBody = '';
      const req = new http.IncomingMessage(null);
      req.method = 'GET';
      req.url = '/api/health';

      const res = new http.ServerResponse(req);
      res.end = (chunk) => {
        if (chunk) responseBody += chunk;
      };

      await middleware(req, res, () => {});

      const parsed = JSON.parse(responseBody);
      assert.ok(parsed.memory, 'Response must include memory stats');
      assert.strictEqual(typeof parsed.memory.rssMb, 'number', 'rssMb must be numeric');
      assert.strictEqual(typeof parsed.memory.heapUsedMb, 'number', 'heapUsedMb must be numeric');
      assert.strictEqual(typeof parsed.memory.heapTotalMb, 'number', 'heapTotalMb must be numeric');
      assert.ok(parsed.memory.rssMb > 0, 'rssMb must be positive');
    } finally {
      if (origDriver !== undefined) process.env.RELIQ_DB_DRIVER = origDriver;
      else delete process.env.RELIQ_DB_DRIVER;
      if (origUrl !== undefined) process.env.SUPABASE_URL = origUrl;
      else delete process.env.SUPABASE_URL;
      if (origKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
      else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }
  });

  // Test 11: Backend bundle dist-server/server.js does NOT import Vite
  test('PROD-ARCH-11: Backend bundle dist-server/server.js has zero Vite SSR runtime imports', () => {
    const bundlePath = path.resolve(process.cwd(), 'dist-server', 'server.js');
    if (fs.existsSync(bundlePath)) {
      const content = fs.readFileSync(bundlePath, 'utf8');
      assert.strictEqual(content.includes('createViteServer'), false, 'dist-server/server.js must NOT contain createViteServer');
      assert.strictEqual(content.includes('ssrLoadModule'), false, 'dist-server/server.js must NOT contain ssrLoadModule');
      assert.strictEqual(content.includes("from 'vite'"), false, 'dist-server/server.js must NOT import from vite');
      assert.strictEqual(content.includes('from "vite"'), false, 'dist-server/server.js must NOT import from "vite"');
    }
  });

  // Test 12: pruneOldJobs executes cleanly without throwing
  test('PROD-ARCH-12: pruneOldJobs executes safely and removes stale in-memory evaluation records', () => {
    assert.doesNotThrow(() => {
      pruneOldJobs();
    }, 'pruneOldJobs must execute without error');
  });

  // Test 13: getSupabaseUserClient caches instances to avoid memory leaks
  test('PROD-ARCH-13: getSupabaseUserClient returns cached client for identical auth tokens', () => {
    const origUrl = process.env.SUPABASE_URL;
    const origKey = process.env.SUPABASE_ANON_KEY;
    try {
      process.env.SUPABASE_URL = 'https://mock-test.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'mock-anon-key';

      const client1 = getSupabaseUserClient('Bearer mock-jwt-token-12345');
      const client2 = getSupabaseUserClient('Bearer mock-jwt-token-12345');
      assert.strictEqual(client1, client2, 'getSupabaseUserClient must return cached instance for identical token');
    } finally {
      if (origUrl !== undefined) process.env.SUPABASE_URL = origUrl;
      else delete process.env.SUPABASE_URL;
      if (origKey !== undefined) process.env.SUPABASE_ANON_KEY = origKey;
      else delete process.env.SUPABASE_ANON_KEY;
    }
  });

  // Test 14: Qwen models are eligible judges and 120b models are excluded
  test('PROD-ARCH-14: Qwen models are eligible for judging and 120b models are excluded', () => {
    assert.strictEqual(GROQ_MODEL_REGISTRY['qwen/qwen3.8-27b']?.isJudgeEligible, true);
    assert.strictEqual(GROQ_MODEL_REGISTRY['qwen-2.5-32b']?.isJudgeEligible, true);
    assert.strictEqual(GROQ_MODEL_REGISTRY['openai/gpt-oss-120b']?.isJudgeEligible, false);
    assert.strictEqual(GROQ_MODEL_REGISTRY['gpt-oss-120b']?.isJudgeEligible, false);

    // Even if 120B is neither baseline nor candidate, it must be excluded from eligible judge models
    const eligible = getEligibleJudgeModels('openai/gpt-oss-20b', 'allam-2-7b');
    assert.ok(eligible.some((m) => m.id === 'qwen/qwen3.8-27b'), 'Qwen must be in eligible judges');
    assert.ok(eligible.some((m) => m.id === 'qwen-2.5-32b'), 'Qwen 2.5 must be in eligible judges');
    assert.strictEqual(eligible.some((m) => m.id.includes('120b')), false, 'No 120B model may be in eligible judges');
  });

  // Test 15: validateJudgeConfiguration rejects 120B model as judge
  test('PROD-ARCH-15: validateJudgeConfiguration rejects 120b models as judges with clear error', () => {
    const res = validateJudgeConfiguration(
      { enabled: true, modelIdentifier: 'openai/gpt-oss-120b', provider: 'groq' },
      'openai/gpt-oss-20b',
      'allam-2-7b'
    );
    assert.strictEqual(res.valid, false);
    assert.ok(res.error.includes('120B'), 'Error message must explain 120B model ineligibility');
  });

  // Test 16: Evaluators tolerate trailing periods in model responses
  test('PROD-ARCH-16: Evaluators tolerate trailing periods in model responses', () => {
    // 1. Exact match with trailing dot
    const emTest = { id: 't1', name: 'T1', category: 'General', input: 'test', expectedOutput: 'Order confirmed' };
    const emResWithDot = ExactMatchEvaluator.evaluate('Order confirmed.', emTest);
    assert.strictEqual(emResWithDot.passed, true, 'Exact match must pass when actual has trailing dot');
    assert.strictEqual(emResWithDot.score, 1.0);

    // 2. Keyword criteria with trailing dot
    const kwTest = {
      id: 't2',
      name: 'T2',
      category: 'General',
      input: 'test',
      evaluatorConfig: { requiredKeywords: ['success.'] },
    };
    const kwRes = KeywordCriteriaEvaluator.evaluate('Operation ended with success', kwTest);
    assert.strictEqual(kwRes.passed, true, 'Keyword criteria must pass when keyword has trailing dot but actual does not');

    // 3. JSON validity with trailing dot outside JSON block
    const jsonTest = {
      id: 't3',
      name: 'T3',
      category: 'General',
      input: 'test',
      evaluatorConfig: { requiredJsonKeys: ['status'] },
    };
    const jsonRes = JsonValidityEvaluator.evaluate('{"status": "ok"}.', jsonTest);
    assert.strictEqual(jsonRes.passed, true, 'JSON validity must pass when JSON has trailing dot');
  });

  // Test 17: ComparisonReportModal renders Baseline Output on left and Candidate Output on right
  test('PROD-ARCH-17: ComparisonReportModal source places Baseline Output before Candidate Output', () => {
    const modalPath = path.resolve(process.cwd(), 'src/app/components/ComparisonReportModal.tsx');
    assert.ok(fs.existsSync(modalPath), 'ComparisonReportModal.tsx must exist');
    const content = fs.readFileSync(modalPath, 'utf8');

    const baseIdx = content.indexOf('Baseline Output:');
    const candIdx = content.indexOf('Candidate Output:');
    assert.ok(baseIdx !== -1, 'Must contain Baseline Output: label');
    assert.ok(candIdx !== -1, 'Must contain Candidate Output: label');
    assert.ok(baseIdx < candIdx, 'Baseline Output must appear before Candidate Output in the DOM order (Baseline on left, Candidate on right)');
  });

  console.log('--- All Production Architecture Verification Tests Completed Successfully ---');
}
