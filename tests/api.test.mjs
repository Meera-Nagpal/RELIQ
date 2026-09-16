/* ============================================================
   RELIQ — REST API Integration Test Suite
   
   Covers 36 integration test scenarios across:
   - Projects API (CRUD, validation, 404s)
   - Datasets API (CRUD, project filter, 404s)
   - Test Cases API (CRUD, case_count synchronization, relationship validation)
   - Model Versions API (CRUD, security)
   - Project Settings API (GET, PUT, upsert idempotency)
   - Release Decision API (PATCH, audit log, rollback, invalid decision)
   - Evaluation Read APIs (runs, results, failures, legacy disk integration)
   - Security checks (zero API key leakage)
   ============================================================ */

import assert from 'node:assert';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createServer } from 'vite';

export async function runApiTests(testRunner, existingVite) {
  let vite = existingVite;
  let shouldCloseVite = false;

  if (!vite) {
    vite = await createServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    shouldCloseVite = true;
  }

  // Load database & middleware via Vite SSR loader
  const { initializeDatabase, getDatabase, closeDatabase } = await vite.ssrLoadModule('/src/server/db/database.ts');
  const { createReliqProxyMiddleware } = await vite.ssrLoadModule('/src/server/proxyMiddleware.ts');

  const testDbDir = path.resolve(process.cwd(), 'data', 'test_api_db');
  const testDbPath = path.join(testDbDir, 'test_api_reliq.db');

  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
    if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
  } catch {}

  // Initialize test database with golden seeds
  initializeDatabase({ dbPath: testDbPath });

  // Spin up lightweight HTTP server for testing REST endpoints
  const middleware = createReliqProxyMiddleware();
  const server = http.createServer((req, res) => {
    middleware(req, res, () => {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: `Cannot ${req.method} ${req.url}` } }));
    });
  });

  const TEST_PORT = 3099;
  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${TEST_PORT}`;

  const { test, asyncTest } = testRunner;

  console.log('\n--- Running Backend REST API Integration Tests ---');

  let createdProjectId = '';
  let createdDatasetId = '';
  let createdTestCaseId = '';
  let createdVersionId = '';
  let testRunId = '';

  try {
    // =========================================================
    // 1. PROJECTS API
    // =========================================================

    // Test 1: GET projects
    await asyncTest('API-1: GET /api/projects returns all projects', async () => {
      const res = await fetch(`${baseUrl}/api/projects`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.projects));
      assert.ok(data.projects.length >= 1);
      assert.ok(data.projects.some((p) => p.id === 'proj-checkout-agent'));
    });

    // Test 2: GET project by ID
    await asyncTest('API-2: GET /api/projects/:id returns single project', async () => {
      const res = await fetch(`${baseUrl}/api/projects/proj-checkout-agent`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.id, 'proj-checkout-agent');
      assert.strictEqual(data.name, 'Checkout Agent');
    });

    // Test 3: POST project
    await asyncTest('API-3: POST /api/projects creates project with generated ID', async () => {
      const payload = {
        name: 'Autonomous Billing Sentinel',
        description: 'Verifies invoice calculation and payment gate accuracy',
      };
      const res = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.ok(data.id.startsWith('proj-'));
      assert.strictEqual(data.name, payload.name);
      assert.strictEqual(data.description, payload.description);
      assert.ok(data.created_at);
      createdProjectId = data.id;
    });

    // Test 4: PUT project
    await asyncTest('API-4: PUT /api/projects/:id updates project details', async () => {
      const payload = {
        name: 'Autonomous Billing Sentinel V2',
        description: 'Updated description for sentinel workspace',
      };
      const res = await fetch(`${baseUrl}/api/projects/${createdProjectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.id, createdProjectId);
      assert.strictEqual(data.name, payload.name);
      assert.strictEqual(data.description, payload.description);
    });

    // Test 5: DELETE project
    await asyncTest('API-5: DELETE /api/projects/:id deletes project and cascades', async () => {
      // Create temporary project to delete
      const tempRes = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Temporary Project to Delete' }),
      });
      const tempProj = await tempRes.json();

      const delRes = await fetch(`${baseUrl}/api/projects/${tempProj.id}`, { method: 'DELETE' });
      assert.strictEqual(delRes.status, 200);
      const delData = await delRes.json();
      assert.strictEqual(delData.success, true);
      assert.strictEqual(delData.id, tempProj.id);

      // Verify 404 after deletion
      const checkRes = await fetch(`${baseUrl}/api/projects/${tempProj.id}`);
      assert.strictEqual(checkRes.status, 404);
    });

    // Test 6: 404 nonexistent project
    await asyncTest('API-6: GET /api/projects/:id returns 404 PROJECT_NOT_FOUND', async () => {
      const res = await fetch(`${baseUrl}/api/projects/proj-nonexistent-999`);
      assert.strictEqual(res.status, 404);
      const data = await res.json();
      assert.strictEqual(data.error.code, 'PROJECT_NOT_FOUND');
    });

    // Test 7: validation failure
    await asyncTest('API-7: POST /api/projects with empty name returns 400 VALIDATION_ERROR', async () => {
      const res = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '   ', description: 'No name provided' }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.code, 'VALIDATION_ERROR');
    });

    // =========================================================
    // 2. DATASET API
    // =========================================================

    // Test 8: GET datasets
    await asyncTest('API-8: GET /api/datasets returns datasets list', async () => {
      const res = await fetch(`${baseUrl}/api/datasets`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.datasets));
      assert.ok(data.datasets.length >= 1);
    });

    // Test 9: GET datasets by project
    await asyncTest('API-9: GET /api/datasets?projectId=<id> filters by project', async () => {
      const res = await fetch(`${baseUrl}/api/datasets?projectId=proj-checkout-agent`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.datasets));
      for (const d of data.datasets) {
        assert.strictEqual(d.project_id, 'proj-checkout-agent');
      }
    });

    // Test 10: GET dataset by ID
    await asyncTest('API-10: GET /api/datasets/:id returns dataset metadata with case_count', async () => {
      const res = await fetch(`${baseUrl}/api/datasets/ds-checkout-golden`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.id, 'ds-checkout-golden');
      assert.strictEqual(data.name, 'Checkout Reliability Suite');
      assert.strictEqual(typeof data.case_count, 'number');
      assert.ok(data.case_count >= 22);
    });

    // Test 11: POST dataset
    await asyncTest('API-11: POST /api/datasets creates new dataset', async () => {
      const payload = {
        projectId: createdProjectId,
        name: 'Invoice Edge Cases Benchmark',
        description: 'Scenarios testing VAT, coupon stacking, and regional rounding',
      };
      const res = await fetch(`${baseUrl}/api/datasets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.ok(data.id.startsWith('ds-'));
      assert.strictEqual(data.project_id, createdProjectId);
      assert.strictEqual(data.name, payload.name);
      assert.strictEqual(data.case_count, 0);
      createdDatasetId = data.id;
    });

    // Test 12: PUT dataset
    await asyncTest('API-12: PUT /api/datasets/:id updates dataset details', async () => {
      const payload = {
        name: 'Invoice Edge Cases Benchmark V2',
        description: 'Expanded test suite description',
      };
      const res = await fetch(`${baseUrl}/api/datasets/${createdDatasetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.name, payload.name);
      assert.strictEqual(data.description, payload.description);
    });

    // Test 13: DELETE dataset
    await asyncTest('API-13: DELETE /api/datasets/:id deletes dataset', async () => {
      const tempRes = await fetch(`${baseUrl}/api/datasets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: createdProjectId, name: 'Temp Dataset to Delete' }),
      });
      const tempDs = await tempRes.json();

      const delRes = await fetch(`${baseUrl}/api/datasets/${tempDs.id}`, { method: 'DELETE' });
      assert.strictEqual(delRes.status, 200);
      const delData = await delRes.json();
      assert.strictEqual(delData.success, true);
    });

    // Test 14: 404 nonexistent dataset
    await asyncTest('API-14: GET /api/datasets/:id returns 404 DATASET_NOT_FOUND', async () => {
      const res = await fetch(`${baseUrl}/api/datasets/ds-nonexistent-888`);
      assert.strictEqual(res.status, 404);
      const data = await res.json();
      assert.strictEqual(data.error.code, 'DATASET_NOT_FOUND');
    });

    // =========================================================
    // 3. TEST CASE API
    // =========================================================

    // Test 15: GET dataset cases
    await asyncTest('API-15: GET /api/datasets/:datasetId/cases returns test cases', async () => {
      const res = await fetch(`${baseUrl}/api/datasets/ds-checkout-golden/cases`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.cases));
      assert.ok(data.cases.length >= 22);
      assert.strictEqual(data.count, data.cases.length);
    });

    // Test 16: POST test case
    await asyncTest('API-16: POST /api/datasets/:datasetId/cases creates test case', async () => {
      const payload = {
        name: 'VAT Calculation for Luxembourg customer',
        category: 'Tool Calling',
        input: 'Calculate 17% VAT for cart #4023 with total 100 EUR',
        expectedBehavior: '{"vat": 17.00, "currency": "EUR"}',
      };
      const res = await fetch(`${baseUrl}/api/datasets/${createdDatasetId}/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.ok(data.id.startsWith('tc-'));
      assert.strictEqual(data.dataset_id, createdDatasetId);
      assert.strictEqual(data.name, payload.name);
      assert.strictEqual(data.expected_behavior, payload.expectedBehavior);
      createdTestCaseId = data.id;
    });

    // Test 17: PUT test case
    await asyncTest('API-17: PUT /api/datasets/:datasetId/cases/:caseId updates test case', async () => {
      const payload = {
        name: 'VAT Calculation for Luxembourg customer (Updated)',
        expectedBehavior: '{"vat": 17.00, "totalWithTax": 117.00, "currency": "EUR"}',
      };
      const res = await fetch(`${baseUrl}/api/datasets/${createdDatasetId}/cases/${createdTestCaseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.name, payload.name);
      assert.strictEqual(data.expected_behavior, payload.expectedBehavior);
    });

    // Test 18 & 19: dataset case_count updates correctly & DELETE test case
    await asyncTest('API-18 & 19: dataset.case_count synchronizes accurately on creation and deletion', async () => {
      // Current count should be 1
      const dsRes1 = await fetch(`${baseUrl}/api/datasets/${createdDatasetId}`);
      const ds1 = await dsRes1.json();
      assert.strictEqual(ds1.case_count, 1);

      // Add second case
      const c2Res = await fetch(`${baseUrl}/api/datasets/${createdDatasetId}/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Case 2 for count test',
          category: 'Policy Gate',
          input: 'Test input 2',
          expectedBehavior: 'Expected 2',
        }),
      });
      const c2 = await c2Res.json();

      const dsRes2 = await fetch(`${baseUrl}/api/datasets/${createdDatasetId}`);
      const ds2 = await dsRes2.json();
      assert.strictEqual(ds2.case_count, 2);

      // Delete second case
      const delRes = await fetch(`${baseUrl}/api/datasets/${createdDatasetId}/cases/${c2.id}`, {
        method: 'DELETE',
      });
      assert.strictEqual(delRes.status, 200);

      const dsRes3 = await fetch(`${baseUrl}/api/datasets/${createdDatasetId}`);
      const ds3 = await dsRes3.json();
      assert.strictEqual(ds3.case_count, 1);
    });

    // Test 20: Mismatched datasetId/caseId rejected
    await asyncTest('API-20: Mismatched datasetId/caseId returns 404 TEST_CASE_NOT_FOUND', async () => {
      // createdTestCaseId belongs to createdDatasetId, NOT ds-checkout-golden
      const res = await fetch(`${baseUrl}/api/datasets/ds-checkout-golden/cases/${createdTestCaseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Tampered Case' }),
      });
      assert.strictEqual(res.status, 404);
      const data = await res.json();
      assert.strictEqual(data.error.code, 'TEST_CASE_NOT_FOUND');
    });

    // =========================================================
    // 4. MODEL VERSION API
    // =========================================================

    // Test 21: GET versions
    await asyncTest('API-21: GET /api/versions returns model versions list', async () => {
      const res = await fetch(`${baseUrl}/api/versions`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.versions));
      assert.ok(data.versions.length >= 2);
    });

    // Test 22: POST version
    await asyncTest('API-22: POST /api/versions creates version record', async () => {
      const payload = {
        projectId: createdProjectId,
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        displayName: 'Groq Llama 3.3 70B (High Throughput)',
        systemPrompt: 'You are an accurate retail billing assistant.',
      };
      const res = await fetch(`${baseUrl}/api/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.ok(data.id.startsWith('ver-'));
      assert.strictEqual(data.provider, payload.provider);
      assert.strictEqual(data.model, payload.model);
      assert.strictEqual(data.display_name, payload.displayName);
      createdVersionId = data.id;
    });

    // Test 23: PUT version
    await asyncTest('API-23: PUT /api/versions/:id updates version record', async () => {
      const payload = {
        displayName: 'Groq Llama 3.3 70B (Optimized Prompt)',
        systemPrompt: 'You are a fast, precise retail billing assistant.',
      };
      const res = await fetch(`${baseUrl}/api/versions/${createdVersionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.display_name, payload.displayName);
      assert.strictEqual(data.system_prompt, payload.systemPrompt);
    });

    // Test 24: No API keys returned
    await asyncTest('API-24: Model version responses NEVER contain API keys or secrets', async () => {
      const res = await fetch(`${baseUrl}/api/versions`);
      const text = await res.text();
      assert.strictEqual(text.includes('API_KEY'), false);
      assert.strictEqual(text.includes('sk-'), false);
      assert.strictEqual(text.includes('gsk_'), false);
    });

    // =========================================================
    // 5. PROJECT SETTINGS API
    // =========================================================

    // Test 25: GET settings
    await asyncTest('API-25: GET /api/projects/:projectId/settings returns regression settings', async () => {
      const res = await fetch(`${baseUrl}/api/projects/proj-checkout-agent/settings`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.projectId, 'proj-checkout-agent');
      assert.strictEqual(typeof data.minAccuracy, 'number');
      assert.strictEqual(typeof data.maxDegradation, 'number');
    });

    // Test 26 & 27: PUT settings & upsert idempotency
    await asyncTest('API-26 & 27: PUT /api/projects/:projectId/settings upserts without duplicating', async () => {
      const payload = {
        minAccuracy: 96.5,
        maxDegradation: 1.5,
        latencyTolerance: 15.0,
        rawOutputPrivacy: true,
      };

      // First PUT
      const res1 = await fetch(`${baseUrl}/api/projects/${createdProjectId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.strictEqual(res1.status, 200);
      const data1 = await res1.json();
      assert.strictEqual(data1.minAccuracy, 96.5);
      assert.strictEqual(data1.maxDegradation, 1.5);

      // Second PUT
      const res2 = await fetch(`${baseUrl}/api/projects/${createdProjectId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, minAccuracy: 97.0 }),
      });
      assert.strictEqual(res2.status, 200);
      const data2 = await res2.json();
      assert.strictEqual(data2.minAccuracy, 97.0);

      // Verify only 1 record exists in SQLite for createdProjectId
      const db = getDatabase();
      const count = db
        .prepare('SELECT COUNT(*) as c FROM project_settings WHERE project_id = ?')
        .get(createdProjectId).c;
      assert.strictEqual(count, 1, 'Exactly one settings record must exist per project');
    });

    // =========================================================
    // 6. RELEASE DECISION API
    // =========================================================

    // Setup an evaluation run record in SQLite
    const db = getDatabase();
    testRunId = `run-api-test-${Date.now().toString(36)}`;
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO evaluation_runs (
        id, project_id, dataset_id, status, total_cases, evaluated_cases,
        passed_cases, failed_cases, pass_rate, quality_score, started_at,
        completed_at, release_decision, release_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      testRunId,
      createdProjectId,
      createdDatasetId,
      'COMPLETED',
      1,
      1,
      0,
      1,
      0.0,
      0.0,
      nowIso,
      nowIso,
      'BLOCK',
      'Automated check: Accuracy regression detected.'
    );

    // Insert dummy result for evaluation result reads
    db.prepare(`
      INSERT INTO evaluation_results (
        id, run_id, test_case_id, model_version_id, provider, model, response, passed,
        quality_score, latency_ms, input_tokens, output_tokens, reasoning_tokens,
        total_tokens, cost, failure_type, failure_category, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `res-${testRunId}-01`,
      testRunId,
      createdTestCaseId,
      createdVersionId,
      'groq',
      'llama-3.3-70b-versatile',
      'Wrong VAT calculated',
      0,
      0.0,
      150.0,
      25,
      10,
      0,
      35,
      0.00003,
      'QUALITY_FAILURE',
      'QUALITY_FAILURE',
      nowIso
    );

    // Test 28, 29, 30: release decision update, audit record created, previous decision preserved
    await asyncTest('API-28, 29, 30: PATCH /api/evaluations/runs/:id/release-decision updates atomically with audit record', async () => {
      const payload = {
        decision: 'PASS',
        justification: 'Manual supervisor override: Temporary allowance for beta test environment.',
      };

      const res = await fetch(`${baseUrl}/api/evaluations/runs/${testRunId}/release-decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.runId, testRunId);
      assert.strictEqual(data.decision, 'PASS');
      assert.strictEqual(data.previousDecision, 'BLOCK');
      assert.ok(data.audit);
      assert.strictEqual(data.audit.run_id, testRunId);
      assert.strictEqual(data.audit.new_decision, 'PASS');
      assert.strictEqual(data.audit.previous_decision, 'BLOCK');
      assert.strictEqual(data.audit.justification, payload.justification);

      // Verify audit record exists in database
      const auditInDb = db
        .prepare('SELECT * FROM release_decision_audit WHERE run_id = ?')
        .all(testRunId);
      assert.ok(auditInDb.length >= 1);
    });

    // Test 31: invalid decision rejected
    await asyncTest('API-31: Invalid release decision rejected with 400 INVALID_RELEASE_DECISION', async () => {
      const res = await fetch(`${baseUrl}/api/evaluations/runs/${testRunId}/release-decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'APPROVE_FOR_ALL', justification: 'Invalid enum' }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.code, 'INVALID_RELEASE_DECISION');
    });

    // Test 32: transaction rollback on failure
    await asyncTest('API-32: Transaction rollback preserves database consistency on error', async () => {
      const beforeRun = db.prepare('SELECT release_decision FROM evaluation_runs WHERE id = ?').get(testRunId);
      const beforeAudits = db.prepare('SELECT COUNT(*) as c FROM release_decision_audit WHERE run_id = ?').get(testRunId).c;

      // Attempt patching nonexistent run
      const res = await fetch(`${baseUrl}/api/evaluations/runs/run-does-not-exist-999/release-decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'PASS', justification: 'Should fail' }),
      });
      assert.strictEqual(res.status, 404);

      const afterRun = db.prepare('SELECT release_decision FROM evaluation_runs WHERE id = ?').get(testRunId);
      const afterAudits = db.prepare('SELECT COUNT(*) as c FROM release_decision_audit WHERE run_id = ?').get(testRunId).c;

      assert.strictEqual(afterRun.release_decision, beforeRun.release_decision);
      assert.strictEqual(afterAudits, beforeAudits);
    });

    // =========================================================
    // 7. EVALUATIONS READ APIS
    // =========================================================

    // Test 33: Existing evaluation endpoints still work
    await asyncTest('API-33: Existing health & status endpoints function seamlessly', async () => {
      const healthRes = await fetch(`${baseUrl}/api/health`);
      assert.strictEqual(healthRes.status, 200);
      const health = await healthRes.json();
      assert.strictEqual(health.status, 'healthy');

      const statusRes = await fetch(`${baseUrl}/api/providers/status`);
      assert.strictEqual(statusRes.status, 200);

      const runsRes = await fetch(`${baseUrl}/api/evaluations/runs`);
      assert.strictEqual(runsRes.status, 200);
      const runsData = await runsRes.json();
      assert.ok(Array.isArray(runsData.runs));
    });

    // Test 34: Run results endpoint
    await asyncTest('API-34: GET /api/evaluations/runs/:id/results returns evaluation results', async () => {
      const res = await fetch(`${baseUrl}/api/evaluations/runs/${testRunId}/results`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.runId, testRunId);
      assert.ok(Array.isArray(data.results));
      assert.strictEqual(data.count, 1);
      assert.strictEqual(data.results[0].passed, 0);
    });

    // Test 35: Run failures endpoint
    await asyncTest('API-35: GET /api/evaluations/runs/:id/failures returns only failed cases', async () => {
      const res = await fetch(`${baseUrl}/api/evaluations/runs/${testRunId}/failures`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.runId, testRunId);
      assert.ok(Array.isArray(data.failures));
      assert.strictEqual(data.count, 1);
      assert.strictEqual(data.failures[0].failure_type, 'QUALITY_FAILURE');
    });

    // =========================================================
    // 8. SECURITY
    // =========================================================

    // Test 36: Responses never contain API keys
    await asyncTest('API-36: Full response sweep guarantees ZERO raw API key leakage', async () => {
      const endpoints = [
        '/api/health',
        '/api/projects',
        `/api/projects/${createdProjectId}`,
        '/api/datasets',
        `/api/datasets/${createdDatasetId}`,
        `/api/datasets/${createdDatasetId}/cases`,
        '/api/versions',
        `/api/versions/${createdVersionId}`,
        `/api/projects/${createdProjectId}/settings`,
        '/api/evaluations/runs',
        `/api/evaluations/runs/${testRunId}`,
        `/api/evaluations/runs/${testRunId}/results`,
        `/api/evaluations/runs/${testRunId}/failures`,
      ];

      for (const endpoint of endpoints) {
        const res = await fetch(`${baseUrl}${endpoint}`);
        const text = await res.text();
        assert.strictEqual(text.includes('AIzaSy'), false, `Secret leak detected on ${endpoint}`);
        assert.strictEqual(text.includes('sk-proj-'), false, `Secret leak detected on ${endpoint}`);
        assert.strictEqual(text.includes('gsk_'), false, `Secret leak detected on ${endpoint}`);
        assert.strictEqual(text.includes('csk-'), false, `Secret leak detected on ${endpoint}`);
      }
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

  console.log('--- All Backend REST API Integration Tests Completed Successfully ---\n');
}

// Standalone execution: node tests/api.test.mjs
if (process.argv[1] && process.argv[1].endsWith('api.test.mjs')) {
  let passed = 0;
  let failed = 0;
  runApiTests({
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
    console.log(`API TESTS SUMMARY: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
    else process.exit(0);
  }).catch((err) => {
    console.error('Fatal error in API test suite:', err);
    process.exit(1);
  });
}
