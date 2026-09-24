import React, { useMemo } from 'react';
import { useExperienceStore } from '../store/experienceStore';
import { mapRangeClamped } from '../utils/math';

import { useRouter } from '../router/useRouter';

/**
 * Narrative HUD overlay explaining each step in the AI reliability workflow.
 * Appears on the left side of the screen, synchronized with 3D camera transitions.
 */
export function StateTypography() {
  const currentStateIndex = useExperienceStore((state) => state.currentStateIndex);
  const currentState = useExperienceStore((state) => state.currentState);
  const stateProgress = useExperienceStore((state) => state.stateProgress);
  const { isTransitioning } = useRouter();

  const opacity = useMemo(() => {
    if (currentStateIndex === 0) return 0; // State 0 uses HeroOverlay
    if (currentStateIndex === 2) return 0; // State 2 (COMPARE) uses dedicated Model Ledger data rail
    if (currentStateIndex === 5 && stateProgress > 0.5) return 0; // Final state transitions into Dashboard

    // Smooth fade in / out within state
    if (stateProgress < 0.15) {
      return mapRangeClamped(stateProgress, 0, 0.15, 0, 1);
    } else if (stateProgress > 0.85) {
      return mapRangeClamped(stateProgress, 0.85, 1.0, 1, 0);
    }
    return 1;
  }, [currentStateIndex, stateProgress]);

  if (isTransitioning || currentStateIndex === 0 || !currentState || opacity <= 0.01) return null;

  const paddedIndex = (currentStateIndex + 1).toString().padStart(2, '0');

  return (
    <div
      style={{
        position: 'fixed',
        left: 'clamp(1.5rem, 6vw, 6rem)',
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 12,
        pointerEvents: 'none',
        opacity,
        maxWidth: 'clamp(320px, 36vw, 460px)',
        padding: '1.5rem',
        borderRadius: '12px',
        background: 'radial-gradient(ellipse at left, rgba(10, 10, 10, 0.72) 0%, rgba(10, 10, 10, 0) 75%)',
        transition: 'opacity 0.25s ease-out',
      }}
    >
      {/* Step tag */}
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: '0.78rem',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'var(--accent, #FF6B35)',
          fontWeight: 600,
          marginBottom: '0.5rem',
        }}
      >
        STAGE {paddedIndex} // {currentState.label}
      </div>

      {/* Headline */}
      <h2
        style={{
          fontSize: 'clamp(1.7rem, 3.2vw, 2.8rem)',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          color: '#F5F5F5',
          lineHeight: 1.15,
          margin: '0 0 0.85rem 0',
          textShadow: '0 2px 14px rgba(0, 0, 0, 0.8)',
        }}
      >
        {currentState.name}
      </h2>

      {/* Description */}
      <p
        style={{
          fontSize: 'clamp(0.95rem, 1.3vw, 1.15rem)',
          color: 'var(--text-muted, #A0B0C0)',
          lineHeight: 1.6,
          margin: 0,
          textShadow: '0 1px 8px rgba(0, 0, 0, 0.7)',
        }}
      >
        {currentState.description}
      </p>
    </div>
  );
}
