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
      INSERT OR IGNORE INTO projects (id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const projInfo = insertProject.run(
      SEED_PROJECT.id,
      SEED_PROJECT.name,
      SEED_PROJECT.description,
      SEED_PROJECT.createdAt,
      SEED_PROJECT.updatedAt
    );
    result.projectsSeeded += projInfo.changes;

    // 2. Project Settings
    const insertSettings = db.prepare(`
      INSERT OR IGNORE INTO project_settings (
        id, project_id, min_accuracy, max_degradation, latency_tolerance, raw_output_privacy, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const settingsId = `settings-${SEED_PROJECT.id}`;
    const settingsInfo = insertSettings.run(
      settingsId,
      SEED_PROJECT.id,
      SEED_PROJECT.regressionSettings.minAccuracyPercent,
      SEED_PROJECT.regressionSettings.maxAccuracyDegradationPercent,
      SEED_PROJECT.regressionSettings.maxLatencyIncreasePercent,
      1, // default raw output privacy enabled
      SEED_PROJECT.createdAt,
      SEED_PROJECT.updatedAt
    );
    result.settingsSeeded += settingsInfo.changes;

    // 3. Model Versions
    const insertVersion = db.prepare(`
      INSERT OR IGNORE INTO model_versions (
        id, project_id, provider, model, display_name, system_prompt, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const v of [SEED_BASELINE_VERSION, SEED_CANDIDATE_VERSION]) {
      const vInfo = insertVersion.run(
        v.id,
        SEED_PROJECT.id,
        v.provider,
        v.modelIdentifier,
        v.name,
        v.systemPrompt || '',
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
        id, dataset_id, name, category, input, expected_behavior, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
          tc.createdAt || ds.createdAt,
          tc.createdAt || ds.updatedAt
        );
        result.testCasesSeeded += tcInfo.changes;
      }
    }
  });

  seedTransaction();
  return result;
}
