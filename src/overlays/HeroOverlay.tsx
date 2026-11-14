import React from 'react';
import { useExperienceStore } from '../store/experienceStore';
import { mapRangeClamped } from '../utils/math';
import { useRouter } from '../router/useRouter';
import { useCoreHealth } from '../hooks/useCoreHealth';

/**
 * Hero HUD overlay for State 01 (SYSTEM)
 * Features minimalist brand mark, active environment status,
 * direct gateway to /app workspace, and smooth fade on scroll.
 */
export function HeroOverlay() {
  const scrollProgress = useExperienceStore((state) => state.scrollProgress);
  const { navigate } = useRouter();
  const { status: coreStatus, latencyMs } = useCoreHealth(20000);

  const getStatusDisplay = () => {
    switch (coreStatus) {
      case 'NOMINAL':
        return {
          label: 'CORE: NOMINAL',
          color: '#2ECC71',
          shadow: '0 0 8px #2ECC71',
        };
      case 'DEGRADED':
        return {
          label: 'CORE: DEGRADED',
          color: '#F59E0B',
          shadow: '0 0 8px #F59E0B',
        };
      case 'OFFLINE':
        return {
          label: 'CORE: OFFLINE',
          color: '#EF4444',
          shadow: '0 0 8px #EF4444',
        };
      case 'CHECKING':
      default:
        return {
          label: 'CORE: CHECKING',
          color: '#60A5FA',
          shadow: '0 0 8px #60A5FA',
        };
    }
  };

  const statusDisplay = getStatusDisplay();

  const opacity = mapRangeClamped(scrollProgress, 0, 0.12, 1, 0);
  const translateY = mapRangeClamped(scrollProgress, 0, 0.12, 0, -30);

  const scrollToStart = () => {
    const totalScrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: totalScrollHeight * 0.18, behavior: 'smooth' });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 14,
        pointerEvents: opacity > 0.1 ? 'auto' : 'none',
        opacity,
        transform: `translateY(${translateY}px)`,
        transition: 'opacity 0.2s ease-out',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 'clamp(1.5rem, 4vw, 3.5rem)',
      }}
    >
      {/* ── Top Bar Brand HUD ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem' }}>
          <span
            style={{
              fontFamily: "var(--font-sans, 'Geist Sans', sans-serif)",
              fontSize: '1.55rem',
              fontWeight: 800,
              letterSpacing: '0.12em',
              color: '#FFFFFF',
            }}
          >
            RELIQ
          </span>
          <span
            style={{
              fontSize: '0.68rem',
              padding: '0.25rem 0.65rem',
              borderRadius: '2px',
              border: '1px solid #292929',
              background: '#151515',
              color: '#ADC0D6',
              fontWeight: 700,
              letterSpacing: '0.12em',
              fontFamily: 'monospace',
            }}
          >
            AI RELIABILITY SUITE
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div
            title={`Backend Service: ${statusDisplay.label}${latencyMs ? ` (${latencyMs}ms)` : ''}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.75rem',
              color: 'var(--text-muted, #888888)',
              fontFamily: 'monospace',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: statusDisplay.color,
                boxShadow: statusDisplay.shadow,
              }}
            />
            {statusDisplay.label}
          </div>

          <button
            onClick={() => navigate('#/app/dashboard')}
            style={{
              background: 'var(--accent, #ADC0D6)',
              color: '#0A1A35',
              border: '1px solid var(--accent, #ADC0D6)',
              padding: '0.45rem 1.1rem',
              borderRadius: '2px',
              fontSize: '0.78rem',
              fontWeight: 700,
              fontFamily: 'monospace',
              letterSpacing: '0.04em',
              cursor: 'pointer',
              transition: 'background 0.2s ease',
            }}
          >
            Open RELIQ Workspace →
          </button>
        </div>
      </div>

      {/* ── Bottom Narrative Callout ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          width: '100%',
        }}
      >
        <div style={{ maxWidth: '440px' }}>
          <div
            style={{
              fontSize: '0.72rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--blue-light, #60A5FA)',
              fontWeight: 600,
              fontFamily: 'monospace',
              marginBottom: '0.4rem',
            }}
          >
            THE RELIABILITY LAYER FOR AI
          </div>
          <p
            style={{
              fontSize: 'clamp(1rem, 1.6vw, 1.35rem)',
              color: 'var(--text, #F2F2F2)',
              fontWeight: 400,
              lineHeight: 1.45,
              margin: 0,
            }}
          >
            Evaluate models. Trace regressions. Deploy complex agentic systems with total confidence.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.8rem' }}>
          <button
            onClick={() => navigate('#/app/dashboard')}
            style={{
              background: '#151515',
              border: '1px solid #292929',
              color: 'var(--text, #F2F2F2)',
              padding: '0.75rem 1.4rem',
              borderRadius: '2px',
              fontSize: '0.78rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontFamily: 'monospace',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.2s ease',
            }}
          >
            Direct to App
          </button>
          <button
            onClick={scrollToStart}
            style={{
              background: '#1B1B1B',
              border: '1px solid #3A3A3A',
              color: '#ADC0D6',
              padding: '0.75rem 1.6rem',
              borderRadius: '2px',
              fontSize: '0.78rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontFamily: 'monospace',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#222222';
              e.currentTarget.style.borderColor = '#ADC0D6';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#1B1B1B';
              e.currentTarget.style.borderColor = '#3A3A3A';
            }}
          >
            Explore 3D Journey ↓
          </button>
        </div>
      </div>
    </div>
  );
}
