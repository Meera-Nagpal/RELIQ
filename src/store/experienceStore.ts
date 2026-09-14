/* ============================================================
   RELIQ — Experience State Store (Zustand)
   
   Central state for the immersive experience.
   Keeps 3D state separate from app state.
   All per-frame animation values use refs, NOT this store.
   This store is for discrete state changes only.
   ============================================================ */

import { create } from 'zustand';

/** The 6 immersive states the user scrolls through */
export type ExperienceStateName =
  | 'SYSTEM'
  | 'DATA'
  | 'EVALUATION'
  | 'REGRESSION'
  | 'INVESTIGATION'
  | 'CONFIDENCE';

/** System health visual state */
export type HealthStatus = 'healthy' | 'warning' | 'regression' | 'recovered';

/** Device capability tier */
export type CapabilityTier = 'high' | 'medium' | 'low' | 'fallback';

/** State definition for each immersive state */
export interface ExperienceState {
  index: number;
  name: ExperienceStateName;
  label: string;
  description: string;
  metricValue: string;
  metricLabel: string;
  healthStatus: HealthStatus;
}

/** All 6 states */
export const EXPERIENCE_STATES: ExperienceState[] = [
  {
    index: 0,
    name: 'SYSTEM',
    label: 'RELIQ',
    description: 'Ship AI changes with confidence.',
    metricValue: '',
    metricLabel: '',
    healthStatus: 'healthy',
  },
  {
    index: 1,
    name: 'DATA',
    label: 'RUN',
    description: 'Evaluate your AI against real test cases.',
    metricValue: '500',
    metricLabel: 'TEST CASES',
    healthStatus: 'healthy',
  },
  {
    index: 2,
    name: 'EVALUATION',
    label: 'COMPARE',
    description: 'Measure one version against another.',
    metricValue: '94.8%',
    metricLabel: 'ACCURACY',
    healthStatus: 'healthy',
  },
  {
    index: 3,
    name: 'REGRESSION',
    label: 'DETECT',
    description: 'Find regressions before production.',
    metricValue: '89.7%',
    metricLabel: 'RELIABILITY',
    healthStatus: 'regression',
  },
  {
    index: 4,
    name: 'INVESTIGATION',
    label: 'INVESTIGATE',
    description: 'Trace failures to their root cause.',
    metricValue: '47',
    metricLabel: 'FAILED CASES',
    healthStatus: 'warning',
  },
  {
    index: 5,
    name: 'CONFIDENCE',
    label: 'SHIP',
    description: 'Deploy with confidence.',
    metricValue: '87%',
    metricLabel: 'ROOT-CAUSE CONFIDENCE',
    healthStatus: 'recovered',
  },
];

/** Store shape */
interface ExperienceStore {
  // Current state
  currentStateIndex: number;
  currentState: ExperienceState;
  healthStatus: HealthStatus;
  
  // Scroll
  scrollProgress: number;        // 0 → 1 normalized
  stateProgress: number;         // 0 → 1 within current state
  scrollVelocity: number;
  
  // UI visibility
  showScrollHint: boolean;
  showDashboard: boolean;
  isHorizontalScrollActive: boolean;
  
  // Device
  capabilityTier: CapabilityTier;
  webglAvailable: boolean;
  
  // Ready state
  experienceReady: boolean;
  
  // Actions
  setScrollProgress: (progress: number) => void;
  setScrollVelocity: (velocity: number) => void;
  setCapabilityTier: (tier: CapabilityTier) => void;
  setWebglAvailable: (available: boolean) => void;
  setExperienceReady: (ready: boolean) => void;
  setShowScrollHint: (show: boolean) => void;
  setShowDashboard: (show: boolean) => void;
  setHorizontalScrollActive: (active: boolean) => void;
}

/** Calculate which state we're in from scroll progress */
function getStateFromProgress(progress: number): {
  index: number;
  stateProgress: number;
} {
  const totalStates = EXPERIENCE_STATES.length;
  const stateSize = 1 / totalStates;
  const index = Math.min(
    Math.floor(progress / stateSize),
    totalStates - 1
  );
  const stateProgress = (progress - index * stateSize) / stateSize;
  return { index, stateProgress: Math.min(Math.max(stateProgress, 0), 1) };
}

export const useExperienceStore = create<ExperienceStore>((set) => ({
  currentStateIndex: 0,
  currentState: EXPERIENCE_STATES[0],
  healthStatus: 'healthy',
  scrollProgress: 0,
  stateProgress: 0,
  scrollVelocity: 0,
  showScrollHint: true,
  showDashboard: false,
  isHorizontalScrollActive: false,
  capabilityTier: 'high',
  webglAvailable: true,
  experienceReady: false,
  
  setScrollProgress: (progress: number) => {
    const { index, stateProgress } = getStateFromProgress(progress);
    const state = EXPERIENCE_STATES[index];
    set({
      scrollProgress: progress,
      currentStateIndex: index,
      currentState: state,
      stateProgress,
      healthStatus: state.healthStatus,
      showScrollHint: progress < 0.02,
      showDashboard: progress > 0.92,
    });
  },
  
  setScrollVelocity: (velocity) => set({ scrollVelocity: velocity }),
  setCapabilityTier: (tier) => set({ capabilityTier: tier }),
  setWebglAvailable: (available) => set({ webglAvailable: available }),
  setExperienceReady: (ready) => set({ experienceReady: ready }),
  setShowScrollHint: (show) => set({ showScrollHint: show }),
  setShowDashboard: (show) => set({ showDashboard: show }),
  setHorizontalScrollActive: (active) => set({ isHorizontalScrollActive: active }),
}));
