/* ============================================================
   RELIQ — Central Application Store (Zustand)
   
   Manages global workspace state: projects, datasets, versions,
   evaluation runs, active selections, and interactive filters.
   Eliminates prop-drilling across ReliqApp views.
   ============================================================ */

import { create } from 'zustand';
import {
  Dataset,
  EvaluationRun,
  ModelVersion,
  Project,
  RegressionSettings,
  ReleaseDecisionStatus,
} from '../domain/types';
import { apiRepository as repository } from '../services/apiRepository';

export type RegressionViewFilter = 'ALL' | 'REGRESSION' | 'FAILURE' | 'RECOVERED';

interface AppStoreState {
  // Data
  isLoading: boolean;
  error: string | null;
  projects: Project[];
  activeProjectId: string;
  datasets: Dataset[];
  activeDatasetId: string;
  versions: ModelVersion[];
  evaluationRuns: EvaluationRun[];
  activeRunId: string;

  // Global Interactive Filters
  regressionFilter: RegressionViewFilter;
  categoryFilter: string;
  searchQuery: string;

  // Computed / Helpers
  getActiveProject: () => Project | null;
  getActiveDataset: () => Dataset | null;
  getActiveRun: () => EvaluationRun | null;

  // Actions
  loadData: () => Promise<void>;
  selectProject: (projectId: string) => Promise<void>;
  saveProject: (project: Project) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;

  selectDataset: (datasetId: string) => void;
  saveDataset: (dataset: Dataset) => Promise<void>;
  deleteDataset: (datasetId: string) => Promise<void>;

  selectRun: (runId: string) => void;
  saveRun: (run: EvaluationRun) => Promise<void>;
  deleteRun: (runId: string) => Promise<void>;

  updateReleaseDecision: (status: ReleaseDecisionStatus, reason: string) => Promise<void>;
  saveSettings: (settings: RegressionSettings) => Promise<void>;
  resetSeedData: () => Promise<void>;

  setRegressionFilter: (filter: RegressionViewFilter) => void;
  setCategoryFilter: (category: string) => void;
  setSearchQuery: (query: string) => void;
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  isLoading: true,
  error: null,
  projects: [],
  activeProjectId: '',
  datasets: [],
  activeDatasetId: '',
  versions: [],
  evaluationRuns: [],
  activeRunId: '',

  regressionFilter: 'ALL',
  categoryFilter: 'ALL',
  searchQuery: '',

  getActiveProject: () => {
    const { projects, activeProjectId } = get();
    return projects.find((p) => p.id === activeProjectId) || projects[0] || null;
  },

  getActiveDataset: () => {
    const { datasets, activeDatasetId } = get();
    return datasets.find((d) => d.id === activeDatasetId) || datasets[0] || null;
  },

  getActiveRun: () => {
    const { evaluationRuns, activeRunId } = get();
    return evaluationRuns.find((r) => r.id === activeRunId) || evaluationRuns[0] || null;
  },

  loadData: async () => {
    set({ isLoading: true, error: null });
    try {
      const projs = await repository.getProjects();
      const currentActiveId = projs[0]?.id || '';
      const dsets = await repository.getDatasets(currentActiveId);
      const vers = await repository.getVersions();
      const runs = await repository.getEvaluationRuns(currentActiveId);

      set({
        projects: projs,
        activeProjectId: currentActiveId,
        datasets: dsets,
        activeDatasetId: dsets[0]?.id || '',
        versions: vers,
        evaluationRuns: runs,
        activeRunId: runs[0]?.id || '',
        isLoading: false,
      });
    } catch (err: any) {
      console.error('Failed to load RELIQ store data:', err);
      set({ error: err?.message || 'Failed to initialize workspace data', isLoading: false });
    }
  },

  selectProject: async (projectId: string) => {
    set({ activeProjectId: projectId });
    try {
      const dsets = await repository.getDatasets(projectId);
      const runs = await repository.getEvaluationRuns(projectId);
      set({
        datasets: dsets,
        activeDatasetId: dsets[0]?.id || '',
        evaluationRuns: runs,
        activeRunId: runs[0]?.id || '',
      });
    } catch (err) {
      console.error('Failed to switch project:', err);
    }
  },

  saveProject: async (project: Project) => {
    await repository.saveProject(project);
    const projs = await repository.getProjects();
    set({ projects: projs });
  },

  deleteProject: async (projectId: string) => {
    await repository.deleteProject(projectId);
    const projs = await repository.getProjects();
    const remainingId = projs[0]?.id || '';
    set({ projects: projs });
    if (get().activeProjectId === projectId && remainingId) {
      await get().selectProject(remainingId);
    }
  },

  selectDataset: (datasetId: string) => {
    set({ activeDatasetId: datasetId });
  },

  saveDataset: async (dataset: Dataset) => {
    await repository.saveDataset(dataset);
    const dsets = await repository.getDatasets(get().activeProjectId);
    set({ datasets: dsets });
  },

  deleteDataset: async (datasetId: string) => {
    await repository.deleteDataset(datasetId);
    const dsets = await repository.getDatasets(get().activeProjectId);
    const nextActiveId = dsets[0]?.id || '';
    set({
      datasets: dsets,
      activeDatasetId: get().activeDatasetId === datasetId ? nextActiveId : get().activeDatasetId,
    });
  },

  selectRun: (runId: string) => {
    set({ activeRunId: runId });
  },

  saveRun: async (run: EvaluationRun) => {
    await repository.saveEvaluationRun(run);
    const runs = await repository.getEvaluationRuns(get().activeProjectId);
    set({
      evaluationRuns: runs,
      activeRunId: run.id,
    });
  },

  deleteRun: async (runId: string) => {
    await repository.deleteEvaluationRun(runId);
    const runs = await repository.getEvaluationRuns(get().activeProjectId);
    const nextActiveId = runs[0]?.id || '';
    set({
      evaluationRuns: runs,
      activeRunId: get().activeRunId === runId ? nextActiveId : get().activeRunId,
    });
  },

  updateReleaseDecision: async (status: ReleaseDecisionStatus, reason: string) => {
    const activeRun = get().getActiveRun();
    if (!activeRun) return;

    await repository.updateReleaseDecision(activeRun.id, status, reason);
    const runs = await repository.getEvaluationRuns(get().activeProjectId);
    set({ evaluationRuns: runs });
  },

  saveSettings: async (settings: RegressionSettings) => {
    const activeProj = get().getActiveProject();
    if (!activeProj) return;

    await repository.saveProjectSettings(activeProj.id, settings);
    const projs = await repository.getProjects();
    set({ projects: projs });
  },

  resetSeedData: async () => {
    await repository.resetToSeedData();
    await get().loadData();
  },

  setRegressionFilter: (filter: RegressionViewFilter) => set({ regressionFilter: filter }),
  setCategoryFilter: (category: string) => set({ categoryFilter: category }),
  setSearchQuery: (query: string) => set({ searchQuery: query }),
}));
