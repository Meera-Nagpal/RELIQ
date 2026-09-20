/* ============================================================
   RELIQ — Fullscreen Page Transition Overlay
   
   Renders a fixed, fullscreen overlay with 3 concentric RELIQ ripples
   that expand and fade during navigation events.
   
   Target Duration: ~650ms total.
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
        background: 'rgba(10, 10, 10, 0.88)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto', // Prevents double clicks during transition
        overflow: 'hidden',
        animation: 'reliqOverlayFade 0.65s cubic-bezier(0.22, 0.61, 0.36, 1) forwards',
      }}
    >
      <style>{`
        @keyframes reliqOverlayFade {
          0% {
            opacity: 0;
          }
          15% {
            opacity: 1;
          }
          80% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .page-transition {
            animation: none !important;
            opacity: 1 !important;
          }
        }
      `}</style>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.2rem',
        }}
      >
        <RippleLoader size={120} mode="pulse" />
        <div
          style={{
            fontFamily: "'Inter', -apple-system, sans-serif",
            fontSize: '0.72rem',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--reliq-accent, #FF6B35)',
            fontWeight: 700,
            opacity: 0.9,
          }}
        >
          RELIQ TRANSITION
        </div>
      </div>
    </div>
  );
};
