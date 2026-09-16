/* ============================================================
   RELIQ — Dataset & Test Case Service
   
   Business logic and SQLite persistence for Datasets and Test Cases.
   Maintains accurate datasets.case_count and validates relationships.
   ============================================================ */

import { getDatabase } from '../db/database';
import { projectService } from './projectService';

export interface DatasetRecord {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  case_count: number;
  created_at: string;
  updated_at: string;
}

export interface TestCaseRecord {
  id: string;
  dataset_id: string;
  name: string;
  category: string;
  input: string;
  expected_behavior: string;
  evaluator_type?: string;
  evaluator_config?: string | null;
  tags?: string | null;
  severity?: string;
  metadata?: string | null;
  created_at: string;
  updated_at: string;
}

function parseJsonObject(value: unknown): Record<string, any> | undefined {
  if (!value) return undefined;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseJsonArray(value: unknown): string[] {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export class DatasetService {
  /**
   * Retrieves datasets, optionally filtered by projectId.
   */
  getDatasets(projectId?: string): DatasetRecord[] {
    const db = getDatabase();
    if (projectId) {
      return db
        .prepare(`
          SELECT d.id, d.project_id, d.name, d.description, 
                 (SELECT count(*) FROM test_cases tc WHERE tc.dataset_id = d.id) as case_count, 
                 d.created_at, d.updated_at 
          FROM datasets d 
          WHERE d.project_id = ? 
          ORDER BY CASE WHEN d.id = 'ds-checkout-golden' THEN 0 WHEN (SELECT count(*) FROM test_cases tc WHERE tc.dataset_id = d.id) > 0 THEN 1 ELSE 2 END, d.created_at DESC
        `)
        .all(projectId) as DatasetRecord[];
    }
    return db
      .prepare(`
        SELECT d.id, d.project_id, d.name, d.description, 
               (SELECT count(*) FROM test_cases tc WHERE tc.dataset_id = d.id) as case_count, 
               d.created_at, d.updated_at 
        FROM datasets d 
        ORDER BY CASE WHEN d.id = 'ds-checkout-golden' THEN 0 WHEN (SELECT count(*) FROM test_cases tc WHERE tc.dataset_id = d.id) > 0 THEN 1 ELSE 2 END, d.created_at DESC
      `)
      .all() as DatasetRecord[];
  }

  /**
   * Retrieves a single dataset by ID.
   */
  getDatasetById(id: string): DatasetRecord | null {
    const db = getDatabase();
    const row = db
      .prepare(`
        SELECT d.id, d.project_id, d.name, d.description, 
               (SELECT count(*) FROM test_cases tc WHERE tc.dataset_id = d.id) as case_count, 
               d.created_at, d.updated_at 
        FROM datasets d 
        WHERE d.id = ?
      `)
      .get(id) as DatasetRecord | undefined;
    return row || null;
  }

  /**
   * Creates a new dataset. Validates that the referenced project exists.
   */
  createDataset(data: {
    id?: string;
    projectId: string;
    name: string;
    description?: string;
  }): DatasetRecord {
    const db = getDatabase();
    const project = projectService.getProjectById(data.projectId);
    if (!project) {
      const err = new Error(`Project with ID '${data.projectId}' not found`);
      (err as any).code = 'PROJECT_NOT_FOUND';
      throw err;
    }

    const id = data.id?.trim() || `ds-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const description = data.description?.trim() || null;

    db.prepare(`
      INSERT INTO datasets (id, project_id, name, description, case_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.projectId, data.name.trim(), description, 0, now, now);

    return {
      id,
      project_id: data.projectId,
      name: data.name.trim(),
      description,
      case_count: 0,
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Updates an existing dataset's name and/or description.
   */
  updateDataset(
    id: string,
    data: { name?: string; description?: string }
  ): DatasetRecord | null {
    const db = getDatabase();
    const existing = this.getDatasetById(id);
    if (!existing) return null;

    const name = data.name !== undefined ? data.name.trim() : existing.name;
    const description = data.description !== undefined ? data.description.trim() || null : existing.description;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE datasets
      SET name = ?, description = ?, updated_at = ?
      WHERE id = ?
    `).run(name, description, now, id);

    return {
      id,
      project_id: existing.project_id,
      name,
      description,
      case_count: existing.case_count,
      created_at: existing.created_at,
      updated_at: now,
    };
  }

  /**
   * Deletes a dataset by ID. Foreign keys cascade to test cases.
   */
  deleteDataset(id: string): boolean {
    const db = getDatabase();
    const info = db.prepare('DELETE FROM datasets WHERE id = ?').run(id);
    return info.changes > 0;
  }

  /**
   * Retrieves all test cases for a specific dataset.
   */
  getDatasetCases(datasetId: string): TestCaseRecord[] {
    const db = getDatabase();
    return db
      .prepare('SELECT id, dataset_id, name, category, input, expected_behavior, evaluator_type, evaluator_config, tags, severity, metadata, created_at, updated_at FROM test_cases WHERE dataset_id = ? ORDER BY created_at ASC')
      .all(datasetId) as TestCaseRecord[];
  }

  /**
   * Retrieves a single test case by ID and verifies it belongs to datasetId.
   */
  getTestCase(datasetId: string, caseId: string): TestCaseRecord | null {
    const db = getDatabase();
    const row = db
      .prepare('SELECT id, dataset_id, name, category, input, expected_behavior, evaluator_type, evaluator_config, tags, severity, metadata, created_at, updated_at FROM test_cases WHERE id = ? AND dataset_id = ?')
      .get(caseId, datasetId) as TestCaseRecord | undefined;
    return row || null;
  }

  /**
   * Creates a test case within a dataset, updating the dataset's case_count atomically.
   */
  createTestCase(
    datasetId: string,
    data: {
      id?: string;
      name: string;
      category: string;
      input: string;
      expectedBehavior: string;
      evaluatorType?: string;
      evaluatorConfig?: Record<string, any>;
      tags?: string[];
      severity?: string;
      metadata?: Record<string, any>;
    }
  ): TestCaseRecord {
    const db = getDatabase();
    const dataset = this.getDatasetById(datasetId);
    if (!dataset) {
      const err = new Error(`Dataset with ID '${datasetId}' not found`);
      (err as any).code = 'DATASET_NOT_FOUND';
      throw err;
    }

    const id = data.id?.trim() || `tc-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const result = db.transaction(() => {
      db.prepare(`
        INSERT INTO test_cases (
          id, dataset_id, name, category, input, expected_behavior,
          evaluator_type, evaluator_config, tags, severity, metadata,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        datasetId,
        data.name.trim(),
        data.category.trim(),
        data.input,
        data.expectedBehavior,
        data.evaluatorType || 'normalized_text',
        data.evaluatorConfig ? JSON.stringify(data.evaluatorConfig) : null,
        JSON.stringify(data.tags || []),
        data.severity || 'medium',
        data.metadata ? JSON.stringify(data.metadata) : null,
        now,
        now
      );

      db.prepare(`
        UPDATE datasets
        SET case_count = (SELECT COUNT(*) FROM test_cases WHERE dataset_id = ?),
            updated_at = ?
        WHERE id = ?
      `).run(datasetId, now, datasetId);

      return {
        id,
        dataset_id: datasetId,
        name: data.name.trim(),
        category: data.category.trim(),
        input: data.input,
        expected_behavior: data.expectedBehavior,
        evaluator_type: data.evaluatorType || 'normalized_text',
        evaluator_config: data.evaluatorConfig ? JSON.stringify(data.evaluatorConfig) : null,
        tags: JSON.stringify(data.tags || []),
        severity: data.severity || 'medium',
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        created_at: now,
        updated_at: now,
      };
    })();

    return result;
  }

  /**
   * Updates an existing test case if it belongs to datasetId.
   */
  updateTestCase(
    datasetId: string,
    caseId: string,
    data: {
      name?: string;
      category?: string;
      input?: string;
      expectedBehavior?: string;
      evaluatorType?: string;
      evaluatorConfig?: Record<string, any>;
      tags?: string[];
      severity?: string;
      metadata?: Record<string, any>;
    }
  ): TestCaseRecord | null {
    const db = getDatabase();
    const existing = this.getTestCase(datasetId, caseId);
    if (!existing) return null;

    const name = data.name !== undefined ? data.name.trim() : existing.name;
    const category = data.category !== undefined ? data.category.trim() : existing.category;
    const input = data.input !== undefined ? data.input : existing.input;
    const expectedBehavior = data.expectedBehavior !== undefined ? data.expectedBehavior : existing.expected_behavior;
    const evaluatorType = data.evaluatorType !== undefined ? data.evaluatorType : (existing.evaluator_type || 'normalized_text');
    const evaluatorConfig = data.evaluatorConfig !== undefined ? data.evaluatorConfig : parseJsonObject(existing.evaluator_config);
    const tags = data.tags !== undefined ? data.tags : parseJsonArray(existing.tags);
    const severity = data.severity !== undefined ? data.severity : (existing.severity || 'medium');
    const metadata = data.metadata !== undefined ? data.metadata : parseJsonObject(existing.metadata);
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE test_cases
      SET name = ?, category = ?, input = ?, expected_behavior = ?,
          evaluator_type = ?, evaluator_config = ?, tags = ?, severity = ?, metadata = ?, updated_at = ?
      WHERE id = ? AND dataset_id = ?
    `).run(
      name, category, input, expectedBehavior,
      evaluatorType,
      evaluatorConfig ? JSON.stringify(evaluatorConfig) : null,
      JSON.stringify(tags || []),
      severity,
      metadata ? JSON.stringify(metadata) : null,
      now, caseId, datasetId
    );

    // Touch dataset updated_at
    db.prepare('UPDATE datasets SET updated_at = ? WHERE id = ?').run(now, datasetId);

    return {
      id: caseId,
      dataset_id: datasetId,
      name,
      category,
      input,
      expected_behavior: expectedBehavior,
      evaluator_type: evaluatorType,
      evaluator_config: evaluatorConfig ? JSON.stringify(evaluatorConfig) : null,
      tags: JSON.stringify(tags || []),
      severity,
      metadata: metadata ? JSON.stringify(metadata) : null,
      created_at: existing.created_at,
      updated_at: now,
    };
  }

  /**
   * Deletes a test case from a dataset, updating the dataset's case_count atomically.
   */
  deleteTestCase(datasetId: string, caseId: string): boolean {
    const db = getDatabase();
    const existing = this.getTestCase(datasetId, caseId);
    if (!existing) return false;

    const now = new Date().toISOString();

    return db.transaction(() => {
      const info = db
        .prepare('DELETE FROM test_cases WHERE id = ? AND dataset_id = ?')
        .run(caseId, datasetId);

      if (info.changes > 0) {
        db.prepare(`
          UPDATE datasets
          SET case_count = (SELECT COUNT(*) FROM test_cases WHERE dataset_id = ?),
              updated_at = ?
          WHERE id = ?
        `).run(datasetId, now, datasetId);
        return true;
      }
      return false;
    })();
  }
}

export const datasetService = new DatasetService();
