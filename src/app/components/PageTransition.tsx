/* ============================================================
   RELIQ — Clean Brand Transition Overlay
   
   Renders a focused transition layer displaying ONLY "RELIQ" with
   centered concentric circular ripples, subtle orange glow, and
   calibrated 700-1000ms timing.
   
   Underlying 3D environment remains rendered behind the translucent
   backdrop while all state-specific typography is hidden.
   
   Accessibility: Respects prefers-reduced-motion: reduce.
   ============================================================ */

import React from 'react';
import { RippleLoader } from './RippleLoader';

interface PageTransitionProps {
  isVisible: boolean;
}

export const PageTransition: React.FC<PageTransitionProps> = ({ isVisible }) => {
  if (!isVisible) return null;

  return (
    <div
      className="page-transition"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(8, 10, 14, 0.76)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto', // Prevents double clicks during transition
        overflow: 'hidden',
        /* 2.5s duration compatibility */
        animation: 'reliqTransitionFade 0.68s cubic-bezier(0.22, 0.61, 0.36, 1) forwards',
      }}
    >
      <style>{`
        @keyframes reliqTransitionFade {
          0% {
            opacity: 0;
            transform: scale(0.98);
          }
          25% {
            opacity: 1;
            transform: scale(1);
          }
          65% {
            opacity: 1;
            transform: scale(1);
          }
          100% {
            opacity: 0;
            transform: scale(1.02);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .page-transition {
            animation: none !important;
            opacity: 1 !important;
          }
        }
      `}</style>

      {/* ── Centered Brand Transition Container ── */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '280px',
          height: '240px',
        }}
      >
        {/* Concentric subtle circular rings centered around RELIQ */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <RippleLoader size={130} mode="pulse" />
        </div>

        {/* Brand wordmark ONLY: RELIQ */}
        <div
          style={{
            position: 'relative',
            zIndex: 10,
            fontFamily: "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: '1.75rem',
            fontWeight: 800,
            letterSpacing: '0.28em',
            textIndent: '0.28em', // optically center letter-spaced text
            color: '#F0F3F6',
            textShadow: '0 0 24px rgba(255, 107, 53, 0.5), 0 0 48px rgba(255, 107, 53, 0.2)',
            marginBottom: '0.6rem',
          }}
        >
          RELIQ
        </div>

        {/* Subtle orange accent / dots row: ◯ ● ◯ */}
        <div
          style={{
            position: 'relative',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: '0.55rem',
            opacity: 0.85,
          }}
        >
          <div
            style={{
              width: '4px',
              height: '4px',
              borderRadius: '50%',
              border: '1px solid rgba(255, 107, 53, 0.7)',
              background: 'transparent',
            }}
          />
          <div
            style={{
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              background: 'var(--reliq-accent, #FF6B35)',
              boxShadow: '0 0 8px #FF6B35',
            }}
          />
          <div
            style={{
              width: '4px',
              height: '4px',
              borderRadius: '50%',
              border: '1px solid rgba(255, 107, 53, 0.7)',
              background: 'transparent',
            }}
          />
        </div>
      </div>
    </div>
  );
};
