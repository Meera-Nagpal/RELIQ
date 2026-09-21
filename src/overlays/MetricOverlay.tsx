import React, { useMemo } from 'react';
import { useExperienceStore } from '../store/experienceStore';
import { mapRangeClamped } from '../utils/math';

/**
 * Giant animated metric numbers overlay.
 * Formats percentages vs counts correctly, and smoothly animates
 * the regression countdown: 96.8% -> 94.2% -> 91.7% -> 89.7%.
 */
export function MetricOverlay() {
  const currentStateIndex = useExperienceStore((state) => state.currentStateIndex);
  const currentState = useExperienceStore((state) => state.currentState);
  const stateProgress = useExperienceStore((state) => state.stateProgress);

  // During State 3 (REGRESSION) and State 4 (INVESTIGATION), VersionCards handles horizontal view,
  // so we keep this overlay subtle or focused on the core metric pulse.
  const opacity = useMemo(() => {
    if (currentStateIndex === 0) return 0; // SYSTEM (Hero handles title)
    if (currentStateIndex === 5) return 0; // CONFIDENCE / DashboardTransition handles final UI

    // Fade in at start (0 to 0.15), fade out at end (0.85 to 1.0)
    if (stateProgress < 0.15) {
      return mapRangeClamped(stateProgress, 0, 0.15, 0, 1);
    } else if (stateProgress > 0.85) {
      return mapRangeClamped(stateProgress, 0.85, 1.0, 1, 0);
    }
    return 1;
  }, [currentStateIndex, stateProgress]);

  // Display value calculation
  const { displayValue, hasPercent, label } = useMemo(() => {
    if (!currentState) return { displayValue: '', hasPercent: false, label: '' };

    // State 1: DATA (500 TEST CASES)
    if (currentStateIndex === 1) {
      return {
        displayValue: '500',
        hasPercent: false,
        label: 'ACTIVE TEST CASES IN HARNESS',
      };
    }

    // State 2: EVALUATION (94.8% ACCURACY)
    if (currentStateIndex === 2) {
      return {
        displayValue: '94.8',
        hasPercent: true,
        label: 'BASELINE ACCURACY',
      };
    }

    // State 3: REGRESSION (96.8% -> 94.2% -> 91.7% -> 89.7%)
    if (currentStateIndex === 3) {
      let val = '96.8';
      if (stateProgress > 0.25 && stateProgress <= 0.5) val = '94.2';
      else if (stateProgress > 0.5 && stateProgress <= 0.75) val = '91.7';
      else if (stateProgress > 0.75) val = '89.7';

      return {
        displayValue: val,
        hasPercent: true,
        label: stateProgress > 0.75 ? 'REGRESSION DETECTED' : 'EVALUATION IN PROGRESS',
      };
    }

    // State 4: INVESTIGATION (47 FAILED CASES)
    if (currentStateIndex === 4) {
      return {
        displayValue: '47',
        hasPercent: false,
        label: 'FAILED CASES IDENTIFIED',
      };
    }

    return {
      displayValue: currentState.metricValue || '',
      hasPercent: currentState.metricValue.includes('%'),
      label: currentState.metricLabel || '',
    };
  }, [currentStateIndex, stateProgress, currentState]);

  if (currentStateIndex === 0 || currentStateIndex === 5 || opacity <= 0.01) return null;

  const isRegressionWarning = currentStateIndex === 3 && stateProgress > 0.7;

  const topPosition = currentStateIndex === 3
    ? 'clamp(38%, 42vh, 46%)'
    : currentStateIndex === 2
    ? 'clamp(33%, 36vh, 40%)'
    : 'clamp(28%, 30vh, 34%)';

  const rightPosition = currentStateIndex === 2
    ? 'clamp(3rem, 8vw, 10vw)'
    : 'clamp(3rem, 10vw, 12vw)';

  return (
    <div
      style={{
        position: 'fixed',
        top: topPosition,
        right: rightPosition,
        zIndex: 20,
        pointerEvents: 'none',
        opacity,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        transition: 'opacity 0.2s ease-out',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '0.2rem',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <span
          style={{
            fontSize: 'clamp(3.5rem, 7vw, 7rem)',
            fontWeight: 800,
            lineHeight: 0.95,
            letterSpacing: '-0.04em',
            color: isRegressionWarning ? '#FF2200' : '#FFFFFF',
            transition: 'color 0.3s ease',
          }}
        >
          {displayValue}
        </span>
        {hasPercent && (
          <span
            style={{
              fontSize: 'clamp(1.8rem, 3.5vw, 3.5rem)',
              fontWeight: 700,
              color: isRegressionWarning ? '#FF2200' : 'var(--accent, #FF6B35)',
            }}
          >
            %
          </span>
        )}
      </div>

      <div
        style={{
          fontSize: '0.75rem',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: isRegressionWarning ? '#FFAA99' : 'var(--text-muted, #888888)',
          fontWeight: 600,
          marginTop: '0.6rem',
        }}
      >
        {label}
      </div>

      {isRegressionWarning && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.4rem 0.9rem',
            background: 'rgba(255, 34, 0, 0.15)',
            border: '1px solid #FF2200',
            color: '#FF4422',
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.15em',
            boxShadow: '0 0 20px rgba(255, 34, 0, 0.3)',
            animation: 'pulse 1.2s infinite',
          }}
        >
          CRITICAL REGRESSION DETECTED
        </div>
      )}
    </div>
  );
}
