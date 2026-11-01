/* ============================================================
   RELIQ — Projects Management View
   
   Allows creating, selecting, renaming, and managing RELIQ projects.
   ============================================================ */

import React, { useState } from 'react';
import { Project } from '../../domain/types';
import { useRouter } from '../../router/useRouter';

interface ProjectsViewProps {
  projects: Project[];
  activeProject: Project | null;
  onSelectProject: (projectId: string) => void;
  onSaveProject: (project: Project) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  projects,
  activeProject,
  onSelectProject,
  onSaveProject,
  onDeleteProject,
}) => {
  const { navigate } = useRouter();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleOpenCreate = () => {
    setName('');
    setDescription('');
    setEditingProject(null);
    setIsCreateModalOpen(true);
  };

  const handleOpenEdit = (p: Project) => {
    setEditingProject(p);
    setName(p.name);
    setDescription(p.description);
    setIsCreateModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingProject) {
      await onSaveProject({
        ...editingProject,
        name: name.trim(),
        description: description.trim(),
      });
    } else {
      const newProj: Project = {
        id: `proj-${Date.now().toString(36)}`,
        name: name.trim(),
        description: description.trim(),
        baselineVersionId: 'ver-v1-4',
        candidateVersionId: 'ver-v1-5',
        regressionSettings: {
          minAccuracyPercent: 95.0,
          maxAccuracyDegradationPercent: 2.0,
          maxLatencyIncreasePercent: 20.0,
          maxFailureRatePercent: 5.0,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await onSaveProject(newProj);
      onSelectProject(newProj.id);
    }
    setIsCreateModalOpen(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: '#0000FF', fontWeight: 700, textTransform: 'uppercase' }}>
            WORKSPACES // PROJECT REPOSITORIES
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#F2F2F2', margin: '0.2rem 0 0.35rem 0', letterSpacing: '-0.02em' }}>
            Workspaces & Repositories
          </h1>
          <p style={{ color: '#858585', fontSize: '0.82rem', margin: 0, maxWidth: '640px', lineHeight: 1.5 }}>
            Organize evaluation datasets, regression baselines, and deployment gates by application workspace.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          style={{
            background: '#0000FF',
            color: '#FFFFFF',
            border: 'none',
            padding: '0.45rem 1rem',
            borderRadius: '2px',
            fontSize: '0.75rem',
            fontFamily: 'monospace',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          + NEW WORKSPACE
        </button>
      </div>

      {/* Projects List */}
      {projects.length === 0 ? (
        <div
          style={{
            padding: '3rem 2rem',
            textAlign: 'center',
            background: '#151515',
            borderRadius: '2px',
            border: '1px dashed #292929',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div style={{ fontSize: '1.5rem', color: '#858585', fontFamily: 'monospace' }}>[0 WORKSPACES]</div>
          <h3 style={{ color: '#F2F2F2', margin: 0, fontSize: '1.1rem', letterSpacing: '0.05em' }}>NO SAVED WORKSPACES</h3>
          <p style={{ color: '#858585', fontSize: '0.85rem', margin: 0, maxWidth: '440px', lineHeight: 1.5 }}>
            Create an evaluation workspace to organize test suites, models, and regression gate policies.
          </p>
          <button
            onClick={handleOpenCreate}
            style={{
              background: '#0000FF',
              color: '#FFFFFF',
              border: 'none',
              padding: '0.5rem 1.2rem',
              borderRadius: '2px',
              fontSize: '0.78rem',
              fontFamily: 'monospace',
              fontWeight: 700,
              cursor: 'pointer',
              marginTop: '0.5rem',
            }}
          >
            + CREATE WORKSPACE
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem' }}>
          {projects.map((proj) => {
            const isActive = proj.id === activeProject?.id;
            return (
              <div
                key={proj.id}
                style={{
                  background: '#151515',
                  border: isActive
                    ? '1px solid #0000FF'
                    : '1px solid #292929',
                  borderRadius: '2px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '1rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ color: isActive ? 'var(--accent, #C86D51)' : '#667788', fontSize: '1.1rem' }}>◈</span>
                      <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#FFFFFF', fontWeight: 700 }}>
                        {proj.name}
                      </h3>
                    </div>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        padding: '0.2rem 0.6rem',
                        borderRadius: '999px',
                        background: isActive ? 'rgba(78, 155, 111, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                        color: isActive ? '#4E9B6F' : '#8899AA',
                        fontWeight: 700,
                        border: isActive ? '1px solid rgba(78, 155, 111, 0.28)' : '1px solid rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      {isActive ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>

                  <p style={{ fontSize: '0.88rem', color: '#8899A6', lineHeight: 1.5, margin: '0 0 1.2rem 0' }}>
                    {proj.description || 'No description provided.'}
                  </p>

                  <div
                    style={{
                      background: 'rgba(0, 0, 0, 0.25)',
                      padding: '0.85rem',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.45rem',
                      border: '1px solid rgba(255, 255, 255, 0.04)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#888888' }}>Dataset Used:</span>
                      <span style={{ color: '#FFFFFF', fontWeight: 600 }}>
                        {proj.defaultDatasetId || 'Checkout Reliability Suite (27 scenarios)'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#888888' }}>Comparison Models:</span>
                      <span style={{ color: '#5B82A6', fontFamily: 'monospace', fontWeight: 600 }}>
                        {proj.baselineVersionId === 'ver-v1-4' ? 'openai/gpt-oss-20b' : proj.baselineVersionId || 'openai/gpt-oss-20b'} vs {proj.candidateVersionId === 'ver-v1-5' ? 'openai/gpt-oss-120b' : proj.candidateVersionId || 'openai/gpt-oss-120b'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#888888' }}>Target Accuracy Gate:</span>
                      <span style={{ color: '#FFFFFF', fontWeight: 600 }}>{proj.regressionSettings.minAccuracyPercent}%</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#888888' }}>Last Updated:</span>
                      <span style={{ color: '#AAAAAA' }}>
                        {new Date(proj.updatedAt || proj.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action row */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                    paddingTop: '1rem',
                    marginTop: '1.2rem',
                    flexWrap: 'wrap',
                    gap: '0.6rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <button
                      onClick={() => {
                        onSelectProject(proj.id);
                        navigate('#/app/dashboard');
                      }}
                      style={{
                        background: 'var(--accent, #C86D51)',
                        color: '#FFFFFF',
                        border: 'none',
                        padding: '0.45rem 1rem',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Open Project →
                    </button>
                    {!isActive && (
                      <button
                        onClick={() => onSelectProject(proj.id)}
                        style={{
                          background: 'transparent',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          color: '#CCCCCC',
                          padding: '0.45rem 0.8rem',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                        }}
                      >
                        Set Active
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.6rem' }}>
                    <button
                      onClick={() => handleOpenEdit(proj)}
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#ECECEC',
                        padding: '0.45rem 0.8rem',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                      }}
                    >
                      Edit
                    </button>
                    {projects.length > 1 && (
                      <button
                        onClick={() => {
                          if (confirm(`Delete project "${proj.name}"?`)) {
                            onDeleteProject(proj.id);
                          }
                        }}
                        style={{
                          background: 'transparent',
                          border: '1px solid rgba(192, 92, 84, 0.25)',
                          color: '#C05C54',
                          padding: '0.45rem 0.8rem',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create/Edit Project */}
      {isCreateModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: '#14181F',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '12px',
              padding: '2rem',
              width: '100%',
              maxWidth: '480px',
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.7)',
            }}
          >
            <h3 style={{ margin: '0 0 1.2rem 0', color: '#FFFFFF' }}>
              {editingProject ? 'Edit Project' : 'Create New Project'}
            </h3>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#888888', marginBottom: '0.4rem' }}>
                  Project Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Customer Support Copilot"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.8rem',
                    background: '#101419',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#FFFFFF',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#888888', marginBottom: '0.4rem' }}>
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe the agent or model workload..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.8rem',
                    background: '#101419',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#FFFFFF',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                    resize: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#CCCCCC',
                    padding: '0.6rem 1.2rem',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    background: 'var(--accent, #C86D51)',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '0.6rem 1.4rem',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {editingProject ? 'Save Changes' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
