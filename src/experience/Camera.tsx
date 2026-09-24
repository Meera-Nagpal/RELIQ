import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useExperienceStore } from '../store/experienceStore';

/**
 * Scroll-driven cinematic camera controller.
 * Employs Catmull-Rom splines with smooth damping to create the sensation
 * of physically navigating through a high-dimensional AI reliability system.
 */
export function Camera() {
  const { camera } = useThree();
  const { scrollProgress, healthStatus, scrollVelocity } = useExperienceStore();

  // 6 Choreographed cinematic waypoints
  const waypoints = useMemo(() => [
    // State 0: SYSTEM — Wide cinematic view framing RELIQ & calm Core
    { position: new THREE.Vector3(0, 0.8, 7.8), lookAt: new THREE.Vector3(0, 0.1, 0) },
    // State 1: DATA — Glide forward-left towards flowing data nodes & RUN
    { position: new THREE.Vector3(-2.6, 0.5, 5.2), lookAt: new THREE.Vector3(-0.6, 0.2, 0) },
    // State 2: EVALUATION — Sweeping orbit to the right, elevated comparison angle
    { position: new THREE.Vector3(2.8, 1.2, 4.4), lookAt: new THREE.Vector3(0.4, 0.1, 0) },
    // State 3: REGRESSION — Low-tension angle with slight focal distortion
    { position: new THREE.Vector3(0.6, 1.6, 5.8), lookAt: new THREE.Vector3(0, 0.3, 0) },
    // State 4: INVESTIGATION — Deep pivot towards isolated failed clusters
    { position: new THREE.Vector3(-1.6, -0.2, 4.0), lookAt: new THREE.Vector3(-0.4, 0.1, 0) },
    // State 5: CONFIDENCE — Straight dolly directly into 96.8% for UI transition
    { position: new THREE.Vector3(0, 0.32, 2.7), lookAt: new THREE.Vector3(0, 0.32, 0) }
  ], []);

  const curvePos = useMemo(() => new THREE.CatmullRomCurve3(waypoints.map(w => w.position)), [waypoints]);
  const curveLook = useMemo(() => new THREE.CatmullRomCurve3(waypoints.map(w => w.lookAt)), [waypoints]);

  const targetPosition = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());
  const currentLookAt = useRef(new THREE.Vector3(0, 0, 0));

  useFrame((state, delta) => {
    const t = THREE.MathUtils.clamp(scrollProgress, 0, 1);

    // Sample continuous spline positions
    curvePos.getPoint(t, targetPosition.current);
    curveLook.getPoint(t, targetLookAt.current);

    // Subtle atmospheric breathing motion
    const time = state.clock.elapsedTime;
    const breathingY = Math.sin(time * 0.6) * 0.05;
    const breathingX = Math.cos(time * 0.4) * 0.03;
    targetPosition.current.y += breathingY;
    targetPosition.current.x += breathingX;

    // Camera tension shake during regression
    if (healthStatus === 'regression') {
      const shakeIntensity = 0.025;
      targetPosition.current.x += (Math.random() - 0.5) * shakeIntensity;
      targetPosition.current.y += (Math.random() - 0.5) * shakeIntensity;
      targetPosition.current.z += (Math.random() - 0.5) * shakeIntensity;
    }

    // Velocity-based slight forward surge
    const velocityKick = THREE.MathUtils.clamp(scrollVelocity * 0.0008, -0.2, 0.2);
    targetPosition.current.z += velocityKick;

    // Horizontal exploration: pan camera across wide composition on horizontal scroll
    if (typeof window !== 'undefined') {
      const maxScrollX = document.documentElement.scrollWidth - window.innerWidth;
      if (maxScrollX > 0) {
        const hRatio = THREE.MathUtils.clamp(window.scrollX / maxScrollX, 0, 1);
        targetPosition.current.x += hRatio * 1.6;
        targetLookAt.current.x += hRatio * 1.2;
      }
    }

    // Smooth camera damping
    camera.position.lerp(targetPosition.current, delta * 3.2);

    // Smooth lookAt damping
    currentLookAt.current.lerp(targetLookAt.current, delta * 4.0);
    camera.lookAt(currentLookAt.current);
  });

  return null;
}
