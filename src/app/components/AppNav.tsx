/* ============================================================
   RELIQ — Application Sidebar Navigation
   ============================================================ */

import React from 'react';
import { AppView, useRouter } from '../../router/useRouter';

interface AppNavProps {
  currentView: AppView;
  regressionCount?: number;
}

const NAV_ITEMS: { id: AppView; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '◈' },
  { id: 'projects', label: 'Projects', icon: '◫' },
  { id: 'datasets', label: 'Datasets', icon: '☰' },
  { id: 'evaluations', label: 'Evaluations', icon: '▶' },
  { id: 'regressions', label: 'Failure Explorer', icon: '⚠' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export const AppNav: React.FC<AppNavProps> = ({ currentView, regressionCount = 0 }) => {
  const { navigate } = useRouter();

  return (
    <aside
      style={{
        width: '240px',
        flexShrink: 0,
        background: '#0D1117',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '1.5rem 1rem',
        height: '100vh',
        boxSizing: 'border-box',
      }}
    >
      <div>
        {/* Brand */}
        <div
          onClick={() => navigate('#/app/dashboard')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.4rem 0.6rem 1.5rem 0.6rem',
            cursor: 'pointer',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            marginBottom: '1.2rem',
          }}
        >
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '2px',
              background: 'var(--accent, #FF6B35)',
              boxShadow: '0 0 10px #FF6B35',
            }}
          />
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '1.15rem',
              fontWeight: 800,
              letterSpacing: '0.12em',
              color: '#FFFFFF',
            }}
          >
            RELIQ
          </span>
          <span
            style={{
              fontSize: '0.62rem',
              padding: '0.15rem 0.45rem',
              borderRadius: '999px',
              background: 'rgba(255, 107, 53, 0.15)',
              color: 'var(--accent, #FF6B35)',
              fontWeight: 700,
              letterSpacing: '0.08em',
              marginLeft: 'auto',
            }}
          >
            APP
          </span>
        </div>

        {/* Nav Links */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {NAV_ITEMS.map((item) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigate(`#/app/${item.id}`)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '6px',
                  background: isActive ? 'rgba(255, 107, 53, 0.12)' : 'transparent',
                  border: isActive
                    ? '1px solid rgba(255, 107, 53, 0.3)'
                    : '1px solid transparent',
                  color: isActive ? '#FFFFFF' : '#8899A6',
                  fontSize: '0.85rem',
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  width: '100%',
                }}
              >
                <span style={{ fontSize: '0.95rem', color: isActive ? 'var(--accent, #FF6B35)' : '#667788' }}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {item.id === 'regressions' && regressionCount > 0 && (
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: '0.65rem',
                      padding: '0.1rem 0.4rem',
                      borderRadius: '4px',
                      background: 'rgba(255, 34, 0, 0.2)',
                      color: '#FF4422',
                      fontWeight: 700,
                    }}
                    title={`${regressionCount} quality regression(s) detected`}
                  >
                    {regressionCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer link to 3D Experience */}
      <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '1rem' }}>
        <button
          onClick={() => navigate('#/')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '6px',
            padding: '0.6rem 0.8rem',
            color: '#AAAAAA',
            fontSize: '0.75rem',
            fontWeight: 500,
            cursor: 'pointer',
            width: '100%',
          }}
        >
          <span>←</span>
          <span>View 3D Experience</span>
        </button>
      </div>
    </aside>
  );
};
