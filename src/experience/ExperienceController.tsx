import { useEffect } from 'react';
import { useExperienceStore } from '../store/experienceStore';

/**
 * Orchestration component that runs inside the R3F Canvas.
 * Reads experience state to trigger R3F-specific side effects.
 * Signals experienceReady when WebGL context and core scene are mounted.
 */
export function ExperienceController() {
  const setExperienceReady = useExperienceStore((state) => state.setExperienceReady);

  useEffect(() => {
    setExperienceReady(true);
    return () => {
      setExperienceReady(false);
    };
  }, [setExperienceReady]);

  // Subscribe to store changes so the Canvas re-renders on state transitions
  useExperienceStore((state) => state.scrollProgress);
  useExperienceStore((state) => state.healthStatus);

  return null;
}
