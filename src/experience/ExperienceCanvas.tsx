import React, { Component, ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { AdaptiveDpr, AdaptiveEvents } from '@react-three/drei';
import { useExperienceStore } from '../store/experienceStore';
import { ExperienceController } from './ExperienceController';

// 3D Components
import { Camera } from './Camera';
import { ReliabilityCore } from './ReliabilityCore';
import { Particles } from './Particles';
import { DataConnections } from './DataConnections';
import { ReflectiveGround } from './ReflectiveGround';
import { Lighting } from './Lighting';
import { Environment } from './Environment';
import { SpatialTypography } from './SpatialTypography';
import { FallbackExperience } from '../fallback/FallbackExperience';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <FallbackExperience />;
    }
    return this.props.children;
  }
}

/**
 * The main Canvas wrapper
 */
export function ExperienceCanvas() {
  const capabilityTier = useExperienceStore((state) => state.capabilityTier);

  if (capabilityTier === 'fallback') {
    return <FallbackExperience />;
  }

  return (
    <ErrorBoundary>
      <React.Suspense fallback={null}>
        <Canvas
          dpr={[1, capabilityTier === 'low' ? 1.2 : 1.75]}
          camera={{ position: [0, 0.8, 7.8], fov: 45 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        >
          <ExperienceController />
          <Lighting />
          <Environment />
          <Camera />
          
          <ReliabilityCore />
          <React.Suspense fallback={null}>
            <SpatialTypography />
          </React.Suspense>
          <DataConnections />
          
          <Particles count={capabilityTier === 'low' ? 600 : 2000} />
          
          <ReflectiveGround />
          
          <AdaptiveDpr pixelated />
          <AdaptiveEvents />
        </Canvas>
      </React.Suspense>
    </ErrorBoundary>
  );
}
