/* ============================================================
   RELIQ — Root Application Switcher with Global Page Transitions
   
   Directs to:
   - Preserved 3D Immersive Landing Experience at "/"
   - Functional AI Reliability Workspace at "#/app/*"
   - Global 3-Ring Ripple Page Transition Overlay on Navigation
   ============================================================ */

import React from 'react';
import { useRouter } from './router/useRouter';
import { LandingExperience } from './landing/LandingExperience';
import { ReliqApp } from './app/ReliqApp';
import { PageTransition } from './app/components/PageTransition';

const App: React.FC = () => {
  const { isApp, isTransitioning } = useRouter();

  return (
    <>
      <PageTransition isVisible={isTransitioning} />
      {isApp ? <ReliqApp /> : <LandingExperience />}
    </>
  );
};

export default App;
