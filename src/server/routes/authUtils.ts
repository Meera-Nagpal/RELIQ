/* ============================================================
   RELIQ — Authorization & Multi-Tenant Data Isolation Helpers
   
   Enforces strict tenant boundaries across Projects, Datasets,
   Model Versions, Settings, and Evaluation Runs.
   ============================================================ */

import { projectService } from '../services/projectService';
import { datasetService } from '../services/datasetService';
import { evaluationDbService } from '../services/evaluationDbService';
import { isBuiltinDatasetId } from '../../data/benchmarkRegistry';
import { getRunFromDisk } from '../evaluationService';

/**
 * Checks whether the user can access (read) a project.
 * - Public/Template projects (user_id IS NULL or proj-checkout-agent) are accessible to all.
 * - User-scoped projects (user_id = X) are accessible only to user X.
 */
export async function canUserAccessProject(projectId: string, userId?: string): Promise<boolean> {
  if (!projectId) return false;
  if (projectId === 'proj-checkout-agent') return true;

  const project = await projectService.getProjectById(projectId);
  if (!project) return true; // Allow route handler to return 404 PROJECT_NOT_FOUND

  // If no user_id, project is public/shared template
  if (!project.user_id) return true;

  // Otherwise, strictly match user_id
  return Boolean(userId && project.user_id === userId);
}

/**
 * Checks whether the user can modify or delete a project.
 * - Template projects (user_id IS NULL) cannot be modified/deleted by non-owners unless in test/dev mode without users.
 * - User-scoped projects can only be modified/deleted by their owner.
 */
export async function canUserModifyProject(projectId: string, userId?: string): Promise<boolean> {
  if (!projectId) return false;
  const project = await projectService.getProjectById(projectId);
  if (!project) return true; // Allow route handler to return 404 PROJECT_NOT_FOUND

  // Protected built-in project cannot be modified by authenticated users
  if (project.id === 'proj-checkout-agent') {
    return !userId;
  }

  if (project.user_id) {
    return Boolean(userId && project.user_id === userId);
  }

  // Shared project with no owner
  return true;
}

/**
 * Checks whether the user can access (read) a dataset.
 * - Builtin benchmark datasets are always accessible.
 * - Custom datasets inherit access permissions from their parent project.
 */
export async function canUserAccessDataset(datasetId: string, userId?: string): Promise<boolean> {
  if (!datasetId) return false;
  if (isBuiltinDatasetId(datasetId)) return true;

  const dataset = await datasetService.getDatasetById(datasetId);
  if (!dataset) return true; // Allow route handler to return 404 DATASET_NOT_FOUND

  const projectId = dataset.project_id || dataset.projectId;
  return canUserAccessProject(projectId, userId);
}

/**
 * Checks whether the user can modify or delete a dataset.
 * - Builtin datasets are immutable.
 * - Custom datasets can only be modified if user can modify the parent project.
 */
export async function canUserModifyDataset(datasetId: string, userId?: string): Promise<boolean> {
  if (!datasetId) return false;
  if (isBuiltinDatasetId(datasetId)) return false;

  const dataset = await datasetService.getDatasetById(datasetId);
  if (!dataset) return true; // Allow route handler to return 404 DATASET_NOT_FOUND

  const projectId = dataset.project_id || dataset.projectId;
  return canUserModifyProject(projectId, userId);
}

/**
 * Checks whether the user can access (read or monitor) an evaluation run.
 * - Evaluates project ownership and run user_id.
 */
export async function canUserAccessRun(runId: string, userId?: string): Promise<boolean> {
  if (!runId) return false;
  const run = (await evaluationDbService.getEvaluationRunById(runId)) || getRunFromDisk(runId);
  if (!run) return true; // Let 404 handler return 'Run not found' rather than 403

  const runUserId = run.user_id || run.userId;
  if (runUserId) {
    return Boolean(userId && runUserId === userId);
  }

  const projectId = run.project_id || run.projectId;
  if (projectId) {
    return canUserAccessProject(projectId, userId);
  }

  return true;
}
