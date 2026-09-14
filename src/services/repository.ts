/* ============================================================
   RELIQ — Storage Repository Interface
   
   Decouples data persistence from the UI and evaluation engine.
   Enables swapping LocalStorage with PostgreSQL / Supabase.
   ============================================================ */

import { Dataset, EvaluationRun, ModelVersion, Project } from '../domain/types';

export interface StorageRepository {
  // Projects
  getProjects: () => Promise<Project[]>;
  getProjectById: (id: string) => Promise<Project | null>;
  saveProject: (project: Project) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  // Datasets
  getDatasets: (projectId?: string) => Promise<Dataset[]>;
  getDatasetById: (id: string) => Promise<Dataset | null>;
  saveDataset: (dataset: Dataset) => Promise<void>;
  deleteDataset: (id: string) => Promise<void>;

  // Versions
  getVersions: () => Promise<ModelVersion[]>;
  getVersionById: (id: string) => Promise<ModelVersion | null>;
  saveVersion: (version: ModelVersion) => Promise<void>;

  // Evaluation Runs
  getEvaluationRuns: (projectId?: string) => Promise<EvaluationRun[]>;
  getEvaluationRunById: (id: string) => Promise<EvaluationRun | null>;
  saveEvaluationRun: (run: EvaluationRun) => Promise<void>;
  deleteEvaluationRun: (id: string) => Promise<void>;

  // Demo Reset
  resetToSeedData: () => Promise<void>;
}
