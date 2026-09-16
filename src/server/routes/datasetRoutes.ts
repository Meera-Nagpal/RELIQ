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
          name: body.name,
          category: body.category,
          input: body.input,
          expectedBehavior,
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
        const cases = datasetService.getDatasetCases(datasetId);
        sendJson(res, 200, { datasetId, cases, count: cases.length });
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
      const expectedBehavior = body.expectedBehavior !== undefined ? body.expectedBehavior : body.expectedOutput;
      if (expectedBehavior === undefined || expectedBehavior === null || typeof expectedBehavior !== 'string') {
        sendError(res, 400, 'VALIDATION_ERROR', "Test case 'expectedBehavior' is required as a string");
        return true;
      }

      try {
        const created = datasetService.createTestCase(datasetId, {
          id: typeof body.id === 'string' ? body.id : undefined,
          name: body.name,
          category: body.category,
          input: body.input,
          expectedBehavior,
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
