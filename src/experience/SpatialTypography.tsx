import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { useExperienceStore } from '../store/experienceStore';

/**
 * SpatialTypography Component
 * Integrates monumental typography directly into the 3D WebGL scene.
 * 
 * Key architectural features:
 * - Dynamic resolution-aware responsive scaling (frustum bounding):
 *   Automatically scales typography based on visible frustum width and height,
 *   guaranteeing all text fits the screen perfectly across ANY resolution (mobile, laptop, 1080p, ultrawide).
 * - "INVESTIGATE", "COMPARE", "DETECT", "RUN", and "RELIQ" are symmetrically centered,
 *   billboarded to face the camera, and bounded to safe viewport margins so they NEVER clip or overflow.
 * - Pure bright white (#FFFFFF) for maximum contrast and legibility.
 * - Smooth Hermite opacity transitions with zero inter-section overlap.
 */
export function SpatialTypography() {
  const { currentStateIndex, stateProgress, healthStatus } = useExperienceStore();

  const state1Group = useRef<THREE.Group>(null);
  const state2Group = useRef<THREE.Group>(null);
  const state3Group = useRef<THREE.Group>(null);
  const state4Group = useRef<THREE.Group>(null);
  const state5Group = useRef<THREE.Group>(null);
  const state6Group = useRef<THREE.Group>(null);

  useFrame(({ camera, size }, delta) => {
    // Frustum and camera geometry for exact responsive bounds calculation
    const persCamera = camera as THREE.PerspectiveCamera;
    const vFovRad = (persCamera.fov * Math.PI) / 180;
    const aspect = size.width / Math.max(size.height, 1);

    // Dynamic frustum-bounded scaling helper:
    // Computes visible world width & height at the group's exact distance from camera,
    // and scales the group so it occupies the optimal portion of the screen without ever clipping.
    const fitGroupToScreen = (
      group: THREE.Group | null,
      unscaledWidth: number,
      unscaledHeight: number,
      maxFractionWidth: number = 0.68,
      maxFractionHeight: number = 0.50
    ) => {
      if (!group) return;
      const dist = camera.position.distanceTo(group.position);
      const visibleHeight = 2 * dist * Math.tan(vFovRad / 2);
      const visibleWidth = visibleHeight * aspect;

      const safeWidth = visibleWidth * maxFractionWidth;
      const safeHeight = visibleHeight * maxFractionHeight;

      const scaleX = safeWidth / Math.max(unscaledWidth, 0.001);
      const scaleY = safeHeight / Math.max(unscaledHeight, 0.001);
      const targetScale = Math.min(1.0, scaleX, scaleY);

      group.scale.setScalar(targetScale);
      group.quaternion.copy(camera.quaternion);
    };

    // Apply responsive frustum bounds to all states
    fitGroupToScreen(state1Group.current, 6.2, 2.4, 0.65, 0.50);
    fitGroupToScreen(state2Group.current, 4.2, 1.8, 0.65, 0.50);
    fitGroupToScreen(state3Group.current, 5.2, 1.2, 0.68, 0.50);
    fitGroupToScreen(state4Group.current, 5.4, 1.3, 0.68, 0.50);
    fitGroupToScreen(state5Group.current, 5.4, 1.0, 0.68, 0.50); // INVESTIGATE: strictly bounded to 68% of screen
    fitGroupToScreen(state6Group.current, 3.2, 1.0, 0.62, 0.42); // 96.8%: bounded to 42% height so top text never clips

    // Hermite fade curve with clean inter-state buffer to ensure ZERO overlap
    const getOpacity = (targetIdx: number) => {
      if (currentStateIndex === targetIdx) {
        // State 05 (Final state): Smoothly dissolve before DashboardTransition opens
        if (targetIdx === 5) {
          if (stateProgress < 0.08) {
            const t = Math.max(0, stateProgress / 0.08);
            return t * t * (3 - 2 * t);
          }
          if (stateProgress > 0.22) {
            // Reaches 0 opacity by stateProgress 0.28 before dashboard card scales in
            const t = Math.max(0, 1 - (stateProgress - 0.22) / 0.06);
            return t * t * (3 - 2 * t);
          }
          return 1.0;
        }

        // States 0 through 4:
        // Fade in smoothly from 0.05 to 0.22
        if (stateProgress < 0.22) {
          const t = Math.max(0, (stateProgress - 0.05) / 0.17);
          return t * t * (3 - 2 * t);
        }
        // Fade out cleanly from 0.72 to 0.88 (fully 0 by 0.88 to guarantee zero overlap)
        if (stateProgress > 0.72) {
          const t = Math.max(0, 1 - (stateProgress - 0.72) / 0.16);
          return t * t * (3 - 2 * t);
        }
        return 1.0;
      }
      return 0.0;
    };

    const updateGroupOpacity = (group: THREE.Group | null, targetOpacity: number) => {
      if (!group) return;
      group.visible = targetOpacity > 0.005;
      group.children.forEach((child: any) => {
        if (child.material) {
          child.material.transparent = true;
          child.material.opacity = THREE.MathUtils.damp(
            child.material.opacity ?? 0,
            targetOpacity,
            5.5,
            delta
          );
        }
      });
    };

    updateGroupOpacity(state1Group.current, getOpacity(0));
    updateGroupOpacity(state2Group.current, getOpacity(1));
    updateGroupOpacity(state3Group.current, getOpacity(2));
    updateGroupOpacity(state4Group.current, getOpacity(3));
    updateGroupOpacity(state5Group.current, getOpacity(4));
    updateGroupOpacity(state6Group.current, getOpacity(5));

    // Subtle regression tension jitter strictly during DETECT state
    if (state4Group.current && healthStatus === 'regression') {
      state4Group.current.position.x = (Math.random() - 0.5) * 0.015;
      state4Group.current.position.y = 0.25 + (Math.random() - 0.5) * 0.015;
    }
  });

  return (
    <group>
      {/* ── STATE 01: SYSTEM (Monumental RELIQ) ── */}
      <group ref={state1Group} position={[0, 0.1, -1.2]}>
        <Text
          fontSize={2.4}
          letterSpacing={0.14}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
          fillOpacity={1}
        >
          RELIQ
        </Text>
        <Text
          position={[0, -1.2, 0]}
          fontSize={0.22}
          letterSpacing={0.25}
          color="#94A3B8"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.9}
        >
          SHIP AI CHANGES WITH CONFIDENCE
        </Text>
      </group>

      {/* ── STATE 02: DATA (RUN — Full Screen Fit) ── */}
      <group ref={state2Group} position={[0, 0.2, 0]}>
        <Text
          fontSize={1.8}
          letterSpacing={0.14}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
          fillOpacity={1}
        >
          RUN
        </Text>
      </group>

      {/* ── STATE 03: EVALUATION (COMPARE — Full Screen Fit) ── */}
      <group ref={state3Group} position={[0, 0.15, 0]}>
        <Text
          fontSize={1.15}
          letterSpacing={0.08}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
          fillOpacity={1}
        >
          COMPARE
        </Text>
      </group>

      {/* ── STATE 04: REGRESSION (DETECT — Full Screen Fit, Bright White) ── */}
      <group ref={state4Group} position={[0, 0.25, 0]}>
        <Text
          fontSize={1.25}
          letterSpacing={0.09}
          color="#FFFFFF" /* color="#FF2200" */
          anchorX="center"
          anchorY="middle"
          fillOpacity={1}
        >
          DETECT
        </Text>
      </group>

      {/* ── STATE 05: INVESTIGATION (INVESTIGATE — Responsive, Symmetrically Centered, Never Clipped) ── */}
      <group ref={state5Group} position={[0, 0.15, 0]}>
        <Text
          fontSize={0.82}
          letterSpacing={0.05}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
          fillOpacity={1}
        >
          INVESTIGATE
        </Text>
        {/* ISOLATED FAILURES metric represented cleanly via top-right MetricOverlay */}
      </group>

      {/* ── STATE 06: CONFIDENCE / TRANSITION (SHIP — 96.8%) ── */}
      <group ref={state6Group} position={[0, 0.32, -0.6]}>
        <Text
          position={[0, 0.44, 0]}
          fontSize={0.14}
          letterSpacing={0.24}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
          fillOpacity={1}
        >
          ROOT-CAUSE ISOLATED
        </Text>
        <Text
          position={[0, 0.04, 0]}
          fontSize={0.88}
          letterSpacing={0.04}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
          fillOpacity={1}
        >
          {(() => {
            try {
              if (typeof window !== 'undefined') {
                const stored = localStorage.getItem('reliq-active-confidence');
                if (stored) return `${parseFloat(stored).toFixed(1)}%`;
              }
            } catch {}
            return "96.8%";
          })()}
        </Text>
        <Text
          position={[0, -0.32, 0]}
          fontSize={0.12}
          letterSpacing={0.22}
          color="#CBD5E1"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.95}
        >
          AI RELIABILITY ASSURED
        </Text>
      </group>
    </group>
  );
}
