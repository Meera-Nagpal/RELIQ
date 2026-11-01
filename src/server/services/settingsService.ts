/* ============================================================
   RELIQ — Project Settings Service
   
   Business logic and persistence for Project Settings.
   Uses Supabase PostgreSQL in production (when RELIQ_DB_DRIVER=supabase_postgresql
   or Supabase credentials are configured).
   Uses SQLite in local offline development and automated tests.
   Upserts regression thresholds and raw output privacy toggles.
   ============================================================ */

import { getDatabase } from '../db/database';
import { isSupabaseDriverActive } from '../db/supabaseClient';
import { supabaseRepository } from '../db/supabaseRepository';
import { projectService } from './projectService';

export interface ProjectSettingsRecord {
  id: string;
  project_id: string;
  min_accuracy: number;
  max_degradation: number;
  latency_tolerance: number;
  max_failure_rate?: number;
  min_coverage?: number;
  min_evaluated_cases?: number;
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
  maxFailureRate: number;
  minCoverage: number;
  minEvaluatedCases: number;
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
    maxFailureRate: row.max_failure_rate ?? 5.0,
    minCoverage: row.min_coverage ?? 80.0,
    minEvaluatedCases: row.min_evaluated_cases ?? 100,
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
  getSettings(projectId: string): (FormattedProjectSettings | null) | Promise<FormattedProjectSettings | null> {
    if (isSupabaseDriverActive()) {
      return (async () => {
        const project = await projectService.getProjectById(projectId);
        if (!project) return null;

        let row = await supabaseRepository.getProjectSettings(projectId);
        if (!row) {
          const now = new Date().toISOString();
          const id = `settings-${projectId}`;
          row = await supabaseRepository.upsertProjectSettings({
            id,
            project_id: projectId,
            min_accuracy: 95.0,
            max_degradation: 2.0,
            latency_tolerance: 20.0,
            max_failure_rate: 5.0,
            min_coverage: 80.0,
            min_evaluated_cases: 100,
            raw_output_privacy: 1,
            created_at: now,
            updated_at: now,
          });
        }
        return formatSettingsRecord(row);
      })();
    }

    const db = getDatabase();
    const project = projectService.getProjectById(projectId);
    if (!project) return null;

    let row = db
      .prepare('SELECT id, project_id, min_accuracy, max_degradation, latency_tolerance, max_failure_rate, min_coverage, min_evaluated_cases, raw_output_privacy, created_at, updated_at FROM project_settings WHERE project_id = ?')
      .get(projectId) as ProjectSettingsRecord | undefined;

    if (!row) {
      // Create default settings row
      const now = new Date().toISOString();
      const id = `settings-${projectId}`;
      db.prepare(`
        INSERT OR IGNORE INTO project_settings (
          id, project_id, min_accuracy, max_degradation, latency_tolerance, max_failure_rate, min_coverage, min_evaluated_cases, raw_output_privacy, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, projectId, 95.0, 2.0, 20.0, 5.0, 80.0, 100, 1, now, now);

      row = db
        .prepare('SELECT id, project_id, min_accuracy, max_degradation, latency_tolerance, max_failure_rate, min_coverage, min_evaluated_cases, raw_output_privacy, created_at, updated_at FROM project_settings WHERE project_id = ?')
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
      maxFailureRate?: number;
      minCoverage?: number;
      minEvaluatedCases?: number;
      rawOutputPrivacy?: boolean;
    }
  ): FormattedProjectSettings | Promise<FormattedProjectSettings> {
    if (isSupabaseDriverActive()) {
      return (async () => {
        const project = await projectService.getProjectById(projectId);
        if (!project) {
          const err = new Error(`Project with ID '${projectId}' not found`);
          (err as any).code = 'PROJECT_NOT_FOUND';
          throw err;
        }

        const existing = await this.getSettings(projectId);
        const id = `settings-${projectId}`;
        const now = new Date().toISOString();
        const privacy = data.rawOutputPrivacy !== false ? 1 : 0;
        const maxFailureRate = typeof data.maxFailureRate === 'number' && !isNaN(data.maxFailureRate) ? data.maxFailureRate : (existing?.maxFailureRate ?? 5.0);
        const minCoverage = typeof data.minCoverage === 'number' && !isNaN(data.minCoverage) ? data.minCoverage : (existing?.minCoverage ?? 80.0);
        const minEvaluatedCases = typeof data.minEvaluatedCases === 'number' && !isNaN(data.minEvaluatedCases) ? data.minEvaluatedCases : (existing?.minEvaluatedCases ?? 100);

        const updated = await supabaseRepository.upsertProjectSettings({
          id,
          project_id: projectId,
          min_accuracy: data.minAccuracy,
          max_degradation: data.maxDegradation,
          latency_tolerance: data.latencyTolerance,
          max_failure_rate: maxFailureRate,
          min_coverage: minCoverage,
          min_evaluated_cases: minEvaluatedCases,
          raw_output_privacy: privacy,
          created_at: existing?.createdAt || now,
          updated_at: now,
        });

        return formatSettingsRecord(updated);
      })();
    }

    const db = getDatabase();
    const project = projectService.getProjectById(projectId);
    if (!project) {
      const err = new Error(`Project with ID '${projectId}' not found`);
      (err as any).code = 'PROJECT_NOT_FOUND';
      throw err;
    }

    const existing = this.getSettings(projectId) as FormattedProjectSettings | null;
    const id = `settings-${projectId}`;
    const now = new Date().toISOString();
    const privacy = data.rawOutputPrivacy !== false ? 1 : 0;
    const maxFailureRate = typeof data.maxFailureRate === 'number' && !isNaN(data.maxFailureRate) ? data.maxFailureRate : (existing?.maxFailureRate ?? 5.0);
    const minCoverage = typeof data.minCoverage === 'number' && !isNaN(data.minCoverage) ? data.minCoverage : (existing?.minCoverage ?? 80.0);
    const minEvaluatedCases = typeof data.minEvaluatedCases === 'number' && !isNaN(data.minEvaluatedCases) ? data.minEvaluatedCases : (existing?.minEvaluatedCases ?? 100);

    db.prepare(`
      INSERT INTO project_settings (
        id, project_id, min_accuracy, max_degradation, latency_tolerance, max_failure_rate, min_coverage, min_evaluated_cases, raw_output_privacy, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        min_accuracy = excluded.min_accuracy,
        max_degradation = excluded.max_degradation,
        latency_tolerance = excluded.latency_tolerance,
        max_failure_rate = excluded.max_failure_rate,
        min_coverage = excluded.min_coverage,
        min_evaluated_cases = excluded.min_evaluated_cases,
        raw_output_privacy = excluded.raw_output_privacy,
        updated_at = excluded.updated_at
    `).run(
      id,
      projectId,
      data.minAccuracy,
      data.maxDegradation,
      data.latencyTolerance,
      maxFailureRate,
      minCoverage,
      minEvaluatedCases,
      privacy,
      now,
      now
    );

    const updated = db
      .prepare('SELECT id, project_id, min_accuracy, max_degradation, latency_tolerance, max_failure_rate, min_coverage, min_evaluated_cases, raw_output_privacy, created_at, updated_at FROM project_settings WHERE project_id = ?')
      .get(projectId) as ProjectSettingsRecord;

    return formatSettingsRecord(updated);
  }
}

export const settingsService = new SettingsService();
