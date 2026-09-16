/* ============================================================
   RELIQ — REST API-Backed Storage Repository Implementation
   
   Implements StorageRepository over the RELIQ backend REST APIs.
   Authoritative source of truth is SQLite (data/reliq.db).
   
   Features:
   - Zero hard-coded hostnames (uses relative /api/...)
   - Standardized error transformation via ApiClient
   - Complete domain type mapping (Project, Dataset, TestCase, ModelVersion,
     RegressionSettings, EvaluationRun, TestCaseResult)
   - Zero client-side API key leakage
   - Authoritative backend case_count & settings handling
   ============================================================ */

import {
  Dataset,
  EvaluationRun,
  ModelVersion,
  Project,
  RegressionSettings,
  TestCase,
  TestCaseResult,
} from '../domain/types';
import { apiClient, ApiClient, ApiError } from './apiClient';
import { StorageRepository } from './repository';

const STORAGE_KEYS = {
  ACTIVE_PROJECT_ID: 'reliq_active_project_id_v2',
  PRIVACY_STORE_RAW_OUTPUTS: 'reliq_privacy_store_raw_outputs',
};

export const DEFAULT_REGRESSION_SETTINGS: RegressionSettings = {
  minAccuracyPercent: 95.0,
  maxAccuracyDegradationPercent: 2.0,
  maxLatencyIncreasePercent: 20.0,
  maxFailureRatePercent: 5.0,
  minEvaluationCoveragePercent: 80.0,
  minimumEvaluatedCases: 100,
};

// ── Mapping Helpers ──────────────────────────────────────────

function mapBackendTestCase(tc: any): TestCase {
  let evaluatorConfig = undefined;
  if (tc.evaluator_config) {
    try {
      evaluatorConfig = typeof tc.evaluator_config === 'string'
        ? JSON.parse(tc.evaluator_config)
        : tc.evaluator_config;
    } catch {}
  } else if (tc.evaluatorConfig) {
    evaluatorConfig = tc.evaluatorConfig;
  }

  let tags: string[] = [];
  if (tc.tags) {
    try {
      tags = typeof tc.tags === 'string' ? JSON.parse(tc.tags) : tc.tags;
    } catch {}
  }

  let metadata = undefined;
  if (tc.metadata) {
    try {
      metadata = typeof tc.metadata === 'string' ? JSON.parse(tc.metadata) : tc.metadata;
    } catch {}
  }

  return {
    id: tc.id,
    name: tc.name,
    category: tc.category,
    input: tc.input,
    expectedOutput: tc.expected_behavior || tc.expected_output || tc.expectedOutput || '',
    evaluatorType: tc.evaluator_type || tc.evaluatorType || 'normalized_text',
    evaluatorConfig,
    tags: Array.isArray(tags) ? tags : [],
    severity: tc.severity || 'medium',
    metadata,
    createdAt: tc.created_at || tc.createdAt || new Date().toISOString(),
  };
}

function mapBackendDataset(d: any, cases: TestCase[] = []): Dataset {
  return {
    id: d.id,
    projectId: d.project_id || d.projectId,
    name: d.name,
    description: d.description || '',
    cases,
    createdAt: d.created_at || d.createdAt || new Date().toISOString(),
    updatedAt: d.updated_at || d.updatedAt || new Date().toISOString(),
  };
}

function mapBackendVersion(v: any): ModelVersion {
  return {
    id: v.id,
    name: v.display_name || v.displayName || v.model,
    provider: v.provider,
    modelIdentifier: v.model || v.modelIdentifier,
    promptVersion: v.prompt_version || '1.0',
    systemPrompt: v.system_prompt || v.systemPrompt || '',
    temperature: 0.7,
    createdAt: v.created_at || v.createdAt || new Date().toISOString(),
  };
}

function mapBackendSettings(s: any): RegressionSettings {
  if (!s) return { ...DEFAULT_REGRESSION_SETTINGS };
  return {
    minAccuracyPercent: s.minAccuracy ?? s.min_accuracy ?? DEFAULT_REGRESSION_SETTINGS.minAccuracyPercent,
    maxAccuracyDegradationPercent: s.maxDegradation ?? s.max_degradation ?? DEFAULT_REGRESSION_SETTINGS.maxAccuracyDegradationPercent,
    maxLatencyIncreasePercent: s.latencyTolerance ?? s.latency_tolerance ?? DEFAULT_REGRESSION_SETTINGS.maxLatencyIncreasePercent,
    maxFailureRatePercent: DEFAULT_REGRESSION_SETTINGS.maxFailureRatePercent,
    minEvaluationCoveragePercent: DEFAULT_REGRESSION_SETTINGS.minEvaluationCoveragePercent,
    minimumEvaluatedCases: DEFAULT_REGRESSION_SETTINGS.minimumEvaluatedCases,
  };
}

export class ApiRepository implements StorageRepository {
  private client: ApiClient;

  constructor(client: ApiClient = apiClient) {
    this.client = client;
  }

  getClient(): ApiClient {
    return this.client;
  }

  // ── Projects ──────────────────────────────────────────────
  async getProjects(): Promise<Project[]> {
    const res = await this.client.get<{ projects: any[] }>('/api/projects');
    const rawProjects = Array.isArray(res?.projects) ? res.projects : [];

    const mappedProjects: Project[] = [];
    for (const p of rawProjects) {
      let settings: RegressionSettings = { ...DEFAULT_REGRESSION_SETTINGS };
      try {
        const sRes = await this.client.get<any>(`/api/projects/${encodeURIComponent(p.id)}/settings`);
        if (sRes) {
          settings = mapBackendSettings(sRes);
        }
      } catch {}

      mappedProjects.push({
        id: p.id,
        name: p.name,
        description: p.description || '',
        defaultDatasetId: p.default_dataset_id || undefined,
        baselineVersionId: p.baseline_version_id || 'ver-v1-4',
        candidateVersionId: p.candidate_version_id || 'ver-v1-5',
        regressionSettings: settings,
        createdAt: p.created_at || p.createdAt || new Date().toISOString(),
        updatedAt: p.updated_at || p.updatedAt || new Date().toISOString(),
      });
    }

    return mappedProjects;
  }

  async getProjectById(id: string): Promise<Project | null> {
    try {
      const res = await this.client.get<any>(`/api/projects/${encodeURIComponent(id)}`);
      const p = res?.project || res;
      if (!p || !p.id) return null;

      let settings: RegressionSettings = { ...DEFAULT_REGRESSION_SETTINGS };
      try {
        const sRes = await this.client.get<any>(`/api/projects/${encodeURIComponent(p.id)}/settings`);
        if (sRes) {
          settings = mapBackendSettings(sRes);
        }
      } catch {}

      return {
        id: p.id,
        name: p.name,
        description: p.description || '',
        defaultDatasetId: p.default_dataset_id || undefined,
        baselineVersionId: p.baseline_version_id || 'ver-v1-4',
        candidateVersionId: p.candidate_version_id || 'ver-v1-5',
        regressionSettings: settings,
        createdAt: p.created_at || p.createdAt || new Date().toISOString(),
        updatedAt: p.updated_at || p.updatedAt || new Date().toISOString(),
      };
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  async saveProject(project: Project): Promise<void> {
    let exists = false;
    try {
      await this.client.put(`/api/projects/${encodeURIComponent(project.id)}`, {
        name: project.name,
        description: project.description,
      });
      exists = true;
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 404) {
        exists = false;
      } else {
        throw err;
      }
    }

    if (!exists) {
      await this.client.post('/api/projects', {
        id: project.id,
        name: project.name,
        description: project.description,
      });
    }

    if (project.regressionSettings) {
      await this.saveProjectSettings(project.id, project.regressionSettings);
    }
  }

  async deleteProject(id: string): Promise<void> {
    await this.client.delete(`/api/projects/${encodeURIComponent(id)}`);
  }

  // ── Datasets ──────────────────────────────────────────────
  async getDatasets(projectId?: string): Promise<Dataset[]> {
    const params = projectId ? { projectId } : undefined;
    const res = await this.client.get<{ datasets: any[] }>('/api/datasets', params);
    const rawDatasets = Array.isArray(res?.datasets) ? res.datasets : [];

    const datasetsWithCases = await Promise.all(
      rawDatasets.map(async (d) => {
        let cases: TestCase[] = [];
        try {
          const caseRes = await this.client.get<{ cases: any[] }>(`/api/datasets/${encodeURIComponent(d.id)}/cases`);
          if (Array.isArray(caseRes?.cases)) {
            cases = caseRes.cases.map(mapBackendTestCase);
          }
        } catch {}
        return mapBackendDataset(d, cases);
      })
    );

    return datasetsWithCases;
  }

  async getDatasetById(id: string): Promise<Dataset | null> {
    try {
      const res = await this.client.get<any>(`/api/datasets/${encodeURIComponent(id)}`);
      const d = res?.dataset || res;
      if (!d || !d.id) return null;

      let cases: TestCase[] = [];
      try {
        const caseRes = await this.client.get<{ cases: any[] }>(`/api/datasets/${encodeURIComponent(id)}/cases`);
        if (Array.isArray(caseRes?.cases)) {
          cases = caseRes.cases.map(mapBackendTestCase);
        }
      } catch {}

      return mapBackendDataset(d, cases);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  async saveDataset(dataset: Dataset): Promise<void> {
    let exists = false;
    try {
      await this.client.put(`/api/datasets/${encodeURIComponent(dataset.id)}`, {
        name: dataset.name,
        description: dataset.description,
      });
      exists = true;
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 404) {
        exists = false;
      } else {
        throw err;
      }
    }

    if (!exists) {
      await this.client.post('/api/datasets', {
        id: dataset.id,
        projectId: dataset.projectId,
        name: dataset.name,
        description: dataset.description,
      });
    }

    // Synchronize test cases if provided
    if (Array.isArray(dataset.cases)) {
      let existingCases: TestCase[] = [];
      try {
        const existingRes = await this.client.get<{ cases: any[] }>(
          `/api/datasets/${encodeURIComponent(dataset.id)}/cases`
        );
        if (Array.isArray(existingRes?.cases)) {
          existingCases = existingRes.cases.map(mapBackendTestCase);
        }
      } catch {}

      const existingMap = new Map<string, TestCase>(existingCases.map((c) => [c.id, c]));
      const newMap = new Map<string, TestCase>(dataset.cases.map((c) => [c.id, c]));

      // 1. Delete removed cases
      for (const [id] of existingMap) {
        if (!newMap.has(id)) {
          try {
            await this.client.delete(
              `/api/datasets/${encodeURIComponent(dataset.id)}/cases/${encodeURIComponent(id)}`
            );
          } catch {}
        }
      }

      // 2. Insert or update cases
      for (const [id, tc] of newMap) {
        if (existingMap.has(id)) {
          await this.client.put(
            `/api/datasets/${encodeURIComponent(dataset.id)}/cases/${encodeURIComponent(id)}`,
            {
              name: tc.name,
              category: tc.category,
              input: tc.input,
              expectedOutput: tc.expectedOutput,
              evaluatorType: tc.evaluatorType,
              evaluatorConfig: tc.evaluatorConfig,
              severity: tc.severity,
              tags: tc.tags,
              metadata: tc.metadata,
            }
          );
        } else {
          await this.client.post(
            `/api/datasets/${encodeURIComponent(dataset.id)}/cases`,
            {
              id: tc.id,
              name: tc.name,
              category: tc.category,
              input: tc.input,
              expectedOutput: tc.expectedOutput,
              evaluatorType: tc.evaluatorType,
              evaluatorConfig: tc.evaluatorConfig,
              severity: tc.severity,
              tags: tc.tags,
              metadata: tc.metadata,
            }
          );
        }
      }
    }
  }

  async deleteDataset(id: string): Promise<void> {
    await this.client.delete(`/api/datasets/${encodeURIComponent(id)}`);
  }

  // ── Test Cases ────────────────────────────────────────────
  async getTestCases(datasetId: string): Promise<TestCase[]> {
    const res = await this.client.get<{ cases: any[] }>(`/api/datasets/${encodeURIComponent(datasetId)}/cases`);
    return Array.isArray(res?.cases) ? res.cases.map(mapBackendTestCase) : [];
  }

  async saveTestCase(datasetId: string, testCase: TestCase): Promise<void> {
    let exists = false;
    try {
      await this.client.put(
        `/api/datasets/${encodeURIComponent(datasetId)}/cases/${encodeURIComponent(testCase.id)}`,
        {
          name: testCase.name,
          category: testCase.category,
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
          expectedBehavior: testCase.expectedOutput,
          evaluatorType: testCase.evaluatorType,
          evaluatorConfig: testCase.evaluatorConfig,
          severity: testCase.severity,
          tags: testCase.tags,
          metadata: testCase.metadata,
        }
      );
      exists = true;
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 404) {
        exists = false;
      } else {
        throw err;
      }
    }

    if (!exists) {
      await this.client.post(
        `/api/datasets/${encodeURIComponent(datasetId)}/cases`,
        {
          id: testCase.id,
          name: testCase.name,
          category: testCase.category,
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
          expectedBehavior: testCase.expectedOutput,
          evaluatorType: testCase.evaluatorType,
          evaluatorConfig: testCase.evaluatorConfig,
          severity: testCase.severity,
          tags: testCase.tags,
          metadata: testCase.metadata,
        }
      );
    }
  }

  async deleteTestCase(datasetId: string, caseId: string): Promise<void> {
    await this.client.delete(
      `/api/datasets/${encodeURIComponent(datasetId)}/cases/${encodeURIComponent(caseId)}`
    );
  }

  // ── Model Versions ────────────────────────────────────────
  async getVersions(projectId?: string): Promise<ModelVersion[]> {
    const params = projectId ? { projectId } : undefined;
    const res = await this.client.get<{ versions: any[] }>('/api/versions', params);
    return Array.isArray(res?.versions) ? res.versions.map(mapBackendVersion) : [];
  }

  async getVersionById(id: string): Promise<ModelVersion | null> {
    const versions = await this.getVersions();
    return versions.find((v) => v.id === id) || null;
  }

  async saveVersion(version: ModelVersion): Promise<void> {
    let exists = false;
    try {
      await this.client.put(`/api/versions/${encodeURIComponent(version.id)}`, {
        displayName: version.name,
        systemPrompt: version.systemPrompt,
      });
      exists = true;
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 404) {
        exists = false;
      } else {
        throw err;
      }
    }

    if (!exists) {
      await this.client.post('/api/versions', {
        id: version.id,
        projectId: (version as any).projectId || 'proj-checkout-agent',
        provider: version.provider,
        model: version.modelIdentifier,
        displayName: version.name,
        systemPrompt: version.systemPrompt,
      });
    }
  }

  async deleteVersion(id: string): Promise<void> {
    await this.client.delete(`/api/versions/${encodeURIComponent(id)}`);
  }

  // ── Project Settings ──────────────────────────────────────
  async getProjectSettings(projectId: string): Promise<RegressionSettings | null> {
    try {
      const res = await this.client.get<any>(`/api/projects/${encodeURIComponent(projectId)}/settings`);
      return mapBackendSettings(res);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  async saveProjectSettings(projectId: string, settings: RegressionSettings): Promise<void> {
    await this.client.put(`/api/projects/${encodeURIComponent(projectId)}/settings`, {
      minAccuracy: settings.minAccuracyPercent,
      maxDegradation: settings.maxAccuracyDegradationPercent,
      latencyTolerance: settings.maxLatencyIncreasePercent,
    });
  }

  // ── Evaluation Runs ───────────────────────────────────────
  async getEvaluationRuns(projectId?: string): Promise<EvaluationRun[]> {
    const res = await this.client.get<{ runs: EvaluationRun[] }>('/api/evaluations/runs');
    let runs = Array.isArray(res?.runs) ? res.runs : [];

    // Ensure execution mode, metrics, and domain defaults
    runs = runs.map((run) => {
      let mode: 'LIVE' | 'SAVED' | 'REFERENCE' = run.executionMode || 'SAVED';
      if (run.baselineVersion?.provider === 'demo') {
        mode = 'REFERENCE';
      }

      const isReg = Boolean(run.regressionDecision?.isRegression);
      return {
        ...run,
        projectId: run.projectId || projectId || 'proj-checkout-agent',
        datasetId: run.datasetId || 'ds-checkout-golden',
        datasetName: run.datasetName || 'Checkout Reliability Suite',
        executionMode: mode,
        caseResults: Array.isArray(run.caseResults) ? run.caseResults : Array.isArray((run as any).results) ? (run as any).results : [],
        regressionDecision: run.regressionDecision || {
          isRegression: isReg,
          verdict: isReg ? 'REGRESSION_DETECTED' : 'NO_REGRESSION',
          summary: isReg ? 'Regression detected in evaluation' : 'No regressions detected',
          violatedRules: [],
          regressionCategories: [],
        },
        releaseDecision: run.releaseDecision || {
          status: isReg ? 'BLOCK' : 'PASS',
          decidedBy: 'System',
          decidedAt: run.timestamp || new Date().toISOString(),
        },
        metrics: {
          ...(run.metrics || {}),
          totalCases: run.metrics?.totalCases ?? (run.caseResults?.length || 0),
        },
      } as EvaluationRun;
    });

    runs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (projectId) {
      return runs.filter((r) => r.projectId === projectId);
    }
    return runs;
  }

  async getEvaluationRunById(id: string): Promise<EvaluationRun | null> {
    try {
      const res = await this.client.get<EvaluationRun>(`/api/evaluations/runs/${encodeURIComponent(id)}`);
      return res || null;
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  async getEvaluationResults(runId: string): Promise<TestCaseResult[]> {
    const res = await this.client.get<{ results: TestCaseResult[] }>(
      `/api/evaluations/runs/${encodeURIComponent(runId)}/results`
    );
    return Array.isArray(res?.results) ? res.results : [];
  }

  async getEvaluationFailures(runId: string): Promise<TestCaseResult[]> {
    const res = await this.client.get<{ failures: TestCaseResult[] }>(
      `/api/evaluations/runs/${encodeURIComponent(runId)}/failures`
    );
    return Array.isArray(res?.failures) ? res.failures : [];
  }

  async updateReleaseDecision(runId: string, decision: string, justification?: string): Promise<any> {
    return this.client.patch(`/api/evaluations/runs/${encodeURIComponent(runId)}/release-decision`, {
      decision,
      justification,
    });
  }

  async saveEvaluationRun(run: EvaluationRun): Promise<void> {
    if (run.releaseDecision?.status) {
      await this.updateReleaseDecision(run.id, run.releaseDecision.status, run.releaseDecision.reason);
    }
  }

  async deleteEvaluationRun(id: string): Promise<void> {
    await this.client.delete(`/api/evaluations/runs/${encodeURIComponent(id)}`);
  }

  // ── Active Project & UI Preferences ───────────────────────
  getActiveProjectId(): string {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(STORAGE_KEYS.ACTIVE_PROJECT_ID) || 'proj-checkout-agent';
    }
    return 'proj-checkout-agent';
  }

  setActiveProjectId(id: string): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, id);
    }
  }

  getStoreRawOutputs(): boolean {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(STORAGE_KEYS.PRIVACY_STORE_RAW_OUTPUTS) !== 'false';
    }
    return true;
  }

  setStoreRawOutputs(enabled: boolean): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.PRIVACY_STORE_RAW_OUTPUTS, enabled ? 'true' : 'false');
    }
  }

  // ── Demo Reset ────────────────────────────────────────────
  async resetToSeedData(): Promise<void> {
    try {
      await this.client.post('/api/seed/reset');
    } catch {
      try {
        await this.client.post('/api/reset');
      } catch {}
    }
  }
}

export const apiRepository = new ApiRepository();
