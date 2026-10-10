/* ============================================================
   RELIQ — Project Service
   
   Business logic and SQLite persistence for Projects.
   ============================================================ */

import { getDatabase } from '../db/database';

export interface ProjectRecord {
  id: string;
  name: string;
  description: string | null;
  default_dataset_id?: string | null;
  baseline_version_id?: string | null;
  candidate_version_id?: string | null;
  created_at: string;
  updated_at: string;
}

export class ProjectService {
  /**
   * Retrieves all projects, ordered by creation date descending.
   */
  getAllProjects(): ProjectRecord[] {
    const db = getDatabase();
    return db
      .prepare('SELECT id, name, description, default_dataset_id, baseline_version_id, candidate_version_id, created_at, updated_at FROM projects ORDER BY created_at DESC')
      .all() as ProjectRecord[];
  }

  /**
   * Retrieves a single project by ID.
   */
  getProjectById(id: string): ProjectRecord | null {
    const db = getDatabase();
    const row = db
      .prepare('SELECT id, name, description, default_dataset_id, baseline_version_id, candidate_version_id, created_at, updated_at FROM projects WHERE id = ?')
      .get(id) as ProjectRecord | undefined;
    return row || null;
  }

  /**
   * Creates a new project with a server-generated unique ID or specified ID.
   */
  createProject(data: {
    id?: string;
    name: string;
    description?: string;
    defaultDatasetId?: string;
    baselineVersionId?: string;
    candidateVersionId?: string;
  }): ProjectRecord {
    const db = getDatabase();
    const id = data.id?.trim() || `proj-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const description = data.description?.trim() || null;
    const defaultDatasetId = data.defaultDatasetId?.trim() || null;
    const baselineVersionId = data.baselineVersionId?.trim() || 'ver-v1-4';
    const candidateVersionId = data.candidateVersionId?.trim() || 'ver-v1-5';

    db.prepare(`
      INSERT INTO projects (id, name, description, default_dataset_id, baseline_version_id, candidate_version_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.name.trim(), description, defaultDatasetId, baselineVersionId, candidateVersionId, now, now);

    return {
      id,
      name: data.name.trim(),
      description,
      default_dataset_id: defaultDatasetId,
      baseline_version_id: baselineVersionId,
      candidate_version_id: candidateVersionId,
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Updates an existing project's name, description, and default version/dataset references.
   */
  updateProject(
    id: string,
    data: {
      name?: string;
      description?: string;
      defaultDatasetId?: string;
      baselineVersionId?: string;
      candidateVersionId?: string;
    }
  ): ProjectRecord | null {
    const db = getDatabase();
    const existing = this.getProjectById(id);
    if (!existing) return null;

    const name = data.name !== undefined ? data.name.trim() : existing.name;
    const description = data.description !== undefined ? data.description.trim() || null : existing.description;
    const defaultDatasetId = data.defaultDatasetId !== undefined ? data.defaultDatasetId?.trim() || null : (existing.default_dataset_id ?? null);
    const baselineVersionId = data.baselineVersionId !== undefined ? data.baselineVersionId?.trim() || null : (existing.baseline_version_id ?? null);
    const candidateVersionId = data.candidateVersionId !== undefined ? data.candidateVersionId?.trim() || null : (existing.candidate_version_id ?? null);
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE projects
      SET name = ?, description = ?, default_dataset_id = ?, baseline_version_id = ?, candidate_version_id = ?, updated_at = ?
      WHERE id = ?
    `).run(name, description, defaultDatasetId, baselineVersionId, candidateVersionId, now, id);

    return {
      id,
      name,
      description,
      default_dataset_id: defaultDatasetId,
      baseline_version_id: baselineVersionId,
      candidate_version_id: candidateVersionId,
      created_at: existing.created_at,
      updated_at: now,
    };
  }

  /**
   * Deletes a project by ID. Foreign keys cascade to datasets, runs, settings, etc.
   */
  deleteProject(id: string): boolean {
    const db = getDatabase();
    const info = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    return info.changes > 0;
  }
}

export const projectService = new ProjectService();
