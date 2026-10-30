/* ============================================================
   RELIQ — Supabase PostgreSQL Persistence Repository
   
   Provides strongly-typed database operations over Supabase PostgreSQL:
   - Projects, Datasets, Test Cases, Model Versions
   - Evaluation Runs, Results, Audit Log, Project Settings
   - Evaluation Response Cache
   ============================================================ */

import { getSupabaseAdmin, isSupabaseConfigured } from './supabaseClient';
import type { ProjectRecord } from '../services/projectService';
import type { DatasetRecord, TestCaseRecord } from '../services/datasetService';
import type { ModelVersionRecord } from '../services/versionService';
import type { ProjectSettingsRecord } from '../services/settingsService';
import type { ReleaseDecisionAuditRecord } from '../services/evaluationDbService';

export class SupabaseRepository {
  // ── 1. Projects ───────────────────────────────────────────
  async getAllProjects(userId?: string): Promise<ProjectRecord[]> {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('projects')
      .select('id, name, description, default_dataset_id, baseline_version_id, candidate_version_id, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.or(`user_id.eq.${userId},user_id.is.null`);
    }

    const { data, error } = await query;
    if (error) throw new Error(`[Supabase] getAllProjects failed: ${error.message}`);
    return (data || []) as ProjectRecord[];
  }

  async getProjectById(id: string): Promise<ProjectRecord | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, description, default_dataset_id, baseline_version_id, candidate_version_id, created_at, updated_at')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`[Supabase] getProjectById failed: ${error.message}`);
    return (data as ProjectRecord) || null;
  }

  async createProject(project: {
    id: string;
    name: string;
    description: string | null;
    default_dataset_id?: string | null;
    baseline_version_id?: string | null;
    candidate_version_id?: string | null;
    user_id?: string | null;
    created_at: string;
    updated_at: string;
  }): Promise<ProjectRecord> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('projects')
      .insert(project)
      .select('id, name, description, default_dataset_id, baseline_version_id, candidate_version_id, created_at, updated_at')
      .single();

    if (error) throw new Error(`[Supabase] createProject failed: ${error.message}`);
    return data as ProjectRecord;
  }

  async updateProject(
    id: string,
    updates: Partial<{
      name: string;
      description: string | null;
      default_dataset_id: string | null;
      baseline_version_id: string | null;
      candidate_version_id: string | null;
      updated_at: string;
    }>
  ): Promise<ProjectRecord | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', id)
      .select('id, name, description, default_dataset_id, baseline_version_id, candidate_version_id, created_at, updated_at')
      .maybeSingle();

    if (error) throw new Error(`[Supabase] updateProject failed: ${error.message}`);
    return (data as ProjectRecord) || null;
  }

  async deleteProject(id: string): Promise<boolean> {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw new Error(`[Supabase] deleteProject failed: ${error.message}`);
    return true;
  }

  // ── 2. Datasets ───────────────────────────────────────────
  async getAllDatasets(projectId?: string): Promise<DatasetRecord[]> {
    const supabase = getSupabaseAdmin();
    let query = supabase.from('datasets').select('*').order('created_at', { ascending: false });

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`[Supabase] getAllDatasets failed: ${error.message}`);
    return (data || []) as DatasetRecord[];
  }

  async getDatasetById(id: string): Promise<DatasetRecord | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('datasets').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`[Supabase] getDatasetById failed: ${error.message}`);
    return (data as DatasetRecord) || null;
  }

  async createDataset(dataset: Partial<DatasetRecord>): Promise<DatasetRecord> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('datasets').insert(dataset).select('*').single();
    if (error) throw new Error(`[Supabase] createDataset failed: ${error.message}`);
    return data as DatasetRecord;
  }

  async updateDataset(id: string, updates: Partial<DatasetRecord>): Promise<DatasetRecord | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('datasets').update(updates).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`[Supabase] updateDataset failed: ${error.message}`);
    return (data as DatasetRecord) || null;
  }

  async deleteDataset(id: string): Promise<boolean> {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('datasets').delete().eq('id', id);
    if (error) throw new Error(`[Supabase] deleteDataset failed: ${error.message}`);
    return true;
  }

  // ── 3. Test Cases ─────────────────────────────────────────
  async getTestCasesByDatasetId(datasetId: string): Promise<TestCaseRecord[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('test_cases')
      .select('*')
      .eq('dataset_id', datasetId)
      .order('source_record_number', { ascending: true, nullsFirst: false });

    if (error) throw new Error(`[Supabase] getTestCasesByDatasetId failed: ${error.message}`);
    return (data || []) as TestCaseRecord[];
  }

  async createTestCases(testCases: Partial<TestCaseRecord>[]): Promise<number> {
    if (!testCases.length) return 0;
    const supabase = getSupabaseAdmin();
    // Batch in chunks of 100 for network efficiency
    const CHUNK_SIZE = 100;
    let inserted = 0;

    for (let i = 0; i < testCases.length; i += CHUNK_SIZE) {
      const chunk = testCases.slice(i, i + CHUNK_SIZE);
      const { data, error } = await supabase.from('test_cases').insert(chunk).select('id');
      if (error) throw new Error(`[Supabase] createTestCases chunk failed: ${error.message}`);
      inserted += (data || []).length;
    }
    return inserted;
  }

  async deleteTestCasesByDatasetId(datasetId: string): Promise<boolean> {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('test_cases').delete().eq('dataset_id', datasetId);
    if (error) throw new Error(`[Supabase] deleteTestCasesByDatasetId failed: ${error.message}`);
    return true;
  }

  // ── 4. Model Versions ─────────────────────────────────────
  async getModelVersions(projectId?: string): Promise<ModelVersionRecord[]> {
    const supabase = getSupabaseAdmin();
    let query = supabase.from('model_versions').select('*').order('created_at', { ascending: false });
    if (projectId) {
      query = query.eq('project_id', projectId);
    }
    const { data, error } = await query;
    if (error) throw new Error(`[Supabase] getModelVersions failed: ${error.message}`);
    return (data || []) as ModelVersionRecord[];
  }

  async getModelVersionById(id: string): Promise<ModelVersionRecord | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('model_versions').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`[Supabase] getModelVersionById failed: ${error.message}`);
    return (data as ModelVersionRecord) || null;
  }

  async createModelVersion(version: Partial<ModelVersionRecord>): Promise<ModelVersionRecord> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('model_versions').insert(version).select('*').single();
    if (error) throw new Error(`[Supabase] createModelVersion failed: ${error.message}`);
    return data as ModelVersionRecord;
  }

  async updateModelVersion(id: string, updates: Partial<ModelVersionRecord>): Promise<ModelVersionRecord | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('model_versions').update(updates).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`[Supabase] updateModelVersion failed: ${error.message}`);
    return (data as ModelVersionRecord) || null;
  }

  async deleteModelVersion(id: string): Promise<boolean> {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('model_versions').delete().eq('id', id);
    if (error) throw new Error(`[Supabase] deleteModelVersion failed: ${error.message}`);
    return true;
  }

  // ── 5. Project Settings ───────────────────────────────────
  async getProjectSettings(projectId: string): Promise<ProjectSettingsRecord | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('project_settings').select('*').eq('project_id', projectId).maybeSingle();
    if (error) throw new Error(`[Supabase] getProjectSettings failed: ${error.message}`);
    return (data as ProjectSettingsRecord) || null;
  }

  async upsertProjectSettings(settings: ProjectSettingsRecord): Promise<ProjectSettingsRecord> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('project_settings')
      .upsert(settings, { onConflict: 'project_id' })
      .select('*')
      .single();
    if (error) throw new Error(`[Supabase] upsertProjectSettings failed: ${error.message}`);
    return data as ProjectSettingsRecord;
  }

  // ── 6. Evaluation Runs ────────────────────────────────────
  async getAllEvaluationRuns(projectId?: string): Promise<any[]> {
    const supabase = getSupabaseAdmin();
    let query = supabase.from('evaluation_runs').select('*').order('started_at', { ascending: false });
    if (projectId) {
      query = query.eq('project_id', projectId);
    }
    const { data, error } = await query;
    if (error) throw new Error(`[Supabase] getAllEvaluationRuns failed: ${error.message}`);
    return data || [];
  }

  async getEvaluationRunById(id: string): Promise<any | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('evaluation_runs').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`[Supabase] getEvaluationRunById failed: ${error.message}`);
    return data || null;
  }

  async saveEvaluationRun(runRecord: any, resultsRecords: any[] = []): Promise<void> {
    const supabase = getSupabaseAdmin();
    const { error: runError } = await supabase.from('evaluation_runs').upsert(runRecord, { onConflict: 'id' });
    if (runError) throw new Error(`[Supabase] saveEvaluationRun failed: ${runError.message}`);

    if (resultsRecords.length > 0) {
      const CHUNK_SIZE = 100;
      for (let i = 0; i < resultsRecords.length; i += CHUNK_SIZE) {
        const chunk = resultsRecords.slice(i, i + CHUNK_SIZE);
        const { error: resError } = await supabase.from('evaluation_results').upsert(chunk, { onConflict: 'id' });
        if (resError) throw new Error(`[Supabase] saveEvaluationResults chunk failed: ${resError.message}`);
      }
    }
  }

  async updateReleaseDecision(
    runId: string,
    newDecision: string,
    justification: string,
    previousDecision: string | null
  ): Promise<void> {
    const supabase = getSupabaseAdmin();
    // 1. Update run
    const { error: updateError } = await supabase
      .from('evaluation_runs')
      .update({ release_decision: newDecision, release_reason: justification })
      .eq('id', runId);
    if (updateError) throw new Error(`[Supabase] updateReleaseDecision run failed: ${updateError.message}`);

    // 2. Insert audit
    const auditRecord: ReleaseDecisionAuditRecord = {
      id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      run_id: runId,
      previous_decision: previousDecision,
      new_decision: newDecision,
      justification,
      created_at: new Date().toISOString(),
    };
    const { error: auditError } = await supabase.from('release_decision_audit').insert(auditRecord);
    if (auditError) throw new Error(`[Supabase] updateReleaseDecision audit failed: ${auditError.message}`);
  }

  async getEvaluationResultsByRunId(runId: string): Promise<any[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('evaluation_results').select('*').eq('run_id', runId);
    if (error) throw new Error(`[Supabase] getEvaluationResultsByRunId failed: ${error.message}`);
    return data || [];
  }

  async getReleaseDecisionAudit(runId: string): Promise<ReleaseDecisionAuditRecord[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('release_decision_audit')
      .select('*')
      .eq('run_id', runId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`[Supabase] getReleaseDecisionAudit failed: ${error.message}`);
    return (data || []) as ReleaseDecisionAuditRecord[];
  }

  // ── 7. Evaluation Response Cache ──────────────────────────
  async getCachedResponse(cacheKey: string): Promise<{
    responseText: string;
    usage?: any;
    latencyMs?: number;
  } | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('evaluation_cache')
      .select('response_text, usage_json, latency_ms')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (error || !data) return null;
    return {
      responseText: data.response_text,
      usage: data.usage_json,
      latencyMs: data.latency_ms,
    };
  }

  async setCachedResponse(
    cacheKey: string,
    model: string,
    provider: string,
    promptHash: string,
    responseText: string,
    usageJson?: any,
    latencyMs?: number
  ): Promise<void> {
    try {
      const supabase = getSupabaseAdmin();
      await supabase.from('evaluation_cache').upsert(
        {
          cache_key: cacheKey,
          model,
          provider,
          prompt_hash: promptHash,
          response_text: responseText,
          usage_json: usageJson,
          latency_ms: latencyMs,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'cache_key' }
      );
    } catch {
      // Non-blocking caching failure
    }
  }
}

export const supabaseRepository = new SupabaseRepository();
