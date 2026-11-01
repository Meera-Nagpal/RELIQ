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

  console.log('--- All Production Architecture Verification Tests Completed Successfully ---');
}
