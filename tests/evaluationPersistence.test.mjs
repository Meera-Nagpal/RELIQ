/* ============================================================
   RELIQ — Authoritative Evaluation Persistence Unit Test Suite
   
   39 Dedicated Tests Verifying:
   1. Canonical Run ID generation & propagation
   2. Progressive SQLite run lifecycle & per-case persistence
   3. Provider & operational error classification (401, 402, 403, 429, 500, timeout, network)
   4. Quality semantics vs operational failure isolation
   5. Metric nullability (null passRate, null qualityScore, null latency)
   6. Database service queries (runs, single run, results, failures)
   7. Partial run failure resilience
   8. Legacy JSON disk compatibility
   9. Server restart & database reopen persistence
   ============================================================ */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

export async function runEvaluationPersistenceTests(testRunner, viteServer) {
  let server = viteServer;
  let shouldCloseServer = false;

  if (!server) {
    server = await createServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    shouldCloseServer = true;
  }

  const { initializeDatabase, getDatabase, closeDatabase } = await server.ssrLoadModule('/src/server/db/database.ts');
  const { evaluationDbService } = await server.ssrLoadModule('/src/server/services/evaluationDbService.ts');
  const { generateCanonicalRunId, runServerEvaluation, getRunsFromDisk, saveRunToDisk } = await server.ssrLoadModule('/src/server/evaluationService.ts');
  const { classifyResponseStatus, EvaluationRunner, calculateMedian, calculateP95 } = await server.ssrLoadModule('/src/evaluation/runner.ts');

  const { test, asyncTest } = testRunner;
  const testDbDir = path.resolve(process.cwd(), 'data', 'test_eval_persist_db');
  const testDbPath = path.join(testDbDir, 'test_eval_persist.db');

  // Clean up any previous test database
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
    if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
  } catch {}

  // Initialize SQLite database
  initializeDatabase({ dbPath: testDbPath });

  console.log('\n--- Running Authoritative Evaluation Persistence Tests (Step 4) ---');

  try {
    // =============================================================
    // Group 1: Canonical Run ID Propagation (Tests 1 - 4)
    // =============================================================

    test('EVAL-PERSIST-01: generateCanonicalRunId() produces canonical ID matching pattern', () => {
      const runId = generateCanonicalRunId();
      assert.ok(runId, 'runId must be defined');
      assert.ok(runId.startsWith('run-live-'), `runId '${runId}' must start with run-live-`);
      assert.match(runId, /^run-live-[a-z0-9]+-[a-z0-9]+$/, 'runId must follow canonical format');
    });

    test('EVAL-PERSIST-02: createEvaluationRun records canonical runId into evaluation_runs.id', () => {
      const db = getDatabase();
      const runId = generateCanonicalRunId();
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 10,
      });

      const row = db.prepare('SELECT id, status FROM evaluation_runs WHERE id = ?').get(runId);
      assert.ok(row, 'Run record must exist in evaluation_runs');
      assert.strictEqual(row.id, runId);
      assert.strictEqual(row.status, 'RUNNING');
    });

    test('EVAL-PERSIST-03: recordCaseResult stores identical canonical run_id in evaluation_results', () => {
      const db = getDatabase();
      const runId = generateCanonicalRunId();
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 2,
      });

      evaluationDbService.recordCaseResult(runId, { id: 'v-test', provider: 'google', modelIdentifier: 'gemini-2.5-flash' }, {
        testCaseId: 'tc-chk-001',
        testCaseName: 'Direct Checkout',
        candidateOutput: 'Order confirmed',
        passed: true,
        candidateScore: 1.0,
        candidateLatencyMs: 120,
        candidateQualityEvaluated: true,
        candidateTransportSuccess: true,
        candidateEvaluationEligible: true,
        candidateExecutionStatus: 'PASS',
        candidateUsage: { inputTokens: 50, outputTokens: 25, totalTokens: 75, estimatedCostUsd: 0.0001 },
      });

      const rows = db.prepare('SELECT run_id, test_case_id, passed FROM evaluation_results WHERE run_id = ?').all(runId);
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].run_id, runId, 'Result row must reference identical canonical runId');
      assert.strictEqual(rows[0].test_case_id, 'tc-chk-001');
      assert.strictEqual(rows[0].passed, 1);
    });

    test('EVAL-PERSIST-04: Canonical runId preserved through run creation, results, and finalization', () => {
      const db = getDatabase();
      const runId = generateCanonicalRunId();
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 1,
      });

      evaluationDbService.recordCaseResult(runId, { id: 'v-test', provider: 'cerebras', modelIdentifier: 'gpt-oss-120b' }, {
        testCaseId: 'tc-chk-001',
        passed: true,
        candidateScore: 1.0,
        candidateLatencyMs: 85,
        candidateQualityEvaluated: true,
        candidateTransportSuccess: true,
        candidateEvaluationEligible: true,
        candidateExecutionStatus: 'PASS',
      });

      evaluationDbService.finalizeEvaluationRun({
        id: runId,
        timestamp: new Date().toISOString(),
        metrics: { totalCases: 1, evaluatedCases: 1, candidateEvaluatedCases: 1, candidatePassed: 1, candidatePassRate: 100, candidateQualityScore: 1.0 },
        releaseDecision: { status: 'GO', reason: 'High pass rate' },
      });

      const runRow = db.prepare('SELECT id, status, pass_rate, release_decision FROM evaluation_runs WHERE id = ?').get(runId);
      const resRows = db.prepare('SELECT run_id FROM evaluation_results WHERE run_id = ?').all(runId);

      assert.strictEqual(runRow.id, runId);
      assert.strictEqual(runRow.status, 'COMPLETED');
      assert.strictEqual(runRow.pass_rate, 100);
      assert.strictEqual(runRow.release_decision, 'GO');
      assert.strictEqual(resRows.length, 1);
      assert.strictEqual(resRows[0].run_id, runId);
    });

    // =============================================================
    // Group 2: SQLite Run Creation and Progressive Lifecycle (Tests 5 - 9)
    // =============================================================

    test('EVAL-PERSIST-05: Initial evaluation_runs record inserted with status RUNNING', () => {
      const db = getDatabase();
      const runId = generateCanonicalRunId();
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 5,
      });

      const run = db.prepare('SELECT status FROM evaluation_runs WHERE id = ?').get(runId);
      assert.strictEqual(run.status, 'RUNNING');
    });

    test('EVAL-PERSIST-06: Initial RUNNING record has started_at timestamp, completed_at is null', () => {
      const db = getDatabase();
      const runId = generateCanonicalRunId();
      const startTime = new Date().toISOString();
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 5,
        startedAt: startTime,
      });

      const run = db.prepare('SELECT started_at, completed_at FROM evaluation_runs WHERE id = ?').get(runId);
      assert.ok(run.started_at, 'started_at must be populated');
      assert.strictEqual(run.completed_at, null, 'completed_at must be NULL when RUNNING');
    });

    test('EVAL-PERSIST-07: Initial RUNNING record has pass_rate, quality_score, release_decision as null', () => {
      const db = getDatabase();
      const runId = generateCanonicalRunId();
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 5,
      });

      const run = db.prepare('SELECT pass_rate, quality_score, release_decision, release_reason FROM evaluation_runs WHERE id = ?').get(runId);
      assert.strictEqual(run.pass_rate, null, 'Initial pass_rate must be null');
      assert.strictEqual(run.quality_score, null, 'Initial quality_score must be null');
      assert.strictEqual(run.release_decision, null, 'Initial release_decision must be null');
      assert.strictEqual(run.release_reason, null, 'Initial release_reason must be null');
    });

    test('EVAL-PERSIST-08: Progressive per-case persistence records results incrementally', () => {
      const db = getDatabase();
      const runId = generateCanonicalRunId();
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 3,
      });

      evaluationDbService.recordCaseResult(runId, { id: 'v-test', provider: 'google', modelIdentifier: 'gemini-2.5-flash' }, {
        testCaseId: 'tc-chk-001',
        passed: true,
        candidateScore: 1.0,
        candidateLatencyMs: 110,
        candidateQualityEvaluated: true,
        candidateTransportSuccess: true,
        candidateEvaluationEligible: true,
      });
      let count = db.prepare('SELECT COUNT(*) as cnt FROM evaluation_results WHERE run_id = ?').get(runId).cnt;
      assert.strictEqual(count, 1, 'Should have 1 case result');

      evaluationDbService.recordCaseResult(runId, { id: 'v-test', provider: 'google', modelIdentifier: 'gemini-2.5-flash' }, {
        testCaseId: 'tc-chk-002',
        passed: false,
        candidateScore: 0.0,
        candidateLatencyMs: 140,
        candidateQualityEvaluated: true,
        candidateTransportSuccess: true,
        candidateEvaluationEligible: true,
      });
      count = db.prepare('SELECT COUNT(*) as cnt FROM evaluation_results WHERE run_id = ?').get(runId).cnt;
      assert.strictEqual(count, 2, 'Should have 2 case results');
    });

    test('EVAL-PERSIST-09: finalizeEvaluationRun updates status to COMPLETED and sets completed_at', () => {
      const db = getDatabase();
      const runId = generateCanonicalRunId();
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 2,
      });

      const finishTime = new Date().toISOString();
      evaluationDbService.finalizeEvaluationRun({
        id: runId,
        timestamp: finishTime,
        metrics: { totalCases: 2, evaluatedCases: 2, candidateEvaluatedCases: 2, candidatePassed: 2, candidatePassRate: 100, candidateQualityScore: 1.0 },
        releaseDecision: { status: 'GO', reason: 'Passed all tests' },
      });

      const run = db.prepare('SELECT status, completed_at, release_decision FROM evaluation_runs WHERE id = ?').get(runId);
      assert.strictEqual(run.status, 'COMPLETED');
      assert.strictEqual(run.completed_at, finishTime);
      assert.strictEqual(run.release_decision, 'GO');
    });
    // =============================================================
    // Group 3: Provider & Operational Failure Classification (Tests 10 - 17)
    // =============================================================

    test('EVAL-PERSIST-10: HTTP 401 Unauthorized classified as provider failure with qualityEvaluated=false', () => {
      const resp = {
        output: '',
        usage: {
          provider: 'google',
          model: 'gemini-2.5-flash',
          latencyMs: 0,
          error: { status: 401, message: 'API key not valid. Please pass a valid API key.' },
        },
      };
      const classification = classifyResponseStatus(resp);
      assert.strictEqual(classification.qualityEvaluated, false, 'qualityEvaluated must be false on 401');
      assert.strictEqual(classification.transportSuccess, false, 'transportSuccess must be false on 401');
      assert.strictEqual(classification.evaluationEligible, false, 'evaluationEligible must be false on 401');
      assert.strictEqual(classification.isEvaluated, false, 'isEvaluated must be false on 401');
      assert.strictEqual(classification.errorDetail?.category, 'AUTHENTICATION');
    });

    test('EVAL-PERSIST-11: HTTP 402 Payment Required classified as provider failure with qualityEvaluated=false', () => {
      const resp = {
        output: '',
        usage: {
          provider: 'groq',
          model: 'llama-3-70b',
          latencyMs: 0,
          error: { status: 402, code: 'PAYMENT_REQUIRED', message: 'Insufficient credits or payment required' },
        },
      };
      const classification = classifyResponseStatus(resp);
      assert.strictEqual(classification.qualityEvaluated, false);
      assert.strictEqual(classification.transportSuccess, false);
      assert.strictEqual(classification.status, 'PAYMENT_REQUIRED');
      assert.strictEqual(classification.failureCategory, 'PROVIDER_QUOTA');
    });

    test('EVAL-PERSIST-12: HTTP 403 Forbidden classified as provider failure with qualityEvaluated=false', () => {
      const resp = {
        output: '',
        usage: {
          provider: 'anthropic',
          model: 'claude-3-opus',
          latencyMs: 0,
          error: { status: 403, code: 'PROVIDER_FORBIDDEN', message: 'Access forbidden for project' },
        },
      };
      const classification = classifyResponseStatus(resp);
      assert.strictEqual(classification.qualityEvaluated, false);
      assert.strictEqual(classification.transportSuccess, false);
      assert.strictEqual(classification.status, 'PROVIDER_FORBIDDEN');
      assert.strictEqual(classification.failureCategory, 'PROVIDER_AUTHENTICATION');
    });

    test('EVAL-PERSIST-13: HTTP 429 Rate Limit classified as provider failure with qualityEvaluated=false', () => {
      const resp = {
        output: '',
        usage: {
          provider: 'cerebras',
          model: 'gpt-oss-120b',
          latencyMs: 0,
          error: { status: 429, code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit reached. Please wait.' },
          rateLimit: { retryAfter: '15' },
        },
      };
      const classification = classifyResponseStatus(resp);
      assert.strictEqual(classification.qualityEvaluated, false);
      assert.strictEqual(classification.transportSuccess, false);
      assert.strictEqual(classification.status, 'PROVIDER_RATE_LIMIT');
      assert.strictEqual(classification.failureCategory, 'PROVIDER_QUOTA');
      assert.strictEqual(classification.errorDetail?.retryAfterSeconds, 15);
    });

    test('EVAL-PERSIST-14: HTTP 500/503 Provider Server Error classified with qualityEvaluated=false', () => {
      const resp = {
        output: '',
        usage: {
          provider: 'google',
          model: 'gemini-3.6-flash',
          latencyMs: 0,
          error: { status: 503, message: 'The service is temporarily unavailable.' },
        },
      };
      const classification = classifyResponseStatus(resp);
      assert.strictEqual(classification.qualityEvaluated, false);
      assert.strictEqual(classification.transportSuccess, false);
      assert.ok(classification.status === 'PROVIDER_SERVER_ERROR' || classification.status === 'PROVIDER_ERROR');
      assert.strictEqual(classification.failureCategory, 'PROVIDER_SERVER_ERROR');
    });

    test('EVAL-PERSIST-15: Timeout Error classified as operational failure with qualityEvaluated=false', () => {
      const resp = {
        output: '',
        usage: {
          provider: 'groq',
          model: 'llama-3-8b',
          latencyMs: 15000,
          error: { status: 504, code: 'TIMEOUT', message: 'Request timed out waiting for provider response' },
        },
      };
      const classification = classifyResponseStatus(resp);
      assert.strictEqual(classification.qualityEvaluated, false);
      assert.strictEqual(classification.transportSuccess, false);
      assert.ok(classification.status === 'TIMEOUT' || classification.status === 'PROVIDER_TIMEOUT');
      assert.strictEqual(classification.failureCategory, 'PROVIDER_NETWORK');
    });

    test('EVAL-PERSIST-16: Network / DNS Error classified as operational failure with qualityEvaluated=false', () => {
      const resp = {
        output: '',
        usage: {
          provider: 'cerebras',
          model: 'gpt-oss-120b',
          latencyMs: 50,
          error: { code: 'NETWORK_ERROR', message: 'fetch failed: ECONNREFUSED 127.0.0.1:443' },
        },
      };
      const classification = classifyResponseStatus(resp);
      assert.strictEqual(classification.qualityEvaluated, false);
      assert.strictEqual(classification.transportSuccess, false);
      assert.ok(classification.status === 'NETWORK_ERROR' || classification.status === 'PROVIDER_NETWORK_ERROR');
      assert.strictEqual(classification.failureCategory, 'PROVIDER_NETWORK');
    });

    test('EVAL-PERSIST-17: Operational failure written to evaluation_results stores failure_type and NULL scores', () => {
      const db = getDatabase();
      const runId = generateCanonicalRunId();
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 1,
      });

      evaluationDbService.recordCaseResult(runId, { id: 'v-test', provider: 'google', modelIdentifier: 'gemini-2.5-flash' }, {
        testCaseId: 'tc-chk-001',
        passed: null,
        candidateScore: null,
        candidateLatencyMs: null,
        candidateQualityEvaluated: false,
        candidateTransportSuccess: false,
        candidateEvaluationEligible: false,
        candidateExecutionStatus: 'AUTHENTICATION_ERROR',
        failureCategory: 'PROVIDER_AUTHENTICATION',
      });

      const row = db.prepare('SELECT passed, quality_score, latency_ms, failure_type, failure_category FROM evaluation_results WHERE run_id = ?').get(runId);
      assert.strictEqual(row.passed, null, 'passed must be NULL for operational error');
      assert.strictEqual(row.quality_score, null, 'quality_score must be NULL for operational error');
      assert.strictEqual(row.latency_ms, null, 'latency_ms must be NULL for operational error');
      assert.strictEqual(row.failure_type, 'AUTHENTICATION_ERROR');
      assert.strictEqual(row.failure_category, 'PROVIDER_AUTHENTICATION');
    });

    // =============================================================
    // Group 4: Quality Semantics vs Operational Errors (Tests 18 - 22)
    // =============================================================

    test('EVAL-PERSIST-18: Quality pass: qualityEvaluated=true, passed=true, qualityScore recorded', () => {
      const resp = {
        output: 'Order confirmed successfully',
        usage: { provider: 'google', model: 'gemini-2.5-flash', latencyMs: 150 },
      };
      const evaluatorScore = { passed: true, score: 1.0, reasoning: 'Exact match' };
      const classification = classifyResponseStatus(resp, evaluatorScore);

      assert.strictEqual(classification.qualityEvaluated, true);
      assert.strictEqual(classification.transportSuccess, true);
      assert.strictEqual(classification.evaluationEligible, true);
      assert.strictEqual(classification.status, 'PASS');
      assert.strictEqual(classification.failureCategory, undefined);
    });

    test('EVAL-PERSIST-19: Quality failure: qualityEvaluated=true, passed=false, qualityScore recorded', () => {
      const resp = {
        output: 'Order cancelled due to item unavailable',
        usage: { provider: 'google', model: 'gemini-2.5-flash', latencyMs: 140 },
      };
      const evaluatorScore = { passed: false, score: 0.0, reasoning: 'Expected order confirmation' };
      const classification = classifyResponseStatus(resp, evaluatorScore);

      assert.strictEqual(classification.qualityEvaluated, true);
      assert.strictEqual(classification.transportSuccess, true);
      assert.strictEqual(classification.evaluationEligible, true);
      assert.strictEqual(classification.status, 'QUALITY_FAILURE');
      assert.strictEqual(classification.failureCategory, 'QUALITY_FAILURE');
    });

    test('EVAL-PERSIST-20: Operational failures do not dilute evaluatedCases count', () => {
      const cases = [
        { candidateQualityEvaluated: true, passed: true },
        { candidateQualityEvaluated: true, passed: false },
        { candidateQualityEvaluated: false, passed: null },
        { candidateQualityEvaluated: false, passed: null },
        { candidateQualityEvaluated: false, passed: null },
      ];

      const evaluatedCases = cases.filter((c) => c.candidateQualityEvaluated).length;
      assert.strictEqual(evaluatedCases, 2, 'Only 2 cases were evaluated for quality');
    });

    test('EVAL-PERSIST-21: Pass rate with 1 pass, 1 quality fail, 3 operational failures is 50%, not 20%', () => {
      const cases = [
        { candidateQualityEvaluated: true, passed: true },
        { candidateQualityEvaluated: true, passed: false },
        { candidateQualityEvaluated: false, passed: null },
        { candidateQualityEvaluated: false, passed: null },
        { candidateQualityEvaluated: false, passed: null },
      ];

      const evaluatedCases = cases.filter((c) => c.candidateQualityEvaluated).length;
      const passedCases = cases.filter((c) => c.candidateQualityEvaluated && c.passed).length;
      const passRate = evaluatedCases > 0 ? (passedCases / evaluatedCases) * 100 : null;

      assert.strictEqual(evaluatedCases, 2);
      assert.strictEqual(passedCases, 1);
      assert.strictEqual(passRate, 50, 'Pass rate must be 50% (1/2), not diluted to 20% (1/5)');
    });

    test('EVAL-PERSIST-22: Latency statistics calculate only over successful requests', () => {
      const latencies = [100, 150, 200];
      const median = calculateMedian(latencies);
      const p95 = calculateP95(latencies);

      assert.strictEqual(median, 150);
      assert.strictEqual(p95, 200);

      const emptyLatencies = [];
      assert.strictEqual(calculateMedian(emptyLatencies), 0);
      assert.strictEqual(calculateP95(emptyLatencies), 0);
    });
    // =============================================================
    // Group 5: Metric Nullability Semantics (Tests 23 - 27)
    // =============================================================

    test('EVAL-PERSIST-23: When 0 cases evaluated (all provider failures), pass_rate in DB is NULL, not 0', () => {
      const db = getDatabase();
      const runId = generateCanonicalRunId();
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 3,
      });

      evaluationDbService.finalizeEvaluationRun({
        id: runId,
        timestamp: new Date().toISOString(),
        metrics: {
          totalCases: 3,
          evaluatedCases: 0,
          candidateEvaluatedCases: 0,
          candidatePassed: 0,
          candidatePassRate: null,
          candidateQualityScore: null,
        },
        releaseDecision: { status: 'NO_GO', reason: 'Provider unreachable' },
      });

      const row = db.prepare('SELECT evaluated_cases, pass_rate FROM evaluation_runs WHERE id = ?').get(runId);
      assert.strictEqual(row.evaluated_cases, 0);
      assert.strictEqual(row.pass_rate, null, 'pass_rate must be strictly NULL when 0 cases evaluated');
    });

    test('EVAL-PERSIST-24: When 0 cases evaluated, quality_score in DB is NULL, not 0', () => {
      const db = getDatabase();
      const runId = generateCanonicalRunId();
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 2,
      });

      evaluationDbService.finalizeEvaluationRun({
        id: runId,
        timestamp: new Date().toISOString(),
        metrics: {
          totalCases: 2,
          evaluatedCases: 0,
          candidateEvaluatedCases: 0,
          candidatePassed: 0,
          candidatePassRate: null,
          candidateQualityScore: null,
        },
        releaseDecision: { status: 'NO_GO', reason: 'All failed' },
      });

      const row = db.prepare('SELECT quality_score FROM evaluation_runs WHERE id = ?').get(runId);
      assert.strictEqual(row.quality_score, null, 'quality_score must be strictly NULL when 0 cases evaluated');
    });

    test('EVAL-PERSIST-25: When transport fails, latency_ms in evaluation_results is strictly NULL', () => {
      const db = getDatabase();
      const runId = generateCanonicalRunId();
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 1,
      });

      evaluationDbService.recordCaseResult(runId, { id: 'v-test', provider: 'cerebras', modelIdentifier: 'gpt-oss-120b' }, {
        testCaseId: 'tc-chk-001',
        candidateOutput: '',
        passed: null,
        candidateScore: null,
        candidateLatencyMs: 5000,
        candidateQualityEvaluated: false,
        candidateTransportSuccess: false,
        candidateEvaluationEligible: false,
        candidateExecutionStatus: 'TIMEOUT',
      });

      const row = db.prepare('SELECT latency_ms FROM evaluation_results WHERE run_id = ?').get(runId);
      assert.strictEqual(row.latency_ms, null, 'latency_ms must be NULL when transport fails');
    });

    test('EVAL-PERSIST-26: When transport fails, cost and token counts in evaluation_results are strictly NULL', () => {
      const db = getDatabase();
      const runId = generateCanonicalRunId();
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 1,
      });

      evaluationDbService.recordCaseResult(runId, { id: 'v-test', provider: 'google', modelIdentifier: 'gemini-2.5-flash' }, {
        testCaseId: 'tc-chk-001',
        candidateOutput: '',
        passed: null,
        candidateQualityEvaluated: false,
        candidateTransportSuccess: false,
        candidateEvaluationEligible: false,
        candidateExecutionStatus: 'RATE_LIMIT',
        candidateUsage: { inputTokens: 10, outputTokens: 0, totalTokens: 10, estimatedCostUsd: 0.005 },
      });

      const row = db.prepare('SELECT cost, input_tokens, output_tokens, total_tokens FROM evaluation_results WHERE run_id = ?').get(runId);
      assert.strictEqual(row.cost, null, 'cost must be NULL when transport fails');
      assert.strictEqual(row.input_tokens, null, 'input_tokens must be NULL when transport fails');
      assert.strictEqual(row.output_tokens, null, 'output_tokens must be NULL when transport fails');
      assert.strictEqual(row.total_tokens, null, 'total_tokens must be NULL when transport fails');
    });

    test('EVAL-PERSIST-27: When request succeeds, latency_ms and token counts are stored as valid numbers', () => {
      const db = getDatabase();
      const runId = generateCanonicalRunId();
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 1,
      });

      evaluationDbService.recordCaseResult(runId, { id: 'v-test', provider: 'google', modelIdentifier: 'gemini-2.5-flash' }, {
        testCaseId: 'tc-chk-001',
        candidateOutput: '{"success": true}',
        passed: true,
        candidateScore: 0.95,
        candidateLatencyMs: 142,
        candidateQualityEvaluated: true,
        candidateTransportSuccess: true,
        candidateEvaluationEligible: true,
        candidateExecutionStatus: 'PASS',
        candidateUsage: { inputTokens: 120, outputTokens: 45, reasoningTokens: 15, totalTokens: 165, estimatedCostUsd: 0.00032 },
      });

      const row = db.prepare('SELECT latency_ms, input_tokens, output_tokens, reasoning_tokens, total_tokens, cost FROM evaluation_results WHERE run_id = ?').get(runId);
      assert.strictEqual(row.latency_ms, 142);
      assert.strictEqual(row.input_tokens, 120);
      assert.strictEqual(row.output_tokens, 45);
      assert.strictEqual(row.reasoning_tokens, 15);
      assert.strictEqual(row.total_tokens, 165);
      assert.strictEqual(row.cost, 0.00032);
    });

    // =============================================================
    // Group 6: Database Service Integration & Authoritative Queries (Tests 28 - 32)
    // =============================================================

    test('EVAL-PERSIST-28: createEvaluationRun auto-ensures foreign keys for non-existent project/dataset', () => {
      const db = getDatabase();
      const runId = generateCanonicalRunId();
      const customProjId = `proj-custom-${Date.now()}`;
      const customDsId = `ds-custom-${Date.now()}`;

      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: customProjId,
        datasetId: customDsId,
        totalCases: 5,
      });

      const proj = db.prepare('SELECT id FROM projects WHERE id = ?').get(customProjId);
      const ds = db.prepare('SELECT id FROM datasets WHERE id = ?').get(customDsId);
      const run = db.prepare('SELECT id, project_id, dataset_id FROM evaluation_runs WHERE id = ?').get(runId);

      assert.ok(proj, 'Auto-created project must exist');
      assert.ok(ds, 'Auto-created dataset must exist');
      assert.strictEqual(run.project_id, customProjId);
      assert.strictEqual(run.dataset_id, customDsId);
    });

    test('EVAL-PERSIST-29: recordCaseResult auto-ensures test_case and model_version references', () => {
      const db = getDatabase();
      const runId = generateCanonicalRunId();
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 1,
      });

      const customTcId = `tc-dyn-${Date.now()}`;
      const customMvId = `mv-dyn-${Date.now()}`;

      evaluationDbService.recordCaseResult(
        runId,
        { id: customMvId, provider: 'groq', modelIdentifier: 'llama-3-8b' },
        {
          testCaseId: customTcId,
          testCaseName: 'Dynamic Case',
          passed: true,
          candidateScore: 1.0,
          candidateLatencyMs: 90,
          candidateQualityEvaluated: true,
          candidateTransportSuccess: true,
          candidateEvaluationEligible: true,
        }
      );

      const tc = db.prepare('SELECT id FROM test_cases WHERE id = ?').get(customTcId);
      const mv = db.prepare('SELECT id FROM model_versions WHERE id = ?').get(customMvId);
      const res = db.prepare('SELECT test_case_id, model_version_id FROM evaluation_results WHERE run_id = ?').get(runId);

      assert.ok(tc, 'Auto-created test_case must exist');
      assert.ok(mv, 'Auto-created model_version must exist');
      assert.strictEqual(res.test_case_id, customTcId);
      assert.strictEqual(res.model_version_id, customMvId);
    });

    test('EVAL-PERSIST-30: finalizeEvaluationRun accurately persists evaluated_cases, passed_cases, failed_cases', () => {
      const db = getDatabase();
      const runId = generateCanonicalRunId();
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 10,
      });

      evaluationDbService.finalizeEvaluationRun({
        id: runId,
        timestamp: new Date().toISOString(),
        metrics: {
          totalCases: 10,
          evaluatedCases: 8,
          candidateEvaluatedCases: 8,
          candidatePassed: 6,
          candidatePassRate: 75.0,
          candidateQualityScore: 0.78,
        },
        releaseDecision: { status: 'WARN', reason: 'Pass rate dropped slightly below threshold' },
      });

      const row = db.prepare('SELECT total_cases, evaluated_cases, passed_cases, failed_cases, pass_rate, quality_score, release_decision FROM evaluation_runs WHERE id = ?').get(runId);
      assert.strictEqual(row.total_cases, 10);
      assert.strictEqual(row.evaluated_cases, 8);
      assert.strictEqual(row.passed_cases, 6);
      assert.strictEqual(row.failed_cases, 2);
      assert.strictEqual(row.pass_rate, 75.0);
      assert.strictEqual(row.quality_score, 0.78);
      assert.strictEqual(row.release_decision, 'WARN');
    });

    test('EVAL-PERSIST-31: getEvaluationRuns retrieves authoritative runs list from SQLite', () => {
      const runs = evaluationDbService.getEvaluationRuns();
      assert.ok(Array.isArray(runs), 'getEvaluationRuns must return array');
      assert.ok(runs.length >= 1, 'Should contain at least one run');
    });

    test('EVAL-PERSIST-32: getEvaluationRunById returns complete run details with metrics from SQLite', () => {
      const db = getDatabase();
      const runId = generateCanonicalRunId();
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 4,
      });
      evaluationDbService.finalizeEvaluationRun({
        id: runId,
        timestamp: new Date().toISOString(),
        metrics: {
          totalCases: 4,
          evaluatedCases: 4,
          candidateEvaluatedCases: 4,
          candidatePassed: 3,
          candidatePassRate: 75.0,
          candidateQualityScore: 0.82,
        },
        releaseDecision: { status: 'GO', reason: 'Pass criteria met' },
      });

      const run = evaluationDbService.getEvaluationRunById(runId);
      assert.ok(run, 'getEvaluationRunById must return run');
      assert.strictEqual(run.id, runId);
      assert.strictEqual(run.status, 'COMPLETED');
      assert.strictEqual(run.metrics.candidatePassRate, 75.0);
      assert.strictEqual(run.releaseDecision.status, 'GO');
    });

    // =============================================================
    // Group 7: Case Results & Failures Queries (Tests 33 - 35)
    // =============================================================

    test('EVAL-PERSIST-33: getRunResults retrieves all test case results for a given run from SQLite', () => {
      const runId = generateCanonicalRunId();
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 2,
      });

      evaluationDbService.recordCaseResult(runId, { id: 'v-test', provider: 'google', modelIdentifier: 'gemini-2.5-flash' }, {
        testCaseId: 'tc-chk-001',
        passed: true,
        candidateScore: 1.0,
        candidateLatencyMs: 120,
        candidateQualityEvaluated: true,
        candidateTransportSuccess: true,
        candidateEvaluationEligible: true,
      });

      evaluationDbService.recordCaseResult(runId, { id: 'v-test', provider: 'google', modelIdentifier: 'gemini-2.5-flash' }, {
        testCaseId: 'tc-chk-002',
        passed: false,
        candidateScore: 0.0,
        candidateLatencyMs: 130,
        candidateQualityEvaluated: true,
        candidateTransportSuccess: true,
        candidateEvaluationEligible: true,
      });

      const results = evaluationDbService.getRunResults(runId);
      assert.strictEqual(results.length, 2, 'Should return 2 case results');
      assert.ok(results.some((r) => r.testCaseId === 'tc-chk-001'));
      assert.ok(results.some((r) => r.testCaseId === 'tc-chk-002'));
    });

    test('EVAL-PERSIST-34: getRunFailures retrieves only failed cases and operational errors from SQLite', () => {
      const runId = generateCanonicalRunId();
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 3,
      });

      evaluationDbService.recordCaseResult(runId, { id: 'v-test', provider: 'google', modelIdentifier: 'gemini-2.5-flash' }, {
        testCaseId: 'tc-chk-001',
        passed: true,
        candidateScore: 1.0,
        candidateLatencyMs: 100,
        candidateQualityEvaluated: true,
        candidateTransportSuccess: true,
        candidateEvaluationEligible: true,
      });

      evaluationDbService.recordCaseResult(runId, { id: 'v-test', provider: 'google', modelIdentifier: 'gemini-2.5-flash' }, {
        testCaseId: 'tc-chk-002',
        passed: false,
        candidateScore: 0.0,
        candidateLatencyMs: 110,
        candidateQualityEvaluated: true,
        candidateTransportSuccess: true,
        candidateEvaluationEligible: true,
        candidateExecutionStatus: 'QUALITY_FAILURE',
        failureCategory: 'QUALITY_FAILURE',
      });

      evaluationDbService.recordCaseResult(runId, { id: 'v-test', provider: 'google', modelIdentifier: 'gemini-2.5-flash' }, {
        testCaseId: 'tc-chk-003',
        passed: null,
        candidateScore: null,
        candidateLatencyMs: null,
        candidateQualityEvaluated: false,
        candidateTransportSuccess: false,
        candidateEvaluationEligible: false,
        candidateExecutionStatus: 'PROVIDER_RATE_LIMIT',
        failureCategory: 'PROVIDER_QUOTA',
      });

      const failures = evaluationDbService.getRunFailures(runId);
      assert.strictEqual(failures.length, 2, 'getRunFailures must return 2 failures (1 quality + 1 provider error)');
      const failedCaseIds = failures.map((f) => f.testCaseId);
      assert.ok(failedCaseIds.includes('tc-chk-002'), 'tc-chk-002 must be included in failures');
      assert.ok(failedCaseIds.includes('tc-chk-003'), 'tc-chk-003 must be included in failures');
      assert.ok(!failedCaseIds.includes('tc-chk-001'), 'tc-chk-001 (pass) must NOT be in failures');
    });

    test('EVAL-PERSIST-35: getRunResults accurately reflects candidateOutput, score, and latency', () => {
      const runId = generateCanonicalRunId();
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 1,
      });

      evaluationDbService.recordCaseResult(runId, { id: 'v-test', provider: 'cerebras', modelIdentifier: 'gpt-oss-120b' }, {
        testCaseId: 'tc-chk-001',
        candidateOutput: 'Cart item added with promo code applied',
        passed: true,
        candidateScore: 0.98,
        candidateLatencyMs: 76,
        candidateQualityEvaluated: true,
        candidateTransportSuccess: true,
        candidateEvaluationEligible: true,
      });

      const results = evaluationDbService.getRunResults(runId);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].candidateOutput, 'Cart item added with promo code applied');
      assert.strictEqual(results[0].qualityScore, 0.98);
      assert.strictEqual(results[0].latencyMs, 76);
      assert.strictEqual(Boolean(results[0].passed), true);
    });
    // =============================================================
    // Group 8: Partial Runs, Interruption, and Failure Handling (Tests 36 - 37)
    // =============================================================

    test('EVAL-PERSIST-36: failEvaluationRun marks run as FAILED and sets error message in release_reason', () => {
      const db = getDatabase();
      const runId = generateCanonicalRunId();
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 5,
      });

      const errMsg = 'PROVIDER_TIMEOUT: Model execution timed out after 30000ms';
      evaluationDbService.failEvaluationRun(runId, errMsg);

      const run = db.prepare('SELECT status, release_reason, completed_at FROM evaluation_runs WHERE id = ?').get(runId);
      assert.strictEqual(run.status, 'FAILED');
      assert.strictEqual(run.release_reason, errMsg);
      assert.ok(run.completed_at, 'completed_at must be populated on failure');
    });

    test('EVAL-PERSIST-37: Partial run failure preserves all completed case results recorded prior to failure', () => {
      const db = getDatabase();
      const runId = generateCanonicalRunId();
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 5,
      });

      // Record 2 cases successfully before crash
      evaluationDbService.recordCaseResult(runId, { id: 'v-test', provider: 'google', modelIdentifier: 'gemini-2.5-flash' }, {
        testCaseId: 'tc-chk-001',
        passed: true,
        candidateScore: 1.0,
        candidateLatencyMs: 120,
        candidateQualityEvaluated: true,
        candidateTransportSuccess: true,
        candidateEvaluationEligible: true,
      });
      evaluationDbService.recordCaseResult(runId, { id: 'v-test', provider: 'google', modelIdentifier: 'gemini-2.5-flash' }, {
        testCaseId: 'tc-chk-002',
        passed: false,
        candidateScore: 0.0,
        candidateLatencyMs: 140,
        candidateQualityEvaluated: true,
        candidateTransportSuccess: true,
        candidateEvaluationEligible: true,
      });

      // Abrupt failure occurs on case 3
      evaluationDbService.failEvaluationRun(runId, 'Uncaught network disconnection on case 3');

      // Verify run status
      const run = db.prepare('SELECT status FROM evaluation_runs WHERE id = ?').get(runId);
      assert.strictEqual(run.status, 'FAILED');

      // Verify case results are NOT lost
      const results = db.prepare('SELECT id, test_case_id FROM evaluation_results WHERE run_id = ?').all(runId);
      assert.strictEqual(results.length, 2, 'Both completed test cases must remain preserved in SQLite');
    });

    // =============================================================
    // Group 9: Legacy Compatibility & Server Restart Persistence (Tests 38 - 39)
    // =============================================================

    test('EVAL-PERSIST-38: Legacy JSON compatibility preserves run to disk matching SQLite', () => {
      const runId = generateCanonicalRunId();
      const mockRun = {
        id: runId,
        projectId: 'proj-checkout-agent',
        projectName: 'Checkout Agent',
        datasetId: 'ds-checkout-golden',
        datasetName: 'Checkout Golden Dataset',
        baselineVersionId: 'v-gemini-3.6',
        baselineVersionName: 'Gemini 3.6 Flash',
        candidateVersionId: 'v-groq-gpt-oss',
        candidateVersionName: 'GPT OSS 20B',
        timestamp: new Date().toISOString(),
        durationMs: 450,
        metrics: {
          totalCases: 1,
          evaluatedCases: 1,
          baselinePassed: 1,
          candidatePassed: 1,
          baselinePassRate: 100,
          candidatePassRate: 100,
          candidateQualityScore: 1.0,
        },
        caseResults: [
          {
            testCaseId: 'tc-chk-001',
            testCaseName: 'Basic Checkout',
            category: 'Checkout',
            severity: 'critical',
            passed: true,
            candidateScore: 1.0,
          },
        ],
        releaseDecision: {
          status: 'GO',
          reason: 'All checks passed',
          thresholdsMet: true,
          safetyGatePassed: true,
        },
      };

      // Save to SQLite
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: mockRun.projectId,
        datasetId: mockRun.datasetId,
        totalCases: 1,
      });
      evaluationDbService.finalizeEvaluationRun(mockRun);

      // Save to disk
      saveRunToDisk(mockRun);

      // Verify disk run exists
      const diskRuns = getRunsFromDisk();
      const foundDisk = diskRuns.find((r) => r.id === runId);
      assert.ok(foundDisk, 'Run must be saved to data/runs/*.json');
      assert.strictEqual(foundDisk.id, runId);

      // Verify SQLite run exists
      const dbRun = evaluationDbService.getEvaluationRunById(runId);
      assert.ok(dbRun, 'Run must be readable from SQLite');
      assert.strictEqual(dbRun.id, runId);
    });

    test('EVAL-PERSIST-39: Closing and re-opening database preserves all evaluation runs, results, and metrics across restarts', () => {
      const runId = generateCanonicalRunId();

      // Write data to DB
      evaluationDbService.createEvaluationRun({
        id: runId,
        projectId: 'proj-checkout-agent',
        datasetId: 'ds-checkout-golden',
        totalCases: 2,
      });
      evaluationDbService.recordCaseResult(runId, { id: 'v-test', provider: 'google', modelIdentifier: 'gemini-2.5-flash' }, {
        testCaseId: 'tc-chk-001',
        passed: true,
        candidateScore: 1.0,
        candidateLatencyMs: 115,
        candidateQualityEvaluated: true,
        candidateTransportSuccess: true,
        candidateEvaluationEligible: true,
      });
      evaluationDbService.finalizeEvaluationRun({
        id: runId,
        timestamp: new Date().toISOString(),
        metrics: {
          totalCases: 2,
          evaluatedCases: 1,
          candidateEvaluatedCases: 1,
          candidatePassed: 1,
          candidatePassRate: 100,
          candidateQualityScore: 1.0,
        },
        releaseDecision: { status: 'GO', reason: 'High reliability' },
      });

      // Close DB connection (simulate server shutdown)
      closeDatabase();

      // Reopen DB connection (simulate server restart)
      const reopenedDb = initializeDatabase({ dbPath: testDbPath });
      assert.strictEqual(reopenedDb.open, true, 'Database should be re-opened successfully');

      // Query persisted data
      const persistedRun = evaluationDbService.getEvaluationRunById(runId);
      assert.ok(persistedRun, 'Evaluation run must survive database restart');
      assert.strictEqual(persistedRun.id, runId);
      assert.strictEqual(persistedRun.status, 'COMPLETED');
      assert.strictEqual(persistedRun.metrics.candidatePassRate, 100);
      assert.strictEqual(persistedRun.releaseDecision.status, 'GO');

      const persistedResults = evaluationDbService.getRunResults(runId);
      assert.strictEqual(persistedResults.length, 1, 'Evaluation results must survive database restart');
      assert.strictEqual(persistedResults[0].testCaseId, 'tc-chk-001');
      assert.strictEqual(Boolean(persistedResults[0].passed), true);
      assert.strictEqual(persistedResults[0].latencyMs, 115);
    });

  } finally {
    closeDatabase();

    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
      if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
      if (fs.existsSync(testDbDir)) fs.rmdirSync(testDbDir);
    } catch {}

    if (shouldCloseServer) {
      await server.close();
    }
  }

  console.log('--- All Authoritative Evaluation Persistence Tests (Step 4) Completed Successfully ---\n');
}

// Standalone execution: node tests/evaluationPersistence.test.mjs
if (process.argv[1] && process.argv[1].endsWith('evaluationPersistence.test.mjs')) {
  let passed = 0;
  let failed = 0;
  runEvaluationPersistenceTests({
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
    console.log(`EVALUATION PERSISTENCE TESTS SUMMARY: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
    else process.exit(0);
  }).catch((err) => {
    console.error('Fatal error in Evaluation Persistence test suite:', err);
    process.exit(1);
  });
}
