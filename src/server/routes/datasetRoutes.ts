/* ============================================================
   RELIQ — Dataset & Test Case Routes
   
   REST Endpoints for Datasets and Test Cases:
   - GET    /api/datasets (optional ?projectId=<id>)
   - GET    /api/datasets/:id
   - GET    /api/datasets/:id/cases
   - POST   /api/datasets
   - PUT    /api/datasets/:id
   - DELETE /api/datasets/:id
   - POST   /api/datasets/:datasetId/cases
   - PUT    /api/datasets/:datasetId/cases/:caseId
   - DELETE /api/datasets/:datasetId/cases/:caseId
   ============================================================ */

import type { IncomingMessage, ServerResponse } from 'http';
import { getBuiltinBenchmarks, getDatasetTemplate } from '../../data/benchmarkRegistry';
import { datasetService } from '../services/datasetService';
import { getJsonBody, sendError, sendJson } from './httpUtils';

export async function handleDatasetRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: string,
  query: URLSearchParams
): Promise<boolean> {
  const method = req.method || 'GET';

  // 1. GET /api/datasets (optional ?projectId=<id>)
  if (method === 'GET' && parsedUrl === '/api/datasets') {
    try {
      const projectId = query.get('projectId') || undefined;
      const datasets = datasetService.getDatasets(projectId);
      sendJson(res, 200, { datasets });
    } catch (err: any) {
      sendError(res, 500, 'DATABASE_ERROR', err.message || 'Failed to retrieve datasets');
    }
    return true;
  }

  // 1b. GET /api/datasets/benchmarks (Built-in Benchmark Registry metadata)
  if (method === 'GET' && parsedUrl === '/api/datasets/benchmarks') {
    try {
      const benchmarks = getBuiltinBenchmarks().map((b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        version: b.version,
        sourceType: b.sourceType,
        source_type: b.sourceType,
        status: b.status,
        isImmutable: true,
        is_immutable: true,
        caseCount: b.cases.length,
        case_count: b.cases.length,
      }));
      sendJson(res, 200, { benchmarks });
    } catch (err: any) {
      sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to retrieve built-in benchmarks');
    }
    return true;
  }

  // 1c. GET /api/datasets/templates/:format (.json | .jsonl | .ndjson | .csv)
  const templateMatch = parsedUrl.match(/^\/api\/datasets\/templates\/([^/]+)$/);
  if (method === 'GET' && templateMatch) {
    const rawFormat = decodeURIComponent(templateMatch[1]).toLowerCase().replace(/^\./, '');
    if (rawFormat !== 'json' && rawFormat !== 'jsonl' && rawFormat !== 'ndjson' && rawFormat !== 'csv') {
      sendError(res, 400, 'INVALID_FORMAT', `Unsupported template format '${rawFormat}'. Supported: json, jsonl, ndjson, csv`);
      return true;
    }
    const tpl = getDatasetTemplate(rawFormat as 'json' | 'jsonl' | 'ndjson' | 'csv');
    sendJson(res, 200, {
      format: rawFormat,
      filename: tpl.filename,
      mimeType: tpl.mimeType,
      content: tpl.content,
    });
    return true;
  }

  // 1d. POST /api/datasets/preview (or /api/datasets/validate)
  if (method === 'POST' && (parsedUrl === '/api/datasets/preview' || parsedUrl === '/api/datasets/validate')) {
    const body = await getJsonBody(req, res);
    if (!body) return true;

    try {
      const rawContent =
        typeof body.rawContent === 'string'
          ? body.rawContent
          : typeof body.raw_content === 'string'
          ? body.raw_content
          : typeof body.content === 'string'
          ? body.content
          : '';
      const selectedEvaluators = Array.isArray(body.selectedEvaluators)
        ? body.selectedEvaluators
        : Array.isArray(body.selected_evaluators)
        ? body.selected_evaluators
        : undefined;
      const preview = datasetService.previewDatasetImport({
        projectId:
          typeof body.projectId === 'string'
            ? body.projectId
            : typeof body.project_id === 'string'
            ? body.project_id
            : undefined,
        name: typeof body.name === 'string' ? body.name : undefined,
        rawContent,
        filename:
          typeof body.filename === 'string'
            ? body.filename
            : typeof body.sourceFilename === 'string'
            ? body.sourceFilename
            : typeof body.source_filename === 'string'
            ? body.source_filename
            : undefined,
        format: typeof body.format === 'string' ? (body.format as any) : undefined,
        fieldMapping:
          body.fieldMapping && typeof body.fieldMapping === 'object'
            ? body.fieldMapping
            : body.field_mapping && typeof body.field_mapping === 'object'
            ? body.field_mapping
            : undefined,
        defaultCategory:
          typeof body.defaultCategory === 'string'
            ? body.defaultCategory
            : typeof body.default_category === 'string'
            ? body.default_category
            : undefined,
        defaultEvaluatorType:
          typeof body.defaultEvaluatorType === 'string'
            ? (body.defaultEvaluatorType as any)
            : typeof body.default_evaluator_type === 'string'
            ? (body.default_evaluator_type as any)
            : undefined,
        defaultSeverity:
          typeof body.defaultSeverity === 'string'
            ? (body.defaultSeverity as any)
            : typeof body.default_severity === 'string'
            ? (body.default_severity as any)
            : undefined,
        selectedEvaluators,
      });
      sendJson(res, 200, preview);
    } catch (err: any) {
      sendError(res, 400, 'PREVIEW_FAILED', err.message || 'Failed to preview dataset');
    }
    return true;
  }

  // 1e. POST /api/datasets/import
  if (method === 'POST' && parsedUrl === '/api/datasets/import') {
    const body = await getJsonBody(req, res);
    if (!body) return true;

    const rawContent =
      typeof body.rawContent === 'string'
        ? body.rawContent
        : typeof body.raw_content === 'string'
        ? body.raw_content
        : typeof body.content === 'string'
        ? body.content
        : '';
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      sendError(res, 400, 'VALIDATION_ERROR', "Dataset 'name' is required for import");
      return true;
    }

    try {
      const projectId =
        typeof body.projectId === 'string'
          ? body.projectId
          : typeof body.project_id === 'string'
          ? body.project_id
          : undefined;
      const sourceFilename =
        typeof body.sourceFilename === 'string'
          ? body.sourceFilename
          : typeof body.source_filename === 'string'
          ? body.source_filename
          : typeof body.filename === 'string'
          ? body.filename
          : undefined;
      const conflictResolution =
        typeof body.conflictResolution === 'string'
          ? body.conflictResolution
          : typeof body.conflict_resolution === 'string'
          ? body.conflict_resolution
          : undefined;
      const selectedEvaluators = Array.isArray(body.selectedEvaluators)
        ? body.selectedEvaluators
        : Array.isArray(body.selected_evaluators)
        ? body.selected_evaluators
        : undefined;

      const imported = datasetService.importDataset({
        projectId,
        name: body.name.trim(),
        description: typeof body.description === 'string' ? body.description : undefined,
        version: typeof body.version === 'string' ? body.version : undefined,
        status: typeof body.status === 'string' ? (body.status as any) : undefined,
        filename: sourceFilename,
        sourceFilename,
        format: typeof body.format === 'string' ? (body.format as any) : undefined,
        rawContent,
        fieldMapping:
          body.fieldMapping && typeof body.fieldMapping === 'object'
            ? body.fieldMapping
            : body.field_mapping && typeof body.field_mapping === 'object'
            ? body.field_mapping
            : undefined,
        defaultCategory:
          typeof body.defaultCategory === 'string'
            ? body.defaultCategory
            : typeof body.default_category === 'string'
            ? body.default_category
            : undefined,
        defaultEvaluatorType:
          typeof body.defaultEvaluatorType === 'string'
            ? (body.defaultEvaluatorType as any)
            : typeof body.default_evaluator_type === 'string'
            ? (body.default_evaluator_type as any)
            : undefined,
        defaultSeverity:
          typeof body.defaultSeverity === 'string'
            ? (body.defaultSeverity as any)
            : typeof body.default_severity === 'string'
            ? (body.default_severity as any)
            : undefined,
        selectedEvaluators,
        conflictResolution: conflictResolution as any,
        customResolvedName:
          typeof body.customResolvedName === 'string'
            ? body.customResolvedName
            : typeof body.custom_resolved_name === 'string'
            ? body.custom_resolved_name
            : undefined,
      });
      sendJson(res, 201, imported);
    } catch (err: any) {
      if (err.code === 'PROJECT_NOT_FOUND') {
        sendError(res, 404, 'PROJECT_NOT_FOUND', err.message);
      } else if (err.code === 'BUILTIN_DATASET_PROTECTED' || err.code === 'DATASET_NAME_CONFLICT') {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: {
              code: err.code,
              message: err.message,
              existingDatasetId: err.existingDatasetId || err.conflict?.id,
              existingVersion: err.existingVersion || err.conflict?.version,
            },
          })
        );
      } else if (err.code === 'DATASET_VALIDATION_FAILED') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: {
              code: 'DATASET_VALIDATION_FAILED',
              message: err.message,
            },
            preview: err.preview,
          })
        );
      } else {
        sendError(res, 500, 'DATABASE_ERROR', err.message || 'Failed to import dataset');
      }
    }
    return true;
  }

  // 2. POST /api/datasets
  if (method === 'POST' && parsedUrl === '/api/datasets') {
    const body = await getJsonBody(req, res);
    if (!body) return true;

    if (!body.projectId || typeof body.projectId !== 'string' || !body.projectId.trim()) {
      sendError(res, 400, 'VALIDATION_ERROR', "Dataset 'projectId' is required");
      return true;
    }
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      sendError(res, 400, 'VALIDATION_ERROR', "Dataset 'name' is required and cannot be empty");
      return true;
    }

    try {
      const created = datasetService.createDataset({
        id: typeof body.id === 'string' ? body.id : undefined,
        projectId: body.projectId.trim(),
        name: body.name.trim(),
        description: typeof body.description === 'string' ? body.description : undefined,
        sourceType: typeof body.sourceType === 'string' ? (body.sourceType as any) : undefined,
        version: typeof body.version === 'string' ? body.version : undefined,
        status: typeof body.status === 'string' ? (body.status as any) : undefined,
        sourceFilename: typeof body.sourceFilename === 'string' ? body.sourceFilename : undefined,
      });
      sendJson(res, 201, created);
    } catch (err: any) {
      if (err.code === 'PROJECT_NOT_FOUND') {
        sendError(res, 404, 'PROJECT_NOT_FOUND', err.message);
      } else {
        sendError(res, 500, 'DATABASE_ERROR', err.message || 'Failed to create dataset');
      }
    }
    return true;
  }

  // Match /api/datasets/:datasetId/cases/:caseId
  const nestedCaseMatch = parsedUrl.match(/^\/api\/datasets\/([^/]+)\/cases\/([^/]+)$/);
  if (nestedCaseMatch) {
    const datasetId = decodeURIComponent(nestedCaseMatch[1]);
    const caseId = decodeURIComponent(nestedCaseMatch[2]);

    // PUT /api/datasets/:datasetId/cases/:caseId
    if (method === 'PUT') {
      const body = await getJsonBody(req, res);
      if (!body) return true;

      try {
        const expectedBehavior = body.expectedBehavior !== undefined ? body.expectedBehavior : body.expectedOutput;
        const updated = datasetService.updateTestCase(datasetId, caseId, {
          caseKey: typeof body.caseKey === 'string' ? body.caseKey : undefined,
          name: body.name,
          category: body.category,
          input: body.input,
          expectedBehavior,
          context: typeof body.context === 'string' ? body.context : undefined,
          evaluatorType: typeof body.evaluatorType === 'string' ? body.evaluatorType : undefined,
          evaluatorConfig: body.evaluatorConfig && typeof body.evaluatorConfig === 'object' ? body.evaluatorConfig : undefined,
          severity: typeof body.severity === 'string' ? body.severity : undefined,
          tags: Array.isArray(body.tags) ? body.tags : undefined,
          metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : undefined,
        });

        if (!updated) {
          sendError(res, 404, 'TEST_CASE_NOT_FOUND', `Test case '${caseId}' not found in dataset '${datasetId}'`);
          return true;
        }

        sendJson(res, 200, updated);
      } catch (err: any) {
        sendError(res, 500, 'DATABASE_ERROR', err.message || 'Failed to update test case');
      }
      return true;
    }

    // DELETE /api/datasets/:datasetId/cases/:caseId
    if (method === 'DELETE') {
      try {
        const deleted = datasetService.deleteTestCase(datasetId, caseId);
        if (!deleted) {
          sendError(res, 404, 'TEST_CASE_NOT_FOUND', `Test case '${caseId}' not found in dataset '${datasetId}'`);
          return true;
        }
        sendJson(res, 200, { success: true, datasetId, caseId });
      } catch (err: any) {
        sendError(res, 500, 'DATABASE_ERROR', err.message || 'Failed to delete test case');
      }
      return true;
    }
  }

  // Match /api/datasets/:datasetId/cases
  const casesMatch = parsedUrl.match(/^\/api\/datasets\/([^/]+)\/cases$/);
  if (casesMatch) {
    const datasetId = decodeURIComponent(casesMatch[1]);

    // GET /api/datasets/:datasetId/cases
    if (method === 'GET') {
      try {
        const dataset = datasetService.getDatasetById(datasetId);
        if (!dataset) {
          sendError(res, 404, 'DATASET_NOT_FOUND', `Dataset with ID '${datasetId}' not found`);
          return true;
        }
        const limitRaw = query.get('limit');
        const offsetRaw = query.get('offset');
        const limit = limitRaw !== null ? parseInt(limitRaw, 10) : undefined;
        const offset = offsetRaw !== null ? parseInt(offsetRaw, 10) : undefined;
        const cases = datasetService.getDatasetCases(datasetId, {
          limit: typeof limit === 'number' && !isNaN(limit) ? limit : undefined,
          offset: typeof offset === 'number' && !isNaN(offset) ? offset : undefined,
        });
        sendJson(res, 200, { datasetId, cases, count: cases.length, totalCount: dataset.caseCount });
      } catch (err: any) {
        sendError(res, 500, 'DATABASE_ERROR', err.message || 'Failed to retrieve test cases');
      }
      return true;
    }

    // POST /api/datasets/:datasetId/cases
    if (method === 'POST') {
      const body = await getJsonBody(req, res);
      if (!body) return true;

      if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
        sendError(res, 400, 'VALIDATION_ERROR', "Test case 'name' is required");
        return true;
      }
      if (!body.category || typeof body.category !== 'string' || !body.category.trim()) {
        sendError(res, 400, 'VALIDATION_ERROR', "Test case 'category' is required");
        return true;
      }
      if (body.input === undefined || body.input === null || typeof body.input !== 'string') {
        sendError(res, 400, 'VALIDATION_ERROR', "Test case 'input' is required as a string");
        return true;
      }
      const rawExpected = body.expectedBehavior !== undefined ? body.expectedBehavior : body.expectedOutput;
      const evaluatorType = typeof body.evaluatorType === 'string' ? body.evaluatorType : 'keyword_criteria';
      const isReferenceFree = ['behavioral_safety', 'llm_judge', 'response_length', 'latency', 'json_validity'].includes(evaluatorType);
      const expectedBehavior = rawExpected === undefined && isReferenceFree ? '' : rawExpected;
      if (expectedBehavior === undefined || expectedBehavior === null || typeof expectedBehavior !== 'string') {
        sendError(res, 400, 'VALIDATION_ERROR', "Test case 'expectedBehavior' is required as a string");
        return true;
      }

      try {
        const created = datasetService.createTestCase(datasetId, {
          id: typeof body.id === 'string' ? body.id : undefined,
          caseKey: typeof body.caseKey === 'string' ? body.caseKey : undefined,
          sourceRecordNumber: typeof body.sourceRecordNumber === 'number' ? body.sourceRecordNumber : undefined,
          name: body.name,
          category: body.category,
          input: body.input,
          expectedBehavior,
          context: typeof body.context === 'string' ? body.context : undefined,
          evaluatorType: typeof body.evaluatorType === 'string' ? body.evaluatorType : undefined,
          evaluatorConfig: body.evaluatorConfig && typeof body.evaluatorConfig === 'object' ? body.evaluatorConfig : undefined,
          severity: typeof body.severity === 'string' ? body.severity : undefined,
          tags: Array.isArray(body.tags) ? body.tags : undefined,
          metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : undefined,
        });
        sendJson(res, 201, created);
      } catch (err: any) {
        if (err.code === 'DATASET_NOT_FOUND') {
          sendError(res, 404, 'DATASET_NOT_FOUND', err.message);
        } else {
          sendError(res, 500, 'DATABASE_ERROR', err.message || 'Failed to create test case');
        }
      }
      return true;
    }
  }

  // Match /api/datasets/:id
  const datasetMatch = parsedUrl.match(/^\/api\/datasets\/([^/]+)$/);
  if (datasetMatch) {
    const id = decodeURIComponent(datasetMatch[1]);

    // GET /api/datasets/:id
    if (method === 'GET') {
      try {
        const dataset = datasetService.getDatasetById(id);
        if (!dataset) {
          sendError(res, 404, 'DATASET_NOT_FOUND', `Dataset with ID '${id}' not found`);
          return true;
        }
        sendJson(res, 200, dataset);
      } catch (err: any) {
        sendError(res, 500, 'DATABASE_ERROR', err.message || 'Failed to retrieve dataset');
      }
      return true;
    }

    // PUT /api/datasets/:id
    if (method === 'PUT') {
      const body = await getJsonBody(req, res);
      if (!body) return true;

      if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim())) {
        sendError(res, 400, 'VALIDATION_ERROR', "Dataset 'name' cannot be empty");
        return true;
      }

      try {
        const updated = datasetService.updateDataset(id, {
          name: body.name,
          description: typeof body.description === 'string' ? body.description : undefined,
          version: typeof body.version === 'string' ? body.version : undefined,
          status: typeof body.status === 'string' ? (body.status as any) : undefined,
        });

        if (!updated) {
          sendError(res, 404, 'DATASET_NOT_FOUND', `Dataset with ID '${id}' not found`);
          return true;
        }

        sendJson(res, 200, updated);
      } catch (err: any) {
        sendError(res, 500, 'DATABASE_ERROR', err.message || 'Failed to update dataset');
      }
      return true;
    }

    // DELETE /api/datasets/:id
    if (method === 'DELETE') {
      try {
        const deleted = datasetService.deleteDataset(id);
        if (!deleted) {
          sendError(res, 404, 'DATASET_NOT_FOUND', `Dataset with ID '${id}' not found`);
          return true;
        }
        sendJson(res, 200, { success: true, id });
      } catch (err: any) {
        sendError(res, 500, 'DATABASE_ERROR', err.message || 'Failed to delete dataset');
      }
      return true;
    }
  }

  return false;
}
