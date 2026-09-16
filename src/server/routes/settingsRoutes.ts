/* ============================================================
   RELIQ — Project Settings Routes
   
   REST Endpoints for Project Settings:
   - GET /api/projects/:projectId/settings
   - PUT /api/projects/:projectId/settings
   ============================================================ */

import type { IncomingMessage, ServerResponse } from 'http';
import { settingsService } from '../services/settingsService';
import { getJsonBody, sendError, sendJson } from './httpUtils';

export async function handleSettingsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: string
): Promise<boolean> {
  const method = req.method || 'GET';

  const settingsMatch = parsedUrl.match(/^\/api\/projects\/([^/]+)\/settings$/);
  if (!settingsMatch) return false;

  const projectId = decodeURIComponent(settingsMatch[1]);

  // 1. GET /api/projects/:projectId/settings
  if (method === 'GET') {
    try {
      const settings = settingsService.getSettings(projectId);
      if (!settings) {
        sendError(res, 404, 'PROJECT_NOT_FOUND', `Project with ID '${projectId}' not found`);
        return true;
      }
      sendJson(res, 200, settings);
    } catch (err: any) {
      sendError(res, 500, 'DATABASE_ERROR', err.message || 'Failed to retrieve project settings');
    }
    return true;
  }

  // 2. PUT /api/projects/:projectId/settings
  if (method === 'PUT') {
    const body = await getJsonBody(req, res);
    if (!body) return true;

    if (body.minAccuracy === undefined || typeof body.minAccuracy !== 'number' || isNaN(body.minAccuracy)) {
      sendError(res, 400, 'VALIDATION_ERROR', "'minAccuracy' must be a valid number");
      return true;
    }
    if (body.maxDegradation === undefined || typeof body.maxDegradation !== 'number' || isNaN(body.maxDegradation)) {
      sendError(res, 400, 'VALIDATION_ERROR', "'maxDegradation' must be a valid number");
      return true;
    }
    if (body.latencyTolerance === undefined || typeof body.latencyTolerance !== 'number' || isNaN(body.latencyTolerance)) {
      sendError(res, 400, 'VALIDATION_ERROR', "'latencyTolerance' must be a valid number");
      return true;
    }

    try {
      const updated = settingsService.upsertSettings(projectId, {
        minAccuracy: body.minAccuracy,
        maxDegradation: body.maxDegradation,
        latencyTolerance: body.latencyTolerance,
        rawOutputPrivacy: body.rawOutputPrivacy !== undefined ? Boolean(body.rawOutputPrivacy) : true,
      });
      sendJson(res, 200, updated);
    } catch (err: any) {
      if (err.code === 'PROJECT_NOT_FOUND') {
        sendError(res, 404, 'PROJECT_NOT_FOUND', err.message);
      } else {
        sendError(res, 500, 'DATABASE_ERROR', err.message || 'Failed to update project settings');
      }
    }
    return true;
  }

  return false;
}
