/* ============================================================
   RELIQ — useExperienceState Hook
   
   Derives computed/convenience values from the experience store.
   Uses Zustand's shallow equality to minimise re-renders.
   ============================================================ */

import { useExperienceStore, type ExperienceState, type HealthStatus } from '../store/experienceStore';
import { shallow } from 'zustand/shallow';

/** Map health status → numeric factor for shader/animation interpolation */
const HEALTH_FACTOR_MAP: Record<HealthStatus, number> = {
  healthy: 1.0,
  warning: 0.7,
  regression: 0.3,
  recovered: 0.9,
};

/**
 * Compute per-state opacity from stateProgress.
 * Fade in  : 0.00 → 0.15  (opacity 0 → 1)
 * Full     : 0.15 → 0.85  (opacity 1)
 * Fade out : 0.85 → 1.00  (opacity 1 → 0)
 */
function computeStateOpacity(stateProgress: number): number {
  if (stateProgress < 0.15) {
    return stateProgress / 0.15;
  }
  if (stateProgress > 0.85) {
    return 1 - (stateProgress - 0.85) / 0.15;
  }
  return 1;
}

export interface UseExperienceStateReturn {
  /** Full ExperienceState object for the current state */
  currentState: ExperienceState;
  /** True when viewing the first state (SYSTEM / hero) */
  isFirstState: boolean;
  /** True when viewing the last state (CONFIDENCE / ship) */
  isLastState: boolean;
  /** True when health status is 'regression' */
  isRegression: boolean;
  /** Numeric 0-1 factor representing system health severity */
  healthFactor: number;
  /** Opacity for current state content (fades in/out at state boundaries) */
  stateOpacity: number;
}

/**
 * Convenience hook that derives computed values from the experience store.
 * Use this instead of reading raw store values in overlay components.
 */
export function useExperienceState(): UseExperienceStateReturn {
  const { currentState, currentStateIndex, healthStatus, stateProgress } =
    useExperienceStore(
      (s) => ({
        currentState: s.currentState,
        currentStateIndex: s.currentStateIndex,
        healthStatus: s.healthStatus,
        stateProgress: s.stateProgress,
      }),
      shallow,
    );

  return {
    currentState,
    isFirstState: currentStateIndex === 0,
    isLastState: currentStateIndex === 5,
    isRegression: healthStatus === 'regression',
    healthFactor: HEALTH_FACTOR_MAP[healthStatus] ?? 1.0,
    stateOpacity: computeStateOpacity(stateProgress),
  };
}
