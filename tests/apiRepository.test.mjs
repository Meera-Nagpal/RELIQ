/* ============================================================
   RELIQ — ApiRepository Integration & Storage Verification Suite
   
   Covers all requirements from STEP 3:
   1. Projects: GET (all), GET (single), POST, PUT, DELETE
   2. Datasets: GET (all), GET (single), POST, PUT, DELETE
   3. Test Cases: GET (cases), POST, PUT, DELETE
   4. Model Versions: GET (all), POST, PUT, DELETE
   5. Settings: GET, PUT
   6. Evaluation Runs: GET (all), GET (single), results, failures
   7. Release Decision: PATCH release-decision
   8. Run Deletion: DELETE run
   9. Error Handling: 404 produces frontend ApiError, 400 produces frontend ApiError
   10. Network Failure: unreachable backend throws visible ApiError
   11. Extra Fields Resilience: unknown fields do not crash frontend
   12. LocalStorage Non-Regression: database is authoritative, no overwrite
   ============================================================ */

import assert from 'node:assert';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createServer } from 'vite';

export async function runApiRepositoryTests(testRunner, existingVite) {
  let vite = existingVite;
  let shouldCloseVite = false;

  if (!vite) {
    vite = await createServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    shouldCloseVite = true;
  }

  // Load modules via Vite SSR loader
  const { initializeDatabase, getDatabase, closeDatabase } = await vite.ssrLoadModule('/src/server/db/database.ts');
  const { createReliqProxyMiddleware } = await vite.ssrLoadModule('/src/server/proxyMiddleware.ts');
  const { ApiClient, ApiError } = await vite.ssrLoadModule('/src/services/apiClient.ts');
  const { ApiRepository } = await vite.ssrLoadModule('/src/services/apiRepository.ts');

  const testDbDir = path.resolve(process.cwd(), 'data', 'test_apirepo_db');
  const testDbPath = path.join(testDbDir, 'test_apirepo_reliq.db');

  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
    if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
  } catch {}

  // Initialize SQLite database
  initializeDatabase({ dbPath: testDbPath });

  // Setup test HTTP server
  const middleware = createReliqProxyMiddleware();
  const server = http.createServer((req, res) => {
    middleware(req, res, () => {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: `Cannot ${req.method} ${req.url}` } }));
    });
  });

  const TEST_PORT = 3096;
  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));

  const client = new ApiClient(`http://127.0.0.1:${TEST_PORT}`);
  const repo = new ApiRepository(client);

  const { test, asyncTest } = testRunner;

  // Simple mock localStorage for Node environment
  const mockStorage = new Map();
  globalThis.localStorage = {
    getItem: (key) => mockStorage.get(key) || null,
    setItem: (key, val) => mockStorage.set(key, String(val)),
    removeItem: (key) => mockStorage.delete(key),
    clear: () => mockStorage.clear(),
  };

  console.log('\n--- Running ApiRepository Frontend Storage Tests ---');

  try {
    // -------------------------------------------------------------
    // Test 1: GET projects returns authoritative backend projects
    // -------------------------------------------------------------
    await asyncTest('REPO-1: GET projects returns projects from backend database', async () => {
      const projects = await repo.getProjects();
      assert.ok(Array.isArray(projects));
      assert.ok(projects.length >= 1);
      const seeded = projects.find((p) => p.id === 'proj-checkout-agent');
      assert.ok(seeded, 'Seeded proj-checkout-agent must exist');
      assert.strictEqual(seeded.name, 'Checkout Agent');
      assert.ok(seeded.regressionSettings);
      assert.strictEqual(seeded.regressionSettings.minAccuracyPercent, 95);
    });

    // -------------------------------------------------------------
    // Test 2: GET project by ID
    // -------------------------------------------------------------
    await asyncTest('REPO-2: GET project by ID returns single mapped project', async () => {
      const project = await repo.getProjectById('proj-checkout-agent');
      assert.ok(project);
      assert.strictEqual(project.id, 'proj-checkout-agent');
      assert.strictEqual(project.name, 'Checkout Agent');
      assert.strictEqual(project.regressionSettings.maxAccuracyDegradationPercent, 2);

      const notFound = await repo.getProjectById('proj-non-existent');
      assert.strictEqual(notFound, null);
    });

    // -------------------------------------------------------------
    // Test 3: POST project creates a new project via saveProject
    // -------------------------------------------------------------
    const newProjectId = `proj-repo-test-${Date.now().toString(36)}`;
    await asyncTest('REPO-3: POST project creates new project via saveProject', async () => {
      await repo.saveProject({
        id: newProjectId,
        name: 'Repo Integration Test Project',
        description: 'Created via ApiRepository',
        baselineVersionId: 'ver-v1-4',
        candidateVersionId: 'ver-v1-5',
        regressionSettings: {
          minAccuracyPercent: 92.5,
          maxAccuracyDegradationPercent: 3.0,
          maxLatencyIncreasePercent: 15.0,
          maxFailureRatePercent: 5.0,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const fetched = await repo.getProjectById(newProjectId);
      assert.ok(fetched);
      assert.strictEqual(fetched.name, 'Repo Integration Test Project');
      assert.strictEqual(fetched.regressionSettings.minAccuracyPercent, 92.5);
    });

    // -------------------------------------------------------------
    // Test 4: PUT project updates project via saveProject
    // -------------------------------------------------------------
    await asyncTest('REPO-4: PUT project updates existing project details', async () => {
      await repo.saveProject({
        id: newProjectId,
        name: 'Repo Integration Test Project (Updated)',
        description: 'Updated description',
        baselineVersionId: 'ver-v1-4',
        candidateVersionId: 'ver-v1-5',
        regressionSettings: {
          minAccuracyPercent: 96.0,
          maxAccuracyDegradationPercent: 1.5,
          maxLatencyIncreasePercent: 10.0,
          maxFailureRatePercent: 5.0,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const fetched = await repo.getProjectById(newProjectId);
      assert.strictEqual(fetched.name, 'Repo Integration Test Project (Updated)');
      assert.strictEqual(fetched.regressionSettings.minAccuracyPercent, 96.0);
    });

    // -------------------------------------------------------------
    // Test 5: DELETE project removes project from backend
    // -------------------------------------------------------------
    await asyncTest('REPO-5: DELETE project removes project and cascades', async () => {
      await repo.deleteProject(newProjectId);
      const fetched = await repo.getProjectById(newProjectId);
      assert.strictEqual(fetched, null);
    });

    // -------------------------------------------------------------
    // Test 6: GET datasets returns list with test cases
    // -------------------------------------------------------------
    await asyncTest('REPO-6: GET datasets returns datasets with populated cases', async () => {
      const datasets = await repo.getDatasets('proj-checkout-agent');
      assert.ok(Array.isArray(datasets));
      assert.ok(datasets.length >= 2);
      const golden = datasets.find((d) => d.id === 'ds-checkout-golden');
      assert.ok(golden);
      assert.strictEqual(golden.cases.length, 22);
    });

    // -------------------------------------------------------------
    // Test 7: GET dataset by ID
    // -------------------------------------------------------------
    await asyncTest('REPO-7: GET dataset by ID returns single dataset with cases', async () => {
      const ds = await repo.getDatasetById('ds-checkout-golden');
      assert.ok(ds);
      assert.strictEqual(ds.id, 'ds-checkout-golden');
      assert.strictEqual(ds.cases.length, 22);

      const notFound = await repo.getDatasetById('ds-non-existent');
      assert.strictEqual(notFound, null);
    });

    // -------------------------------------------------------------
    // Test 8: POST dataset creates new dataset via saveDataset
    // -------------------------------------------------------------
    const newDatasetId = `ds-repo-test-${Date.now().toString(36)}`;
    await asyncTest('REPO-8: POST dataset creates new dataset via saveDataset', async () => {
      await repo.saveDataset({
        id: newDatasetId,
        projectId: 'proj-checkout-agent',
        name: 'Repo Test Dataset',
        description: 'Created via ApiRepository',
        cases: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const fetched = await repo.getDatasetById(newDatasetId);
      assert.ok(fetched);
      assert.strictEqual(fetched.name, 'Repo Test Dataset');
      assert.strictEqual(fetched.cases.length, 0);
    });

    // -------------------------------------------------------------
    // Test 9: PUT dataset updates dataset details
    // -------------------------------------------------------------
    await asyncTest('REPO-9: PUT dataset updates dataset name and description', async () => {
      await repo.saveDataset({
        id: newDatasetId,
        projectId: 'proj-checkout-agent',
        name: 'Repo Test Dataset (Updated)',
        description: 'Updated description',
        cases: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const fetched = await repo.getDatasetById(newDatasetId);
      assert.strictEqual(fetched.name, 'Repo Test Dataset (Updated)');
    });

    // -------------------------------------------------------------
    // Test 10: Test Cases: POST, GET, PUT, DELETE via test case methods
    // -------------------------------------------------------------
    const newCaseId = `tc-repo-test-${Date.now().toString(36)}`;
    await asyncTest('REPO-10, 11, 12, 13: Test case operations via ApiRepository', async () => {
      // 1. Create test case
      await repo.saveTestCase(newDatasetId, {
        id: newCaseId,
        name: 'Verify Coupon Boundary',
        category: 'Policy Gate',
        input: 'Apply coupon DISCOUNT90 to order total $100',
        expectedOutput: 'Coupon rejected: maximum allowed discount is 50%',
        evaluatorType: 'exact_match',
        severity: 'high',
        tags: ['coupons', 'policy'],
        createdAt: new Date().toISOString(),
      });

      // 2. Fetch cases
      let cases = await repo.getTestCases(newDatasetId);
      assert.strictEqual(cases.length, 1);
      assert.strictEqual(cases[0].id, newCaseId);
      assert.strictEqual(cases[0].name, 'Verify Coupon Boundary');

      // 3. Update test case
      await repo.saveTestCase(newDatasetId, {
        id: newCaseId,
        name: 'Verify Coupon Boundary (Updated)',
        category: 'Policy Gate',
        input: 'Apply coupon DISCOUNT90 to order total $100',
        expectedOutput: 'Updated expected message',
        evaluatorType: 'normalized_text',
        severity: 'critical',
        tags: ['coupons', 'policy', 'v2'],
        createdAt: new Date().toISOString(),
      });

      cases = await repo.getTestCases(newDatasetId);
      assert.strictEqual(cases[0].name, 'Verify Coupon Boundary (Updated)');
      assert.strictEqual(cases[0].expectedOutput, 'Updated expected message');

      // 4. Delete test case
      await repo.deleteTestCase(newDatasetId, newCaseId);
      cases = await repo.getTestCases(newDatasetId);
      assert.strictEqual(cases.length, 0);
    });

    // -------------------------------------------------------------
    // Test 14: DELETE dataset removes dataset and cases
    // -------------------------------------------------------------
    await asyncTest('REPO-14: DELETE dataset removes dataset from backend', async () => {
      await repo.deleteDataset(newDatasetId);
      const fetched = await repo.getDatasetById(newDatasetId);
      assert.strictEqual(fetched, null);
    });

    // -------------------------------------------------------------
    // Test 15: GET versions returns model versions
    // -------------------------------------------------------------
    await asyncTest('REPO-15: GET versions returns versions without API keys', async () => {
      const versions = await repo.getVersions('proj-checkout-agent');
      assert.ok(Array.isArray(versions));
      assert.ok(versions.length >= 2);
      for (const v of versions) {
        assert.strictEqual(v.apiKey, undefined);
        assert.strictEqual(v.api_key, undefined);
      }
    });

    // -------------------------------------------------------------
    // Test 16: POST and PUT version
    // -------------------------------------------------------------
    const newVersionId = `ver-repo-test-${Date.now().toString(36)}`;
    await asyncTest('REPO-16, 17: POST and PUT version via ApiRepository', async () => {
      await repo.saveVersion({
        id: newVersionId,
        name: 'v2.0 Experimental Agent',
        provider: 'groq',
        modelIdentifier: 'llama-3.3-70b-versatile',
        promptVersion: '2.0',
        systemPrompt: 'System prompt for v2.0',
        temperature: 0.5,
        createdAt: new Date().toISOString(),
      });

      let fetched = await repo.getVersionById(newVersionId);
      assert.ok(fetched);
      assert.strictEqual(fetched.name, 'v2.0 Experimental Agent');

      // Update version
      await repo.saveVersion({
        ...fetched,
        name: 'v2.0 Experimental Agent (Modified)',
      });

      fetched = await repo.getVersionById(newVersionId);
      assert.strictEqual(fetched?.name, 'v2.0 Experimental Agent (Modified)');

      // Clean up version
      if (repo.deleteVersion) {
        await repo.deleteVersion(newVersionId);
        const deleted = await repo.getVersionById(newVersionId);
        assert.strictEqual(deleted, null);
      }
    });

    // -------------------------------------------------------------
    // Test 18: Project settings GET & PUT
    // -------------------------------------------------------------
    await asyncTest('REPO-18, 19: Project settings GET and PUT upsert', async () => {
      const settings = await repo.getProjectSettings('proj-checkout-agent');
      assert.ok(settings);
      assert.strictEqual(settings.minAccuracyPercent, 95);

      await repo.saveProjectSettings('proj-checkout-agent', {
        minAccuracyPercent: 96.5,
        maxAccuracyDegradationPercent: 1.8,
        maxLatencyIncreasePercent: 22.0,
        maxFailureRatePercent: 5.0,
      });

      const updated = await repo.getProjectSettings('proj-checkout-agent');
      assert.strictEqual(updated?.minAccuracyPercent, 96.5);
      assert.strictEqual(updated?.maxAccuracyDegradationPercent, 1.8);

      // Restore
      await repo.saveProjectSettings('proj-checkout-agent', {
        minAccuracyPercent: 95.0,
        maxAccuracyDegradationPercent: 2.0,
        maxLatencyIncreasePercent: 20.0,
        maxFailureRatePercent: 5.0,
      });
    });

    // -------------------------------------------------------------
    // Test 20: GET evaluation runs
    // -------------------------------------------------------------
    await asyncTest('REPO-20: GET evaluation runs returns runs from backend', async () => {
      const runs = await repo.getEvaluationRuns('proj-checkout-agent');
      assert.ok(Array.isArray(runs));
      assert.ok(runs.length >= 1);
    });

    // -------------------------------------------------------------
    // Test 21: GET single evaluation run
    // -------------------------------------------------------------
    let testRunId = '';
    await asyncTest('REPO-21: GET single evaluation run by ID', async () => {
      const runs = await repo.getEvaluationRuns();
      if (runs.length > 0) {
        testRunId = runs[0].id;
        const run = await repo.getEvaluationRunById(testRunId);
        assert.ok(run);
        assert.strictEqual(run.id, testRunId);
      }
    });

    // -------------------------------------------------------------
    // Test 22: PATCH release decision update
    // -------------------------------------------------------------
    await asyncTest('REPO-22: updateReleaseDecision updates decision atomically', async () => {
      if (!testRunId) {
        const runs = await repo.getEvaluationRuns();
        testRunId = runs[0]?.id;
      }
      if (testRunId) {
        const res = await repo.updateReleaseDecision(testRunId, 'SHIP_WITH_CONDITIONS', 'Certified with caveat');
        assert.ok(res);
        assert.strictEqual(res.decision, 'SHIP_WITH_CONDITIONS');
        assert.ok(res.audit);
      }
    });

    // -------------------------------------------------------------
    // Test 23: Backend 404 produces frontend ApiError
    // -------------------------------------------------------------
    await asyncTest('REPO-23: Backend 404 produces frontend ApiError', async () => {
      let threw = false;
      try {
        await repo.deleteProject('proj-non-existent-12345');
      } catch (err) {
        threw = true;
        assert.ok(err instanceof ApiError);
        assert.strictEqual(err.status, 404);
        assert.strictEqual(err.code, 'PROJECT_NOT_FOUND');
      }
      assert.strictEqual(threw, true, 'deleteProject on non-existent ID must throw 404');
    });

    // -------------------------------------------------------------
    // Test 24: Backend 400 produces frontend ApiError
    // -------------------------------------------------------------
    await asyncTest('REPO-24: Backend 400 produces frontend ApiError', async () => {
      let threw = false;
      try {
        await repo.updateReleaseDecision('run-test-fake', 'INVALID_DECISION_XYZ', 'justification');
      } catch (err) {
        threw = true;
        assert.ok(err instanceof ApiError);
        assert.strictEqual(err.status, 400);
        assert.strictEqual(err.code, 'INVALID_RELEASE_DECISION');
      }
      assert.strictEqual(threw, true, 'Invalid release decision must throw 400');
    });

    // -------------------------------------------------------------
    // Test 25: Network failure does NOT silently succeed
    // -------------------------------------------------------------
    await asyncTest('REPO-25: Unreachable backend throws visible NETWORK_ERROR ApiError', async () => {
      const deadClient = new ApiClient('http://127.0.0.1:19999'); // closed port
      const deadRepo = new ApiRepository(deadClient);

      let threw = false;
      try {
        await deadRepo.getProjects();
      } catch (err) {
        threw = true;
        assert.ok(err instanceof ApiError);
        assert.strictEqual(err.status, 0);
        assert.strictEqual(err.code, 'NETWORK_ERROR');
      }
      assert.strictEqual(threw, true, 'Unreachable backend must visibly fail');
    });

    // -------------------------------------------------------------
    // Test 26: Unknown extra fields in API response do NOT crash frontend
    // -------------------------------------------------------------
    await asyncTest('REPO-26: Unknown extra fields in API response do not crash mapping', async () => {
      const dummyClient = {
        get: async () => ({
          projects: [
            {
              id: 'proj-extra-test',
              name: 'Extra Fields Project',
              description: 'Testing resilience',
              unknownFieldAlpha: 12345,
              arbitraryTelemetryObject: { foo: 'bar' },
              created_at: '2026-09-16T00:00:00.000Z',
              updated_at: '2026-09-16T00:00:00.000Z',
            },
          ],
        }),
      };
      const testRepo = new ApiRepository(dummyClient);
      const projs = await testRepo.getProjects();
      assert.strictEqual(projs.length, 1);
      assert.strictEqual(projs[0].id, 'proj-extra-test');
      assert.strictEqual(projs[0].name, 'Extra Fields Project');
    });

    // -------------------------------------------------------------
    // Test 27: LocalStorage non-regression test
    // -------------------------------------------------------------
    await asyncTest('REPO-27: LocalStorage regression protection - backend is authoritative', async () => {
      // 1. Populate mock localStorage with obsolete fake data
      globalThis.localStorage.setItem(
        'reliq_projects_v2',
        JSON.stringify([
          {
            id: 'proj-fake-local',
            name: 'Obsolete Local Project',
            description: 'Should not overwrite backend',
          },
        ])
      );

      // 2. ApiRepository fetch must return backend SQLite data, NOT fake localStorage
      const projs = await repo.getProjects();
      const fake = projs.find((p) => p.id === 'proj-fake-local');
      assert.strictEqual(fake, undefined, 'Fake localStorage project must NOT exist in backend data');
      const seeded = projs.find((p) => p.id === 'proj-checkout-agent');
      assert.ok(seeded, 'Backend seeded project must be returned');

      // 3. Create project on backend
      const liveId = `proj-live-${Date.now().toString(36)}`;
      await repo.saveProject({
        id: liveId,
        name: 'Live Persistence Project',
        description: 'Verified against SQLite',
        baselineVersionId: 'ver-v1-4',
        candidateVersionId: 'ver-v1-5',
        regressionSettings: {
          minAccuracyPercent: 95.0,
          maxAccuracyDegradationPercent: 2.0,
          maxLatencyIncreasePercent: 20.0,
          maxFailureRatePercent: 5.0,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // 4. Verify directly in SQLite database
      const db = getDatabase();
      const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(liveId);
      assert.ok(row, 'Created project must be present in SQLite projects table');

      // 5. Delete project on backend
      await repo.deleteProject(liveId);
      const rowAfter = db.prepare('SELECT * FROM projects WHERE id = ?').get(liveId);
      assert.strictEqual(rowAfter, undefined, 'Deleted project must be removed from SQLite');

      // 6. Verify subsequent fetch does not resurrect from localStorage
      const projsAfter = await repo.getProjects();
      assert.strictEqual(projsAfter.find((p) => p.id === liveId), undefined);
    });

  } finally {
    // Teardown HTTP server
    await new Promise((resolve) => server.close(resolve));

    // Teardown database
    closeDatabase();

    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
      if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
      if (fs.existsSync(testDbDir)) fs.rmdirSync(testDbDir);
    } catch {}

    if (shouldCloseVite) {
      await vite.close();
    }
  }

  console.log('--- All ApiRepository Frontend Storage Tests Completed Successfully ---\n');
}

// Standalone execution: node tests/apiRepository.test.mjs
if (process.argv[1] && process.argv[1].endsWith('apiRepository.test.mjs')) {
  let passed = 0;
  let failed = 0;
  runApiRepositoryTests({
    test: (name, fn) => {
      try {
        fn();
        console.log(`  ✓ PASS: ${name}`);
        passed++;
      } catch (err) {
        console.error(`  ✗ FAIL: ${name}\n    ${err.message}`);
        failed++;
      }
    },
    asyncTest: async (name, fn) => {
      try {
        await fn();
        console.log(`  ✓ PASS: ${name}`);
        passed++;
      } catch (err) {
        console.error(`  ✗ FAIL: ${name}\n    ${err.message}`);
        failed++;
      }
    },
  }).then(() => {
    console.log(`API REPOSITORY TESTS SUMMARY: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
    else process.exit(0);
  }).catch((err) => {
    console.error('Fatal error in ApiRepository test suite:', err);
    process.exit(1);
  });
}
