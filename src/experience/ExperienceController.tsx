import { useExperienceStore } from '../store/experienceStore';

/**
 * Orchestration component that runs inside the R3F Canvas.
 * Reads experience state to trigger R3F-specific side effects.
 * Scroll tracking is handled in App.tsx via useScrollProgress (DOM-based).
 */
export function ExperienceController() {
  // Subscribe to store changes so the Canvas re-renders on state transitions
  useExperienceStore((state) => state.scrollProgress);
  useExperienceStore((state) => state.healthStatus);

  return null;
}
