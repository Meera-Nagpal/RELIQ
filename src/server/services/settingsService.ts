/* ============================================================
   RELIQ — Project Settings Service
   
   Business logic and SQLite persistence for Project Settings.
   Upserts regression thresholds and raw output privacy toggles.
   ============================================================ */

import { getDatabase } from '../db/database';
import { projectService } from './projectService';

export interface ProjectSettingsRecord {
  id: string;
  project_id: string;
  min_accuracy: number;
  max_degradation: number;
  latency_tolerance: number;
  raw_output_privacy: number; // 1 for true, 0 for false
  created_at: string;
  updated_at: string;
}

export interface FormattedProjectSettings {
  id: string;
  projectId: string;
  minAccuracy: number;
  maxDegradation: number;
  latencyTolerance: number;
  rawOutputPrivacy: boolean;
  createdAt: string;
  updatedAt: string;
}

export function formatSettingsRecord(row: ProjectSettingsRecord): FormattedProjectSettings {
  return {
    id: row.id,
    projectId: row.project_id,
    minAccuracy: row.min_accuracy,
    maxDegradation: row.max_degradation,
    latencyTolerance: row.latency_tolerance,
    rawOutputPrivacy: Boolean(row.raw_output_privacy),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SettingsService {
  /**
   * Retrieves settings for a specific project.
   * If not yet created, initializes with project defaults.
   */
  getSettings(projectId: string): FormattedProjectSettings | null {
    const db = getDatabase();
    const project = projectService.getProjectById(projectId);
    if (!project) return null;

    let row = db
      .prepare('SELECT id, project_id, min_accuracy, max_degradation, latency_tolerance, raw_output_privacy, created_at, updated_at FROM project_settings WHERE project_id = ?')
      .get(projectId) as ProjectSettingsRecord | undefined;

    if (!row) {
      // Create default settings row
      const now = new Date().toISOString();
      const id = `settings-${projectId}`;
      db.prepare(`
        INSERT OR IGNORE INTO project_settings (
          id, project_id, min_accuracy, max_degradation, latency_tolerance, raw_output_privacy, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, projectId, 95.0, 2.0, 20.0, 1, now, now);

      row = db
        .prepare('SELECT id, project_id, min_accuracy, max_degradation, latency_tolerance, raw_output_privacy, created_at, updated_at FROM project_settings WHERE project_id = ?')
        .get(projectId) as ProjectSettingsRecord;
    }

    return formatSettingsRecord(row);
  }

  /**
   * Upserts regression thresholds and settings for a project.
   */
  upsertSettings(
    projectId: string,
    data: {
      minAccuracy: number;
      maxDegradation: number;
      latencyTolerance: number;
      rawOutputPrivacy?: boolean;
    }
  ): FormattedProjectSettings {
    const db = getDatabase();
    const project = projectService.getProjectById(projectId);
    if (!project) {
      const err = new Error(`Project with ID '${projectId}' not found`);
      (err as any).code = 'PROJECT_NOT_FOUND';
      throw err;
    }

    const id = `settings-${projectId}`;
    const now = new Date().toISOString();
    const privacy = data.rawOutputPrivacy !== false ? 1 : 0;

    db.prepare(`
      INSERT INTO project_settings (
        id, project_id, min_accuracy, max_degradation, latency_tolerance, raw_output_privacy, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        min_accuracy = excluded.min_accuracy,
        max_degradation = excluded.max_degradation,
        latency_tolerance = excluded.latency_tolerance,
        raw_output_privacy = excluded.raw_output_privacy,
        updated_at = excluded.updated_at
    `).run(
      id,
      projectId,
      data.minAccuracy,
      data.maxDegradation,
      data.latencyTolerance,
      privacy,
      now,
      now
    );

    const updated = db
      .prepare('SELECT id, project_id, min_accuracy, max_degradation, latency_tolerance, raw_output_privacy, created_at, updated_at FROM project_settings WHERE project_id = ?')
      .get(projectId) as ProjectSettingsRecord;

    return formatSettingsRecord(updated);
  }
}

export const settingsService = new SettingsService();
