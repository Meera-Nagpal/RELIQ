import React, { useMemo, useState, useEffect } from 'react';
import { useExperienceStore } from '../store/experienceStore';
import { mapRangeClamped } from '../utils/math';
import { apiRepository } from '../services/apiRepository';
import { useRouter } from '../router/useRouter';

/**
 * Lusion-Style Viewport-Safe RUN Stage Overlay (Stage 02 // DATA)
 *
 * Implements the spatial WebGL-integrated composition:
 * - TOP RIGHT QUADRANT: 27 TEST CASES IN HARNESS (secondary statistics)
 * - LEFT RAIL: STAGE 02 // RUN and DATA narrative
 * - CENTER HERO: Monumental RUN above the 3D Sphere, 500 ACTIVE TEST CASES below
 *
 * Multi-layer parallax choreography synchronized with scroll progress (0 -> 1):
 * - RUN typography:   translateX(t * 11vw)
 * - Subcount (500):   translateX(t * 6.5vw)
 * - Top statistics:   translateX(t * 5vw)
 * - Left rail (DATA): translateX(t * 3.5vw)
 * - 3D Sphere:        counter-parallax translation in WebGL
 *
 * Reverse scroll reverses spatial choreography naturally (RIGHT -> CENTER -> LEFT).
 */
export function RunStageOverlay() {
  const scrollProgress = useExperienceStore((state) => state.scrollProgress);
  const { isTransitioning } = useRouter();
  const [activeCaseCount, setActiveCaseCount] = useState<number>(27);

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

  // Stage 1 window in scroll space: 0.14 to 0.34
  const stageStart = 0.14;
  const stageEnd = 0.34;
  const stageProgress = mapRangeClamped(scrollProgress, stageStart, stageEnd, 0, 1);
  const t = (stageProgress - 0.5) * 2; // Normalized -1 (entry/left) -> 0 (centered) -> 1 (exit/right)

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

  // Layered parallax translations (in responsive vw units)
  const typographyTranslateX = t * 11;
  const subcountTranslateX = t * 6.5;
  const statsTranslateX = t * 5;
  const leftRailTranslateX = t * 3.5;

  if (isTransitioning || opacity <= 0.005) return null;

  return (
    <div className="stage-viewport stage--run" style={{ opacity }}>
      <div className="stage-scene-canvas">
        {/* TOP STATISTIC: 27 TEST CASES IN HARNESS */}
        <div
          className="stage-stat--top"
          style={{ transform: `translate3d(${statsTranslateX}vw, 0, 0)` }}
        >
          <div className="stage-stat-number">{activeCaseCount}</div>
          <div className="stage-stat-label">TEST CASES IN HARNESS</div>
        </div>

        {/* LEFT RAIL: STAGE 02 // RUN and DATA narrative */}
        <div
          className="stage-rail--left"
          style={{
            transform: `translateY(-50%) translate3d(${leftRailTranslateX}vw, 0, 0)`,
          }}
        >
          <div className="stage-badge-tag">STAGE 02 // RUN</div>
          <h2 className="stage-headline-title">DATA</h2>
          <p className="stage-narrative-desc">
            Evaluate your AI against real test cases.
          </p>
        </div>

        {/* CENTER HERO: Monumental RUN framing the 3D Sphere */}
        <div
          className="stage-center-hero"
          style={{ transform: `translate3d(${typographyTranslateX}vw, 0, 0)` }}
        >
          <div className="stage-display-text--run">RUN</div>

          {/* Dedicated spatial aperture window framing the 3D Sphere */}
          <div className="stage-sphere-aperture" aria-hidden="true" />

          <div
            className="stage-center-subgroup"
            style={{ transform: `translate3d(${subcountTranslateX - typographyTranslateX}vw, 0, 0)` }}
          >
            <span className="stage-center-count">500</span>
            <span className="stage-center-count-label">ACTIVE TEST CASES</span>
          </div>
        </div>
      </div>
    </div>
  );
}
