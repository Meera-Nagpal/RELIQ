import React from 'react';
import { useExperienceStore } from '../store/experienceStore';
import { mapRangeClamped } from '../utils/math';
import { useRouter } from '../router/useRouter';

/**
 * Hero HUD overlay for State 01 (SYSTEM)
 * Features minimalist brand mark, active environment status,
 * direct gateway to /app workspace, and smooth fade on scroll.
 */
export function HeroOverlay() {
  const scrollProgress = useExperienceStore((state) => state.scrollProgress);
  const { navigate } = useRouter();

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
              fontFamily: "'Inter', sans-serif",
              fontSize: '1.55rem',
              fontWeight: 900,
              letterSpacing: '0.18em',
              color: '#FFFFFF',
              textShadow: '0 0 25px rgba(255, 107, 53, 0.4)',
            }}
          >
            RELIQ
          </span>
          <span
            style={{
              fontSize: '0.68rem',
              padding: '0.25rem 0.65rem',
              borderRadius: '999px',
              border: '1px solid rgba(255, 107, 53, 0.45)',
              background: 'rgba(255, 107, 53, 0.12)',
              color: 'var(--accent, #FF6B35)',
              fontWeight: 700,
              letterSpacing: '0.12em',
            }}
          >
            AI RELIABILITY SUITE
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div
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
                background: '#2ECC71',
                boxShadow: '0 0 8px #2ECC71',
              }}
            />
            CORE: NOMINAL
          </div>

          <button
            onClick={() => navigate('#/app/dashboard')}
            style={{
              background: 'var(--accent, #FF6B35)',
              color: '#000000',
              border: 'none',
              padding: '0.45rem 1.1rem',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              cursor: 'pointer',
              boxShadow: '0 0 15px rgba(255, 107, 53, 0.35)',
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
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              color: 'var(--accent, #FF6B35)',
              fontWeight: 600,
              marginBottom: '0.4rem',
            }}
          >
            THE RELIABILITY LAYER FOR AI
          </div>
          <p
            style={{
              fontSize: 'clamp(1rem, 1.6vw, 1.35rem)',
              color: '#E0E0E0',
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
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              color: '#FFFFFF',
              padding: '0.75rem 1.4rem',
              borderRadius: '6px',
              fontSize: '0.78rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Direct to App
          </button>
          <button
            onClick={scrollToStart}
            style={{
              background: 'transparent',
              border: '1px solid var(--accent, #FF6B35)',
              color: 'var(--accent, #FF6B35)',
              padding: '0.75rem 1.6rem',
              borderRadius: '6px',
              fontSize: '0.78rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}
          >
            Explore 3D Journey ↓
          </button>
        </div>
      </div>
    </div>
  );
}
