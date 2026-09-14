/* ============================================================
   RELIQ — Application Header Bar
   ============================================================ */

import React, { useState } from 'react';
import { EvaluationRun, Project } from '../../domain/types';
import { useRouter } from '../../router/useRouter';

interface AppHeaderProps {
  projects: Project[];
  activeProject: Project | null;
  onSelectProject: (projectId: string) => void;
  onCreateProjectClick: () => void;
  activeRun?: EvaluationRun | null;
  isRegressionDetected?: boolean;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  projects,
  activeProject,
  onSelectProject,
  onCreateProjectClick,
  activeRun,
  isRegressionDetected,
}) => {
  const { navigate } = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <header
      style={{
        height: '60px',
        background: '#0D1117',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 2rem',
        boxSizing: 'border-box',
      }}
    >
      {/* Left: Project Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', position: 'relative' }}>
        <div style={{ fontSize: '0.8rem', color: '#888888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Project:
        </div>

        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            padding: '0.4rem 0.85rem',
            borderRadius: '6px',
            color: '#FFFFFF',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <span style={{ color: 'var(--accent, #FF6B35)' }}>●</span>
          <span>{activeProject?.name || 'Select Project'}</span>
          <span style={{ fontSize: '0.7rem', color: '#888888', marginLeft: '0.4rem' }}>▼</span>
        </button>

        {dropdownOpen && (
          <div
            style={{
              position: 'absolute',
              top: '110%',
              left: '60px',
              width: '240px',
              background: '#161B22',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              boxShadow: '0 12px 28px rgba(0, 0, 0, 0.7)',
              zIndex: 100,
              padding: '0.4rem',
            }}
          >
            {projects.map((p) => (
              <div
                key={p.id}
                onClick={() => {
                  onSelectProject(p.id);
                  setDropdownOpen(false);
                }}
                style={{
                  padding: '0.5rem 0.8rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  color: p.id === activeProject?.id ? 'var(--accent, #FF6B35)' : '#ECECEC',
                  background: p.id === activeProject?.id ? 'rgba(255, 107, 53, 0.1)' : 'transparent',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{p.name}</span>
                {p.id === activeProject?.id && <span style={{ fontSize: '0.7rem' }}>✓</span>}
              </div>
            ))}
            <div
              onClick={() => {
                setDropdownOpen(false);
                onCreateProjectClick();
              }}
              style={{
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                marginTop: '0.3rem',
                padding: '0.5rem 0.8rem',
                fontSize: '0.8rem',
                color: '#4DA6FF',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              + Create New Project
            </div>
          </div>
        )}
      </div>

      {/* Right: Status Badges and Quick Action */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {(() => {
          if (!activeRun) {
            return (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.3rem 0.75rem',
                  borderRadius: '999px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#8899AA',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                }}
              >
                <span>⚪ RELEASE GATE: NO EVALUATIONS</span>
              </div>
            );
          }

          const status = activeRun.releaseDecision?.status;
          const isBlocked =
            status === 'BLOCK' ||
            status === 'REGRESSION_DETECTED' ||
            (isRegressionDetected ?? activeRun.regressionDecision?.isRegression);
          const isInsufficient =
            status === 'INSUFFICIENT_EVIDENCE' || (status as any) === 'INSUFFICIENT EVIDENCE';
          const isConditions =
            status === 'SHIP_WITH_CONDITIONS' || (status as any) === 'SHIP WITH CONDITIONS';

          let bg = 'rgba(46, 204, 113, 0.12)';
          let color = '#2ECC71';
          let border = 'rgba(46, 204, 113, 0.3)';
          let text = '✓ RELEASE GATE: PASSED';

          if (isBlocked) {
            bg = 'rgba(255, 34, 0, 0.12)';
            color = '#FF3311';
            border = 'rgba(255, 34, 0, 0.3)';
            text = '● RELEASE GATE: BLOCKED';
          } else if (isInsufficient) {
            bg = 'rgba(192, 132, 252, 0.15)';
            color = '#C084FC';
            border = 'rgba(192, 132, 252, 0.35)';
            text = '⚠ RELEASE GATE: INSUFFICIENT EVIDENCE';
          } else if (isConditions) {
            bg = 'rgba(243, 156, 18, 0.15)';
            color = '#F39C12';
            border = 'rgba(243, 156, 18, 0.35)';
            text = '⚡ RELEASE GATE: CONDITIONS';
          }

          return (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.3rem 0.75rem',
                borderRadius: '999px',
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                background: bg,
                color,
                border: `1px solid ${border}`,
              }}
            >
              <span>{text}</span>
            </div>
          );
        })()}

        <button
          onClick={() => navigate('#/app/evaluations')}
          style={{
            background: 'var(--accent, #FF6B35)',
            color: '#000000',
            border: 'none',
            padding: '0.45rem 1.1rem',
            borderRadius: '6px',
            fontSize: '0.8rem',
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: '0.04em',
            boxShadow: '0 2px 10px rgba(255, 107, 53, 0.3)',
          }}
        >
          + Run Evaluation
        </button>
      </div>
    </header>
  );
};
