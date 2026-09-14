import React, { useMemo } from 'react';
import { useExperienceStore } from '../store/experienceStore';
import { mapRangeClamped } from '../utils/math';

/**
 * Narrative HUD overlay explaining each step in the AI reliability workflow.
 * Appears on the left side of the screen, synchronized with 3D camera transitions.
 */
export function StateTypography() {
  const currentStateIndex = useExperienceStore((state) => state.currentStateIndex);
  const currentState = useExperienceStore((state) => state.currentState);
  const stateProgress = useExperienceStore((state) => state.stateProgress);

  const opacity = useMemo(() => {
    if (currentStateIndex === 0) return 0; // State 0 uses HeroOverlay
    if (currentStateIndex === 5 && stateProgress > 0.5) return 0; // Final state transitions into Dashboard

    // Smooth fade in / out within state
    if (stateProgress < 0.15) {
      return mapRangeClamped(stateProgress, 0, 0.15, 0, 1);
    } else if (stateProgress > 0.85) {
      return mapRangeClamped(stateProgress, 0.85, 1.0, 1, 0);
    }
    return 1;
  }, [currentStateIndex, stateProgress]);

  if (currentStateIndex === 0 || !currentState || opacity <= 0.01) return null;

  const paddedIndex = (currentStateIndex + 1).toString().padStart(2, '0');

  return (
    <div
      style={{
        position: 'fixed',
        left: 'clamp(2rem, 8vw, 8rem)',
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 12,
        pointerEvents: 'none',
        opacity,
        maxWidth: '420px',
        transition: 'opacity 0.2s ease-out',
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
          fontSize: 'clamp(1.8rem, 3.2vw, 3rem)',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          color: '#F5F5F5',
          lineHeight: 1.1,
          margin: '0 0 1rem 0',
        }}
      >
        {currentState.name}
      </h2>

      {/* Description */}
      <p
        style={{
          fontSize: 'clamp(0.95rem, 1.3vw, 1.15rem)',
          color: 'var(--text-muted, #999999)',
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        {currentState.description}
      </p>
    </div>
  );
}
