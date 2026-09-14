import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshReflectorMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { groundShader } from './shaders/groundShader';
import { useExperienceStore } from '../store/experienceStore';

/**
 * Reflective ground plane representing digital fluid / digital water.
 * Combines real-time reflections of 3D objects with dynamic data wave ripples.
 */
export function ReflectiveGround() {
  const fluidShaderRef = useRef<THREE.ShaderMaterial>(null);
  const reflectorRef = useRef<any>(null);

  const { capabilityTier, healthStatus, scrollProgress, scrollVelocity } = useExperienceStore();

  const shaderArgs = useMemo(() => {
    return {
      uniforms: THREE.UniformsUtils.clone(groundShader.uniforms),
      vertexShader: groundShader.vertexShader,
      fragmentShader: groundShader.fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    };
  }, []);

  useFrame((state, delta) => {
    let targetDistortion = 0.0;
    let targetHealth = 1.0;

    if (healthStatus === 'warning') {
      targetDistortion = 0.4;
      targetHealth = 0.7;
    } else if (healthStatus === 'regression') {
      targetDistortion = 1.0;
      targetHealth = 0.2;
    } else if (healthStatus === 'recovered') {
      targetDistortion = 0.1;
      targetHealth = 0.95;
    }

    if (fluidShaderRef.current) {
      const uniforms = fluidShaderRef.current.uniforms;
      uniforms.uTime.value = state.clock.elapsedTime;
      uniforms.uScrollProgress.value = scrollProgress;
      uniforms.uScrollVelocity.value = THREE.MathUtils.damp(
        uniforms.uScrollVelocity.value,
        scrollVelocity * 0.001,
        3,
        delta
      );
      uniforms.uDistortion.value = THREE.MathUtils.damp(
        uniforms.uDistortion.value,
        targetDistortion,
        2.5,
        delta
      );
      uniforms.uHealthFactor.value = THREE.MathUtils.damp(
        uniforms.uHealthFactor.value,
        targetHealth,
        2.5,
        delta
      );
    }
  });

  const groundY = -2.2;
  const resolution = capabilityTier === 'medium' ? 256 : 512;

  return (
    <group position={[0, groundY, 0]}>
      {/* ── Real-time Mirror Reflector (High / Medium Tiers) ── */}
      {capabilityTier !== 'low' && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[48, 48]} />
          <MeshReflectorMaterial
            ref={reflectorRef}
            blur={[300, 100]}
            resolution={resolution}
            mixBlur={0.7}
            mixStrength={3.5}
            roughness={0.8}
            depthScale={1.2}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.5}
            color="#080e14"
            metalness={0.6}
            mirror={0.65}
          />
        </mesh>
      )}

      {/* ── Digital Water Ripples & Data Grid Layer ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <planeGeometry args={[48, 48, 72, 72]} />
        <shaderMaterial ref={fluidShaderRef} args={[shaderArgs]} />
      </mesh>
    </group>
  );
}
