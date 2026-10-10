/* ============================================================
   RELIQ — Dataset & Test Case Service (Phase 1A + 1D)
   
   Business logic and SQLite persistence for Datasets and Test Cases:
   - Built-in benchmark protection & metadata (source_type, version, status)
   - User dataset import preview, validation, field mapping & atomic persistence
   - Version conflict resolution (error, new_version, rename)
   - Accurate datasets.case_count maintenance & optional case pagination
   ============================================================ */

import {
  DatasetEvaluatorCompatibility,
  DatasetFieldMapping,
  DatasetFormatType,
  DatasetImportRequest,
  DatasetPreviewResult,
  DatasetSourceType,
  DatasetStatus,
  EvaluatorType,
  SeverityLevel,
  TestCaseCategory,
} from '../../domain/types';
import {
  isBuiltinDatasetId,
  isBuiltinDatasetName,
} from '../../data/benchmarkRegistry';
import {
  bumpDatasetVersion,
  computeEvaluatorCompatibility,
  parseAndValidateDataset,
  ParseAndValidateOptions,
} from '../../data/datasetImporter';
import { getDatabase } from '../db/database';
import { projectService } from './projectService';

export interface DatasetRecord {
  id: string;
  project_id: string;
  projectId: string;
  name: string;
  description: string | null;
  case_count: number;
  caseCount: number;
  source_type: DatasetSourceType;
  sourceType: DatasetSourceType;
  version: string;
  status: DatasetStatus;
  source_filename: string | null;
  sourceFilename: string | null;
  content_hash: string | null;
  contentHash: string | null;
  is_immutable?: boolean;
  isImmutable?: boolean;
  cases?: TestCaseRecord[];
  created_at: string;
  createdAt: string;
  updated_at: string;
  updatedAt: string;
}

export interface TestCaseRecord {
  id: string;
  dataset_id: string;
  case_key?: string | null;
  caseKey?: string;
  source_record_number?: number | null;
  sourceRecordNumber?: number;
  name: string;
  category: string;
  input: string;
  expected_behavior: string;
  expected_output?: string;
  expectedOutput?: string;
  context?: string | null;
  evaluator_type?: string;
  evaluatorType?: EvaluatorType;
  evaluator_config?: string | null;
  evaluatorConfig?: Record<string, any>;
  tags?: string | string[] | null;
  severity?: string;
  metadata?: string | Record<string, any> | null;
  created_at: string;
  createdAt?: string;
  updated_at: string;
}

export interface DatasetConflictInfo {
  id: string;
  name: string;
  version: string;
  sourceType: DatasetSourceType;
  isBuiltin: boolean;
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

function enrichTestCaseRecord(row: any): TestCaseRecord {
  return {
    id: row.id,
    dataset_id: row.dataset_id,
    case_key: row.case_key ?? row.id,
    caseKey: row.case_key || row.id,
    source_record_number: row.source_record_number ?? null,
    sourceRecordNumber: typeof row.source_record_number === 'number' ? row.source_record_number : undefined,
    name: row.name,
    category: row.category,
    input: row.input,
    expected_behavior: row.expected_behavior ?? '',
    expected_output: row.expected_behavior ?? '',
    expectedOutput: row.expected_behavior ?? '',
    context: row.context ?? null,
    evaluator_type: row.evaluator_type || 'normalized_text',
    evaluatorType: (row.evaluator_type || 'normalized_text') as EvaluatorType,
    evaluator_config: row.evaluator_config ?? null,
    evaluatorConfig: parseJsonObject(row.evaluator_config),
    tags: row.tags ?? null,
    severity: row.severity || 'medium',
    metadata: row.metadata ?? null,
    created_at: row.created_at,
    createdAt: row.created_at,
    updated_at: row.updated_at,
  };
}

function enrichDatasetRecord(row: any, cases?: TestCaseRecord[]): DatasetRecord {
  const isBuiltin = row.source_type === 'builtin' || isBuiltinDatasetId(row.id);
  const caseCount = typeof row.case_count === 'number' ? row.case_count : (cases ? cases.length : 0);
  const sourceType: DatasetSourceType = isBuiltin ? 'builtin' : (row.source_type || 'upload');
  const version = row.version || '1.0.0';
  const status: DatasetStatus = row.status || 'active';
  const sourceFilename = row.source_filename ?? null;
  const contentHash = row.content_hash ?? null;
  return {
    id: row.id,
    project_id: row.project_id,
    projectId: row.project_id,
    name: row.name,
    description: row.description ?? null,
    case_count: caseCount,
    caseCount,
    source_type: sourceType,
    sourceType,
    version,
    status,
    source_filename: sourceFilename,
    sourceFilename,
    content_hash: contentHash,
    contentHash,
    is_immutable: isBuiltin,
    isImmutable: isBuiltin,
    ...(cases !== undefined ? { cases } : {}),
    created_at: row.created_at,
    createdAt: row.created_at,
    updated_at: row.updated_at,
    updatedAt: row.updated_at,
  };
}

export class DatasetService {
  /**
   * Retrieves datasets, optionally filtered by projectId.
   */
  getDatasets(projectId?: string): DatasetRecord[] {
    const db = getDatabase();
    if (projectId) {
      const rows = db
        .prepare(`
          SELECT d.id, d.project_id, d.name, d.description,
                 (SELECT count(*) FROM test_cases tc WHERE tc.dataset_id = d.id) as case_count,
                 d.source_type, d.version, d.status, d.source_filename, d.content_hash,
                 d.created_at, d.updated_at
          FROM datasets d
          WHERE d.project_id = ?
          ORDER BY CASE
            WHEN d.id = 'ds-checkout-golden' THEN 0
            WHEN d.source_type = 'builtin' THEN 1
            WHEN (SELECT count(*) FROM test_cases tc WHERE tc.dataset_id = d.id) > 0 THEN 2
            ELSE 3
          END, d.created_at DESC
        `)
        .all(projectId) as any[];
      return rows.map((r) => enrichDatasetRecord(r));
    }
    const rows = db
      .prepare(`
        SELECT d.id, d.project_id, d.name, d.description,
               (SELECT count(*) FROM test_cases tc WHERE tc.dataset_id = d.id) as case_count,
               d.source_type, d.version, d.status, d.source_filename, d.content_hash,
               d.created_at, d.updated_at
        FROM datasets d
        ORDER BY CASE
          WHEN d.id = 'ds-checkout-golden' THEN 0
          WHEN d.source_type = 'builtin' THEN 1
          WHEN (SELECT count(*) FROM test_cases tc WHERE tc.dataset_id = d.id) > 0 THEN 2
          ELSE 3
        END, d.created_at DESC
      `)
      .all() as any[];
    return rows.map((r) => enrichDatasetRecord(r));
  }

  /**
   * Retrieves a single dataset by ID, including its normalized test cases.
   */
  getDatasetById(id: string): DatasetRecord | null {
    const db = getDatabase();
    const row = db
      .prepare(`
        SELECT d.id, d.project_id, d.name, d.description,
               (SELECT count(*) FROM test_cases tc WHERE tc.dataset_id = d.id) as case_count,
               d.source_type, d.version, d.status, d.source_filename, d.content_hash,
               d.created_at, d.updated_at
        FROM datasets d
        WHERE d.id = ?
      `)
      .get(id) as any | undefined;
    if (!row) return null;
    const cases = this.getDatasetCases(id).map(enrichTestCaseRecord);
    return enrichDatasetRecord(row, cases);
  }

  /**
   * Finds datasets matching a name within a project (case-insensitive).
   */
  findDatasetsByName(projectId: string, name: string): DatasetRecord[] {
    const db = getDatabase();
    const rows = db
      .prepare(`
        SELECT d.id, d.project_id, d.name, d.description,
               (SELECT count(*) FROM test_cases tc WHERE tc.dataset_id = d.id) as case_count,
               d.source_type, d.version, d.status, d.source_filename, d.content_hash,
               d.created_at, d.updated_at
        FROM datasets d
        WHERE d.project_id = ? AND LOWER(TRIM(d.name)) = LOWER(TRIM(?))
        ORDER BY d.created_at DESC
      `)
      .all(projectId, name) as any[];
    return rows.map((r) => enrichDatasetRecord(r));
  }

  /**
   * Creates a new dataset. Validates that the referenced project exists.
   */
  createDataset(data: {
    id?: string;
    projectId: string;
    name: string;
    description?: string;
    sourceType?: DatasetSourceType;
    version?: string;
    status?: DatasetStatus;
    sourceFilename?: string;
    contentHash?: string;
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
    const sourceType: DatasetSourceType =
      data.sourceType || (isBuiltinDatasetId(id) ? 'builtin' : 'upload');
    const version = data.version?.trim() || '1.0.0';
    const status: DatasetStatus = data.status || 'active';
    const sourceFilename = data.sourceFilename?.trim() || null;
    const contentHash = data.contentHash?.trim() || null;

    db.prepare(`
      INSERT INTO datasets (
        id, project_id, name, description, case_count,
        source_type, version, status, source_filename, content_hash,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.projectId,
      data.name.trim(),
      description,
      0,
      sourceType,
      version,
      status,
      sourceFilename,
      contentHash,
      now,
      now
    );

    return enrichDatasetRecord({
      id,
      project_id: data.projectId,
      name: data.name.trim(),
      description,
      case_count: 0,
      source_type: sourceType,
      version,
      status,
      source_filename: sourceFilename,
      content_hash: contentHash,
      created_at: now,
      updated_at: now,
    });
  }

  /**
   * Updates an existing dataset's name, description, version, or status.
   */
  updateDataset(
    id: string,
    data: { name?: string; description?: string; version?: string; status?: DatasetStatus }
  ): DatasetRecord | null {
    const db = getDatabase();
    const existing = this.getDatasetById(id);
    if (!existing) return null;

    const name = data.name !== undefined ? data.name.trim() : existing.name;
    const description = data.description !== undefined ? data.description.trim() || null : existing.description;
    const version = data.version !== undefined ? data.version.trim() : existing.version;
    const status = data.status !== undefined ? data.status : existing.status;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE datasets
      SET name = ?, description = ?, version = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(name, description, version, status, now, id);

    return enrichDatasetRecord({
      ...existing,
      name,
      description,
      version,
      status,
      updated_at: now,
    });
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
   * Retrieves test cases for a specific dataset, with optional limit/offset pagination.
   */
  getDatasetCases(
    datasetId: string,
    options?: { limit?: number; offset?: number }
  ): TestCaseRecord[] {
    const db = getDatabase();
    if (options && typeof options.limit === 'number' && options.limit > 0) {
      const offset = typeof options.offset === 'number' && options.offset >= 0 ? options.offset : 0;
      return db
        .prepare(`
          SELECT id, dataset_id, case_key, source_record_number, name, category, input,
                 expected_behavior, context, evaluator_type, evaluator_config, tags,
                 severity, metadata, created_at, updated_at
          FROM test_cases
          WHERE dataset_id = ?
          ORDER BY COALESCE(source_record_number, 999999) ASC, created_at ASC
          LIMIT ? OFFSET ?
        `)
        .all(datasetId, options.limit, offset) as TestCaseRecord[];
    }
    return db
      .prepare(`
        SELECT id, dataset_id, case_key, source_record_number, name, category, input,
               expected_behavior, context, evaluator_type, evaluator_config, tags,
               severity, metadata, created_at, updated_at
        FROM test_cases
        WHERE dataset_id = ?
        ORDER BY COALESCE(source_record_number, 999999) ASC, created_at ASC
      `)
      .all(datasetId) as TestCaseRecord[];
  }

  /**
   * Retrieves a single test case by ID and verifies it belongs to datasetId.
   */
  getTestCase(datasetId: string, caseId: string): TestCaseRecord | null {
    const db = getDatabase();
    const row = db
      .prepare(`
        SELECT id, dataset_id, case_key, source_record_number, name, category, input,
               expected_behavior, context, evaluator_type, evaluator_config, tags,
               severity, metadata, created_at, updated_at
        FROM test_cases
        WHERE id = ? AND dataset_id = ?
      `)
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
      caseKey?: string;
      sourceRecordNumber?: number;
      name: string;
      category: string;
      input: string;
      expectedBehavior: string;
      context?: string;
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
    const caseKey = data.caseKey?.trim() || id;
    const now = new Date().toISOString();

    const result = db.transaction(() => {
      db.prepare(`
        INSERT INTO test_cases (
          id, dataset_id, case_key, source_record_number, name, category, input,
          expected_behavior, context, evaluator_type, evaluator_config, tags,
          severity, metadata, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        datasetId,
        caseKey,
        data.sourceRecordNumber ?? null,
        data.name.trim(),
        data.category.trim(),
        data.input,
        data.expectedBehavior ?? '',
        data.context ?? null,
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
        case_key: caseKey,
        source_record_number: data.sourceRecordNumber ?? null,
        name: data.name.trim(),
        category: data.category.trim(),
        input: data.input,
        expected_behavior: data.expectedBehavior ?? '',
        context: data.context ?? null,
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
      caseKey?: string;
      name?: string;
      category?: string;
      input?: string;
      expectedBehavior?: string;
      context?: string;
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

    const caseKey = data.caseKey !== undefined ? data.caseKey.trim() : (existing.case_key ?? caseId);
    const name = data.name !== undefined ? data.name.trim() : existing.name;
    const category = data.category !== undefined ? data.category.trim() : existing.category;
    const input = data.input !== undefined ? data.input : existing.input;
    const expectedBehavior = data.expectedBehavior !== undefined ? data.expectedBehavior : existing.expected_behavior;
    const context = data.context !== undefined ? data.context : (existing.context ?? null);
    const evaluatorType = data.evaluatorType !== undefined ? data.evaluatorType : (existing.evaluator_type || 'normalized_text');
    const evaluatorConfig = data.evaluatorConfig !== undefined ? data.evaluatorConfig : parseJsonObject(existing.evaluator_config);
    const tags = data.tags !== undefined ? data.tags : parseJsonArray(existing.tags);
    const severity = data.severity !== undefined ? data.severity : (existing.severity || 'medium');
    const metadata = data.metadata !== undefined ? data.metadata : parseJsonObject(existing.metadata);
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE test_cases
      SET case_key = ?, name = ?, category = ?, input = ?, expected_behavior = ?, context = ?,
          evaluator_type = ?, evaluator_config = ?, tags = ?, severity = ?, metadata = ?, updated_at = ?
      WHERE id = ? AND dataset_id = ?
    `).run(
      caseKey,
      name,
      category,
      input,
      expectedBehavior,
      context,
      evaluatorType,
      evaluatorConfig ? JSON.stringify(evaluatorConfig) : null,
      JSON.stringify(tags || []),
      severity,
      metadata ? JSON.stringify(metadata) : null,
      now,
      caseId,
      datasetId
    );

    // Touch dataset updated_at
    db.prepare('UPDATE datasets SET updated_at = ? WHERE id = ?').run(now, datasetId);

    return {
      id: caseId,
      dataset_id: datasetId,
      case_key: caseKey,
      caseKey,
      source_record_number: existing.source_record_number ?? null,
      sourceRecordNumber: typeof existing.source_record_number === 'number' ? existing.source_record_number : undefined,
      name,
      category,
      input,
      expected_behavior: expectedBehavior,
      expectedOutput: expectedBehavior,
      context,
      evaluator_type: evaluatorType,
      evaluatorType: evaluatorType as EvaluatorType,
      evaluator_config: evaluatorConfig ? JSON.stringify(evaluatorConfig) : null,
      evaluatorConfig,
      tags: JSON.stringify(tags || []),
      severity,
      metadata: metadata ? JSON.stringify(metadata) : null,
      created_at: existing.created_at,
      createdAt: existing.created_at,
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

  /**
   * Previews and validates a raw dataset upload before persistence.
   */
  previewDatasetImport(
    options: ParseAndValidateOptions & { projectId?: string; name?: string }
  ): DatasetPreviewResult & { existingConflict?: DatasetConflictInfo } {
    const preview = parseAndValidateDataset(options);
    const projectId = options.projectId?.trim() || 'proj-checkout-agent';
    const candidateName = (options.name || preview.suggestedName || '').trim();

    let existingConflict: DatasetConflictInfo | undefined;
    if (candidateName) {
      if (isBuiltinDatasetName(candidateName)) {
        existingConflict = {
          id: 'builtin',
          name: candidateName,
          version: '1.0.0',
          sourceType: 'builtin',
          isBuiltin: true,
        };
        preview.issues.push({
          severity: 'warning',
          code: 'NAME_CONFLICT',
          message: `Dataset name '${candidateName}' matches a built-in benchmark. Built-in benchmarks cannot be overwritten; choose a new name or select 'rename' on import.`,
        });
        preview.warningCount = preview.issues.filter((i) => i.severity === 'warning').length;
      } else {
        const matches = this.findDatasetsByName(projectId, candidateName);
        if (matches.length > 0) {
          const latest = matches[0];
          const isBuiltin = latest.source_type === 'builtin' || isBuiltinDatasetId(latest.id);
          existingConflict = {
            id: latest.id,
            name: latest.name,
            version: latest.version || '1.0.0',
            sourceType: latest.source_type,
            isBuiltin,
          };
          preview.issues.push({
            severity: 'warning',
            code: 'NAME_CONFLICT',
            message: isBuiltin
              ? `Dataset name '${candidateName}' belongs to a protected built-in benchmark.`
              : `Dataset '${candidateName}' (v${latest.version}) already exists. Import as a new version (v${bumpDatasetVersion(latest.version)}) or rename.`,
          });
          preview.warningCount = preview.issues.filter((i) => i.severity === 'warning').length;
        }
      }
    }

    return {
      ...preview,
      existingConflict,
    };
  }

  /**
   * Validates and atomically imports a user-uploaded dataset into SQLite.
   */
  importDataset(request: DatasetImportRequest): {
    dataset: DatasetRecord;
    cases: TestCaseRecord[];
    preview: DatasetPreviewResult;
    evaluatorCompatibility: DatasetEvaluatorCompatibility[];
  } {
    const db = getDatabase();
    const projectId = request.projectId?.trim() || 'proj-checkout-agent';

    // Ensure target project exists
    let project = projectService.getProjectById(projectId);
    if (!project) {
      const allProjects = projectService.getAllProjects();
      if (allProjects.length > 0) {
        project = allProjects[0];
      } else {
        const now = new Date().toISOString();
        db.prepare(`
          INSERT OR IGNORE INTO projects (id, name, description, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(projectId, 'Default Project', 'Auto-created project for dataset import', now, now);
        project = projectService.getProjectById(projectId);
      }
    }
    const targetProjectId = project?.id || projectId;

    const effectiveFilename = request.filename || request.sourceFilename;
    const preview = parseAndValidateDataset({
      rawContent: request.rawContent,
      filename: effectiveFilename,
      format: request.format,
      fieldMapping: request.fieldMapping,
      defaultCategory: request.defaultCategory,
      defaultEvaluatorType: request.defaultEvaluatorType,
      defaultSeverity: request.defaultSeverity,
      selectedEvaluators: request.selectedEvaluators,
    });

    if (!preview.valid || preview.errorCount > 0 || preview.normalizedCases.length === 0) {
      const firstError =
        preview.issues.find((i) => i.severity === 'error')?.message ||
        'Dataset validation failed';
      const err = new Error(firstError);
      (err as any).code = 'DATASET_VALIDATION_FAILED';
      (err as any).preview = preview;
      throw err;
    }

    let finalName = (request.name || preview.suggestedName || 'Imported Dataset').trim();
    if (!finalName) {
      finalName = 'Imported Dataset';
    }

    let finalVersion = (request.version || preview.suggestedVersion || '1.0.0').trim();
    const conflictResolution = request.conflictResolution || 'error';

    // 1. Protect built-in benchmark names from overwrite
    const matchesExisting = this.findDatasetsByName(targetProjectId, finalName);
    const matchesBuiltin =
      isBuiltinDatasetName(finalName) ||
      matchesExisting.some((m) => m.source_type === 'builtin' || isBuiltinDatasetId(m.id));

    if (matchesBuiltin) {
      if (conflictResolution === 'rename') {
        finalName = request.customResolvedName?.trim() || `${finalName} (Custom Upload)`;
      } else {
        const err = new Error(
          `Cannot overwrite built-in benchmark suite '${finalName}'. Please provide a different dataset name or set conflictResolution to 'rename'.`
        );
        (err as any).code = 'BUILTIN_DATASET_PROTECTED';
        throw err;
      }
    } else if (matchesExisting.length > 0) {
      const latestExisting = matchesExisting[0];
      if (conflictResolution === 'new_version') {
        const bumped = bumpDatasetVersion(latestExisting.version);
        if (!request.version || request.version.trim() === latestExisting.version) {
          finalVersion = bumped;
        }
      } else if (conflictResolution === 'rename') {
        finalName =
          request.customResolvedName?.trim() || `${finalName} (${matchesExisting.length + 1})`;
      } else {
        const err = new Error(
          `Dataset '${finalName}' (v${latestExisting.version}) already exists in this project. Specify conflictResolution: 'new_version' to create v${bumpDatasetVersion(latestExisting.version)}, or choose a new name.`
        );
        (err as any).code = 'DATASET_NAME_CONFLICT';
        (err as any).conflict = {
          id: latestExisting.id,
          name: latestExisting.name,
          version: latestExisting.version,
          suggestedNewVersion: bumpDatasetVersion(latestExisting.version),
        };
        throw err;
      }
    }

    const datasetId = `ds-up-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const description =
      (request.description ?? preview.suggestedDescription ?? '').trim() ||
      `Imported from ${effectiveFilename || preview.detectedFormat.toUpperCase()} (${preview.normalizedCases.length} scenarios)`;
    const sourceFilename = effectiveFilename?.trim() || `upload.${preview.detectedFormat}`;

    const checkExistingCaseId = db.prepare('SELECT id FROM test_cases WHERE id = ?');
    const insertDatasetStmt = db.prepare(`
      INSERT INTO datasets (
        id, project_id, name, description, case_count,
        source_type, version, status, source_filename, content_hash,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, 'upload', ?, ?, ?, ?, ?, ?)
    `);

    const insertCaseStmt = db.prepare(`
      INSERT INTO test_cases (
        id, dataset_id, case_key, source_record_number, name, category, input,
        expected_behavior, context, evaluator_type, evaluator_config, tags,
        severity, metadata, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertedCases: TestCaseRecord[] = [];

    const datasetRecord = db.transaction(() => {
      insertDatasetStmt.run(
        datasetId,
        targetProjectId,
        finalName,
        description,
        preview.normalizedCases.length,
        finalVersion,
        request.status || 'active',
        sourceFilename,
        preview.contentHash,
        now,
        now
      );

      for (const tc of preview.normalizedCases) {
        const baseKey = tc.caseKey || tc.id;
        // Ensure primary key uniqueness across test_cases table while preserving clean case_key
        const collision = checkExistingCaseId.get(baseKey);
        const pkId = collision ? `${datasetId}_${baseKey}` : baseKey;

        insertCaseStmt.run(
          pkId,
          datasetId,
          baseKey,
          tc.sourceRecordNumber ?? tc.order ?? null,
          tc.name,
          tc.category,
          tc.input,
          tc.expectedOutput ?? '',
          tc.context ?? null,
          tc.evaluatorType,
          tc.evaluatorConfig ? JSON.stringify(tc.evaluatorConfig) : null,
          JSON.stringify(tc.tags || []),
          tc.severity || 'medium',
          tc.metadata ? JSON.stringify(tc.metadata) : null,
          now,
          now
        );

        insertedCases.push(
          enrichTestCaseRecord({
            id: pkId,
            dataset_id: datasetId,
            case_key: baseKey,
            source_record_number: tc.sourceRecordNumber ?? tc.order ?? null,
            name: tc.name,
            category: tc.category,
            input: tc.input,
            expected_behavior: tc.expectedOutput ?? '',
            context: tc.context ?? null,
            evaluator_type: tc.evaluatorType,
            evaluator_config: tc.evaluatorConfig ? JSON.stringify(tc.evaluatorConfig) : null,
            tags: JSON.stringify(tc.tags || []),
            severity: tc.severity || 'medium',
            metadata: tc.metadata ? JSON.stringify(tc.metadata) : null,
            created_at: now,
            updated_at: now,
          })
        );
      }

      return enrichDatasetRecord(
        {
          id: datasetId,
          project_id: targetProjectId,
          name: finalName,
          description,
          case_count: insertedCases.length,
          source_type: 'upload',
          version: finalVersion,
          status: request.status || 'active',
          source_filename: sourceFilename,
          content_hash: preview.contentHash,
          created_at: now,
          updated_at: now,
        },
        insertedCases
      );
    })();

    return {
      dataset: datasetRecord,
      cases: insertedCases,
      preview,
      evaluatorCompatibility: computeEvaluatorCompatibility(preview.normalizedCases),
    };
  }
}

export const datasetService = new DatasetService();
