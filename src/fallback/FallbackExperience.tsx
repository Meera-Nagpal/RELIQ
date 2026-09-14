/* ============================================================
   RELIQ — Fallback Experience (CSS-Only)
   
   A visually impressive alternative when WebGL is unavailable.
   Uses layered CSS animations, gradients, and parallax effects
   to maintain the premium feel without any canvas/WebGL.
   ============================================================ */

import React, { useEffect, useRef, useCallback } from 'react';

// ─── Inline Styles ──────────────────────────────────────────

const styles = `
/* ============ Fallback Root ============ */
.fallback-root {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #0A0A0A;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* ============ Layer 1: Animated Gradient Background ============ */
.fallback-layer-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  will-change: transform;
}

.fallback-gradient {
  position: absolute;
  inset: -20%;
  background:
    radial-gradient(
      ellipse 60% 50% at 50% 50%,
      rgba(255, 107, 53, 0.08) 0%,
      rgba(255, 107, 53, 0.03) 40%,
      transparent 70%
    ),
    radial-gradient(
      ellipse 80% 60% at 30% 70%,
      rgba(255, 140, 90, 0.04) 0%,
      transparent 60%
    ),
    radial-gradient(
      ellipse 90% 80% at 70% 30%,
      rgba(255, 107, 53, 0.03) 0%,
      transparent 50%
    );
  animation: fallback-gradient-drift 12s ease-in-out infinite alternate;
}

@keyframes fallback-gradient-drift {
  0% {
    transform: translate(0%, 0%) scale(1);
    opacity: 0.8;
  }
  33% {
    transform: translate(2%, -1%) scale(1.02);
    opacity: 1;
  }
  66% {
    transform: translate(-1%, 2%) scale(0.98);
    opacity: 0.9;
  }
  100% {
    transform: translate(1%, -2%) scale(1.01);
    opacity: 1;
  }
}

/* ============ Layer 2: Abstract Decorative Elements ============ */
.fallback-layer-decor {
  position: absolute;
  inset: 0;
  z-index: 1;
  will-change: transform;
}

/* Orbs — blurred circles */
.fallback-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0;
  animation: fallback-orb-float 20s ease-in-out infinite;
}

.fallback-orb--1 {
  width: clamp(200px, 30vw, 500px);
  height: clamp(200px, 30vw, 500px);
  background: rgba(255, 107, 53, 0.06);
  top: 15%;
  left: 60%;
  animation-delay: 0s;
  animation-duration: 18s;
}

.fallback-orb--2 {
  width: clamp(150px, 25vw, 400px);
  height: clamp(150px, 25vw, 400px);
  background: rgba(255, 140, 90, 0.04);
  top: 60%;
  left: 20%;
  animation-delay: -6s;
  animation-duration: 22s;
}

.fallback-orb--3 {
  width: clamp(100px, 20vw, 300px);
  height: clamp(100px, 20vw, 300px);
  background: rgba(255, 107, 53, 0.05);
  top: 40%;
  left: 40%;
  animation-delay: -12s;
  animation-duration: 16s;
}

@keyframes fallback-orb-float {
  0%, 100% {
    opacity: 0.4;
    transform: translate(0, 0) scale(1);
  }
  25% {
    opacity: 0.7;
    transform: translate(30px, -20px) scale(1.1);
  }
  50% {
    opacity: 0.5;
    transform: translate(-20px, 30px) scale(0.95);
  }
  75% {
    opacity: 0.8;
    transform: translate(15px, 15px) scale(1.05);
  }
}

/* Geometric lines — subtle decorative accents */
.fallback-line {
  position: absolute;
  background: linear-gradient(90deg, transparent, rgba(255, 107, 53, 0.12), transparent);
  height: 1px;
  animation: fallback-line-sweep 10s ease-in-out infinite;
}

.fallback-line--1 {
  width: clamp(100px, 20vw, 300px);
  top: 30%;
  left: 10%;
  animation-delay: 0s;
  transform: rotate(-5deg);
}

.fallback-line--2 {
  width: clamp(80px, 15vw, 200px);
  top: 65%;
  right: 15%;
  left: auto;
  animation-delay: -4s;
  transform: rotate(3deg);
}

.fallback-line--3 {
  width: clamp(120px, 18vw, 250px);
  top: 48%;
  left: 55%;
  animation-delay: -7s;
  transform: rotate(-2deg);
}

@keyframes fallback-line-sweep {
  0%, 100% { opacity: 0; transform: translateX(-20px) scaleX(0.5); }
  50% { opacity: 1; transform: translateX(20px) scaleX(1); }
}

/* Floating particles — tiny dots drifting upward */
.fallback-particle {
  position: absolute;
  width: 2px;
  height: 2px;
  background: rgba(255, 107, 53, 0.3);
  border-radius: 50%;
  animation: fallback-particle-rise linear infinite;
}

.fallback-particle--1 { left: 20%; bottom: -5%; animation-duration: 14s; animation-delay: 0s; }
.fallback-particle--2 { left: 35%; bottom: -5%; animation-duration: 18s; animation-delay: -3s; }
.fallback-particle--3 { left: 50%; bottom: -5%; animation-duration: 16s; animation-delay: -7s; }
.fallback-particle--4 { left: 65%; bottom: -5%; animation-duration: 20s; animation-delay: -5s; }
.fallback-particle--5 { left: 80%; bottom: -5%; animation-duration: 15s; animation-delay: -10s; }
.fallback-particle--6 { left: 10%; bottom: -5%; animation-duration: 22s; animation-delay: -2s; width: 3px; height: 3px; opacity: 0.6; }
.fallback-particle--7 { left: 90%; bottom: -5%; animation-duration: 17s; animation-delay: -8s; }
.fallback-particle--8 { left: 45%; bottom: -5%; animation-duration: 19s; animation-delay: -12s; }

@keyframes fallback-particle-rise {
  0% {
    transform: translateY(0) translateX(0);
    opacity: 0;
  }
  10% {
    opacity: 0.6;
  }
  90% {
    opacity: 0.3;
  }
  100% {
    transform: translateY(-110vh) translateX(40px);
    opacity: 0;
  }
}

/* ============ Layer 3: Typography + Content ============ */
.fallback-layer-content {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  will-change: transform;
}

.fallback-title {
  font-size: clamp(3rem, 10vw, 12rem);
  font-weight: 800;
  line-height: 0.9;
  letter-spacing: -0.04em;
  text-transform: uppercase;
  color: #F5F5F5;
  text-align: center;
  margin-bottom: 2rem;
  /* Subtle text shadow for depth */
  text-shadow: 0 0 80px rgba(255, 107, 53, 0.15);
  animation: fallback-title-entrance 1.5s cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
  opacity: 0;
}

@keyframes fallback-title-entrance {
  0% {
    opacity: 0;
    transform: translateY(30px);
    letter-spacing: 0.1em;
  }
  100% {
    opacity: 1;
    transform: translateY(0);
    letter-spacing: -0.04em;
  }
}

.fallback-metric-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  animation: fallback-metric-entrance 1.2s cubic-bezier(0.22, 0.61, 0.36, 1) 0.4s forwards;
  opacity: 0;
}

@keyframes fallback-metric-entrance {
  0% {
    opacity: 0;
    transform: translateY(20px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.fallback-metric-value {
  font-size: clamp(2rem, 6vw, 6rem);
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
  color: #FF6B35;
  font-variant-numeric: tabular-nums lining-nums;
}

.fallback-metric-label {
  font-size: clamp(0.625rem, 0.8vw, 0.75rem);
  font-weight: 500;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: #888888;
}

.fallback-description {
  font-size: clamp(0.875rem, 1.5vw, 1.125rem);
  color: #888888;
  margin-top: 2rem;
  text-align: center;
  max-width: 400px;
  line-height: 1.6;
  animation: fallback-metric-entrance 1.2s cubic-bezier(0.22, 0.61, 0.36, 1) 0.7s forwards;
  opacity: 0;
}

/* CTA Button */
.fallback-cta {
  margin-top: 3rem;
  padding: 0.875rem 2.5rem;
  background: transparent;
  border: 1px solid rgba(255, 107, 53, 0.4);
  color: #FF6B35;
  font-family: inherit;
  font-size: clamp(0.625rem, 0.8vw, 0.75rem);
  font-weight: 500;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: all 0.4s cubic-bezier(0.22, 0.61, 0.36, 1);
  animation: fallback-metric-entrance 1.2s cubic-bezier(0.22, 0.61, 0.36, 1) 1s forwards;
  opacity: 0;
}

.fallback-cta::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(255, 107, 53, 0.08);
  transform: translateX(-100%);
  transition: transform 0.4s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.fallback-cta:hover {
  border-color: rgba(255, 107, 53, 0.8);
  box-shadow: 0 0 30px rgba(255, 107, 53, 0.1);
}

.fallback-cta:hover::before {
  transform: translateX(0);
}

.fallback-cta:active {
  transform: scale(0.98);
}

/* ============ Noise Overlay ============ */
.fallback-noise {
  position: absolute;
  inset: -50%;
  width: 200%;
  height: 200%;
  z-index: 3;
  pointer-events: none;
  opacity: 0.035;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E");
  animation: fallback-grain 0.5s steps(1) infinite;
}

@keyframes fallback-grain {
  0%, 100% { transform: translate(0, 0); }
  10% { transform: translate(-5%, -10%); }
  20% { transform: translate(-15%, 5%); }
  30% { transform: translate(7%, -25%); }
  40% { transform: translate(-5%, 25%); }
  50% { transform: translate(-15%, 10%); }
  60% { transform: translate(15%, 0%); }
  70% { transform: translate(0%, 15%); }
  80% { transform: translate(3%, 35%); }
  90% { transform: translate(-10%, 10%); }
}

/* ============ Reduced Motion ============ */
@media (prefers-reduced-motion: reduce) {
  .fallback-gradient,
  .fallback-orb,
  .fallback-line,
  .fallback-particle,
  .fallback-noise {
    animation: none !important;
  }
  .fallback-orb { opacity: 0.5; }
  .fallback-title,
  .fallback-metric-group,
  .fallback-description,
  .fallback-cta {
    animation: none !important;
    opacity: 1 !important;
  }
}
`;

// ─── Component ──────────────────────────────────────────────

export const FallbackExperience: React.FC = () => {
  const layerBgRef = useRef<HTMLDivElement>(null);
  const layerDecorRef = useRef<HTMLDivElement>(null);
  const layerContentRef = useRef<HTMLDivElement>(null);

  /**
   * Parallax on mouse move — each layer moves at different speed.
   * Uses refs for per-frame values, not React state.
   */
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 2;   // -1 to 1
    const y = (e.clientY / window.innerHeight - 0.5) * 2;  // -1 to 1

    // Layer 1 (background): slowest
    if (layerBgRef.current) {
      layerBgRef.current.style.transform =
        `translate(${x * -8}px, ${y * -6}px)`;
    }

    // Layer 2 (decor): medium
    if (layerDecorRef.current) {
      layerDecorRef.current.style.transform =
        `translate(${x * -15}px, ${y * -12}px)`;
    }

    // Layer 3 (content): fastest
    if (layerContentRef.current) {
      layerContentRef.current.style.transform =
        `translate(${x * -4}px, ${y * -3}px)`;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [handleMouseMove]);

  const handleCtaClick = useCallback(() => {
    // Scroll down to begin the experience
    window.scrollTo({ top: window.innerHeight, behavior: 'smooth' });
  }, []);

  return (
    <>
      {/* Inject scoped styles */}
      <style dangerouslySetInnerHTML={{ __html: styles }} />

      <div className="fallback-root" role="main" aria-label="RELIQ AI Reliability Platform">
        {/* Layer 1: Animated gradient background */}
        <div className="fallback-layer-bg" ref={layerBgRef} aria-hidden="true">
          <div className="fallback-gradient" />
        </div>

        {/* Layer 2: Abstract decorative elements */}
        <div className="fallback-layer-decor" ref={layerDecorRef} aria-hidden="true">
          {/* Orbs */}
          <div className="fallback-orb fallback-orb--1" />
          <div className="fallback-orb fallback-orb--2" />
          <div className="fallback-orb fallback-orb--3" />

          {/* Lines */}
          <div className="fallback-line fallback-line--1" />
          <div className="fallback-line fallback-line--2" />
          <div className="fallback-line fallback-line--3" />

          {/* Floating particles */}
          <div className="fallback-particle fallback-particle--1" />
          <div className="fallback-particle fallback-particle--2" />
          <div className="fallback-particle fallback-particle--3" />
          <div className="fallback-particle fallback-particle--4" />
          <div className="fallback-particle fallback-particle--5" />
          <div className="fallback-particle fallback-particle--6" />
          <div className="fallback-particle fallback-particle--7" />
          <div className="fallback-particle fallback-particle--8" />
        </div>

        {/* Layer 3: Typography / Content */}
        <div className="fallback-layer-content" ref={layerContentRef}>
          <h1 className="fallback-title">RELIQ</h1>

          <div className="fallback-metric-group">
            <span className="fallback-metric-value">96.8%</span>
            <span className="fallback-metric-label">AI Reliability</span>
          </div>

          <p className="fallback-description">
            Ship AI changes with confidence. Evaluate, compare, and detect
            regressions before they reach production.
          </p>

          <button
            className="fallback-cta"
            onClick={handleCtaClick}
            type="button"
          >
            Enter RELIQ
          </button>
        </div>

        {/* Noise / grain overlay */}
        <div className="fallback-noise" aria-hidden="true" />
      </div>
    </>
  );
};

export default FallbackExperience;
