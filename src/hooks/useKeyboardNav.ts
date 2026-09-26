import { useEffect } from 'react';
import gsap from 'gsap';
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
      // Calculate target scroll position from state index: ((clampedIndex + 0.45) / 6) * totalScrollHeight
      const clampedIndex = Math.min(Math.max(index, 0), 5);
      const totalScrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const targetScroll = ((clampedIndex + 0.45) / 6) * totalScrollHeight;

      const scrollObj = { y: window.scrollY };
      gsap.killTweensOf(scrollObj);
      gsap.to(scrollObj, {
        y: targetScroll,
        duration: 2.6,
        ease: 'power3.inOut',
        onUpdate: () => {
          window.scrollTo(0, scrollObj.y);
        },
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStateIndex]);
}
