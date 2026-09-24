import React, { useMemo } from 'react';
import { useExperienceStore } from '../store/experienceStore';
import { mapRangeClamped } from '../utils/math';
import { useRouter } from '../router/useRouter';

/**
 * Compact Supporting Information Box for State 06 (SHIP / CONFIDENCE)
 * 
 * Restores the previous RELIQ visual composition:
 * - The 3D scene (central sphere, orbital rings, spatial 96.8% typography) remains
 *   the open, unblocked primary HERO.
 * - The foreground information box is a compact supporting overlay positioned
 *   at the bottom of the screen.
 * - Dark translucent panel, thin border, subtle blur, rounded corners, clean typography.
 * - Direct action button to launch the workspace.
 */
export function DashboardTransition() {
  const currentStateIndex = useExperienceStore((state) => state.currentStateIndex);
  const stateProgress = useExperienceStore((state) => state.stateProgress);
  const { navigate, isTransitioning } = useRouter();

  // Active in state 5 (index 5) as user approaches and holds on State 06
  const isEntering = !isTransitioning && currentStateIndex === 5 && stateProgress > 0.25;

  const scale = useMemo(() => {
    if (!isEntering) return 0.94;
    return mapRangeClamped(stateProgress, 0.25, 0.7, 0.94, 1.0);
  }, [isEntering, stateProgress]);

  const opacity = useMemo(() => {
    if (!isEntering) return 0;
    return mapRangeClamped(stateProgress, 0.25, 0.6, 0, 1.0);
  }, [isEntering, stateProgress]);

  if (isTransitioning || opacity <= 0.001) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'clamp(2rem, 6vh, 4rem)',
        transform: `translateX(-50%) scale(${scale})`,
        transformOrigin: 'bottom center',
        zIndex: 25,
        pointerEvents: isEntering ? 'auto' : 'none',
        opacity,
        width: 'calc(100% - 3rem)',
        maxWidth: 'clamp(360px, 38vw, 480px)',
        background: 'rgba(10, 14, 22, 0.76)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.10)',
        borderRadius: '12px',
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.6), 0 0 24px rgba(255, 107, 53, 0.10)',
        padding: '1.25rem 1.6rem',
        transition: 'opacity 0.25s ease-out, transform 0.18s ease-out',
      }}
    >
      {/* ── Top Tag & Metric Badge ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.5rem',
        }}
      >
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: '0.72rem',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--accent, #FF6B35)',
            fontWeight: 600,
          }}
        >
          STAGE 06 // SHIP
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.72rem',
            padding: '0.2rem 0.55rem',
            borderRadius: '4px',
            background: 'rgba(46, 204, 113, 0.12)',
            color: '#2ECC71',
            border: '1px solid rgba(46, 204, 113, 0.35)',
            fontWeight: 700,
            fontFamily: 'monospace',
          }}
        >
          <span
            style={{
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              background: '#2ECC71',
              boxShadow: '0 0 6px #2ECC71',
            }}
          />
          96.8% RELIABILITY
        </div>
      </div>

      {/* ── Headline ── */}
      <h3
        style={{
          fontSize: 'clamp(1.25rem, 2vw, 1.5rem)',
          fontWeight: 800,
          color: '#F5F5F5',
          letterSpacing: '-0.02em',
          margin: '0 0 0.45rem 0',
          lineHeight: 1.2,
          textShadow: '0 2px 10px rgba(0, 0, 0, 0.7)',
        }}
      >
        Deploy with Confidence
      </h3>

      {/* ── Description ── */}
      <p
        style={{
          fontSize: 'clamp(0.85rem, 1.05vw, 0.95rem)',
          color: 'var(--text-muted, #A0B0C0)',
          lineHeight: 1.55,
          margin: '0 0 1.15rem 0',
          textShadow: '0 1px 6px rgba(0, 0, 0, 0.6)',
        }}
      >
        Target model v1.6 passed all 500 regression test cases. Root causes isolated and resolved with full verification.
      </p>

      {/* ── Actions ── */}
      <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
        <button
          onClick={() => navigate('#/app/dashboard')}
          style={{
            flex: 1,
            background: 'var(--accent, #FF6B35)',
            color: '#000000',
            border: 'none',
            padding: '0.65rem 1.2rem',
            borderRadius: '6px',
            fontSize: '0.82rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
            cursor: 'pointer',
            boxShadow: '0 0 16px rgba(255, 107, 53, 0.35)',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
        >
          Launch Workspace →
        </button>
        <button
          onClick={() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          title="Replay 3D experience"
          style={{
            background: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#AAAAAA',
            padding: '0.65rem 0.95rem',
            borderRadius: '6px',
            fontSize: '0.78rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'border-color 0.15s ease, color 0.15s ease',
          }}
        >
          ↺ Replay
        </button>
      </div>
    </div>
  );
}
