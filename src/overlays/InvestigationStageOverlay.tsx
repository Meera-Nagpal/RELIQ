import React, { useMemo } from 'react';
import { useExperienceStore } from '../store/experienceStore';
import { mapRangeClamped, lerp } from '../utils/math';
import { useRouter } from '../router/useRouter';

/**
 * Viewport-Safe INVESTIGATION Stage Overlay (Stage 05 // INVESTIGATE)
 *
 * Implements a responsive three-column desktop composition:
 * - LEFT EDGE: Stage label & INVESTIGATION narrative
 * - CENTER: Monumental INVESTIGATE typography + 14 ISOLATED FAILURES anchored with 3D Core
 * - RIGHT EDGE: 47 FAILED CASES IDENTIFIED counter & status badge
 *
 * Choreographed with continuous horizontal travel tied to scroll progress (0 -> 1):
 * - ENTRY (progress = 0): enters from left (-14vw)
 * - MIDDLE (progress = 0.5): centered (0vw)
 * - EXIT (progress = 1): moves toward right (+14vw)
 * - REVERSE SCROLL: smoothly reverses spatial movement (RIGHT -> CENTER -> LEFT)
 *
 * Bound to 100svh stage container with overflow:hidden — zero horizontal or vertical page scrollbar.
 */
export function InvestigationStageOverlay() {
  const scrollProgress = useExperienceStore((state) => state.scrollProgress);
  const { isTransitioning } = useRouter();

  // Stage 4 window in scroll space (nominal 4/6 = 0.6667 to 5/6 = 0.8333)
  const stageStart = 0.64;
  const stageEnd = 0.84;
  const stageProgress = mapRangeClamped(scrollProgress, stageStart, stageEnd, 0, 1);

  // Smooth cinematic fade in / out
  const opacity = useMemo(() => {
    if (scrollProgress < stageStart - 0.02) return 0;
    if (scrollProgress < stageStart + 0.03) {
      return mapRangeClamped(scrollProgress, stageStart - 0.02, stageStart + 0.03, 0, 1);
    }
    if (scrollProgress > stageEnd - 0.03) {
      return mapRangeClamped(scrollProgress, stageEnd - 0.03, stageEnd + 0.02, 1, 0);
    }
    if (scrollProgress > stageEnd + 0.02) return 0;
    return 1;
  }, [scrollProgress, stageStart, stageEnd]);

  // Horizontal travel interpolation (in responsive vw units)
  // progress = 0: enters from left (-14vw)
  // progress = 0.5: centered (0vw)
  // progress = 1: moves toward right (+14vw)
  const centerTranslateX = lerp(-14, 14, stageProgress);
  const leftRailTranslateX = lerp(-9, 9, stageProgress);
  const rightRailTranslateX = lerp(-7, 7, stageProgress);

  if (isTransitioning || opacity <= 0.005) return null;

  return (
    <div className="stage-viewport stage--investigation" style={{ opacity }}>
      <div className="stage-track">
        {/* LEFT EDGE: stage label & INVESTIGATION */}
        <div
          className="stage-rail--left"
          style={{ transform: `translate3d(${leftRailTranslateX}vw, 0, 0)` }}
        >
          <div className="stage-badge-tag">STAGE 05 // INVESTIGATE</div>
          <h2 className="stage-headline-title">INVESTIGATION</h2>
          <p className="stage-narrative-desc">
            Trace failures to their root cause.
          </p>
        </div>

        {/* CENTER: INVESTIGATE typography & 14 ISOLATED FAILURES */}
        <div
          className="stage-center-hero"
          style={{ transform: `translate3d(${centerTranslateX}vw, 0, 0)` }}
        >
          <div className="stage-display-text--investigate">INVESTIGATE</div>
          <div className="stage-center-subgroup">
            <span className="stage-center-count">14</span>
            <span className="stage-center-count-label">ISOLATED FAILURES</span>
          </div>
        </div>

        {/* RIGHT EDGE: 47 FAILED CASES IDENTIFIED counter & status badge */}
        <div
          className="stage-rail--right"
          style={{ transform: `translate3d(${rightRailTranslateX}vw, 0, 0)` }}
        >
          <div className="stage-counter-huge">47</div>
          <div className="stage-counter-caption">FAILED CASES IDENTIFIED</div>
          <div className="stage-status-pill">CRITICAL REGRESSION DETECTED</div>
        </div>
      </div>
    </div>
  );
}
