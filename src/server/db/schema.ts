/* ============================================================
   RELIQ — SQLite Database Schema Definitions
   
   Production-grade relational schema for RELIQ:
   - Projects
   - Datasets
   - Test Cases
   - Model Versions
   - Evaluation Runs
   - Evaluation Results
   - Project Settings
   - Release Decision Audit Log
   ============================================================ */

import type Database from 'better-sqlite3';

export const SCHEMA_SQL = `
-- Enforce Foreign Key Integrity
PRAGMA foreign_keys = ON;

-- 1. Projects
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 2. Datasets
CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  case_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 3. Test Cases
CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  input TEXT NOT NULL,
  expected_behavior TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
);

-- 4. Model Versions
CREATE TABLE IF NOT EXISTS model_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  display_name TEXT NOT NULL,
  system_prompt TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 5. Evaluation Runs
CREATE TABLE IF NOT EXISTS evaluation_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  status TEXT NOT NULL,
  total_cases INTEGER NOT NULL DEFAULT 0,
  evaluated_cases INTEGER NOT NULL DEFAULT 0,
  passed_cases INTEGER NOT NULL DEFAULT 0,
  failed_cases INTEGER NOT NULL DEFAULT 0,
  pass_rate REAL,
  quality_score REAL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  release_decision TEXT,
  release_reason TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
);

-- 6. Evaluation Results
CREATE TABLE IF NOT EXISTS evaluation_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  test_case_id TEXT,
  model_version_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  response TEXT,
  passed INTEGER,
  quality_score REAL,
  latency_ms REAL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  reasoning_tokens INTEGER,
  total_tokens INTEGER,
  cost REAL,
  failure_type TEXT,
  failure_category TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES evaluation_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE SET NULL,
  FOREIGN KEY (model_version_id) REFERENCES model_versions(id) ON DELETE SET NULL
);

-- 7. Project Settings
CREATE TABLE IF NOT EXISTS project_settings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  min_accuracy REAL NOT NULL,
  max_degradation REAL NOT NULL,
  latency_tolerance REAL NOT NULL,
  raw_output_privacy INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 8. Release Decision Audit
CREATE TABLE IF NOT EXISTS release_decision_audit (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  previous_decision TEXT,
  new_decision TEXT NOT NULL,
  justification TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES evaluation_runs(id) ON DELETE CASCADE
);

-- Indexes for performance and query isolation
CREATE INDEX IF NOT EXISTS idx_datasets_project_id ON datasets(project_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_dataset_id ON test_cases(dataset_id);
CREATE INDEX IF NOT EXISTS idx_model_versions_project_id ON model_versions(project_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_runs_project_id ON evaluation_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_runs_dataset_id ON evaluation_runs(dataset_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_results_run_id ON evaluation_results(run_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_results_test_case_id ON evaluation_results(test_case_id);
CREATE INDEX IF NOT EXISTS idx_project_settings_project_id ON project_settings(project_id);
CREATE INDEX IF NOT EXISTS idx_release_decision_audit_run_id ON release_decision_audit(run_id);
`;

/**
 * Initializes database schema and indexes.
 * Safe to execute multiple times against existing SQLite databases.
 */
export function initSchema(db: Database.Database): void {
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
}
