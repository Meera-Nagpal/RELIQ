/* ============================================================
   RELIQ — AI Evaluation Laboratory Top Header Bar
   Precision Instrumentation • Breadcrumbs • Live Backend Status
   ============================================================ */

import React, { useState, useRef, useEffect } from 'react';
import { EvaluationRun, Project } from '../../domain/types';
import { AppView, useRouter } from '../../router/useRouter';

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
  const { appView, navigate } = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [dropdownOpen]);

  // Format breadcrumb text based on current view
  const getViewBreadcrumb = (view: AppView): string => {
    switch (view) {
      case 'overview':
      case 'dashboard':
        return 'Overview';
      case 'evaluations':
      case 'new-evaluation':
        return 'Evaluations';
      case 'datasets':
        return 'Datasets';
      case 'models':
        return 'Models';
      case 'judges':
        return 'Judges';
      case 'history':
        return 'History';
      case 'regressions':
      case 'details':
        return 'Details';
      case 'settings':
        return 'Settings';
      case 'projects':
        return 'Projects';
      default:
        return 'Workspace';
    }
  };

  return (
    <header
      style={{
        height: '52px',
        background: '#151515',
        borderBottom: '1px solid #292929',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 1.5rem',
        boxSizing: 'border-box',
        zIndex: 40,
        userSelect: 'none',
      }}
    >
      {/* Left: Workspace Selector & Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', position: 'relative' }} ref={dropdownRef}>
        {/* Workspace Project Dropdown Trigger */}
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: '#1B1B1B',
            border: '1px solid #292929',
            padding: '0.35rem 0.75rem',
            borderRadius: '2px',
            color: '#F2F2F2',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'border-color 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#3A3A3A')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#292929')}
        >
          <span style={{ color: '#0000FF', fontSize: '0.75rem' }}>◆</span>
          <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeProject?.name || 'Select Workspace'}
          </span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#858585" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* Breadcrumb Separator */}
        <span style={{ color: '#555555', fontSize: '0.75rem', fontFamily: 'monospace' }}>/</span>

        {/* Current View Breadcrumb */}
        <span
          style={{
            fontSize: '0.75rem',
            fontFamily: 'monospace',
            color: '#858585',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {getViewBreadcrumb(appView)}
        </span>

        {/* Dropdown Menu */}
        {dropdownOpen && (
          <div
            style={{
              position: 'absolute',
              top: '120%',
              left: '0',
              width: '260px',
              background: '#1B1B1B',
              border: '1px solid #292929',
              borderRadius: '2px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.8)',
              zIndex: 100,
              padding: '0.35rem',
            }}
          >
            <div
              style={{
                fontSize: '0.65rem',
                fontFamily: 'monospace',
                color: '#555555',
                padding: '0.35rem 0.6rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              WORKSPACES ({projects.length})
            </div>

            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {projects.map((p) => {
                const isSelected = p.id === activeProject?.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      onSelectProject(p.id);
                      setDropdownOpen(false);
                    }}
                    style={{
                      padding: '0.45rem 0.65rem',
                      borderRadius: '2px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      color: isSelected ? '#F2F2F2' : '#858585',
                      background: isSelected ? '#151515' : 'transparent',
                      borderLeft: isSelected ? '2px solid #0000FF' : '2px solid transparent',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = '#222222';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </span>
                    {isSelected && (
                      <span style={{ color: '#0000FF', fontSize: '0.7rem', fontFamily: 'monospace' }}>●</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div
              onClick={() => {
                setDropdownOpen(false);
                onCreateProjectClick();
              }}
              style={{
                borderTop: '1px solid #292929',
                marginTop: '0.3rem',
                padding: '0.5rem 0.65rem',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                color: '#0000FF',
                cursor: 'pointer',
                fontWeight: 600,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0, 0, 255, 0.08)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              + NEW WORKSPACE
            </div>
          </div>
        )}
      </div>

      {/* Right: System Status Telemetry, Operator Badge & Primary Action */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {/* Render Backend & Supabase Live Status Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.25rem 0.65rem',
            borderRadius: '2px',
            fontSize: '0.68rem',
            fontFamily: 'monospace',
            letterSpacing: '0.04em',
            background: '#1B1B1B',
            color: '#858585',
            border: '1px solid #292929',
          }}
          title="Backend: Render (Node.js) • Database: Supabase (PostgreSQL)"
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#22C55E',
              boxShadow: '0 0 6px rgba(34, 197, 94, 0.6)',
              display: 'inline-block',
            }}
          />
          <span style={{ color: '#22C55E', fontWeight: 600 }}>RENDER LIVE</span>
          <span style={{ color: '#3A3A3A' }}>|</span>
          <span style={{ color: '#858585' }}>SUPABASE</span>
        </div>

        {/* Release Gate Indicator Pill (if active run exists) */}
        {activeRun && (() => {
          const status = activeRun.releaseDecision?.status;
          const isBlocked =
            status === 'BLOCK' ||
            status === 'REGRESSION_DETECTED' ||
            (isRegressionDetected ?? activeRun.regressionDecision?.isRegression);
          const isPass = status === 'SHIP' || status === 'NO_REGRESSION';

          const color = isBlocked ? '#EF4444' : isPass ? '#22C55E' : '#F59E0B';
          const bg = isBlocked ? '#261414' : isPass ? '#13241A' : '#261D10';
          const border = isBlocked ? 'rgba(239, 68, 68, 0.3)' : isPass ? 'rgba(34, 197, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)';
          const text = isBlocked ? 'GATE: BLOCKED' : isPass ? 'GATE: PASSED' : 'GATE: CONDITIONS';

          return (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.25rem 0.65rem',
                borderRadius: '2px',
                fontSize: '0.68rem',
                fontFamily: 'monospace',
                fontWeight: 700,
                letterSpacing: '0.05em',
                background: bg,
                color: color,
                border: `1px solid ${border}`,
              }}
            >
              <span>{text}</span>
            </div>
          );
        })()}

        {/* Operator User Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.25rem 0.55rem',
            borderRadius: '2px',
            background: '#1B1B1B',
            border: '1px solid #292929',
            fontSize: '0.68rem',
            fontFamily: 'monospace',
            color: '#858585',
          }}
          title="Laboratory Identity"
        >
          <span style={{ color: '#0000FF' }}>⌘</span>
          <span>OPERATOR // LAB-01</span>
        </div>

        {/* Primary Action Button: Electric Blue */}
        <button
          onClick={() => navigate('#/app/evaluations')}
          style={{
            background: '#0000FF',
            color: '#FFFFFF',
            border: '1px solid #0000FF',
            padding: '0.35rem 0.9rem',
            borderRadius: '2px',
            fontSize: '0.78rem',
            fontFamily: 'monospace',
            fontWeight: 700,
            letterSpacing: '0.04em',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            transition: 'background 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#1A1AFF';
            e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 0, 255, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#0000FF';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <span>+</span>
          <span>NEW EVALUATION</span>
        </button>
      </div>
    </header>
  );
};
