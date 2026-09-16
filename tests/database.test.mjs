/* ============================================================
   RELIQ — Database & Persistence Unit Test Suite
   
   Verifies:
   1. Database file creation (data/reliq.db)
   2. Schema creation (all 8 tables & 9 indexes)
   3. Foreign keys enforcement (PRAGMA foreign_keys = ON)
   4. initializeDatabase() idempotence (can run twice safely)
   5. Seed data idempotence (no duplicates on repeated seeding)
   6. Basic insert/read for Project
   7. Basic insert/read for Dataset
   8. Basic insert/read for Test Case
   9. Basic insert/read for Model Version
   10. Basic insert/read for Evaluation Run & Evaluation Result
   11. Database closes cleanly
   ============================================================ */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

export async function runDatabaseTests(testRunner, viteServer) {
  let server = viteServer;
  let shouldCloseServer = false;

  if (!server) {
    server = await createServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    shouldCloseServer = true;
  }

  const {
    initializeDatabase,
    getDatabase,
    closeDatabase,
  } = await server.ssrLoadModule('/src/server/db/database.ts');

  const { seedDatabase } = await server.ssrLoadModule('/src/server/db/seed.ts');

  const { test } = testRunner;
  const testDbDir = path.resolve(process.cwd(), 'data', 'test_db');
  const testDbPath = path.join(testDbDir, 'test_reliq.db');

  // Clean up any previous test database
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
    if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
  } catch {}

  console.log('\n--- Running Database & Persistence Unit Tests ---');

  try {
    // -------------------------------------------------------------
    // Test 1: Database file creation
    // -------------------------------------------------------------
    test('DB-1: Database file creation in target directory', () => {
      const db = initializeDatabase({ dbPath: testDbPath, skipSeed: true });
      assert.ok(db, 'Database instance should be returned');
      assert.strictEqual(fs.existsSync(testDbPath), true, 'Database file should exist on disk');
    });

    // -------------------------------------------------------------
    // Test 2: Schema creation (all 8 tables & 9 indexes)
    // -------------------------------------------------------------
    test('DB-2: Schema creation - all 8 required tables and 9 indexes exist', () => {
      const db = getDatabase(testDbPath);

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all()
        .map((r) => r.name);

      const requiredTables = [
        'datasets',
        'evaluation_results',
        'evaluation_runs',
        'model_versions',
        'project_settings',
        'projects',
        'release_decision_audit',
        'test_cases',
      ];

      for (const tbl of requiredTables) {
        assert.ok(tables.includes(tbl), `Table '${tbl}' must exist in database schema`);
      }

      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name")
        .all()
        .map((r) => r.name);

      const requiredIndexes = [
        'idx_datasets_project_id',
        'idx_test_cases_dataset_id',
        'idx_model_versions_project_id',
        'idx_evaluation_runs_project_id',
        'idx_evaluation_runs_dataset_id',
        'idx_evaluation_results_run_id',
        'idx_evaluation_results_test_case_id',
        'idx_project_settings_project_id',
        'idx_release_decision_audit_run_id',
      ];

      for (const idx of requiredIndexes) {
        assert.ok(indexes.includes(idx), `Index '${idx}' must exist in database schema`);
      }
    });

    // -------------------------------------------------------------
    // Test 3: Foreign keys enabled
    // -------------------------------------------------------------
    test('DB-3: Foreign keys enabled (PRAGMA foreign_keys = ON)', () => {
      const db = getDatabase(testDbPath);
      const fk = db.pragma('foreign_keys', { simple: true });
      assert.strictEqual(fk, 1, 'foreign_keys pragma must be active (1)');

      // Attempt to insert dataset referencing non-existent project -> must fail
      assert.throws(
        () => {
          db.prepare(
            `INSERT INTO datasets (id, project_id, name, description, case_count, created_at, updated_at)
             VALUES ('ds-invalid', 'proj-does-not-exist', 'Invalid Dataset', '', 0, '2026-09-16T00:00:00Z', '2026-09-16T00:00:00Z')`
          ).run();
        },
        /FOREIGN KEY constraint failed/i,
        'Insert with missing foreign key reference must throw constraint violation'
      );
    });

    // -------------------------------------------------------------
    // Test 4: initializeDatabase() can run twice safely (idempotent)
    // -------------------------------------------------------------
    test('DB-4: initializeDatabase() can run twice safely without errors', () => {
      assert.doesNotThrow(() => {
        initializeDatabase({ dbPath: testDbPath, skipSeed: true });
      }, 'Re-calling initializeDatabase must be idempotent');

      const db = getDatabase(testDbPath);
      assert.strictEqual(db.open, true, 'Database should remain open and valid');
    });

    // -------------------------------------------------------------
    // Test 5: Seed data does not duplicate on repeated runs
    // -------------------------------------------------------------
    test('DB-5: Seed data does not duplicate on repeated executions', () => {
      const db = getDatabase(testDbPath);

      // First seed
      seedDatabase(db);
      const projCount1 = db.prepare('SELECT COUNT(*) as c FROM projects').get().c;
      const dsCount1 = db.prepare('SELECT COUNT(*) as c FROM datasets').get().c;
      const tcCount1 = db.prepare('SELECT COUNT(*) as c FROM test_cases').get().c;
      const verCount1 = db.prepare('SELECT COUNT(*) as c FROM model_versions').get().c;
      const setCount1 = db.prepare('SELECT COUNT(*) as c FROM project_settings').get().c;

      assert.ok(projCount1 >= 1, 'At least 1 seed project should exist');
      assert.ok(dsCount1 >= 1, 'At least 1 seed dataset should exist');
      assert.ok(tcCount1 >= 22, 'Seed test cases should be seeded');
      assert.ok(verCount1 >= 2, 'Seed baseline and candidate versions should exist');
      assert.ok(setCount1 >= 1, 'Seed project settings should exist');

      // Second seed execution
      seedDatabase(db);
      const projCount2 = db.prepare('SELECT COUNT(*) as c FROM projects').get().c;
      const dsCount2 = db.prepare('SELECT COUNT(*) as c FROM datasets').get().c;
      const tcCount2 = db.prepare('SELECT COUNT(*) as c FROM test_cases').get().c;
      const verCount2 = db.prepare('SELECT COUNT(*) as c FROM model_versions').get().c;
      const setCount2 = db.prepare('SELECT COUNT(*) as c FROM project_settings').get().c;

      assert.strictEqual(projCount2, projCount1, 'Project count must not increase on re-seed');
      assert.strictEqual(dsCount2, dsCount1, 'Dataset count must not increase on re-seed');
      assert.strictEqual(tcCount2, tcCount1, 'Test case count must not increase on re-seed');
      assert.strictEqual(verCount2, verCount1, 'Version count must not increase on re-seed');
      assert.strictEqual(setCount2, setCount1, 'Settings count must not increase on re-seed');
    });

    // -------------------------------------------------------------
    // Test 6: Basic insert/read for Project
    // -------------------------------------------------------------
    test('DB-6: Basic insert and read for Project', () => {
      const db = getDatabase(testDbPath);
      const now = new Date().toISOString();
      const testProj = {
        id: 'proj-custom-test',
        name: 'Custom Diagnostic Agent',
        description: 'Test project for persistence verification',
        created_at: now,
        updated_at: now,
      };

      db.prepare(`
        INSERT INTO projects (id, name, description, created_at, updated_at)
        VALUES (@id, @name, @description, @created_at, @updated_at)
      `).run(testProj);

      const read = db.prepare('SELECT * FROM projects WHERE id = ?').get(testProj.id);
      assert.ok(read, 'Project record should be retrieved');
      assert.strictEqual(read.name, testProj.name);
      assert.strictEqual(read.description, testProj.description);
    });

    // -------------------------------------------------------------
    // Test 7: Basic insert/read for Dataset
    // -------------------------------------------------------------
    test('DB-7: Basic insert and read for Dataset', () => {
      const db = getDatabase(testDbPath);
      const now = new Date().toISOString();
      const testDs = {
        id: 'ds-custom-test',
        project_id: 'proj-custom-test',
        name: 'Custom Evaluation Suite',
        description: 'Test dataset suite',
        case_count: 5,
        created_at: now,
        updated_at: now,
      };

      db.prepare(`
        INSERT INTO datasets (id, project_id, name, description, case_count, created_at, updated_at)
        VALUES (@id, @project_id, @name, @description, @case_count, @created_at, @updated_at)
      `).run(testDs);

      const read = db.prepare('SELECT * FROM datasets WHERE id = ?').get(testDs.id);
      assert.ok(read, 'Dataset record should be retrieved');
      assert.strictEqual(read.name, testDs.name);
      assert.strictEqual(read.case_count, 5);
      assert.strictEqual(read.project_id, 'proj-custom-test');
    });

    // -------------------------------------------------------------
    // Test 8: Basic insert/read for Test Case
    // -------------------------------------------------------------
    test('DB-8: Basic insert and read for Test Case', () => {
      const db = getDatabase(testDbPath);
      const now = new Date().toISOString();
      const testCase = {
        id: 'tc-custom-01',
        dataset_id: 'ds-custom-test',
        name: 'Simulated Shipping Tier Check',
        category: 'Tool Calling',
        input: 'Calculate shipping cost for package weight 5kg',
        expected_behavior: '{"cost": 15.00, "tier": "standard"}',
        created_at: now,
        updated_at: now,
      };

      db.prepare(`
        INSERT INTO test_cases (id, dataset_id, name, category, input, expected_behavior, created_at, updated_at)
        VALUES (@id, @dataset_id, @name, @category, @input, @expected_behavior, @created_at, @updated_at)
      `).run(testCase);

      const read = db.prepare('SELECT * FROM test_cases WHERE id = ?').get(testCase.id);
      assert.ok(read, 'Test case record should be retrieved');
      assert.strictEqual(read.name, testCase.name);
      assert.strictEqual(read.category, 'Tool Calling');
      assert.strictEqual(read.expected_behavior, testCase.expected_behavior);
    });

    // -------------------------------------------------------------
    // Test 9: Basic insert/read for Model Version
    // -------------------------------------------------------------
    test('DB-9: Basic insert and read for Model Version', () => {
      const db = getDatabase(testDbPath);
      const now = new Date().toISOString();
      const testVersion = {
        id: 'ver-custom-groq-70b',
        project_id: 'proj-custom-test',
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        display_name: 'Llama 3.3 70B (Groq Fast Inference)',
        system_prompt: 'You are an accurate checkout agent.',
        created_at: now,
        updated_at: now,
      };

      db.prepare(`
        INSERT INTO model_versions (id, project_id, provider, model, display_name, system_prompt, created_at, updated_at)
        VALUES (@id, @project_id, @provider, @model, @display_name, @system_prompt, @created_at, @updated_at)
      `).run(testVersion);

      const read = db.prepare('SELECT * FROM model_versions WHERE id = ?').get(testVersion.id);
      assert.ok(read, 'Model version record should be retrieved');
      assert.strictEqual(read.provider, 'groq');
      assert.strictEqual(read.model, 'llama-3.3-70b-versatile');
      assert.strictEqual(read.display_name, testVersion.display_name);
    });

    // -------------------------------------------------------------
    // Test 10: Basic insert/read for Evaluation Run & Results
    // -------------------------------------------------------------
    test('DB-10: Basic insert and read for Evaluation Run and Evaluation Result', () => {
      const db = getDatabase(testDbPath);
      const now = new Date().toISOString();

      // 10a. Evaluation Run
      const testRun = {
        id: 'run-custom-001',
        project_id: 'proj-custom-test',
        dataset_id: 'ds-custom-test',
        status: 'COMPLETED',
        total_cases: 1,
        evaluated_cases: 1,
        passed_cases: 1,
        failed_cases: 0,
        pass_rate: 100.0,
        quality_score: 1.0,
        started_at: now,
        completed_at: now,
        release_decision: 'SHIP',
        release_reason: 'All automated quality and regression checks passed.',
      };

      db.prepare(`
        INSERT INTO evaluation_runs (
          id, project_id, dataset_id, status, total_cases, evaluated_cases, passed_cases, failed_cases,
          pass_rate, quality_score, started_at, completed_at, release_decision, release_reason
        ) VALUES (
          @id, @project_id, @dataset_id, @status, @total_cases, @evaluated_cases, @passed_cases, @failed_cases,
          @pass_rate, @quality_score, @started_at, @completed_at, @release_decision, @release_reason
        )
      `).run(testRun);

      const readRun = db.prepare('SELECT * FROM evaluation_runs WHERE id = ?').get(testRun.id);
      assert.ok(readRun, 'Evaluation run record should be retrieved');
      assert.strictEqual(readRun.status, 'COMPLETED');
      assert.strictEqual(readRun.pass_rate, 100.0);
      assert.strictEqual(readRun.release_decision, 'SHIP');

      // 10b. Evaluation Result
      const testResult = {
        id: 'res-custom-001',
        run_id: 'run-custom-001',
        test_case_id: 'tc-custom-01',
        model_version_id: 'ver-custom-groq-70b',
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        response: '{"cost": 15.00, "tier": "standard"}',
        passed: 1,
        quality_score: 1.0,
        latency_ms: 112.5,
        input_tokens: 35,
        output_tokens: 18,
        reasoning_tokens: 0,
        total_tokens: 53,
        cost: 0.000042,
        failure_type: null,
        failure_category: null,
        created_at: now,
      };

      db.prepare(`
        INSERT INTO evaluation_results (
          id, run_id, test_case_id, model_version_id, provider, model, response, passed,
          quality_score, latency_ms, input_tokens, output_tokens, reasoning_tokens,
          total_tokens, cost, failure_type, failure_category, created_at
        ) VALUES (
          @id, @run_id, @test_case_id, @model_version_id, @provider, @model, @response, @passed,
          @quality_score, @latency_ms, @input_tokens, @output_tokens, @reasoning_tokens,
          @total_tokens, @cost, @failure_type, @failure_category, @created_at
        )
      `).run(testResult);

      const readResult = db.prepare('SELECT * FROM evaluation_results WHERE id = ?').get(testResult.id);
      assert.ok(readResult, 'Evaluation result record should be retrieved');
      assert.strictEqual(readResult.passed, 1);
      assert.strictEqual(readResult.latency_ms, 112.5);
      assert.strictEqual(readResult.total_tokens, 53);

      // 10c. Release Decision Audit Log
      const auditRecord = {
        id: 'audit-custom-001',
        run_id: 'run-custom-001',
        previous_decision: 'SHIP',
        new_decision: 'BLOCK',
        justification: 'Manual supervisor policy override: pricing anomaly check pending.',
        created_at: now,
      };

      db.prepare(`
        INSERT INTO release_decision_audit (id, run_id, previous_decision, new_decision, justification, created_at)
        VALUES (@id, @run_id, @previous_decision, @new_decision, @justification, @created_at)
      `).run(auditRecord);

      const readAudit = db.prepare('SELECT * FROM release_decision_audit WHERE id = ?').get(auditRecord.id);
      assert.ok(readAudit, 'Release decision audit record should be retrieved');
      assert.strictEqual(readAudit.previous_decision, 'SHIP');
      assert.strictEqual(readAudit.new_decision, 'BLOCK');
    });

    // -------------------------------------------------------------
    // Test 11: Database closes cleanly
    // -------------------------------------------------------------
    test('DB-11: Database closes cleanly', () => {
      const db = getDatabase(testDbPath);
      assert.strictEqual(db.open, true);
      closeDatabase();
      assert.strictEqual(db.open, false, 'Database connection should be marked closed');
    });
  } finally {
    // Clean up temporary test database artifacts
    try {
      closeDatabase();
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
      if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
      if (fs.existsSync(testDbDir)) fs.rmdirSync(testDbDir);
    } catch {}

    if (shouldCloseServer) {
      await server.close();
    }
  }

  console.log('--- All Database & Persistence Unit Tests Completed Successfully ---\n');
}

// Allow direct execution: node tests/database.test.mjs
if (process.argv[1] && process.argv[1].endsWith('database.test.mjs')) {
  let passed = 0;
  let failed = 0;
  runDatabaseTests({
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
  }).then(() => {
    console.log(`DATABASE TESTS SUMMARY: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
  }).catch((err) => {
    console.error('Fatal error in database test suite:', err);
    process.exit(1);
  });
}
