/* ============================================================
   RELIQ — Model Version Service
   
   Business logic and SQLite persistence for Model Versions.
   SECURITY: Never accepts, stores, or returns API keys.
   ============================================================ */

import { getDatabase } from '../db/database';
import { projectService } from './projectService';

export interface ModelVersionRecord {
  id: string;
  project_id: string;
  provider: string;
  model: string;
  display_name: string;
  system_prompt: string | null;
  prompt_version?: string | null;
  temperature?: number | null;
  max_tokens?: number | null;
  reasoning_effort?: string | null;
  created_at: string;
  updated_at: string;
}

export class VersionService {
  /**
   * Retrieves all model versions, optionally filtered by projectId.
   */
  getVersions(projectId?: string): ModelVersionRecord[] {
    const db = getDatabase();
    if (projectId) {
      return db
        .prepare('SELECT id, project_id, provider, model, display_name, system_prompt, prompt_version, temperature, max_tokens, reasoning_effort, created_at, updated_at FROM model_versions WHERE project_id = ? ORDER BY created_at DESC')
        .all(projectId) as ModelVersionRecord[];
    }
    return db
      .prepare('SELECT id, project_id, provider, model, display_name, system_prompt, prompt_version, temperature, max_tokens, reasoning_effort, created_at, updated_at FROM model_versions ORDER BY created_at DESC')
      .all() as ModelVersionRecord[];
  }

  /**
   * Retrieves a single model version by ID.
   */
  getVersionById(id: string): ModelVersionRecord | null {
    const db = getDatabase();
    const row = db
      .prepare('SELECT id, project_id, provider, model, display_name, system_prompt, prompt_version, temperature, max_tokens, reasoning_effort, created_at, updated_at FROM model_versions WHERE id = ?')
      .get(id) as ModelVersionRecord | undefined;
    return row || null;
  }

  /**
   * Creates a new model version. Validates project exists.
   */
  createVersion(data: {
    id?: string;
    projectId: string;
    provider: string;
    model: string;
    displayName: string;
    systemPrompt?: string;
    promptVersion?: string;
    temperature?: number;
    maxTokens?: number;
    reasoningEffort?: string;
  }): ModelVersionRecord {
    const db = getDatabase();
    const project = projectService.getProjectById(data.projectId);
    if (!project) {
      const err = new Error(`Project with ID '${data.projectId}' not found`);
      (err as any).code = 'PROJECT_NOT_FOUND';
      throw err;
    }

    const id = data.id?.trim() || `ver-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const systemPrompt = data.systemPrompt !== undefined ? data.systemPrompt : null;
    const promptVersion = data.promptVersion !== undefined ? data.promptVersion : '1.0';
    const temperature = typeof data.temperature === 'number' ? data.temperature : 0.2;
    const maxTokens = typeof data.maxTokens === 'number' ? data.maxTokens : 2048;
    const reasoningEffort = data.reasoningEffort !== undefined ? data.reasoningEffort : null;

    db.prepare(`
      INSERT INTO model_versions (id, project_id, provider, model, display_name, system_prompt, prompt_version, temperature, max_tokens, reasoning_effort, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.projectId,
      data.provider.trim(),
      data.model.trim(),
      data.displayName.trim(),
      systemPrompt,
      promptVersion,
      temperature,
      maxTokens,
      reasoningEffort,
      now,
      now
    );

    return {
      id,
      project_id: data.projectId,
      provider: data.provider.trim(),
      model: data.model.trim(),
      display_name: data.displayName.trim(),
      system_prompt: systemPrompt,
      prompt_version: promptVersion,
      temperature,
      max_tokens: maxTokens,
      reasoning_effort: reasoningEffort,
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Updates an existing model version's configuration.
   */
  updateVersion(
    id: string,
    data: {
      provider?: string;
      model?: string;
      displayName?: string;
      systemPrompt?: string;
      promptVersion?: string;
      temperature?: number;
      maxTokens?: number;
      reasoningEffort?: string;
    }
  ): ModelVersionRecord | null {
    const db = getDatabase();
    const existing = this.getVersionById(id);
    if (!existing) return null;

    const provider = data.provider !== undefined ? data.provider.trim() : existing.provider;
    const model = data.model !== undefined ? data.model.trim() : existing.model;
    const displayName = data.displayName !== undefined ? data.displayName.trim() : existing.display_name;
    const systemPrompt = data.systemPrompt !== undefined ? data.systemPrompt : existing.system_prompt;
    const promptVersion = data.promptVersion !== undefined ? data.promptVersion : (existing.prompt_version ?? '1.0');
    const temperature = typeof data.temperature === 'number' ? data.temperature : (existing.temperature ?? 0.2);
    const maxTokens = typeof data.maxTokens === 'number' ? data.maxTokens : (existing.max_tokens ?? 2048);
    const reasoningEffort = data.reasoningEffort !== undefined ? data.reasoningEffort : (existing.reasoning_effort ?? null);
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE model_versions
      SET provider = ?, model = ?, display_name = ?, system_prompt = ?, prompt_version = ?, temperature = ?, max_tokens = ?, reasoning_effort = ?, updated_at = ?
      WHERE id = ?
    `).run(provider, model, displayName, systemPrompt, promptVersion, temperature, maxTokens, reasoningEffort, now, id);

    return {
      id,
      project_id: existing.project_id,
      provider,
      model,
      display_name: displayName,
      system_prompt: systemPrompt,
      prompt_version: promptVersion,
      temperature,
      max_tokens: maxTokens,
      reasoning_effort: reasoningEffort,
      created_at: existing.created_at,
      updated_at: now,
    };
  }

  /**
   * Deletes a model version by ID.
   */
  deleteVersion(id: string): boolean {
    const db = getDatabase();
    const info = db.prepare('DELETE FROM model_versions WHERE id = ?').run(id);
    return info.changes > 0;
  }
}

export const versionService = new VersionService();
