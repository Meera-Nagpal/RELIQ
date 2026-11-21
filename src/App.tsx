/* ============================================================
   RELIQ — Root Application Switcher (Code-Split)
   
   Directs to:
   - Preserved 3D Immersive Landing Experience at "/" (lazy-loaded)
   - Functional AI Reliability Workspace at "#/app/*" (lazy-loaded)
   - Global 3-Ring Ripple Page Transition Overlay on Navigation
   ============================================================ */

import React, { Suspense, lazy } from 'react';
import { useRouter } from './router/useRouter';
import { PageTransition } from './app/components/PageTransition';

const LandingExperience = lazy(() =>
  import('./landing/LandingExperience').then((m) => ({ default: m.LandingExperience }))
);
const ReliqApp = lazy(() =>
  import('./app/ReliqApp').then((m) => ({ default: m.ReliqApp }))
);

const AppFallback: React.FC = () => (
  <div
    style={{
      width: '100vw',
      height: '100vh',
      background: '#07090E',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1rem',
      color: '#FFFFFF',
      fontFamily: "'Inter', sans-serif",
    }}
  >
    <div
      style={{
        width: '32px',
        height: '32px',
        border: '3px solid rgba(96, 165, 250, 0.2)',
        borderTop: '3px solid #60A5FA',
        borderRadius: '50%',
        animation: 'reliq-spin 0.8s linear infinite',
      }}
    />
    <div
      style={{
        fontSize: '0.8rem',
        letterSpacing: '0.15em',
        color: '#8899AA',
        textTransform: 'uppercase',
        fontWeight: 600,
      }}
    >
      Initializing RELIQ...
    </div>
    <style>{`
      @keyframes reliq-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `}</style>
  </div>
);

const App: React.FC = () => {
  const { isApp, isTransitioning } = useRouter();

  return (
    <>
      <PageTransition isVisible={isTransitioning} />
      <Suspense fallback={<AppFallback />}>
        {isApp ? <ReliqApp /> : <LandingExperience />}
      </Suspense>
    </>
  );
};

export default App;
