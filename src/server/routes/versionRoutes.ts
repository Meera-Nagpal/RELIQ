/* ============================================================
   RELIQ — Model Version Routes
   
   REST Endpoints for Model Versions:
   - GET  /api/versions (optional ?projectId=<id>)
   - GET  /api/versions/:id
   - POST /api/versions
   - PUT  /api/versions/:id
   ============================================================ */

import type { IncomingMessage, ServerResponse } from 'http';
import { versionService } from '../services/versionService';
import { getJsonBody, sendError, sendJson } from './httpUtils';

export async function handleVersionRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: string,
  query: URLSearchParams
): Promise<boolean> {
  const method = req.method || 'GET';

  // 1. GET /api/versions (optional ?projectId=<id>)
  if (method === 'GET' && parsedUrl === '/api/versions') {
    try {
      const projectId = query.get('projectId') || undefined;
      const versions = versionService.getVersions(projectId);
      sendJson(res, 200, { versions });
    } catch (err: any) {
      sendError(res, 500, 'DATABASE_ERROR', err.message || 'Failed to retrieve model versions');
    }
    return true;
  }

  // 2. POST /api/versions
  if (method === 'POST' && parsedUrl === '/api/versions') {
    const body = await getJsonBody(req, res);
    if (!body) return true;

    if (!body.projectId || typeof body.projectId !== 'string' || !body.projectId.trim()) {
      sendError(res, 400, 'VALIDATION_ERROR', "Version 'projectId' is required");
      return true;
    }
    if (!body.provider || typeof body.provider !== 'string' || !body.provider.trim()) {
      sendError(res, 400, 'VALIDATION_ERROR', "Version 'provider' is required");
      return true;
    }
    if (!body.model || typeof body.model !== 'string' || !body.model.trim()) {
      sendError(res, 400, 'VALIDATION_ERROR', "Version 'model' is required");
      return true;
    }
    if (!body.displayName || typeof body.displayName !== 'string' || !body.displayName.trim()) {
      sendError(res, 400, 'VALIDATION_ERROR', "Version 'displayName' is required");
      return true;
    }

    try {
      const created = versionService.createVersion({
        id: typeof body.id === 'string' ? body.id : undefined,
        projectId: body.projectId.trim(),
        provider: body.provider.trim(),
        model: body.model.trim(),
        displayName: body.displayName.trim(),
        systemPrompt: typeof body.systemPrompt === 'string' ? body.systemPrompt : undefined,
      });
      sendJson(res, 201, created);
    } catch (err: any) {
      if (err.code === 'PROJECT_NOT_FOUND') {
        sendError(res, 404, 'PROJECT_NOT_FOUND', err.message);
      } else {
        sendError(res, 500, 'DATABASE_ERROR', err.message || 'Failed to create model version');
      }
    }
    return true;
  }

  // Match /api/versions/:id
  const versionMatch = parsedUrl.match(/^\/api\/versions\/([^/]+)$/);
  if (versionMatch) {
    const id = decodeURIComponent(versionMatch[1]);

    // 3. GET /api/versions/:id
    if (method === 'GET') {
      try {
        const version = versionService.getVersionById(id);
        if (!version) {
          sendError(res, 404, 'MODEL_VERSION_NOT_FOUND', `Model version with ID '${id}' not found`);
          return true;
        }
        sendJson(res, 200, version);
      } catch (err: any) {
        sendError(res, 500, 'DATABASE_ERROR', err.message || 'Failed to retrieve model version');
      }
      return true;
    }

    // 4. PUT /api/versions/:id
    if (method === 'PUT') {
      const body = await getJsonBody(req, res);
      if (!body) return true;

      try {
        const updated = versionService.updateVersion(id, {
          provider: body.provider,
          model: body.model,
          displayName: body.displayName,
          systemPrompt: body.systemPrompt,
        });

        if (!updated) {
          sendError(res, 404, 'MODEL_VERSION_NOT_FOUND', `Model version with ID '${id}' not found`);
          return true;
        }

        sendJson(res, 200, updated);
      } catch (err: any) {
        sendError(res, 500, 'DATABASE_ERROR', err.message || 'Failed to update model version');
      }
      return true;
    }

    // 5. DELETE /api/versions/:id
    if (method === 'DELETE') {
      try {
        const deleted = versionService.deleteVersion(id);
        if (!deleted) {
          sendError(res, 404, 'MODEL_VERSION_NOT_FOUND', `Model version with ID '${id}' not found`);
          return true;
        }
        sendJson(res, 200, { success: true, id });
      } catch (err: any) {
        sendError(res, 500, 'DATABASE_ERROR', err.message || 'Failed to delete model version');
      }
      return true;
    }
  }

  return false;
}
