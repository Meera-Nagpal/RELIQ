import React, { useMemo, useState, useEffect } from 'react';
import { useExperienceStore } from '../store/experienceStore';
import { mapRangeClamped, lerp } from '../utils/math';
import { apiRepository } from '../services/apiRepository';
import { useRouter } from '../router/useRouter';

/**
 * Viewport-Safe RUN Stage Overlay (Stage 02 // DATA)
 *
 * Implements a responsive three-column desktop composition:
 * - LEFT EDGE: Stage label & DATA metadata
 * - CENTER: Monumental RUN typography + 500 ACTIVE TEST CASES anchored with 3D Core
 * - RIGHT EDGE: Test case counter in harness
 *
 * Choreographed with continuous horizontal travel tied to scroll progress (0 -> 1):
 * - progress = 0: slightly left of viewport (-14vw)
 * - progress = 0.5: centered (0vw)
 * - progress = 1: slightly right of viewport (+14vw)
 * - reverse scroll: smoothly reverses spatial movement (RIGHT -> CENTER -> LEFT)
 *
 * Bound to 100svh stage container with overflow:hidden — zero horizontal or vertical page scrollbar.
 */
export function RunStageOverlay() {
  const scrollProgress = useExperienceStore((state) => state.scrollProgress);
  const { isTransitioning } = useRouter();
  const [activeCaseCount, setActiveCaseCount] = useState<number>(500);

  useEffect(() => {
    let mounted = true;
    apiRepository
      .getDatasets()
      .then((datasets) => {
        if (!mounted || !datasets || datasets.length === 0) return;
        const storedDatasetId = localStorage.getItem('reliq_active_dataset_id');
        const matched = storedDatasetId
          ? datasets.find((d) => d.id === storedDatasetId)
          : null;
        const targetDataset =
          matched || datasets.find((d) => (d.cases?.length || 0) > 0) || datasets[0];
        if (targetDataset?.cases?.length) {
          setActiveCaseCount(targetDataset.cases.length);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Stage 1 window in scroll space (nominal 1/6 = 0.1667 to 2/6 = 0.3333)
  const stageStart = 0.14;
  const stageEnd = 0.34;
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
  // progress = 0: slightly left (-14vw)
  // progress = 0.5: centered (0vw)
  // progress = 1: slightly right (+14vw)
  const centerTranslateX = lerp(-14, 14, stageProgress);
  const leftRailTranslateX = lerp(-9, 9, stageProgress);
  const rightRailTranslateX = lerp(-7, 7, stageProgress);

  if (isTransitioning || opacity <= 0.005) return null;

  return (
    <div className="stage-viewport stage--run" style={{ opacity }}>
      <div className="stage-track">
        {/* LEFT EDGE: stage label & DATA */}
        <div
          className="stage-rail--left"
          style={{ transform: `translate3d(${leftRailTranslateX}vw, 0, 0)` }}
        >
          <div className="stage-badge-tag">STAGE 02 // RUN</div>
          <h2 className="stage-headline-title">DATA</h2>
          <p className="stage-narrative-desc">
            Evaluate your AI against real test cases.
          </p>
        </div>

        {/* CENTER: RUN typography & 500 ACTIVE TEST CASES */}
        <div
          className="stage-center-hero"
          style={{ transform: `translate3d(${centerTranslateX}vw, 0, 0)` }}
        >
          <div className="stage-display-text--run">RUN</div>
          <div className="stage-center-subgroup">
            <span className="stage-center-count">{activeCaseCount || 500}</span>
            <span className="stage-center-count-label">ACTIVE TEST CASES</span>
          </div>
        </div>

        {/* RIGHT EDGE: test case counter */}
        <div
          className="stage-rail--right"
          style={{ transform: `translate3d(${rightRailTranslateX}vw, 0, 0)` }}
        >
          <div className="stage-counter-huge">{activeCaseCount || 500}</div>
          <div className="stage-counter-caption">TEST CASES IN HARNESS</div>
        </div>
      </div>
    </div>
  );
}
