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
import { HistoryView } from './views/HistoryView';
import { JudgesView } from './views/JudgesView';
import { ModelsView } from './views/ModelsView';
import { ProjectsView } from './views/ProjectsView';
import { RegressionsView } from './views/RegressionsView';
import { SettingsView } from './views/SettingsView';

export const ReliqApp: React.FC = () => {
  const { appView, navigate } = useRouter();

  // Optimistic SWR state initialization from localStorage cache for 0ms initial render
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const c = localStorage.getItem('reliq_cache_projects');
      return c ? JSON.parse(c) : [];
    } catch { return []; }
  });
  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    try {
      return localStorage.getItem('reliq_active_project_id_v2') || '';
    } catch { return ''; }
  });
  const [datasets, setDatasets] = useState<Dataset[]>(() => {
    try {
      const c = localStorage.getItem('reliq_cache_datasets');
      return c ? JSON.parse(c) : [];
    } catch { return []; }
  });
  const [activeDatasetId, setActiveDatasetId] = useState<string>(() => {
    try {
      return localStorage.getItem('reliq_cache_active_dataset_id') || '';
    } catch { return ''; }
  });
  const [versions, setVersions] = useState<ModelVersion[]>(() => {
    try {
      const c = localStorage.getItem('reliq_cache_versions');
      return c ? JSON.parse(c) : [];
    } catch { return []; }
  });
  const [evaluationRuns, setEvaluationRuns] = useState<EvaluationRun[]>(() => {
    try {
      const c = localStorage.getItem('reliq_cache_runs');
      return c ? JSON.parse(c) : [];
    } catch { return []; }
  });
  const [activeRunId, setActiveRunId] = useState<string>(() => {
    try {
      return localStorage.getItem('reliq_cache_active_run_id') || '';
    } catch { return ''; }
  });

  const [isLoading, setIsLoading] = useState(() => {
    try {
      return !localStorage.getItem('reliq_cache_projects');
    } catch { return true; }
  });
  const [loadError, setLoadError] = useState<string | null>(null);

  // Parallel background sync with storage/database
  const loadData = async () => {
    try {
      setLoadError(null);
      const storedActiveId = repository.getActiveProjectId();

      // Parallel fetch across all resources (eliminates sequential N+1 network delay)
      const [projs, dsets, vers, runs] = await Promise.all([
        repository.getProjects(),
        repository.getDatasets(storedActiveId || undefined),
        repository.getVersions(),
        repository.getEvaluationRuns(storedActiveId || undefined),
      ]);

      const validActiveProject = projs.find((p) => p.id === storedActiveId);
      const currentActiveId = validActiveProject ? validActiveProject.id : (projs[0]?.id || '');
      if (currentActiveId) {
        repository.setActiveProjectId(currentActiveId);
      }

      setProjects(projs);
      setActiveProjectId(currentActiveId);
      setDatasets(dsets);
      const preferredInitialDataset = dsets.find((d) => d.id === 'ds-checkout-golden')
        || dsets.find((d) => (d.cases?.length || 0) > 0 || (d.caseCount || 0) > 0)
        || dsets[0];
      const newActiveDsId = preferredInitialDataset?.id || '';
      setActiveDatasetId(newActiveDsId);
      setVersions(vers);
      setEvaluationRuns(runs);
      const newActiveRunId = runs[0]?.id || '';
      setActiveRunId(newActiveRunId);
      setIsLoading(false);

      // Persist warm cache to localStorage for instantaneous next reload
      try {
        localStorage.setItem('reliq_cache_projects', JSON.stringify(projs));
        localStorage.setItem('reliq_cache_datasets', JSON.stringify(dsets));
        localStorage.setItem('reliq_cache_versions', JSON.stringify(vers));
        const strippedRuns = runs.map((r) => ({ ...r, caseResults: [] }));
        localStorage.setItem('reliq_cache_runs', JSON.stringify(strippedRuns));
        if (newActiveDsId) localStorage.setItem('reliq_cache_active_dataset_id', newActiveDsId);
        if (newActiveRunId) localStorage.setItem('reliq_cache_active_run_id', newActiveRunId);
      } catch {}
    } catch (err: any) {
      console.error('Failed to load RELIQ repository data:', err);
      if (projects.length === 0) {
        setLoadError(err.message || 'Failed to connect to backend service');
      }
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0] || null;
  const activeDataset = datasets.find((d) => d.id === activeDatasetId) || datasets[0] || null;
  const activeRun = evaluationRuns.find((r) => r.id === activeRunId) || evaluationRuns[0] || null;

  // Hydrate full run cases if active run is from summary list
  useEffect(() => {
    if (!activeRun?.id) return;
    if (activeRun.caseResults && activeRun.caseResults.length > 0) return;

    let cancelled = false;
    (async () => {
      try {
        const full = await repository.getEvaluationRunById?.(activeRun.id);
        if (!cancelled && full && Array.isArray(full.caseResults) && full.caseResults.length > 0) {
          setEvaluationRuns((prev) =>
            prev.map((r) => (r.id === full.id ? { ...r, ...full } : r))
          );
        }
      } catch {
        // silent fallback to local/summary state
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeRun?.id, activeRun?.caseResults?.length]);

  // Hydrate active dataset test cases in background without blocking initial render
  useEffect(() => {
    if (!activeDatasetId) return;
    const current = datasets.find((d) => d.id === activeDatasetId);
    if (!current || (current.cases && current.cases.length > 0)) return;

    let cancelled = false;
    (async () => {
      try {
        const cases = await repository.getTestCases(activeDatasetId);
        if (!cancelled && Array.isArray(cases) && cases.length > 0) {
          setDatasets((prev) =>
            prev.map((d) => (d.id === activeDatasetId ? { ...d, cases, caseCount: cases.length } : d))
          );
        }
      } catch {
        // silent fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeDatasetId, datasets.length]);

  // Project Switch
  const handleSelectProject = async (projectId: string) => {
    repository.setActiveProjectId(projectId);
    setActiveProjectId(projectId);
    const dsets = await repository.getDatasets(projectId);
    const runs = await repository.getEvaluationRuns(projectId);
    setDatasets(dsets);
    const preferredProjectDataset = dsets.find((d) => d.id === 'ds-checkout-golden')
      || dsets.find((d) => (d.cases?.length || 0) > 0)
      || dsets[0];
    setActiveDatasetId(preferredProjectDataset?.id || '');
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
      const runs = await repository.getEvaluationRuns(activeProjectId);
      setEvaluationRuns(runs);
      setActiveRunId(activeRun.id);
    } catch (err: any) {
      alert(`Failed to update release decision: ${err.message}`);
      throw err;
    }
  };

  const handleResetSeedData = async () => {
    await repository.resetToSeedData();
    await loadData();
  };

  if (loadError) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          background: 'var(--bg, #0F0F0F)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--blue-light, #60A5FA)',
          fontFamily: "var(--font-sans, 'Geist Sans', sans-serif)",
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
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
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
        background: 'var(--bg, #0F0F0F)',
        color: 'var(--text, #F2F2F2)',
        fontFamily: "'Geist Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
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
        <main style={{ flex: 1, overflowY: 'auto', padding: '2rem', boxSizing: 'border-box', transition: 'opacity 0.35s ease' }}>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: '1400px', margin: '0 auto' }}>
              <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
                <div style={{ flex: 1, height: '130px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)' }} />
                <div style={{ flex: 1, height: '130px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)' }} />
                <div style={{ flex: 1, height: '130px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)' }} />
              </div>
              <div style={{ height: '380px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.04)' }} />
            </div>
          ) : (
          <ErrorBoundary>
          {(appView === 'overview' || appView === 'dashboard') && activeProject && (
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
              onDatasetImported={async (importedDs) => {
                const dsets = await repository.getDatasets(activeProjectId);
                setDatasets(dsets);
                setActiveDatasetId(importedDs.id);
              }}
            />
          )}

          {appView === 'models' && (
            <ModelsView />
          )}

          {appView === 'judges' && (
            <JudgesView />
          )}

          {appView === 'history' && (
            <HistoryView
              evaluationRuns={evaluationRuns}
              onSelectRun={(run) => {
                setActiveRunId(run.id);
              }}
              onDeleteRun={handleDeleteRun}
            />
          )}

          {(appView === 'evaluations' || appView === 'new-evaluation') && activeProject && (
            <EvaluationsView
              project={activeProject}
              datasets={datasets}
              activeDatasetId={activeDatasetId}
              versions={versions}
              evaluationRuns={evaluationRuns}
              onSaveRun={handleSaveRun}
              onDeleteRun={handleDeleteRun}
              onSelectActiveRun={(run) => {
                setActiveRunId(run.id);
              }}
              onDatasetImported={async (importedDs) => {
                const dsets = await repository.getDatasets(activeProjectId);
                setDatasets(dsets);
                setActiveDatasetId(importedDs.id);
              }}
            />
          )}

          {(appView === 'regressions' || appView === 'details') && (
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
                  background: '#ADC0D6',
                  color: '#0A1A35',
                  border: '1px solid #ADC0D6',
                  padding: '0.7rem 1.6rem',
                  borderRadius: '2px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  marginTop: '0.5rem',
                  transition: 'background 0.15s ease, border-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#C5D4E5';
                  e.currentTarget.style.borderColor = '#C5D4E5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#ADC0D6';
                  e.currentTarget.style.borderColor = '#ADC0D6';
                }}
              >
                Go to Projects Workspace →
              </button>
            </div>
          )}
          </ErrorBoundary>
          )}
        </main>
      </div>
    </div>
  );
};
