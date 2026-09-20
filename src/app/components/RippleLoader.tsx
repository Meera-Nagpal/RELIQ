/* ============================================================
   RELIQ — Ripple Loader Component
   
   Reusable 3-ring concentric ripple animation for:
   - Global page navigation transitions
   - Real-time evaluation running progress
   
   Uses RELIQ theme variables (--reliq-accent, --reliq-accent-secondary).
   ============================================================ */

import React from 'react';

interface RippleLoaderProps {
  size?: number;
  mode?: 'continuous' | 'pulse';
  color?: string;
  secondaryColor?: string;
  className?: string;
}

export const RippleLoader: React.FC<RippleLoaderProps> = ({
  size = 100,
  mode = 'continuous',
  color = 'var(--reliq-accent, #FF6B35)',
  secondaryColor = 'var(--reliq-accent-secondary, #FF8C5A)',
  className = '',
}) => {
  return (
    <div
      className={`reliq-ripple-wrapper ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      <style>{`
        @keyframes reliqRippleAnimation {
          0% {
            transform: scale(0.25);
            opacity: 0.9;
            border-color: ${color};
          }
          45% {
            opacity: 0.65;
            border-color: ${secondaryColor};
          }
          100% {
            transform: scale(2.6);
            opacity: 0;
            border-color: ${color};
          }
        }

        .reliq-ripple-ring {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          border-radius: 50%;
          border: 4px solid ${color};
          will-change: transform, opacity;
          opacity: 0;
          pointer-events: none;
          box-sizing: border-box;
        }

        .reliq-ripple-ring-1 {
          animation: reliqRippleAnimation ${mode === 'pulse' ? '2.5s' : '1.8s'} cubic-bezier(0.22, 0.61, 0.36, 1) ${mode === 'pulse' ? 'forwards' : 'infinite'};
          animation-delay: 0s;
        }

        .reliq-ripple-ring-2 {
          animation: reliqRippleAnimation ${mode === 'pulse' ? '2.5s' : '1.8s'} cubic-bezier(0.22, 0.61, 0.36, 1) ${mode === 'pulse' ? 'forwards' : 'infinite'};
          animation-delay: ${mode === 'pulse' ? '0.45s' : '0.45s'};
        }

        .reliq-ripple-ring-3 {
          animation: reliqRippleAnimation ${mode === 'pulse' ? '2.5s' : '1.8s'} cubic-bezier(0.22, 0.61, 0.36, 1) ${mode === 'pulse' ? 'forwards' : 'infinite'};
          animation-delay: ${mode === 'pulse' ? '0.9s' : '0.9s'};
        }

        @media (prefers-reduced-motion: reduce) {
          .reliq-ripple-ring {
            animation: none !important;
            opacity: 0.4 !important;
            transform: scale(1) !important;
          }
        }
      `}</style>

      <div
        className="ripple-container"
        style={{
          position: 'relative',
          width: `${size}px`,
          height: `${size}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Core glow dot */}
        <div
          style={{
            width: `${Math.max(10, size * 0.16)}px`,
            height: `${Math.max(10, size * 0.16)}px`,
            borderRadius: '50%',
            background: color,
            boxShadow: `0 0 16px ${color}`,
            zIndex: 2,
          }}
        />

        {/* 3 Concentric Ripple Rings */}
        <div className="ripple reliq-ripple-ring reliq-ripple-ring-1" />
        <div className="ripple reliq-ripple-ring reliq-ripple-ring-2" />
        <div className="ripple reliq-ripple-ring reliq-ripple-ring-3" />
      </div>
    </div>
  );
};
