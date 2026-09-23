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
        left: 'clamp(1.5rem, 5vw, 5rem)',
        bottom: 'clamp(2rem, 7vh, 4.5rem)',
        zIndex: 20,
        pointerEvents: 'none',
        opacity,
        maxWidth: 'clamp(280px, 32vw, 390px)',
        padding: '1.1rem 1.35rem',
        borderRadius: '10px',
        background: 'rgba(10, 14, 22, 0.48)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.35)',
        transition: 'opacity 0.22s cubic-bezier(0.22, 0.61, 0.36, 1)',
      }}
    >
      {/* Step tag */}
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: '0.72rem',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'var(--accent, #FF6B35)',
          fontWeight: 600,
          marginBottom: '0.4rem',
        }}
      >
        STAGE {paddedIndex} // {currentState.label}
      </div>

      {/* Headline */}
      <h2
        style={{
          fontSize: 'clamp(1.4rem, 2.5vw, 2.2rem)',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          color: '#F5F5F5',
          lineHeight: 1.18,
          margin: '0 0 0.6rem 0',
          textShadow: '0 2px 10px rgba(0, 0, 0, 0.7)',
        }}
      >
        {currentState.name}
      </h2>

      {/* Description */}
      <p
        style={{
          fontSize: 'clamp(0.85rem, 1.1vw, 0.98rem)',
          color: 'var(--text-muted, #A0B0C0)',
          lineHeight: 1.55,
          margin: 0,
          textShadow: '0 1px 6px rgba(0, 0, 0, 0.6)',
        }}
      >
        {currentState.description}
      </p>
    </div>
  );
}
