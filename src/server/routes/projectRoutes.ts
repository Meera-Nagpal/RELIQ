/* ============================================================
   RELIQ — Project Routes
   
   REST Endpoints for Project management:
   - GET    /api/projects
   - GET    /api/projects/:id
   - POST   /api/projects
   - PUT    /api/projects/:id
   - DELETE /api/projects/:id
   ============================================================ */

import type { IncomingMessage, ServerResponse } from 'http';
import { projectService } from '../services/projectService';
import { getJsonBody, sendError, sendJson } from './httpUtils';

export async function handleProjectRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: string
): Promise<boolean> {
  const method = req.method || 'GET';

  // 1. GET /api/projects
  if (method === 'GET' && parsedUrl === '/api/projects') {
    try {
      const projects = projectService.getAllProjects();
      sendJson(res, 200, { projects });
    } catch (err: any) {
      sendError(res, 500, 'DATABASE_ERROR', err.message || 'Failed to retrieve projects');
    }
    return true;
  }

  // 2. POST /api/projects
  if (method === 'POST' && parsedUrl === '/api/projects') {
    const body = await getJsonBody(req, res);
    if (!body) return true;

    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      sendError(res, 400, 'VALIDATION_ERROR', "Project 'name' is required and cannot be empty");
      return true;
    }

    try {
      const created = projectService.createProject({
        id: typeof body.id === 'string' ? body.id : undefined,
        name: body.name,
        description: typeof body.description === 'string' ? body.description : undefined,
      });
      sendJson(res, 201, created);
    } catch (err: any) {
      sendError(res, 500, 'DATABASE_ERROR', err.message || 'Failed to create project');
    }
    return true;
  }

  // Match /api/projects/:id
  const projectMatch = parsedUrl.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch) {
    const id = decodeURIComponent(projectMatch[1]);

    // 3. GET /api/projects/:id
    if (method === 'GET') {
      try {
        const project = projectService.getProjectById(id);
        if (!project) {
          sendError(res, 404, 'PROJECT_NOT_FOUND', `Project with ID '${id}' not found`);
          return true;
        }
        sendJson(res, 200, project);
      } catch (err: any) {
        sendError(res, 500, 'DATABASE_ERROR', err.message || 'Failed to retrieve project');
      }
      return true;
    }

    // 4. PUT /api/projects/:id
    if (method === 'PUT') {
      const body = await getJsonBody(req, res);
      if (!body) return true;

      if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim())) {
        sendError(res, 400, 'VALIDATION_ERROR', "Project 'name' cannot be empty");
        return true;
      }

      try {
        const updated = projectService.updateProject(id, {
          name: body.name,
          description: typeof body.description === 'string' ? body.description : undefined,
        });

        if (!updated) {
          sendError(res, 404, 'PROJECT_NOT_FOUND', `Project with ID '${id}' not found`);
          return true;
        }

        sendJson(res, 200, updated);
      } catch (err: any) {
        sendError(res, 500, 'DATABASE_ERROR', err.message || 'Failed to update project');
      }
      return true;
    }

    // 5. DELETE /api/projects/:id
    if (method === 'DELETE') {
      try {
        const deleted = projectService.deleteProject(id);
        if (!deleted) {
          sendError(res, 404, 'PROJECT_NOT_FOUND', `Project with ID '${id}' not found`);
          return true;
        }
        sendJson(res, 200, { success: true, id });
      } catch (err: any) {
        sendError(res, 500, 'DATABASE_ERROR', err.message || 'Failed to delete project');
      }
      return true;
    }
  }

  return false;
}
