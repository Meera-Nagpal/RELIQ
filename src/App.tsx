/* ============================================================
   RELIQ — Root Application Switcher
   
   Directs to:
   - Preserved 3D Immersive Landing Experience at "/"
   - Functional AI Reliability Workspace at "#/app/*"
   ============================================================ */

import React from 'react';
import { useRouter } from './router/useRouter';
import { LandingExperience } from './landing/LandingExperience';
import { ReliqApp } from './app/ReliqApp';

const App: React.FC = () => {
  const { isApp } = useRouter();

  if (isApp) {
    return <ReliqApp />;
  }

  return <LandingExperience />;
};

export default App;
