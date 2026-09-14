import { useEffect } from 'react';
import { useExperienceStore } from '../store/experienceStore';

/**
 * Hook for keyboard navigation between states
 */
export function useKeyboardNav() {
  const { currentStateIndex } = useExperienceStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only active when no input/textarea/select is focused
      if (document.activeElement?.tagName === 'INPUT' || 
          document.activeElement?.tagName === 'TEXTAREA' || 
          document.activeElement?.tagName === 'SELECT') {
        return;
      }

      if (e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        const targetIndex = currentStateIndex + 1;
        scrollToState(targetIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const targetIndex = Math.max(currentStateIndex - 1, 0);
        scrollToState(targetIndex);
      }
    };

    const scrollToState = (index: number) => {
      // Calculate target scroll position from state index: (stateIndex / 6) * totalScrollHeight
      const totalScrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const targetScroll = (index / 6) * totalScrollHeight;
      window.scrollTo({ top: targetScroll, behavior: 'smooth' });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStateIndex]);
}
