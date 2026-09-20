import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { coreShader } from './shaders/coreShader';
import { useExperienceStore } from '../store/experienceStore';

/**
 * ReliabilityCore Component
 * The central procedural 3D object representing AI Reliability.
 * Composed of:
 * - An inner crystalline procedural core with noise displacement
 * - An outer protective geodesic wireframe shell
 * - Concentric gyroscopic latitude rings representing evaluation constraints
 * - Orbiting telemetry markers
 */
export function ReliabilityCore() {
  const coreRef = useRef<THREE.Mesh>(null);
  const shellRef = useRef<THREE.Mesh>(null);
  const ring1Ref = useRef<THREE.Group>(null);
  const ring2Ref = useRef<THREE.Group>(null);
  const ring3Ref = useRef<THREE.Group>(null);
  const satellitesRef = useRef<THREE.Group>(null);

  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const shellMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const ringMaterialRef = useRef<THREE.MeshBasicMaterial>(null);

  const { scrollProgress, healthStatus } = useExperienceStore();

  const shaderArgs = useMemo(() => {
    return {
      uniforms: THREE.UniformsUtils.clone(coreShader.uniforms),
      vertexShader: coreShader.vertexShader,
      fragmentShader: coreShader.fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    };
  }, []);

  // Satellite node data
  const satellites = useMemo(() => {
    return [
      { radius: 2.1, speed: 0.8, angleOffset: 0, y: 0.3, size: 0.04 },
      { radius: 2.4, speed: -0.6, angleOffset: 2.0, y: -0.2, size: 0.05 },
      { radius: 2.8, speed: 1.1, angleOffset: 4.1, y: 0.5, size: 0.035 },
      { radius: 1.9, speed: -0.9, angleOffset: 1.2, y: -0.4, size: 0.045 },
    ];
  }, []);

  const introProgress = useRef(0);

  useFrame((state, delta) => {
    if (!coreRef.current || !materialRef.current || !shellRef.current) return;

    // Target health factor
    let targetHealth = 1.0;
    if (healthStatus === 'warning') targetHealth = 0.65;
    if (healthStatus === 'regression') targetHealth = 0.15;
    if (healthStatus === 'recovered') targetHealth = 0.95;

    // Smooth damp health factor uniform
    const currentHealth = materialRef.current.uniforms.uHealthFactor.value;
    materialRef.current.uniforms.uHealthFactor.value = THREE.MathUtils.damp(
      currentHealth,
      targetHealth,
      2.5,
      delta
    );

    const time = state.clock.elapsedTime;
    materialRef.current.uniforms.uTime.value = time;
    materialRef.current.uniforms.uScrollProgress.value = scrollProgress;

    // Intro energy convergence from top toward central globe
    introProgress.current = Math.min(1.0, introProgress.current + delta * 0.9);
    const introT = introProgress.current;
    const introScale = THREE.MathUtils.smoothstep(introT, 0.05, 1.0);
    const introOffsetY = (1.0 - Math.sin((introT * Math.PI) / 2)) * 2.8;

    // Speeds increase when unstable
    const instability = 1.0 - currentHealth;
    const speedMult = 1.0 + instability * 2.5;

    // Core rotational dynamics
    coreRef.current.rotation.y += delta * 0.35 * speedMult;
    coreRef.current.rotation.x += delta * 0.18 * speedMult;

    // Wireframe shell counter-rotates
    shellRef.current.rotation.y -= delta * 0.28 * speedMult;
    shellRef.current.rotation.z += delta * 0.14 * speedMult;

    // Gyroscopic rings rotation
    if (ring1Ref.current) {
      ring1Ref.current.rotation.x = Math.sin(time * 0.4 * speedMult) * 0.3;
      ring1Ref.current.rotation.y += delta * 0.45 * speedMult;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.y = Math.cos(time * 0.35 * speedMult) * 0.25;
      ring2Ref.current.rotation.z += delta * 0.35 * speedMult;
    }
    if (ring3Ref.current) {
      ring3Ref.current.rotation.x += delta * 0.25 * speedMult;
      ring3Ref.current.rotation.z = Math.sin(time * 0.5 * speedMult) * 0.35;
    }

    // Unstable micro-jitter during regression or smooth convergence
    if (healthStatus === 'regression') {
      const jitterX = (Math.random() - 0.5) * 0.04;
      const jitterY = (Math.random() - 0.5) * 0.04;
      const jitterZ = (Math.random() - 0.5) * 0.04;
      coreRef.current.position.set(jitterX, jitterY, jitterZ);
    } else {
      coreRef.current.position.lerp(new THREE.Vector3(0, introOffsetY, 0), delta * 4.5);
    }

    // Rhythmic breathing pulse
    const pulseFreq = THREE.MathUtils.lerp(1.8, 6.0, instability);
    const pulseAmp = THREE.MathUtils.lerp(0.02, 0.08, instability);
    const pulse = 1.0 + Math.sin(time * pulseFreq) * pulseAmp;

    coreRef.current.scale.setScalar(pulse * 1.15 * Math.max(0.05, introScale));
    shellRef.current.scale.setScalar(pulse * 1.35 * Math.max(0.05, introScale));

    // Shell color & emissive reactivity
    if (shellMaterialRef.current) {
      const targetShellColor = new THREE.Color(
        healthStatus === 'regression' ? '#FF2200' : '#FF6B35'
      );
      shellMaterialRef.current.color.lerp(targetShellColor, delta * 3);
      shellMaterialRef.current.emissive.lerp(targetShellColor, delta * 3);
      shellMaterialRef.current.emissiveIntensity = THREE.MathUtils.lerp(
        0.3,
        1.2,
        instability
      );
    }

    // Ring material color
    if (ringMaterialRef.current) {
      const targetRingColor = new THREE.Color(
        healthStatus === 'regression' ? '#FF3B14' : '#88AACC'
      );
      ringMaterialRef.current.color.lerp(targetRingColor, delta * 3);
    }

    // Orbiting satellites
    if (satellitesRef.current) {
      satellitesRef.current.children.forEach((child, i) => {
        const sat = satellites[i];
        if (!sat) return;
        const satAngle = time * sat.speed * speedMult + sat.angleOffset;
        child.position.x = Math.cos(satAngle) * sat.radius;
        child.position.z = Math.sin(satAngle) * sat.radius;
        child.position.y = sat.y + Math.sin(time * 2 + i) * 0.1;
      });
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* ── Inner Solid Procedural Crystal ── */}
      <mesh ref={coreRef}>
        <icosahedronGeometry args={[1, 4]} />
        <shaderMaterial ref={materialRef} args={[shaderArgs]} />
      </mesh>

      {/* ── Outer Geodesic Wireframe Shell ── */}
      <mesh ref={shellRef}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial
          ref={shellMaterialRef}
          color="#FF6B35"
          wireframe={true}
          transparent={true}
          opacity={0.35}
          emissive="#FF6B35"
          emissiveIntensity={0.4}
        />
      </mesh>

      {/* ── Gyroscopic Ring 1 (Equatorial) ── */}
      <group ref={ring1Ref}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.7, 0.008, 16, 100]} />
          <meshBasicMaterial
            ref={ringMaterialRef}
            color="#88AACC"
            transparent={true}
            opacity={0.45}
          />
        </mesh>
      </group>

      {/* ── Gyroscopic Ring 2 (Tilted Angle) ── */}
      <group ref={ring2Ref} rotation={[0.4, 0.3, 0]}>
        <mesh>
          <torusGeometry args={[1.9, 0.006, 16, 100]} />
          <meshBasicMaterial
            color="#FF6B35"
            transparent={true}
            opacity={0.3}
          />
        </mesh>
      </group>

      {/* ── Gyroscopic Ring 3 (Outer Boundary) ── */}
      <group ref={ring3Ref} rotation={[-0.5, 0, 0.6]}>
        <mesh>
          <torusGeometry args={[2.2, 0.005, 16, 100]} />
          <meshBasicMaterial
            color="#6688AA"
            transparent={true}
            opacity={0.25}
          />
        </mesh>
      </group>

      {/* ── Orbiting Telemetry Satellites ── */}
      <group ref={satellitesRef}>
        {satellites.map((sat, index) => (
          <mesh key={index} position={[sat.radius, sat.y, 0]}>
            <sphereGeometry args={[sat.size, 16, 16]} />
            <meshBasicMaterial
              color={index % 2 === 0 ? '#FF6B35' : '#4DA6FF'}
              transparent={true}
              opacity={0.8}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}
