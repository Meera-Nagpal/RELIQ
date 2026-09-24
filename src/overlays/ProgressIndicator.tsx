import React from 'react';
import { useExperienceStore } from '../store/experienceStore';
import { useRouter } from '../router/useRouter';

const STEP_LABELS = [
  { index: 0, tag: '01', name: 'SYSTEM' },
  { index: 1, tag: '02', name: 'RUN' },
  { index: 2, tag: '03', name: 'COMPARE' },
  { index: 3, tag: '04', name: 'DETECT' },
  { index: 4, tag: '05', name: 'INVESTIGATE' },
  { index: 5, tag: '06', name: 'SHIP' },
];

/**
 * Minimal Immersive Progress Indicator
 * Displays the current step along the 6-state journey,
 * with clickable step dots for instant state jumping.
 */
export function ProgressIndicator() {
  const currentStateIndex = useExperienceStore((state) => state.currentStateIndex);
  const scrollProgress = useExperienceStore((state) => state.scrollProgress);
  const { triggerTransition } = useRouter();

  const handleStepClick = (stepIndex: number) => {
    if (stepIndex === currentStateIndex) return;
    const totalScrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    const targetScroll = (stepIndex / 6 + 0.02) * totalScrollHeight;
    triggerTransition(() => {
      window.scrollTo({ top: targetScroll, behavior: 'auto' });
    });
  };

  return (
    <nav
      aria-label="Experience Progress"
      style={{
        position: 'fixed',
        right: 'clamp(1.5rem, 3vw, 3rem)',
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 25,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '1.2rem',
        pointerEvents: 'auto',
      }}
    >
      {/* Step Counter */}
      <div
        style={{
          fontFamily: 'monospace',
          color: 'var(--text-muted, #888888)',
          fontSize: '0.75rem',
          letterSpacing: '0.15em',
        }}
      >
        0{currentStateIndex + 1} // 06
      </div>

      {/* Step Dots & Labels */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          alignItems: 'flex-end',
        }}
      >
        {STEP_LABELS.map((step) => {
          const isActive = step.index === currentStateIndex;
          return (
            <button
              key={step.index}
              onClick={() => handleStepClick(step.index)}
              title={`Jump to ${step.name}`}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.2rem 0',
                outline: 'none',
              }}
            >
              <span
                style={{
                  fontSize: '0.68rem',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.3)',
                  fontWeight: isActive ? 600 : 400,
                  transition: 'color 0.3s ease',
                  opacity: isActive ? 1 : 0.6,
                }}
              >
                {step.name}
              </span>
              <div
                style={{
                  width: isActive ? '18px' : '4px',
                  height: '4px',
                  borderRadius: '2px',
                  background: isActive
                    ? 'var(--accent, #FF6B35)'
                    : 'rgba(255, 255, 255, 0.2)',
                  transition: 'all 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)',
                  boxShadow: isActive ? '0 0 10px rgba(255, 107, 53, 0.6)' : 'none',
                }}
              />
            </button>
          );
        })}
      </div>

      {/* Continuous Mini Progress Line */}
      <div
        style={{
          width: '2px',
          height: '40px',
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '1px',
          overflow: 'hidden',
          marginTop: '0.5rem',
        }}
      >
        <div
          style={{
            width: '100%',
            height: `${scrollProgress * 100}%`,
            background: 'var(--accent, #FF6B35)',
            transition: 'height 0.1s linear',
          }}
        />
      </div>
    </nav>
  );
}
