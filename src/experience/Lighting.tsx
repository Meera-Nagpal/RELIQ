import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useExperienceStore } from '../store/experienceStore';

/**
 * Atmospheric lighting system.
 */
export function Lighting() {
  const pointLightRef = useRef<THREE.PointLight>(null);
  const directionalLightRef = useRef<THREE.DirectionalLight>(null);
  
  const { healthStatus } = useExperienceStore();

  useFrame((state, delta) => {
    if (!pointLightRef.current) return;

    let targetIntensity = 1.8;
    const targetColor = new THREE.Color('#2563EB');

    if (healthStatus === 'warning') {
      targetIntensity = 3.5;
      targetColor.set('#60A5FA');
    } else if (healthStatus === 'regression') {
      // Flickering effect preserved strictly for regression
      targetIntensity = 6.0 + Math.sin(state.clock.elapsedTime * 10) * 3.0;
      targetColor.set('#ff2200');
    }

    pointLightRef.current.intensity = THREE.MathUtils.damp(
      pointLightRef.current.intensity,
      targetIntensity,
      3,
      delta
    );
    
    pointLightRef.current.color.lerp(targetColor, 0.1);
  });

  return (
    <>
      <ambientLight intensity={0.12} color="#E2E8F0" />
      
      <pointLight 
        ref={pointLightRef}
        position={[0, 0, 0]}
        distance={10}
        decay={2}
        color="#2563EB"
      />
      
      <directionalLight
        ref={directionalLightRef}
        position={[5, 10, 5]}
        intensity={0.5}
        color="#F8FAFC"
      />
      
      <fog attach="fog" args={['#090D16', 5, 20]} />
    </>
  );
}
