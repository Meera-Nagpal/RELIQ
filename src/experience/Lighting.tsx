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

    let targetIntensity = 2.0;
    const targetColor = new THREE.Color('#FF6B35');

    if (healthStatus === 'warning') {
      targetIntensity = 5.0;
    } else if (healthStatus === 'regression') {
      // Flickering effect
      targetIntensity = 8.0 + Math.sin(state.clock.elapsedTime * 10) * 4.0;
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
      <ambientLight intensity={0.15} color="#ffe6cc" />
      
      <pointLight 
        ref={pointLightRef}
        position={[0, 0, 0]}
        distance={10}
        decay={2}
        color="#FF6B35"
      />
      
      <directionalLight
        ref={directionalLightRef}
        position={[5, 10, 5]}
        intensity={0.5}
        color="#ccf2ff"
      />
      
      <fog attach="fog" args={['#0A0A0A', 5, 20]} />
    </>
  );
}
