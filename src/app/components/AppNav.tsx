/* ============================================================
   RELIQ — AI Evaluation Laboratory Sidebar Navigation
   Precision Instrument Aesthetics • Collapsible • SVG Vector Icons
   ============================================================ */

import React, { useState } from 'react';
import { AppView, useRouter } from '../../router/useRouter';

interface AppNavProps {
  currentView: AppView;
  regressionCount?: number;
}

interface NavItem {
  id: AppView;
  label: string;
  badge?: string;
  icon: (color: string) => React.ReactNode;
}

export const AppNav: React.FC<AppNavProps> = ({ currentView, regressionCount = 0 }) => {
  const { navigate } = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Map view aliases for active detection
  const isOverview = currentView === 'overview' || currentView === 'dashboard';
  const isDetails = currentView === 'regressions' || currentView === 'details';

  const NAV_ITEMS: NavItem[] = [
    {
      id: 'overview',
      label: 'Overview',
      icon: (color) => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" />
          <rect x="14" y="3" width="7" height="5" />
          <rect x="14" y="12" width="7" height="9" />
          <rect x="3" y="16" width="7" height="5" />
        </svg>
      ),
    },
    {
      id: 'evaluations',
      label: 'Evaluations',
      icon: (color) => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      ),
    },
    {
      id: 'datasets',
      label: 'Datasets',
      icon: (color) => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        </svg>
      ),
    },
    {
      id: 'models',
      label: 'Models',
      icon: (color) => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <rect x="9" y="9" width="6" height="6" />
          <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
        </svg>
      ),
    },
    {
      id: 'judges',
      label: 'Judges',
      badge: 'QWEN 3.8B',
      icon: (color) => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="m14 13-7.5 7.5a2.12 2.12 0 1 1-3-3L11 10" />
          <path d="m16 16 6-6" />
          <path d="m8 8 6-6" />
          <path d="m9 7 8 8" />
          <path d="m21 11-8-8" />
        </svg>
      ),
    },
    {
      id: 'history',
      label: 'History',
      icon: (color) => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
    {
      id: 'details',
      label: 'Evaluation Details',
      badge: regressionCount > 0 ? `${regressionCount} REG` : undefined,
      icon: (color) => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
        </svg>
      ),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: (color) => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="21" x2="4" y2="14" />
          <line x1="4" y1="10" x2="4" y2="3" />
          <line x1="12" y1="21" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12" y2="3" />
          <line x1="20" y1="21" x2="20" y2="16" />
          <line x1="20" y1="12" x2="20" y2="3" />
          <line x1="1" y1="14" x2="7" y2="14" />
          <line x1="9" y1="8" x2="15" y2="8" />
          <line x1="17" y1="16" x2="23" y2="16" />
        </svg>
      ),
    },
  ];

  return (
    <aside
      style={{
        width: isCollapsed ? '64px' : '230px',
        transition: 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        flexShrink: 0,
        background: '#151515',
        borderRight: '1px solid #292929',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100vh',
        boxSizing: 'border-box',
        userSelect: 'none',
        zIndex: 50,
      }}
    >
      <div>
        {/* Brand Header */}
        <div
          onClick={() => navigate('#/app/overview')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            padding: isCollapsed ? '1rem 0' : '1.1rem 1.1rem',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            cursor: 'pointer',
            borderBottom: '1px solid #292929',
          }}
          title="RELIQ AI Evaluation Laboratory"
        >
          {/* Brand Mark: Precision Accent Mark */}
          <div
            style={{
              width: '10px',
              height: '10px',
              background: '#BAE6FD',
              border: '1px solid #BAE6FD',
              borderRadius: '2px',
              flexShrink: 0,
            }}
          />

          {!isCollapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', overflow: 'hidden' }}>
              <span
                style={{
                  fontFamily: "var(--font-sans, 'Geist Sans', sans-serif)",
                  fontSize: '0.92rem',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  color: '#F2F2F2',
                }}
              >
                RELIQ
              </span>
            </div>
          )}
        </div>

        {/* Section Title */}
        {!isCollapsed && (
          <div
            style={{
              padding: '0.85rem 1.1rem 0.35rem 1.1rem',
              fontSize: '0.65rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#555555',
            }}
          >
            INSTRUMENTATION
          </div>
        )}

        {/* Nav Links */}
        <nav
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.15rem',
            padding: isCollapsed ? '0.5rem 0.35rem' : '0.4rem 0.6rem',
          }}
        >
          {NAV_ITEMS.map((item) => {
            const isActive =
              (item.id === 'overview' && isOverview) ||
              (item.id === 'details' && isDetails) ||
              currentView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'overview') navigate('#/app/overview');
                  else if (item.id === 'details') navigate('#/app/regressions');
                  else navigate(`#/app/${item.id}`);
                }}
                title={isCollapsed ? item.label : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: isCollapsed ? '0.65rem 0' : '0.55rem 0.75rem',
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                  borderRadius: '2px',
                  background: isActive ? '#BAE6FD' : 'transparent',
                  border: 'none',
                  borderLeft: isActive ? '2px solid #BAE6FD' : '2px solid transparent',
                  color: isActive ? '#0A1A35' : '#858585',
                  fontSize: '0.82rem',
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.12s ease, color 0.12s ease',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = '#1A1A1A';
                    e.currentTarget.style.color = '#CCCCCC';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#858585';
                  }
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '18px',
                    height: '18px',
                    flexShrink: 0,
                  }}
                >
                  {item.icon(isActive ? '#0A1A35' : '#858585')}
                </div>

                {!isCollapsed && (
                  <>
                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.label}
                    </span>
                    {item.badge && (
                      <span
                        style={{
                          fontSize: '0.6rem',
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                          padding: '0.1rem 0.35rem',
                          borderRadius: '2px',
                          background: item.badge.includes('REG') ? '#261414' : '#1B1B1B',
                          color: item.badge.includes('REG') ? '#EF4444' : '#858585',
                          border: item.badge.includes('REG') ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid #292929',
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer: Sidebar Collapse Toggle & Landing Link */}
      <div
        style={{
          borderTop: '1px solid #292929',
          padding: isCollapsed ? '0.75rem 0.35rem' : '0.75rem 0.8rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        {/* Toggle Collapse Button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            gap: '0.6rem',
            background: 'transparent',
            border: '1px solid #292929',
            borderRadius: '2px',
            padding: '0.45rem',
            color: '#858585',
            fontSize: '0.75rem',
            cursor: 'pointer',
            width: '100%',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#858585" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {isCollapsed ? (
              <path d="m9 18 6-6-6-6" />
            ) : (
              <path d="m15 18-6-6 6-6" />
            )}
          </svg>
          {!isCollapsed && <span style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>COLLAPSE</span>}
        </button>

        {/* 3D Experience Back Link */}
        <button
          onClick={() => navigate('#/')}
          title="Return to 3D Landing Page"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            gap: '0.5rem',
            background: '#151515',
            border: 'none',
            padding: '0.45rem',
            color: '#555555',
            fontSize: '0.72rem',
            cursor: 'pointer',
            width: '100%',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#F2F2F2')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#555555')}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          {!isCollapsed && <span style={{ fontFamily: 'monospace', fontSize: '0.68rem' }}>3D CANVAS</span>}
        </button>
      </div>
    </aside>
  );
};
