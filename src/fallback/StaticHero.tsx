/* ============================================================
   RELIQ — Static Hero (Suspense Fallback)
   
   Displayed while the 3D experience is loading.
   Minimal, dark, prevents flash of empty/white content.
   ============================================================ */

import React from 'react';

// ─── Inline Styles ──────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vw',
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  background: '#0A0A0A',
  zIndex: 0,
};

const titleStyle: React.CSSProperties = {
  fontSize: 'clamp(3rem, 10vw, 12rem)',
  fontWeight: 800,
  lineHeight: 0.9,
  letterSpacing: '-0.04em',
  textTransform: 'uppercase',
  color: '#F5F5F5',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  opacity: 0.15,
};

const loaderStyle: React.CSSProperties = {
  marginTop: '2rem',
  display: 'flex',
  gap: '0.5rem',
  alignItems: 'center',
};

const dotBaseStyle: React.CSSProperties = {
  width: '4px',
  height: '4px',
  borderRadius: '50%',
  background: '#FF6B35',
};

const keyframesCSS = `
@keyframes static-hero-pulse {
  0%, 100% { opacity: 0.2; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1); }
}
.static-hero-dot {
  animation: static-hero-pulse 1.4s ease-in-out infinite;
}
.static-hero-dot:nth-child(2) {
  animation-delay: 0.15s;
}
.static-hero-dot:nth-child(3) {
  animation-delay: 0.3s;
}

@media (prefers-reduced-motion: reduce) {
  .static-hero-dot {
    animation: none !important;
    opacity: 0.6;
  }
}
`;

// ─── Component ──────────────────────────────────────────────

export const StaticHero: React.FC = () => {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: keyframesCSS }} />
      <div style={containerStyle} role="status" aria-label="Loading RELIQ experience">
        <span style={titleStyle} aria-hidden="true">RELIQ</span>
        <div style={loaderStyle}>
          <div className="static-hero-dot" style={dotBaseStyle} />
          <div className="static-hero-dot" style={dotBaseStyle} />
          <div className="static-hero-dot" style={dotBaseStyle} />
        </div>
        {/* Screen reader text */}
        <span
          style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}
        >
          Loading experience…
        </span>
      </div>
    </>
  );
};

export default StaticHero;
