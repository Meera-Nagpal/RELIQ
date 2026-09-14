import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useExperienceStore } from '../store/experienceStore';

gsap.registerPlugin(ScrollTrigger);

/**
 * Hook to track scroll progress and velocity using GSAP ScrollTrigger
 */
export function useScrollProgress() {
  const { setScrollProgress, setScrollVelocity } = useExperienceStore();
  const progressRef = useRef(0);

  useEffect(() => {
    let lastTime = Date.now();
    let lastProgress = 0;

    const st = ScrollTrigger.create({
      trigger: '.experience-scroll-container',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1.5,
      onUpdate: (self) => {
        const now = Date.now();
        const dt = now - lastTime || 16;
        const dp = self.progress - lastProgress;
        const velocity = dp / dt;
        
        setScrollProgress(self.progress);
        setScrollVelocity(velocity * 1000); // per second
        
        lastProgress = self.progress;
        lastTime = now;
        progressRef.current = self.progress;
      },
    });

    return () => {
      st.kill();
    };
  }, [setScrollProgress, setScrollVelocity]);

  return { progress: progressRef.current, velocity: 0 };
}
