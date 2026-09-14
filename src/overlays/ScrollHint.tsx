import React from 'react';
import { useExperienceStore } from '../store/experienceStore';

/**
 * Minimal scroll & keyboard exploration hint.
 * Disappears once the user starts scrolling.
 */
export function ScrollHint() {
  const showScrollHint = useExperienceStore((state) => state.showScrollHint);

  if (!showScrollHint) return null;

  return (
    <div
      className="scroll-hint"
      style={{
        position: 'fixed',
        bottom: '2.5rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.6rem',
        transition: 'opacity 0.5s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.8rem',
          color: 'var(--text-muted, #888888)',
          fontSize: '0.72rem',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          fontWeight: 500,
        }}
      >
        <span>Scroll to explore</span>
        <span style={{ opacity: 0.35 }}>|</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
          <kbd
            style={{
              padding: '0.15rem 0.4rem',
              borderRadius: '3px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              fontSize: '0.65rem',
              background: 'rgba(255, 255, 255, 0.05)',
              fontFamily: 'inherit',
            }}
          >
            ↑
          </kbd>
          <kbd
            style={{
              padding: '0.15rem 0.4rem',
              borderRadius: '3px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              fontSize: '0.65rem',
              background: 'rgba(255, 255, 255, 0.05)',
              fontFamily: 'inherit',
            }}
          >
            ↓
          </kbd>
        </span>
      </div>

      <div
        style={{
          width: '1px',
          height: '32px',
          background: 'linear-gradient(to bottom, var(--accent, #FF6B35), transparent)',
          animation: 'scroll-pulse 2s ease-in-out infinite',
        }}
      />
    </div>
  );
}
