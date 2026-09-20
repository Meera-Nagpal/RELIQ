/* ============================================================
   RELIQ — LocalStorage Repository Implementation
   
   Implements StorageRepository with browser local storage and
   automatic seeding of golden demo data on initial launch.
   ============================================================ */

import { Dataset, EvaluationRun, ModelVersion, Project } from '../domain/types';
import {
  SEED_BASELINE_VERSION,
  SEED_CANDIDATE_VERSION,
  SEED_DATASET,
  SEED_DATASET_100,
  SEED_DATASET_500,
  SEED_DATASET_1000,
  SEED_GOLDEN_RUN,
  REAL_BENCHMARK_RUN,
  REAL_GROQ_BENCHMARK_RUN,
  SEED_PROJECT,
} from '../data/seedData';
import { StorageRepository } from './repository';

const STORAGE_KEYS = {
  PROJECTS: 'reliq_projects_v2',
  DATASETS: 'reliq_datasets_v2',
  VERSIONS: 'reliq_versions_v2',
  RUNS: 'reliq_runs_v2',
  ACTIVE_PROJECT_ID: 'reliq_active_project_id_v2',
  PRIVACY_STORE_RAW_OUTPUTS: 'reliq_privacy_store_raw_outputs',
};

export class LocalStorageRepository implements StorageRepository {
  private ensureInitialized() {
    if (!localStorage.getItem(STORAGE_KEYS.PROJECTS)) {
      this.initSeedData();
    }
  }

  private initSeedData() {
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify([SEED_PROJECT]));
    localStorage.setItem(
      STORAGE_KEYS.DATASETS,
      JSON.stringify([SEED_DATASET, SEED_DATASET_100, SEED_DATASET_500, SEED_DATASET_1000])
    );
    localStorage.setItem(
      STORAGE_KEYS.VERSIONS,
      JSON.stringify([SEED_BASELINE_VERSION, SEED_CANDIDATE_VERSION])
    );
    localStorage.setItem(
      STORAGE_KEYS.RUNS,
      JSON.stringify([REAL_GROQ_BENCHMARK_RUN, REAL_BENCHMARK_RUN, SEED_GOLDEN_RUN])
    );
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, SEED_PROJECT.id);
  }

  async resetToSeedData(): Promise<void> {
    this.initSeedData();
  }

  // ── Projects ──────────────────────────────────────────────
  async getProjects(): Promise<Project[]> {
    this.ensureInitialized();
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      return data ? JSON.parse(data) : [SEED_PROJECT];
    } catch {
      return [SEED_PROJECT];
    }
  }

  async getProjectById(id: string): Promise<Project | null> {
    const projects = await this.getProjects();
    return projects.find((p) => p.id === id) || null;
  }

  async saveProject(project: Project): Promise<void> {
    const projects = await this.getProjects();
    const idx = projects.findIndex((p) => p.id === project.id);
    if (idx >= 0) {
      projects[idx] = { ...project, updatedAt: new Date().toISOString() };
    } else {
      projects.push({ ...project, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
  }

  async deleteProject(id: string): Promise<void> {
    const projects = await this.getProjects();
    const filtered = projects.filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(filtered));
  }

  // ── Datasets ──────────────────────────────────────────────
  async getDatasets(projectId?: string): Promise<Dataset[]> {
    this.ensureInitialized();
    const defaultDatasets = [SEED_DATASET, SEED_DATASET_100, SEED_DATASET_500, SEED_DATASET_1000];
    try {
      const data = localStorage.getItem(STORAGE_KEYS.DATASETS);
      const datasets: Dataset[] = data ? JSON.parse(data) : defaultDatasets;
      if (projectId) {
        return datasets.filter((d) => d.projectId === projectId);
      }
      return datasets;
    } catch {
      return defaultDatasets;
    }
  }

  async getDatasetById(id: string): Promise<Dataset | null> {
    const datasets = await this.getDatasets();
    return datasets.find((d) => d.id === id) || null;
  }

  async saveDataset(dataset: Dataset): Promise<void> {
    const datasets = await this.getDatasets();
    const idx = datasets.findIndex((d) => d.id === dataset.id);
    if (idx >= 0) {
      datasets[idx] = { ...dataset, updatedAt: new Date().toISOString() };
    } else {
      datasets.push({ ...dataset, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    localStorage.setItem(STORAGE_KEYS.DATASETS, JSON.stringify(datasets));
  }

  async deleteDataset(id: string): Promise<void> {
    const datasets = await this.getDatasets();
    const filtered = datasets.filter((d) => d.id !== id);
    localStorage.setItem(STORAGE_KEYS.DATASETS, JSON.stringify(filtered));
  }

  // ── Versions ──────────────────────────────────────────────
  async getVersions(): Promise<ModelVersion[]> {
    this.ensureInitialized();
    try {
      const data = localStorage.getItem(STORAGE_KEYS.VERSIONS);
      return data ? JSON.parse(data) : [SEED_BASELINE_VERSION, SEED_CANDIDATE_VERSION];
    } catch {
      return [SEED_BASELINE_VERSION, SEED_CANDIDATE_VERSION];
    }
  }

  async getVersionById(id: string): Promise<ModelVersion | null> {
    const versions = await this.getVersions();
    return versions.find((v) => v.id === id) || null;
  }

  async saveVersion(version: ModelVersion): Promise<void> {
    const versions = await this.getVersions();
    const idx = versions.findIndex((v) => v.id === version.id);
    if (idx >= 0) {
      versions[idx] = version;
    } else {
      versions.push(version);
    }
    localStorage.setItem(STORAGE_KEYS.VERSIONS, JSON.stringify(versions));
  }

  private activeSessionLiveRunIds: Set<string> = new Set();

  markLiveRun(runId: string): void {
    this.activeSessionLiveRunIds.add(runId);
  }

  isLiveRun(runId: string): boolean {
    return this.activeSessionLiveRunIds.has(runId);
  }

  // ── Evaluation Runs ───────────────────────────────────────
  async getEvaluationRuns(projectId?: string): Promise<EvaluationRun[]> {
    this.ensureInitialized();
    try {
      // Synchronize with server-persisted runs if available
      try {
        if (typeof fetch !== 'undefined') {
          const res = await fetch('/api/evaluations/runs');
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.runs) && data.runs.length > 0) {
              const currentRaw = localStorage.getItem(STORAGE_KEYS.RUNS);
              const existingRuns: EvaluationRun[] = currentRaw ? JSON.parse(currentRaw) : [];
              for (const serverRun of data.runs) {
                const idx = existingRuns.findIndex((r) => r.id === serverRun.id);
                if (idx >= 0) {
                  existingRuns[idx] = serverRun;
                } else {
                  existingRuns.push(serverRun);
                }
              }
              localStorage.setItem(STORAGE_KEYS.RUNS, JSON.stringify(existingRuns));
            }
          }
        }
      } catch {}

      const data = localStorage.getItem(STORAGE_KEYS.RUNS);
      let runs: EvaluationRun[] = data
        ? JSON.parse(data)
        : [REAL_GROQ_BENCHMARK_RUN, REAL_BENCHMARK_RUN, SEED_GOLDEN_RUN];

      if (!runs.some((r) => r.id === REAL_GROQ_BENCHMARK_RUN.id)) {
        runs.unshift(REAL_GROQ_BENCHMARK_RUN);
        try {
          localStorage.setItem(STORAGE_KEYS.RUNS, JSON.stringify(runs));
        } catch {}
      }

      // Enforce strict execution mode labeling
      runs = runs.map((run) => {
        let mode: 'LIVE' | 'SAVED' | 'REFERENCE';
        if (this.activeSessionLiveRunIds.has(run.id)) {
          mode = 'LIVE';
        } else if (
          run.id === SEED_GOLDEN_RUN.id ||
          run.id === REAL_BENCHMARK_RUN.id ||
          run.baselineVersion?.provider === 'demo'
        ) {
          mode = 'REFERENCE';
        } else {
          mode = 'SAVED';
        }

        const totalCases = run.metrics?.totalCases ?? (run.caseResults?.length || 0);
        const hasData = totalCases > 0 && (run.metrics?.candidateAccuracy != null || run.metrics?.candidateQualityScore != null);
        const isReg = hasData && Boolean(run.regressionDecision?.isRegression);
        const updatedRun: EvaluationRun = {
          ...run,
          projectId: run.projectId || projectId || 'proj-checkout-agent',
          datasetId: run.datasetId || 'ds-checkout-golden',
          datasetName: run.datasetName || 'Checkout Reliability Suite',
          executionMode: mode,
          caseResults: Array.isArray(run.caseResults) ? run.caseResults : Array.isArray((run as any).results) ? (run as any).results : [],
          regressionDecision: run.regressionDecision || {
            isRegression: isReg,
            verdict: !hasData ? 'INSUFFICIENT_EVIDENCE' : isReg ? 'REGRESSION_DETECTED' : 'NO_REGRESSION',
            summary: !hasData ? 'No completed evaluation data' : isReg ? 'Regression detected in evaluation' : 'No regressions detected',
            violatedRules: [],
            regressionCategories: [],
          },
          releaseDecision: run.releaseDecision || {
            status: !hasData ? 'INSUFFICIENT_EVIDENCE' : isReg ? 'BLOCK' : 'PASS',
            decidedBy: 'System',
            decidedAt: run.timestamp || new Date().toISOString(),
          },
          metrics: {
            ...(run.metrics || {}),
            totalCases: totalCases,
            sampleSize: run.metrics?.sampleSize ?? totalCases,
            evidenceStrength: run.metrics?.evidenceStrength || 'LOW',
            baselinePassed: run.metrics?.baselinePassed ?? 0,
            candidatePassed: run.metrics?.candidatePassed ?? 0,
            baselineAccuracy: run.metrics?.baselineAccuracy ?? null,
            candidateAccuracy: run.metrics?.candidateAccuracy ?? null,
            accuracyDelta: run.metrics?.accuracyDelta ?? null,
            baselineEvaluatedCases: run.metrics?.baselineEvaluatedCases ?? 0,
            candidateEvaluatedCases: run.metrics?.candidateEvaluatedCases ?? 0,
            baselineEvaluationCoverage: run.metrics?.baselineEvaluationCoverage ?? 0,
            candidateEvaluationCoverage: run.metrics?.candidateEvaluationCoverage ?? 0,
            baselinePassRate: run.metrics?.baselinePassRate ?? null,
            candidatePassRate: run.metrics?.candidatePassRate ?? null,
            baselineQualityScore: run.metrics?.baselineQualityScore ?? null,
            candidateQualityScore: run.metrics?.candidateQualityScore ?? null,
            qualityScoreDelta: run.metrics?.qualityScoreDelta ?? null,
            baselineMeanSuccessfulLatencyMs: run.metrics?.baselineMeanSuccessfulLatencyMs ?? null,
            candidateMeanSuccessfulLatencyMs: run.metrics?.candidateMeanSuccessfulLatencyMs ?? null,
            baselineMedianLatencyMs: run.metrics?.baselineMedianLatencyMs ?? null,
            candidateMedianLatencyMs: run.metrics?.candidateMedianLatencyMs ?? null,
            baselineP95LatencyMs: run.metrics?.baselineP95LatencyMs ?? null,
            candidateP95LatencyMs: run.metrics?.candidateP95LatencyMs ?? null,
            baselineAvgLatencyMs: run.metrics?.baselineAvgLatencyMs ?? null,
            candidateAvgLatencyMs: run.metrics?.candidateAvgLatencyMs ?? null,
            latencyDeltaPercent: run.metrics?.latencyDeltaPercent ?? null,
            baselineEstimatedCost: run.metrics?.baselineEstimatedCost ?? null,
            candidateEstimatedCost: run.metrics?.candidateEstimatedCost ?? null,
            regressedCasesCount: run.metrics?.regressedCasesCount ?? 0,
            improvedCasesCount: run.metrics?.improvedCasesCount ?? 0,
          } as any,
          baselineVersion: run.baselineVersion || {
            id: 'ver-base',
            name: 'Production Baseline',
            provider: 'cerebras',
            modelIdentifier: 'gpt-oss-120b',
          },
          candidateVersion: run.candidateVersion || {
            id: 'ver-cand',
            name: 'Candidate Release',
            provider: 'groq',
            modelIdentifier: 'openai/gpt-oss-20b',
          },
        };
        if (updatedRun.comparisonReport) {
          updatedRun.comparisonReport.executionMode = mode;
        }
        return updatedRun;
      });

      // Always sort by actual creation/completion timestamp descending
      runs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      if (projectId) {
        return runs.filter((r) => r.projectId === projectId);
      }
      return runs;
    } catch {
      return [REAL_GROQ_BENCHMARK_RUN, REAL_BENCHMARK_RUN, SEED_GOLDEN_RUN];
    }
  }

  async getEvaluationRunById(id: string): Promise<EvaluationRun | null> {
    try {
      if (typeof fetch !== 'undefined') {
        const res = await fetch(`/api/evaluations/runs/${encodeURIComponent(id)}`);
        if (res.ok) {
          const serverRun = await res.json();
          if (serverRun && serverRun.id) {
            return serverRun;
          }
        }
      }
    } catch {}

    const runs = await this.getEvaluationRuns();
    return runs.find((r) => r.id === id) || null;
  }

  getStoreRawOutputs(): boolean {
    const val = localStorage.getItem(STORAGE_KEYS.PRIVACY_STORE_RAW_OUTPUTS);
    return val !== 'false';
  }

  setStoreRawOutputs(enabled: boolean): void {
    localStorage.setItem(STORAGE_KEYS.PRIVACY_STORE_RAW_OUTPUTS, enabled ? 'true' : 'false');
  }

  async saveEvaluationRun(run: EvaluationRun): Promise<void> {
    if (run.executionMode === 'LIVE') {
      this.activeSessionLiveRunIds.add(run.id);
    }

    let runToSave = run;
    if (!this.getStoreRawOutputs()) {
      runToSave = {
        ...run,
        caseResults: run.caseResults.map((c) => ({
          ...c,
          baselineOutput: '[Redacted: Raw Prompt/Output Storage Disabled]',
          candidateOutput: '[Redacted: Raw Prompt/Output Storage Disabled]',
          baselineUsage: c.baselineUsage ? { ...c.baselineUsage, rawResponse: undefined } : undefined,
          candidateUsage: c.candidateUsage ? { ...c.candidateUsage, rawResponse: undefined } : undefined,
        })),
      };
    }

    const runs = await this.getEvaluationRuns();
    const idx = runs.findIndex((r) => r.id === runToSave.id);
    if (idx >= 0) {
      runs[idx] = runToSave;
    } else {
      runs.unshift(runToSave);
    }
    localStorage.setItem(STORAGE_KEYS.RUNS, JSON.stringify(runs));
  }

  async deleteEvaluationRun(id: string): Promise<void> {
    this.activeSessionLiveRunIds.delete(id);
    const runs = await this.getEvaluationRuns();
    const filtered = runs.filter((r) => r.id !== id);
    localStorage.setItem(STORAGE_KEYS.RUNS, JSON.stringify(filtered));
  }

  // Active Project ID helper
  getActiveProjectId(): string {
    this.ensureInitialized();
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_PROJECT_ID) || SEED_PROJECT.id;
  }

  setActiveProjectId(id: string): void {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, id);
  }
}

export const localRepository = new LocalStorageRepository();
