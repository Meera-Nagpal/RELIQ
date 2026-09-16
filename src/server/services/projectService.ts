/* ============================================================
   RELIQ — Project Service
   
   Business logic and SQLite persistence for Projects.
   ============================================================ */

import { getDatabase } from '../db/database';

export interface ProjectRecord {
  id: string;
  name: string;
  description: string | null;
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
      .prepare('SELECT id, name, description, created_at, updated_at FROM projects ORDER BY created_at DESC')
      .all() as ProjectRecord[];
  }

  /**
   * Retrieves a single project by ID.
   */
  getProjectById(id: string): ProjectRecord | null {
    const db = getDatabase();
    const row = db
      .prepare('SELECT id, name, description, created_at, updated_at FROM projects WHERE id = ?')
      .get(id) as ProjectRecord | undefined;
    return row || null;
  }

  /**
   * Creates a new project with a server-generated unique ID or specified ID.
   */
  createProject(data: { id?: string; name: string; description?: string }): ProjectRecord {
    const db = getDatabase();
    const id = data.id?.trim() || `proj-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const description = data.description?.trim() || null;

    db.prepare(`
      INSERT INTO projects (id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, data.name.trim(), description, now, now);

    return {
      id,
      name: data.name.trim(),
      description,
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Updates an existing project's name and/or description.
   */
  updateProject(
    id: string,
    data: { name?: string; description?: string }
  ): ProjectRecord | null {
    const db = getDatabase();
    const existing = this.getProjectById(id);
    if (!existing) return null;

    const name = data.name !== undefined ? data.name.trim() : existing.name;
    const description = data.description !== undefined ? data.description.trim() || null : existing.description;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE projects
      SET name = ?, description = ?, updated_at = ?
      WHERE id = ?
    `).run(name, description, now, id);

    return {
      id,
      name,
      description,
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
