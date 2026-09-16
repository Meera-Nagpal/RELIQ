/* ============================================================
   RELIQ — Evaluation DB & Release Decision Routes
   
   REST Endpoints for Evaluation Runs database extensions:
   - PATCH /api/evaluations/runs/:runId/release-decision
   - GET   /api/evaluations/runs/:id/results
   - GET   /api/evaluations/runs/:id/failures
   ============================================================ */

import type { IncomingMessage, ServerResponse } from 'http';
import { evaluationDbService } from '../services/evaluationDbService';
import { getJsonBody, sendError, sendJson } from './httpUtils';

export async function handleEvaluationDbRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: string
): Promise<boolean> {
  const method = req.method || 'GET';

  // 1. PATCH /api/evaluations/runs/:runId/release-decision
  const decisionMatch = parsedUrl.match(/^\/api\/evaluations\/runs\/([^/]+)\/release-decision$/);
  if (decisionMatch) {
    if (method === 'PATCH') {
      const runId = decodeURIComponent(decisionMatch[1]);
      const body = await getJsonBody(req, res);
      if (!body) return true;

      if (!body.decision || typeof body.decision !== 'string' || !body.decision.trim()) {
        sendError(res, 400, 'VALIDATION_ERROR', "'decision' is required");
        return true;
      }
      if (!body.justification || typeof body.justification !== 'string' || !body.justification.trim()) {
        sendError(res, 400, 'VALIDATION_ERROR', "'justification' is required and cannot be empty");
        return true;
      }

      try {
        const result = evaluationDbService.updateReleaseDecision(
          runId,
          body.decision.trim(),
          body.justification.trim()
        );
        sendJson(res, 200, result);
      } catch (err: any) {
        if (err.code === 'INVALID_RELEASE_DECISION') {
          sendError(res, 400, 'INVALID_RELEASE_DECISION', err.message);
        } else if (err.code === 'RUN_NOT_FOUND') {
          sendError(res, 404, 'RUN_NOT_FOUND', err.message);
        } else {
          sendError(res, 500, 'DATABASE_ERROR', err.message || 'Failed to update release decision');
        }
      }
      return true;
    }
  }

  // 2. GET /api/evaluations/runs/:id/results
  const resultsMatch = parsedUrl.match(/^\/api\/evaluations\/runs\/([^/]+)\/results$/);
  if (resultsMatch) {
    if (method === 'GET') {
      const runId = decodeURIComponent(resultsMatch[1]);
      try {
        const run = evaluationDbService.getEvaluationRunById(runId);
        if (!run) {
          sendError(res, 404, 'RUN_NOT_FOUND', `Evaluation run with ID '${runId}' not found`);
          return true;
        }
        const results = evaluationDbService.getRunResults(runId);
        sendJson(res, 200, { runId, results, count: results.length });
      } catch (err: any) {
        sendError(res, 500, 'DATABASE_ERROR', err.message || 'Failed to retrieve run results');
      }
      return true;
    }
  }

  // 3. GET /api/evaluations/runs/:id/failures
  const failuresMatch = parsedUrl.match(/^\/api\/evaluations\/runs\/([^/]+)\/failures$/);
  if (failuresMatch) {
    if (method === 'GET') {
      const runId = decodeURIComponent(failuresMatch[1]);
      try {
        const run = evaluationDbService.getEvaluationRunById(runId);
        if (!run) {
          sendError(res, 404, 'RUN_NOT_FOUND', `Evaluation run with ID '${runId}' not found`);
          return true;
        }
        const failures = evaluationDbService.getRunFailures(runId);
        sendJson(res, 200, { runId, failures, count: failures.length });
      } catch (err: any) {
        sendError(res, 500, 'DATABASE_ERROR', err.message || 'Failed to retrieve run failures');
      }
      return true;
    }
  }

  return false;
}
