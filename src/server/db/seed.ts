/* ============================================================
   RELIQ — SQLite Database Seeder
   
   Seeds initial demo and golden data from src/data/seedData.ts:
   - Golden project (Checkout Agent)
   - Project settings
   - Baseline and Candidate Model Versions
   - Evaluation Datasets & Test Cases
   
   IDEMPOTENT: Uses INSERT OR IGNORE with deterministic IDs.
   ============================================================ */

import type Database from 'better-sqlite3';
import {
  SEED_BASELINE_VERSION,
  SEED_CANDIDATE_VERSION,
  SEED_DATASET,
  SEED_DATASET_100,
  SEED_PROJECT,
} from '../../data/seedData';

export interface SeedResult {
  projectsSeeded: number;
  settingsSeeded: number;
  versionsSeeded: number;
  datasetsSeeded: number;
  testCasesSeeded: number;
}

/**
 * Seeds golden baseline data into the SQLite database if not already present.
 * Safe to run multiple times; never duplicates records.
 */
export function seedDatabase(db: Database.Database): SeedResult {
  const result: SeedResult = {
    projectsSeeded: 0,
    settingsSeeded: 0,
    versionsSeeded: 0,
    datasetsSeeded: 0,
    testCasesSeeded: 0,
  };

  const seedTransaction = db.transaction(() => {
    // 1. Projects
    const insertProject = db.prepare(`
      INSERT OR IGNORE INTO projects (
        id, name, description, default_dataset_id, baseline_version_id, candidate_version_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const projInfo = insertProject.run(
      SEED_PROJECT.id,
      SEED_PROJECT.name,
      SEED_PROJECT.description,
      SEED_PROJECT.defaultDatasetId || 'ds-checkout-golden',
      SEED_PROJECT.baselineVersionId || 'ver-v1-4',
      SEED_PROJECT.candidateVersionId || 'ver-v1-5',
      SEED_PROJECT.createdAt,
      SEED_PROJECT.updatedAt
    );
    result.projectsSeeded += projInfo.changes;

    // 2. Project Settings
    const insertSettings = db.prepare(`
      INSERT OR IGNORE INTO project_settings (
        id, project_id, min_accuracy, max_degradation, latency_tolerance,
        max_failure_rate, min_coverage, min_evaluated_cases,
        raw_output_privacy, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const settingsId = `settings-${SEED_PROJECT.id}`;
    const settingsInfo = insertSettings.run(
      settingsId,
      SEED_PROJECT.id,
      SEED_PROJECT.regressionSettings.minAccuracyPercent,
      SEED_PROJECT.regressionSettings.maxAccuracyDegradationPercent,
      SEED_PROJECT.regressionSettings.maxLatencyIncreasePercent,
      SEED_PROJECT.regressionSettings.maxFailureRatePercent ?? 5.0,
      SEED_PROJECT.regressionSettings.minEvaluationCoveragePercent ?? 80.0,
      SEED_PROJECT.regressionSettings.minimumEvaluatedCases ?? 100,
      1, // default raw output privacy enabled
      SEED_PROJECT.createdAt,
      SEED_PROJECT.updatedAt
    );
    result.settingsSeeded += settingsInfo.changes;

    // 3. Model Versions
    const insertVersion = db.prepare(`
      INSERT OR IGNORE INTO model_versions (
        id, project_id, provider, model, display_name, system_prompt,
        prompt_version, temperature, max_tokens, reasoning_effort,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const v of [SEED_BASELINE_VERSION, SEED_CANDIDATE_VERSION]) {
      const vInfo = insertVersion.run(
        v.id,
        SEED_PROJECT.id,
        v.provider,
        v.modelIdentifier,
        v.name,
        v.systemPrompt || '',
        v.promptVersion || '1.0',
        v.temperature ?? 0.2,
        v.maxTokens ?? 2048,
        v.reasoningEffort || null,
        v.createdAt,
        v.createdAt
      );
      result.versionsSeeded += vInfo.changes;
    }

    // 4. Datasets
    const insertDataset = db.prepare(`
      INSERT OR IGNORE INTO datasets (
        id, project_id, name, description, case_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertTestCase = db.prepare(`
      INSERT OR IGNORE INTO test_cases (
        id, dataset_id, name, category, input, expected_behavior,
        evaluator_type, evaluator_config, tags, severity, metadata,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const datasetsToSeed = [SEED_DATASET, SEED_DATASET_100];

    for (const ds of datasetsToSeed) {
      const dsInfo = insertDataset.run(
        ds.id,
        SEED_PROJECT.id,
        ds.name,
        ds.description,
        ds.cases.length,
        ds.createdAt,
        ds.updatedAt
      );
      result.datasetsSeeded += dsInfo.changes;

      for (const tc of ds.cases) {
        const tcInfo = insertTestCase.run(
          tc.id,
          ds.id,
          tc.name,
          tc.category,
          tc.input,
          tc.expectedOutput,
          tc.evaluatorType,
          tc.evaluatorConfig ? JSON.stringify(tc.evaluatorConfig) : null,
          JSON.stringify(tc.tags || []),
          tc.severity || 'medium',
          tc.metadata ? JSON.stringify(tc.metadata) : null,
          tc.createdAt || ds.createdAt,
          tc.createdAt || ds.updatedAt
        );

        // INSERT OR IGNORE preserves user-created rows, but seed rows already
        // present in an older database need their evaluator metadata restored.
        db.prepare(`
          UPDATE test_cases
          SET evaluator_type = ?,
              evaluator_config = ?,
              tags = ?,
              severity = ?,
              metadata = ?,
              updated_at = ?
          WHERE id = ? AND dataset_id = ?
            AND evaluator_config IS NULL
            AND tags IS NULL
        `).run(
          tc.evaluatorType,
          tc.evaluatorConfig ? JSON.stringify(tc.evaluatorConfig) : null,
          JSON.stringify(tc.tags || []),
          tc.severity || 'medium',
          tc.metadata ? JSON.stringify(tc.metadata) : null,
          (tc as any).updatedAt || tc.createdAt || ds.updatedAt,
          tc.id,
          ds.id
        );
        result.testCasesSeeded += tcInfo.changes;
      }

      db.prepare(`
        UPDATE datasets
        SET case_count = (SELECT COUNT(*) FROM test_cases WHERE dataset_id = ?)
        WHERE id = ?
      `).run(ds.id, ds.id);
    }
  });

  seedTransaction();
  return result;
}
