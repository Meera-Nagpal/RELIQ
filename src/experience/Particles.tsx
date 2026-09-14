import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { particleShader } from './shaders/particleShader';
import { useExperienceStore } from '../store/experienceStore';

interface ParticlesProps {
  count?: number;
}

/**
 * Data flow particle system component.
 */
export function Particles({ count = 800 }: ParticlesProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  
  const { healthStatus } = useExperienceStore();

  const [positions, randomness, scales] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const rand = new Float32Array(count);
    const scale = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Distribute in a spherical/disc area
      const r = 2 + Math.random() * 3;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      // Flatten slightly to make a disc-like sphere
      pos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = (r * Math.cos(phi)) * 0.5; // squash Y
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      
      rand[i] = Math.random();
      scale[i] = 0.5 + Math.random();
    }

    return [pos, rand, scale];
  }, [count]);

  const shaderArgs = useMemo(() => {
    return {
      uniforms: THREE.UniformsUtils.clone(particleShader.uniforms),
      vertexShader: particleShader.vertexShader,
      fragmentShader: particleShader.fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    };
  }, []);

  useFrame((state, delta) => {
    if (!pointsRef.current || !materialRef.current) return;

    let targetHealthFactor = 1.0;
    const targetColor = new THREE.Color();
    
    if (healthStatus === 'healthy') {
      targetColor.set('#ffffff');
      targetHealthFactor = 1.0;
    } else if (healthStatus === 'warning') {
      targetColor.set('#FF6B35');
      targetHealthFactor = 0.7;
    } else if (healthStatus === 'regression') {
      targetColor.set('#ff3300');
      targetHealthFactor = 0.3;
    } else if (healthStatus === 'recovered') {
      targetColor.set('#4da6ff');
      targetHealthFactor = 0.9;
    }

    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    
    materialRef.current.uniforms.uHealthFactor.value = THREE.MathUtils.damp(
      materialRef.current.uniforms.uHealthFactor.value,
      targetHealthFactor,
      2,
      delta
    );

    materialRef.current.uniforms.uColor.value.lerp(targetColor, 0.1);
    
    // Slow global rotation
    pointsRef.current.rotation.y += delta * 0.05 * (2.0 - targetHealthFactor);
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aRandomness" args={[randomness, 1]} />
        <bufferAttribute attach="attributes-aScale" args={[scales, 1]} />
      </bufferGeometry>
      <shaderMaterial ref={materialRef} args={[shaderArgs]} />
    </points>
  );
}
