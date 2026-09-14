/* ============================================================
   RELIQ — Preserved 3D Immersive Landing Experience
   
   Maintains the full-screen 3D WebGL world, 6-state camera
   choreography, digital fluid ground, and spatial storytelling.
   ============================================================ */

import React, { useRef } from 'react';
import { useDeviceCapability } from '../hooks/useDeviceCapability';
import { useKeyboardNav } from '../hooks/useKeyboardNav';
import { useScrollProgress } from '../hooks/useScrollProgress';
import { useExperienceStore } from '../store/experienceStore';

// Experience canvas
import { ExperienceCanvas } from '../experience/ExperienceCanvas';

// Fallback for non-WebGL devices
import { FallbackExperience } from '../fallback/FallbackExperience';
import { StaticHero } from '../fallback/StaticHero';

// Overlay components
import { HeroOverlay } from '../overlays/HeroOverlay';
import { MetricOverlay } from '../overlays/MetricOverlay';
import { StateTypography } from '../overlays/StateTypography';
import { ProgressIndicator } from '../overlays/ProgressIndicator';
import { ScrollHint } from '../overlays/ScrollHint';
import { VersionCards } from '../overlays/VersionCards';
import { DashboardTransition } from '../overlays/DashboardTransition';

export const LandingExperience: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect device capabilities and write them to store
  useDeviceCapability();

  // Enable keyboard navigation between states
  useKeyboardNav();

  // Activate scroll tracking
  useScrollProgress();

  // Read device flags from store
  const webglAvailable = useExperienceStore((s) => s.webglAvailable);

  return (
    <div className="app-container" ref={containerRef}>
      {/* ── 3D Canvas Layer ───────────────────────────────── */}
      <div className="canvas-wrapper">
        {webglAvailable ? (
          <React.Suspense fallback={<StaticHero />}>
            <ExperienceCanvas />
          </React.Suspense>
        ) : (
          <FallbackExperience />
        )}
      </div>

      {/* ── Film grain overlay ────────────────────────────── */}
      <div className="film-grain" aria-hidden="true" />

      {/* ── Scroll container (creates scroll height) ──────── */}
      <div className="experience-scroll-container content-layer" />

      {/* ── Fixed overlay components ─────────────────────── */}
      <HeroOverlay />
      <StateTypography />
      <MetricOverlay />
      <ProgressIndicator />
      <ScrollHint />
      <VersionCards />
      <DashboardTransition />
    </div>
  );
};
