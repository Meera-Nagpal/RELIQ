/* ============================================================
   RELIQ — Application Workspace Container (/app/*)
   
   Wires together:
   - Persistence repository
   - AppNav sidebar
   - AppHeader bar
   - Dedicated views for Dashboard, Projects, Datasets,
     Evaluations, Regressions, and Settings.
   ============================================================ */

import React, { useEffect, useState } from 'react';
import {
  Dataset,
  EvaluationRun,
  ModelVersion,
  Project,
  RegressionSettings,
  ReleaseDecisionStatus,
} from '../domain/types';
import { useRouter } from '../router/useRouter';
import { apiRepository as repository } from '../services/apiRepository';
import { AppHeader } from './components/AppHeader';
import { AppNav } from './components/AppNav';
import { ErrorBoundary } from './components/ErrorBoundary';

// Views
import { DashboardView } from './views/DashboardView';
import { DatasetsView } from './views/DatasetsView';
import { EvaluationsView } from './views/EvaluationsView';
import { ProjectsView } from './views/ProjectsView';
import { RegressionsView } from './views/RegressionsView';
import { SettingsView } from './views/SettingsView';

export const ReliqApp: React.FC = () => {
  const { appView, navigate } = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [activeDatasetId, setActiveDatasetId] = useState<string>('');
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [evaluationRuns, setEvaluationRuns] = useState<EvaluationRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string>('');

  // Initial load from storage
  const loadData = async () => {
    try {
      setLoadError(null);
      const projs = await repository.getProjects();
      const storedActiveId = repository.getActiveProjectId();
      const validActiveProject = projs.find((p) => p.id === storedActiveId);
      const currentActiveId = validActiveProject ? validActiveProject.id : (projs[0]?.id || '');
      if (currentActiveId) {
        repository.setActiveProjectId(currentActiveId);
      }
      const dsets = await repository.getDatasets(currentActiveId);
      const vers = await repository.getVersions();
      const runs = await repository.getEvaluationRuns(currentActiveId);

      setProjects(projs);
      setActiveProjectId(currentActiveId);
      setDatasets(dsets);
      setActiveDatasetId(dsets[0]?.id || '');
      setVersions(vers);
      setEvaluationRuns(runs);
      setActiveRunId(runs[0]?.id || '');
      setIsLoading(false);
    } catch (err: any) {
      console.error('Failed to load RELIQ repository data:', err);
      setLoadError(err.message || 'Failed to connect to backend service');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0] || null;
  const activeDataset = datasets.find((d) => d.id === activeDatasetId) || datasets[0] || null;
  const activeRun = evaluationRuns.find((r) => r.id === activeRunId) || evaluationRuns[0] || null;

  // Project Switch
  const handleSelectProject = async (projectId: string) => {
    repository.setActiveProjectId(projectId);
    setActiveProjectId(projectId);
    const dsets = await repository.getDatasets(projectId);
    const runs = await repository.getEvaluationRuns(projectId);
    setDatasets(dsets);
    setActiveDatasetId(dsets[0]?.id || '');
    setEvaluationRuns(runs);
    setActiveRunId(runs[0]?.id || '');
  };

  const handleSaveProject = async (project: Project) => {
    await repository.saveProject(project);
    const projs = await repository.getProjects();
    setProjects(projs);
  };

  const handleDeleteProject = async (projectId: string) => {
    await repository.deleteProject(projectId);
    const projs = await repository.getProjects();
    setProjects(projs);
    if (activeProjectId === projectId && projs[0]) {
      handleSelectProject(projs[0].id);
    }
  };

  // Datasets
  const handleSaveDataset = async (dataset: Dataset) => {
    await repository.saveDataset(dataset);
    const dsets = await repository.getDatasets(activeProjectId);
    setDatasets(dsets);
  };

  const handleDeleteDataset = async (datasetId: string) => {
    await repository.deleteDataset(datasetId);
    const dsets = await repository.getDatasets(activeProjectId);
    setDatasets(dsets);
    if (activeDatasetId === datasetId && dsets[0]) {
      setActiveDatasetId(dsets[0].id);
    }
  };

  // Evaluation Runs
  const handleSaveRun = async (run: EvaluationRun) => {
    await repository.saveEvaluationRun(run);
    const runs = await repository.getEvaluationRuns(activeProjectId);
    setEvaluationRuns(runs);
    setActiveRunId(run.id);
  };

  const handleDeleteRun = async (runId: string) => {
    try {
      await repository.deleteEvaluationRun(runId);
      const runs = await repository.getEvaluationRuns(activeProjectId);
      setEvaluationRuns(runs);
      if (activeRunId === runId && runs[0]) {
        setActiveRunId(runs[0].id);
      }
    } catch (err: any) {
      alert(`Failed to delete evaluation run: ${err.message}`);
    }
  };

  // Settings
  const handleSaveSettings = async (settings: RegressionSettings) => {
    if (!activeProject) return;
    if (repository.saveProjectSettings) {
      await repository.saveProjectSettings(activeProject.id, settings);
    }
    const updated = { ...activeProject, regressionSettings: settings };
    await repository.saveProject(updated);
    const projs = await repository.getProjects();
    setProjects(projs);
  };

  // Release Decision
  const handleUpdateReleaseDecision = async (status: ReleaseDecisionStatus, reason: string) => {
    if (!activeRun) return;
    try {
      if (repository.updateReleaseDecision) {
        await repository.updateReleaseDecision(activeRun.id, status, reason);
      }
      const updatedRun: EvaluationRun = {
        ...activeRun,
        releaseDecision: {
          status,
          decidedBy: 'Supervisor / Release Engineer',
          decidedAt: new Date().toISOString(),
          reason,
        },
      };
      await handleSaveRun(updatedRun);
    } catch (err: any) {
      alert(`Failed to update release decision: ${err.message}`);
      throw err;
    }
  };

  const handleResetSeedData = async () => {
    await repository.resetToSeedData();
    await loadData();
  };

  if (isLoading) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          background: '#0D1117',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#888888',
          fontFamily: 'sans-serif',
        }}
      >
        Initializing RELIQ Workspace...
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          background: '#0D1117',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FF6B35',
          fontFamily: 'sans-serif',
          gap: '1rem',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '2.5rem' }}>⚠️</div>
        <h2 style={{ color: '#FFFFFF', margin: 0 }}>Backend Service Unavailable</h2>
        <p style={{ color: '#8899AA', maxWidth: '480px', margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>
          {loadError}. Please ensure the RELIQ backend service is running on port 3001.
        </p>
        <button
          onClick={() => {
            setIsLoading(true);
            loadData();
          }}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#FFFFFF',
            padding: '0.6rem 1.4rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem',
            marginTop: '0.5rem',
          }}
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        width: '100vw',
        height: '100vh',
        background: '#0D1117',
        color: '#FFFFFF',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        overflow: 'hidden',
      }}
    >
      {/* Sidebar Navigation */}
      <AppNav
        currentView={appView}
        regressionCount={activeRun?.metrics?.regressedCasesCount ?? 0}
      />

      {/* Main Workspace Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        {/* Top Header */}
        <AppHeader
          projects={projects}
          activeProject={activeProject}
          onSelectProject={handleSelectProject}
          onCreateProjectClick={() => navigate('#/app/projects')}
          activeRun={activeRun}
          isRegressionDetected={activeRun?.regressionDecision?.isRegression}
        />

        {/* Viewport Content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '2rem', boxSizing: 'border-box' }}>
          <ErrorBoundary>
          {appView === 'dashboard' && activeProject && (
            <DashboardView
              project={activeProject}
              latestRun={activeRun}
              evaluationRuns={evaluationRuns}
            />
          )}

          {appView === 'projects' && (
            <ProjectsView
              projects={projects}
              activeProject={activeProject}
              onSelectProject={handleSelectProject}
              onSaveProject={handleSaveProject}
              onDeleteProject={handleDeleteProject}
            />
          )}

          {appView === 'datasets' && (
            <DatasetsView
              datasets={datasets}
              activeDataset={activeDataset}
              activeProjectId={activeProject?.id}
              onSelectDataset={setActiveDatasetId}
              onSaveDataset={handleSaveDataset}
              onDeleteDataset={handleDeleteDataset}
            />
          )}

          {appView === 'evaluations' && activeProject && (
            <EvaluationsView
              project={activeProject}
              datasets={datasets}
              versions={versions}
              evaluationRuns={evaluationRuns}
              onSaveRun={handleSaveRun}
              onDeleteRun={handleDeleteRun}
              onSelectActiveRun={(run) => {
                setActiveRunId(run.id);
              }}
            />
          )}

          {appView === 'regressions' && (
            <RegressionsView
              run={activeRun}
              onUpdateReleaseDecision={handleUpdateReleaseDecision}
            />
          )}

          {appView === 'settings' && activeProject && (
            <SettingsView
              project={activeProject}
              onSaveSettings={handleSaveSettings}
              onResetSeedData={handleResetSeedData}
            />
          )}

          {!activeProject && appView !== 'projects' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '60vh',
                textAlign: 'center',
                gap: '1rem',
              }}
            >
              <div style={{ fontSize: '2.5rem' }}>📂</div>
              <h2 style={{ margin: 0, color: '#FFFFFF' }}>No Active Project Selected</h2>
              <p style={{ color: '#8899AA', maxWidth: '440px', margin: 0, fontSize: '0.9rem' }}>
                Please select an existing project workspace or create a new one to begin evaluating models.
              </p>
              <button
                onClick={() => navigate('#/app/projects')}
                style={{
                  background: 'var(--accent, #FF6B35)',
                  color: '#000000',
                  border: 'none',
                  padding: '0.7rem 1.6rem',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  marginTop: '0.5rem',
                }}
              >
                Go to Projects Workspace →
              </button>
            </div>
          )}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};
