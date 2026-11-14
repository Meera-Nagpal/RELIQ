import React, { useMemo, useState, useEffect } from 'react';
import { useExperienceStore } from '../store/experienceStore';
import { apiRepository } from '../services/apiRepository';
import { useRouter } from '../router/useRouter';

/**
 * Metric numbers HUD overlay.
 * Formats percentages vs counts correctly, and smoothly animates
 * with a cinematic blur-fade effect and clean inter-state buffers.
 */
export function MetricOverlay() {
  const currentStateIndex = useExperienceStore((state) => state.currentStateIndex);
  const currentState = useExperienceStore((state) => state.currentState);
  const stateProgress = useExperienceStore((state) => state.stateProgress);
  const { isTransitioning } = useRouter();

  const [activeCaseCount, setActiveCaseCount] = useState<number>(500);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const datasets = await apiRepository.getDatasets();
        if (mounted && datasets && datasets.length > 0) {
          const storedDatasetId = localStorage.getItem('reliq_active_dataset_id');
          const matched = storedDatasetId
            ? datasets.find((d) => d.id === storedDatasetId)
            : null;
          const targetDataset = matched || datasets.find((d) => (d.cases?.length || 0) > 0) || datasets[0];
          if (targetDataset?.cases?.length) {
            setActiveCaseCount(targetDataset.cases.length);
          }
        }
      } catch {
        setActiveCaseCount(500);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const opacity = useMemo(() => {
    if (currentStateIndex === 0) return 0; // SYSTEM (Hero handles title)
    if (currentStateIndex === 5 && stateProgress > 0.22) return 0; // Dissolves before DashboardTransition opens

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

  // Display value calculation
  const { displayValue, hasPercent, label } = useMemo(() => {
    if (!currentState) return { displayValue: '', hasPercent: false, label: '' };

    // State 1: DATA (Test case count from harness)
    if (currentStateIndex === 1) {
      return {
        displayValue: String(activeCaseCount || 500),
        hasPercent: false,
        label: 'TEST CASES IN HARNESS',
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
  }, [currentStateIndex, stateProgress, currentState, activeCaseCount]);

  if (isTransitioning || currentStateIndex === 0 || currentStateIndex === 5 || opacity <= 0.01) return null;

  const isRegressionWarning = currentStateIndex === 3 && stateProgress > 0.7;
  const blurPx = Math.max(0, (1 - opacity) * 12);

  return (
    <div
      style={{
        position: 'fixed',
        top: '25%',
        right: 'clamp(2rem, 8vw, 8rem)',
        transform: 'none',
        willChange: 'opacity, filter',
        zIndex: 12,
        pointerEvents: 'none',
        opacity,
        filter: `blur(${blurPx.toFixed(1)}px)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        transition: 'opacity 0.45s cubic-bezier(0.16, 1, 0.3, 1), filter 0.45s cubic-bezier(0.16, 1, 0.3, 1)',
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
            color: isRegressionWarning ? '#EF4444' : '#FFFFFF',
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
              color: isRegressionWarning ? '#EF4444' : '#2563EB',
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
          color: isRegressionWarning ? '#EF4444' : 'var(--text-muted, #888888)',
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
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            color: '#EF4444',
            borderRadius: '2px',
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.12em',
            fontFamily: 'monospace',
          }}
        >
          CRITICAL REGRESSION DETECTED
        </div>
      )}
    </div>
  );
}
