/* ============================================================
   RELIQ — Ripple Loader Component
   
   8-ring concentric scanning / evaluation pulse animation for:
   - Global page navigation transitions
   - Real-time live evaluation progress monitoring
   
   Features:
   - 8 distinct staggered concentric rings
   - Tuned 4.2s lifecycle (target 3.5–5.0s) for a slower, visible pulse
   - Subtle variations in radius, opacity, scale, and color gradient
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
  const duration = mode === 'pulse' ? '2.5s' : '4.2s';
  const timingFn = 'cubic-bezier(0.18, 0.65, 0.32, 1)';

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
        @keyframes reliqPulseAnimation1 {
          0% { transform: scale(0.12); opacity: 0; border-color: ${color}; }
          12% { opacity: 0.88; border-color: ${color}; }
          50% { border-color: ${secondaryColor}; }
          100% { transform: scale(2.85); opacity: 0; border-color: ${color}; }
        }
        @keyframes reliqPulseAnimation2 {
          0% { transform: scale(0.14); opacity: 0; border-color: ${secondaryColor}; }
          15% { opacity: 0.82; border-color: ${color}; }
          55% { border-color: #FFAA44; }
          100% { transform: scale(2.70); opacity: 0; border-color: ${color}; }
        }
        @keyframes reliqPulseAnimation3 {
          0% { transform: scale(0.16); opacity: 0; border-color: ${color}; }
          18% { opacity: 0.76; border-color: ${secondaryColor}; }
          60% { border-color: ${color}; }
          100% { transform: scale(2.95); opacity: 0; border-color: ${secondaryColor}; }
        }

        .reliq-ripple-ring {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          border-radius: 50%;
          will-change: transform, opacity;
          opacity: 0;
          pointer-events: none;
          box-sizing: border-box;
        }

        .reliq-ripple-ring-1 {
          border: 2px solid ${color};
          animation: reliqPulseAnimation1 ${duration} ${timingFn} ${mode === 'pulse' ? 'forwards' : 'infinite'};
          animation-delay: 0.00s;
        }

        .reliq-ripple-ring-2 {
          border: 1.8px solid ${secondaryColor};
          animation: reliqPulseAnimation2 ${duration} ${timingFn} ${mode === 'pulse' ? 'forwards' : 'infinite'};
          animation-delay: 0.25s;
        }

        .reliq-ripple-ring-3 {
          border: 2px solid ${color};
          animation: reliqPulseAnimation3 ${duration} ${timingFn} ${mode === 'pulse' ? 'forwards' : 'infinite'};
          animation-delay: 0.50s;
        }

        .reliq-ripple-ring-4 {
          border: 1.6px solid ${secondaryColor};
          animation: reliqPulseAnimation1 ${duration} ${timingFn} ${mode === 'pulse' ? 'forwards' : 'infinite'};
          animation-delay: 0.75s;
        }

        .reliq-ripple-ring-5 {
          border: 2px solid ${color};
          animation: reliqPulseAnimation2 ${duration} ${timingFn} ${mode === 'pulse' ? 'forwards' : 'infinite'};
          animation-delay: 1.00s;
        }

        .reliq-ripple-ring-6 {
          border: 1.7px solid ${secondaryColor};
          animation: reliqPulseAnimation3 ${duration} ${timingFn} ${mode === 'pulse' ? 'forwards' : 'infinite'};
          animation-delay: 1.25s;
        }

        .reliq-ripple-ring-7 {
          border: 1.5px solid ${color};
          animation: reliqPulseAnimation1 ${duration} ${timingFn} ${mode === 'pulse' ? 'forwards' : 'infinite'};
          animation-delay: 1.50s;
        }

        .reliq-ripple-ring-8 {
          border: 1.8px solid ${secondaryColor};
          animation: reliqPulseAnimation2 ${duration} ${timingFn} ${mode === 'pulse' ? 'forwards' : 'infinite'};
          animation-delay: 1.75s;
        }

        @media (prefers-reduced-motion: reduce) {
          .reliq-ripple-ring {
            animation: none !important;
            opacity: 0.35 !important;
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
        {/* Core glow scanner dot */}
        <div
          style={{
            width: `${Math.max(8, size * 0.12)}px`,
            height: `${Math.max(8, size * 0.12)}px`,
            borderRadius: '50%',
            background: color,
            boxShadow: `0 0 14px ${color}, 0 0 5px #FFFFFF`,
            zIndex: 2,
          }}
        />

        {/* 8 Concentric Ripple Rings */}
        <div className="ripple reliq-ripple-ring reliq-ripple-ring-1" />
        <div className="ripple reliq-ripple-ring reliq-ripple-ring-2" />
        <div className="ripple reliq-ripple-ring reliq-ripple-ring-3" />
        <div className="ripple reliq-ripple-ring reliq-ripple-ring-4" />
        <div className="ripple reliq-ripple-ring reliq-ripple-ring-5" />
        <div className="ripple reliq-ripple-ring reliq-ripple-ring-6" />
        <div className="ripple reliq-ripple-ring reliq-ripple-ring-7" />
        <div className="ripple reliq-ripple-ring reliq-ripple-ring-8" />
      </div>
    </div>
  );
};
