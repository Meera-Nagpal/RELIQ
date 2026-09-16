/* ============================================================
   RELIQ — Storage Repository Interface
   
   Decouples data persistence from the UI and evaluation engine.
   Enables swapping LocalStorage with REST API / PostgreSQL.
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

  // Test Cases
  getTestCases?: (datasetId: string) => Promise<TestCase[]>;
  saveTestCase?: (datasetId: string, testCase: TestCase) => Promise<void>;
  deleteTestCase?: (datasetId: string, caseId: string) => Promise<void>;

  // Versions
  getVersions: (projectId?: string) => Promise<ModelVersion[]>;
  getVersionById: (id: string) => Promise<ModelVersion | null>;
  saveVersion: (version: ModelVersion) => Promise<void>;
  deleteVersion?: (id: string) => Promise<void>;

  // Project Settings
  getProjectSettings?: (projectId: string) => Promise<RegressionSettings | null>;
  saveProjectSettings?: (projectId: string, settings: RegressionSettings) => Promise<void>;

  // Evaluation Runs
  getEvaluationRuns: (projectId?: string) => Promise<EvaluationRun[]>;
  getEvaluationRunById: (id: string) => Promise<EvaluationRun | null>;
  saveEvaluationRun: (run: EvaluationRun) => Promise<void>;
  deleteEvaluationRun: (id: string) => Promise<void>;
  getEvaluationResults?: (runId: string) => Promise<TestCaseResult[]>;
  getEvaluationFailures?: (runId: string) => Promise<TestCaseResult[]>;
  updateReleaseDecision?: (runId: string, decision: string, justification?: string) => Promise<any>;

  // Active Project & UI Preferences
  getActiveProjectId?: () => string;
  setActiveProjectId?: (id: string) => void;
  getStoreRawOutputs?: () => boolean;
  setStoreRawOutputs?: (enabled: boolean) => void;

  // Demo Reset
  resetToSeedData: () => Promise<void>;
}
