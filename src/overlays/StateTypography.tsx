import React, { useMemo } from 'react';
import { useExperienceStore } from '../store/experienceStore';
import { useRouter } from '../router/useRouter';

/**
 * Narrative HUD overlay explaining each step in the AI reliability workflow.
 * Anchored in the lower-left with a cinematic blur-fade transition
 * so the center monumental 3D titles have full screen width to shine without overlap.
 */
export function StateTypography() {
  const currentStateIndex = useExperienceStore((state) => state.currentStateIndex);
  const currentState = useExperienceStore((state) => state.currentState);
  const stateProgress = useExperienceStore((state) => state.stateProgress);
  const { isTransitioning } = useRouter();

  const opacity = useMemo(() => {
    if (currentStateIndex === 0) return 0; // State 0 uses HeroOverlay
    if (currentStateIndex === 5 && stateProgress > 0.22) return 0; // Final state transitions into Dashboard

    // Smooth Hermite fade in (0.05 to 0.22) and clean fade out (0.72 to 0.88)
    if (stateProgress < 0.22) {
      const t = Math.max(0, (stateProgress - 0.05) / 0.17);
      return t * t * (3 - 2 * t);
    } else if (stateProgress > 0.72) {
      const t = Math.max(0, 1 - (stateProgress - 0.72) / 0.16);
      return t * t * (3 - 2 * t);
    }
    return 1;
  }, [currentStateIndex, stateProgress]);

  if (isTransitioning || currentStateIndex === 0 || !currentState || opacity <= 0.01) return null;

  const paddedIndex = (currentStateIndex + 1).toString().padStart(2, '0');
  const blurPx = Math.max(0, (1 - opacity) * 12);

  return (
    <div
      style={{
        position: 'fixed',
        left: 'clamp(1.5rem, 6vw, 6rem)',
        bottom: 'clamp(2.5rem, 6vh, 4.5rem)',
        transform: 'none',
        willChange: 'opacity, filter',
        zIndex: 12,
        pointerEvents: 'none',
        opacity,
        filter: `blur(${blurPx.toFixed(1)}px)`,
        maxWidth: 'clamp(280px, 32vw, 420px)',
        padding: '1.2rem 1.6rem',
        borderRadius: '4px',
        background: 'radial-gradient(ellipse at left bottom, rgba(15, 15, 15, 0.88) 0%, rgba(15, 15, 15, 0) 80%)',
        transition: 'opacity 0.45s cubic-bezier(0.16, 1, 0.3, 1), filter 0.45s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Step tag */}
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: '0.78rem',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: currentStateIndex === 3 ? '#EF4444' : 'var(--blue-light, #60A5FA)',
          fontWeight: 600,
          marginBottom: '0.4rem',
        }}
      >
        STAGE {paddedIndex} // {currentState.label}
      </div>

      {/* Headline */}
      <h2
        style={{
          fontSize: 'clamp(1.6rem, 2.6vw, 2.4rem)',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          color: '#F5F5F5',
          lineHeight: 1.15,
          margin: '0 0 0.6rem 0',
          textShadow: '0 2px 14px rgba(0, 0, 0, 0.8)',
        }}
      >
        {currentState.name}
      </h2>

      {/* Description */}
      <p
        style={{
          fontSize: 'clamp(0.85rem, 1.1vw, 1rem)',
          color: 'var(--text-muted, #A0B0C0)',
          lineHeight: 1.5,
          margin: 0,
          textShadow: '0 1px 8px rgba(0, 0, 0, 0.7)',
        }}
      >
        {currentState.description}
      </p>
    </div>
  );
}
