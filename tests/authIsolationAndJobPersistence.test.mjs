/* ============================================================
   RELIQ — Critical Issues 1 & 2: Auth Data Isolation & Job Persistence
   Regression Test Suite
   ============================================================ */

process.env.RELIQ_DB_DRIVER = 'sqlite';

import assert from 'node:assert';
import { createServer } from 'vite';

async function runTests() {
  console.log('\n============================================================');
  console.log('RELIQ AUTH ISOLATION & EVALUATION JOB PERSISTENCE SUITE');
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
    const { projectService } = await server.ssrLoadModule('/src/server/services/projectService.ts');
    const { datasetService } = await server.ssrLoadModule('/src/server/services/datasetService.ts');
    const { versionService } = await server.ssrLoadModule('/src/server/services/versionService.ts');
    const { settingsService } = await server.ssrLoadModule('/src/server/services/settingsService.ts');
    const { evaluationDbService } = await server.ssrLoadModule('/src/server/services/evaluationDbService.ts');
    const {
      getJobStatus,
      recoverStaleEvaluationRuns,
      _setJobForTesting,
    } = await server.ssrLoadModule('/src/server/evaluationService.ts');
    const {
      canUserAccessProject,
      canUserModifyProject,
      canUserAccessDataset,
      canUserModifyDataset,
      canUserAccessRun,
    } = await server.ssrLoadModule('/src/server/routes/authUtils.ts');
    const { getDatabase, initializeDatabase } = await server.ssrLoadModule('/src/server/db/database.ts');
    initializeDatabase();
    const { getStoredAuthToken, fetchWithAuth } = await server.ssrLoadModule('/src/services/apiClient.ts');

    // ── 1. Client-Side Auth Token Resolution ──
    await test('getStoredAuthToken resolves token from localStorage', () => {
      // Mock global localStorage
      const mockStorage = new Map();
      globalThis.localStorage = {
        getItem: (k) => mockStorage.get(k) || null,
        setItem: (k, v) => mockStorage.set(k, String(v)),
        removeItem: (k) => mockStorage.delete(k),
        key: (i) => Array.from(mockStorage.keys())[i] || null,
        get length() {
          return mockStorage.size;
        },
      };

      assert.strictEqual(getStoredAuthToken(), null, 'Should return null when storage is empty');

      mockStorage.set('reliq_auth_token', 'jwt-token-direct');
      assert.strictEqual(getStoredAuthToken(), 'jwt-token-direct', 'Should return direct reliq_auth_token');

      mockStorage.delete('reliq_auth_token');
      mockStorage.set('sb-12345-auth-token', JSON.stringify({ access_token: 'jwt-token-supabase' }));
      assert.strictEqual(getStoredAuthToken(), 'jwt-token-supabase', 'Should extract access_token from Supabase session JSON');
    });

    // ── 2. Multi-Tenant Project Isolation ──
    await test('Multi-tenant project isolation: Alice cannot access or mutate Bob\'s projects', async () => {
      const aliceProjId = `proj-alice-${Date.now()}`;
      const bobProjId = `proj-bob-${Date.now()}`;

      // Create Alice's project
      await projectService.createProject({
        id: aliceProjId,
        name: "Alice's Project",
        userId: 'user-alice',
      });

      // Create Bob's project
      await projectService.createProject({
        id: bobProjId,
        name: "Bob's Project",
        userId: 'user-bob',
      });

      // Alice access checks
      assert.strictEqual(await canUserAccessProject(aliceProjId, 'user-alice'), true);
      assert.strictEqual(await canUserModifyProject(aliceProjId, 'user-alice'), true);

      // Bob attempting to access Alice's project
      assert.strictEqual(await canUserAccessProject(aliceProjId, 'user-bob'), false);
      assert.strictEqual(await canUserModifyProject(aliceProjId, 'user-bob'), false);

      // Unauthenticated user attempting to access Alice's project
      assert.strictEqual(await canUserAccessProject(aliceProjId, undefined), false);
      assert.strictEqual(await canUserModifyProject(aliceProjId, undefined), false);

      // Public template project (proj-checkout-agent) remains accessible to all
      assert.strictEqual(await canUserAccessProject('proj-checkout-agent', 'user-alice'), true);
      assert.strictEqual(await canUserAccessProject('proj-checkout-agent', 'user-bob'), true);
      assert.strictEqual(await canUserAccessProject('proj-checkout-agent', undefined), true);

      // getAllProjects filters strictly by user
      const aliceProjects = await projectService.getAllProjects('user-alice');
      assert(aliceProjects.some((p) => p.id === aliceProjId));
      assert(!aliceProjects.some((p) => p.id === bobProjId));

      const bobProjects = await projectService.getAllProjects('user-bob');
      assert(bobProjects.some((p) => p.id === bobProjId));
      assert(!bobProjects.some((p) => p.id === aliceProjId));
    });

    // ── 3. Multi-Tenant Dataset Isolation ──
    await test('Multi-tenant dataset isolation: Bob cannot access or mutate Alice\'s datasets', async () => {
      const aliceProjId = `proj-ds-alice-${Date.now()}`;
      await projectService.createProject({
        id: aliceProjId,
        name: "Alice Dataset Project",
        userId: 'user-alice',
      });

      const aliceDatasetId = `ds-alice-${Date.now()}`;
      await datasetService.createDataset({
        id: aliceDatasetId,
        projectId: aliceProjId,
        name: "Alice's Secret Dataset",
        version: '1.0.0',
      });

      // Built-in golden dataset is public and immutable
      assert.strictEqual(await canUserAccessDataset('ds-checkout-golden', 'user-bob'), true);
      assert.strictEqual(await canUserModifyDataset('ds-checkout-golden', 'user-bob'), false);

      // Alice can read and modify her own dataset
      assert.strictEqual(await canUserAccessDataset(aliceDatasetId, 'user-alice'), true);
      assert.strictEqual(await canUserModifyDataset(aliceDatasetId, 'user-alice'), true);

      // Bob cannot read or modify Alice's dataset
      assert.strictEqual(await canUserAccessDataset(aliceDatasetId, 'user-bob'), false);
      assert.strictEqual(await canUserModifyDataset(aliceDatasetId, 'user-bob'), false);
      assert.strictEqual(await canUserAccessDataset(aliceDatasetId, undefined), false);
    });

    // ── 4. Multi-Tenant Evaluation Run Access Control ──
    await test('Evaluation run access control enforces user ownership', async () => {
      const aliceProjId = `proj-run-alice-${Date.now()}`;
      await projectService.createProject({
        id: aliceProjId,
        name: "Alice Run Project",
        userId: 'user-alice',
      });

      const aliceRunId = `run-alice-${Date.now()}`;
      evaluationDbService.createEvaluationRun({
        id: aliceRunId,
        projectId: aliceProjId,
        datasetId: 'ds-checkout-golden',
        totalCases: 10,
        userId: 'user-alice',
      });

      // Alice can access her run
      assert.strictEqual(await canUserAccessRun(aliceRunId, 'user-alice'), true);

      // Bob cannot access Alice's run
      assert.strictEqual(await canUserAccessRun(aliceRunId, 'user-bob'), false);

      // Unauthenticated request cannot access Alice's run
      assert.strictEqual(await canUserAccessRun(aliceRunId, undefined), false);
    });

    // ── 5. Immediate Per-Case Persistence ──
    await test('Per-case results are immediately persisted to evaluation_results table', async () => {
      const runId = `run-test-percase-${Date.now()}`;
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 5,
        startedAt: new Date().toISOString(),
      });

      // Record a single case result
      evaluationDbService.recordCaseResultsBatch(
        runId,
        { id: 'ver-cand', provider: 'groq', modelIdentifier: 'openai/gpt-oss-20b' },
        [
          {
            testCaseId: 'case-alpha',
            testCaseName: 'Alpha Scenario',
            passed: true,
            candidateOutput: 'Expected output string',
            candidateScore: 92.5,
            candidateLatencyMs: 240,
            candidateQualityEvaluated: true,
            candidateTransportSuccess: true,
            candidateEvaluationEligible: true,
            candidateUsage: { inputTokens: 50, outputTokens: 25, estimatedCostUsd: 0.0001 },
          },
        ]
      );

      // Verify immediate persistence in database results
      const results = await evaluationDbService.getRunResults(runId);
      assert.strictEqual(results.length, 1, 'Case result must be immediately readable from DB');
      assert.strictEqual(results[0].testCaseId, 'case-alpha');
      assert.strictEqual(results[0].passed, 1);
      assert.strictEqual(results[0].quality_score, 92.5);

      // Verify evaluation_runs progress was incremented
      const run = await evaluationDbService.getEvaluationRunById(runId);
      assert.strictEqual(run.metrics.evaluatedCases, 1);
      assert.strictEqual(run.metrics.candidatePassed, 1);
    });

    // ── 6. Resumption from Partial Results ──
    await test('Run results support resumption when case results already exist in DB', async () => {
      const runId = `run-resume-${Date.now()}`;
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 3,
      });

      evaluationDbService.recordCaseResultsBatch(
        runId,
        { id: 'ver-cand', provider: 'groq', model: 'gpt-oss-20b' },
        [
          { testCaseId: 'c-1', passed: true, candidateScore: 95 },
          { testCaseId: 'c-2', passed: false, candidateScore: 60 },
        ]
      );

      const existingResults = await evaluationDbService.getRunResults(runId);
      assert.strictEqual(existingResults.length, 2, 'Resumption must find 2 pre-existing case results');
      const caseIds = existingResults.map((r) => r.test_case_id);
      assert(caseIds.includes('c-1'));
      assert(caseIds.includes('c-2'));
    });

    // ── 7. Worker Heartbeat and Live Progress ──
    await test('Evaluation run heartbeat updates last_heartbeat_at timestamp and live progress counts', async () => {
      const runId = `run-hb-${Date.now()}`;
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 20,
      });

      const initialRun = await evaluationDbService.getEvaluationRunById(runId);
      assert(initialRun.lastHeartbeatAt, 'Initial run must have a valid lastHeartbeatAt');

      // Update heartbeat with telemetry
      await evaluationDbService.updateRunHeartbeat(runId, {
        evaluatedCases: 7,
        passedCases: 6,
        failedCases: 1,
      });

      const updatedRun = await evaluationDbService.getEvaluationRunById(runId);
      assert.strictEqual(updatedRun.metrics.evaluatedCases, 7);
      assert.strictEqual(updatedRun.metrics.candidatePassed, 6);
    });

    // ── 8. Stale Worker Heartbeat Recovery ──
    await test('Worker heartbeat expiration: stale RUNNING job is detected and recovered as FAILED', async () => {
      const db = getDatabase();
      const zombieRunId = `run-zombie-${Date.now()}`;
      const staleTime = new Date(Date.now() - 120000).toISOString(); // 2 minutes ago

      // Insert stale RUNNING run directly
      db.prepare(`
        INSERT INTO evaluation_runs (
          id, project_id, dataset_id, dataset_version, dataset_source_type,
          status, total_cases, selected_case_count, evaluated_cases,
          passed_cases, failed_cases, skipped_cases, cancelled_cases,
          started_at, last_heartbeat_at
        ) VALUES (?, 'proj-checkout-agent', 'ds-checkout-golden', '1.0.0', 'builtin',
          'RUNNING', 27, 27, 9, 8, 1, 0, 0, ?, ?)
      `).run(zombieRunId, staleTime, staleTime);

      // getJobStatus should detect expired worker heartbeat (>60s)
      const job = await getJobStatus(zombieRunId);
      assert(job, 'Job status must be returned');
      assert.strictEqual(job.status, 'FAILED', 'Stale running job must transition to FAILED');
      assert(job.error.includes('heartbeat expired'), 'Error must report heartbeat expiration');
      assert.strictEqual(job.progress.current, 9, 'Must report accurate evaluated cases (9/27)');
      assert.strictEqual(job.progress.percent, 33, 'Must report accurate progress percent (33%)');

      // Verify that recoverStaleEvaluationRuns cleans up any remaining zombie runs
      const zombieRunId2 = `run-zombie-batch-${Date.now()}`;
      db.prepare(`
        INSERT INTO evaluation_runs (
          id, project_id, dataset_id, dataset_version, dataset_source_type,
          status, total_cases, selected_case_count, evaluated_cases,
          passed_cases, failed_cases, skipped_cases, cancelled_cases,
          started_at, last_heartbeat_at
        ) VALUES (?, 'proj-checkout-agent', 'ds-checkout-golden', '1.0.0', 'builtin',
          'RUNNING', 27, 27, 0, 0, 0, 0, 0, ?, ?)
      `).run(zombieRunId2, staleTime, staleTime);

      const recoveredCount = await recoverStaleEvaluationRuns(60000);
      assert(recoveredCount >= 1, `Must recover at least 1 stale run, got ${recoveredCount}`);

      const recoveredRun = await evaluationDbService.getEvaluationRunById(zombieRunId2);
      assert.strictEqual(recoveredRun.status, 'FAILED');
      assert(recoveredRun.releaseDecision.reason.includes('Worker heartbeat expired'));
    });

  } finally {
    await server.close();
  }

  console.log('\n------------------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
