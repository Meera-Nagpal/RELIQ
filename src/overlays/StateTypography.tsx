import React, { useMemo } from 'react';
import { useExperienceStore } from '../store/experienceStore';
import { mapRangeClamped } from '../utils/math';
import { useRouter } from '../router/useRouter';

/**
 * Compact Supporting Information Box for States 02 to 05
 * Appears in the lower-left supporting area, synchronized with 3D camera transitions.
 * Preserves the open 3D scene as the primary visual hero.
 */
export function StateTypography() {
  const currentStateIndex = useExperienceStore((state) => state.currentStateIndex);
  const currentState = useExperienceStore((state) => state.currentState);
  const stateProgress = useExperienceStore((state) => state.stateProgress);
  const { isTransitioning } = useRouter();

  const opacity = useMemo(() => {
    if (isTransitioning) return 0;
    if (currentStateIndex === 0) return 0; // State 0 uses HeroOverlay
    if (currentStateIndex === 5 && stateProgress > 0.35) return 0; // Seamless handoff to State 06 compact box

    // Smooth fade in / out within state
    if (stateProgress < 0.15) {
      return mapRangeClamped(stateProgress, 0, 0.15, 0, 1);
    } else if (stateProgress > 0.85) {
      return mapRangeClamped(stateProgress, 0.85, 1.0, 1, 0);
    }
    return 1;
  }, [currentStateIndex, stateProgress, isTransitioning]);

  if (isTransitioning || currentStateIndex === 0 || !currentState || opacity <= 0.01) return null;

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
        padding: '1.15rem 1.4rem',
        borderRadius: '10px',
        background: 'rgba(10, 14, 22, 0.62)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.40)',
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
          fontSize: 'clamp(1.35rem, 2.4vw, 2.1rem)',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          color: '#F5F5F5',
          lineHeight: 1.18,
          margin: '0 0 0.55rem 0',
          textShadow: '0 2px 10px rgba(0, 0, 0, 0.7)',
        }}
      >
        {currentState.name}
      </h2>

      {/* Description */}
      <p
        style={{
          fontSize: 'clamp(0.85rem, 1.05vw, 0.96rem)',
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
