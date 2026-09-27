import React, { useMemo } from 'react';
import { useExperienceStore } from '../store/experienceStore';
import { mapRangeClamped } from '../utils/math';
import { useRouter } from '../router/useRouter';

/**
 * Lusion-Style Viewport-Safe INVESTIGATION Stage Overlay (Stage 05 // INVESTIGATE)
 *
 * Implements the spatial WebGL-integrated composition:
 * - TOP RIGHT QUADRANT: 47 FAILED CASES IDENTIFIED & critical status badge
 * - LEFT RAIL: STAGE 05 // INVESTIGATE and INVESTIGATION narrative
 * - CENTER HERO: Monumental INVESTIGATE above 3D Sphere, 14 ISOLATED FAILURES below
 *
 * Multi-layer parallax choreography synchronized with scroll progress (0 -> 1):
 * - INVESTIGATE typography: translateX(t * 11vw)
 * - Subcount (14 failures):  translateX(t * 6.5vw)
 * - Top statistics:          translateX(t * 5vw)
 * - Left rail (Narrative):   translateX(t * 3.5vw)
 * - 3D Sphere:               counter-parallax translation in WebGL
 *
 * Reverse scroll reverses spatial choreography naturally (RIGHT -> CENTER -> LEFT).
 */
export function InvestigationStageOverlay() {
  const scrollProgress = useExperienceStore((state) => state.scrollProgress);
  const { isTransitioning } = useRouter();

  // Stage 4 window in scroll space: 0.64 to 0.84
  const stageStart = 0.64;
  const stageEnd = 0.84;
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
    <div className="stage-viewport stage--investigation" style={{ opacity }}>
      <div className="stage-scene-canvas">
        {/* TOP STATISTIC: 47 FAILED CASES IDENTIFIED */}
        <div
          className="stage-stat--top"
          style={{ transform: `translate3d(${statsTranslateX}vw, 0, 0)` }}
        >
          <div className="stage-stat-number">47</div>
          <div className="stage-stat-label">FAILED CASES IDENTIFIED</div>
          <div className="stage-status-pill">CRITICAL REGRESSION DETECTED</div>
        </div>

        {/* LEFT RAIL: STAGE 05 // INVESTIGATE and INVESTIGATION narrative */}
        <div
          className="stage-rail--left"
          style={{
            transform: `translateY(-50%) translate3d(${leftRailTranslateX}vw, 0, 0)`,
          }}
        >
          <div className="stage-badge-tag">STAGE 05 // INVESTIGATE</div>
          <h2 className="stage-headline-title">INVESTIGATION</h2>
          <p className="stage-narrative-desc">
            Trace failures to their root cause.
          </p>
        </div>

        {/* CENTER HERO: Monumental INVESTIGATE framing the 3D Sphere */}
        <div
          className="stage-center-hero"
          style={{ transform: `translate3d(${typographyTranslateX}vw, 0, 0)` }}
        >
          <div className="stage-display-text--investigate">INVESTIGATE</div>

          {/* Dedicated spatial aperture window framing the 3D Sphere */}
          <div className="stage-sphere-aperture" aria-hidden="true" />

          <div
            className="stage-center-subgroup"
            style={{ transform: `translate3d(${subcountTranslateX - typographyTranslateX}vw, 0, 0)` }}
          >
            <span className="stage-center-count">14</span>
            <span className="stage-center-count-label">ISOLATED FAILURES</span>
          </div>
        </div>
      </div>
    </div>
  );
}
