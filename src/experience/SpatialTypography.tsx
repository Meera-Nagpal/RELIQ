import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { useExperienceStore } from '../store/experienceStore';
import { useRouter } from '../router/useRouter';

/**
 * SpatialTypography Component
 * Integrates monumental typography directly into the 3D WebGL scene.
 * Words exist with real 3D coordinates:
 * - Positioned behind or alongside the Reliability Core
 * - Occluded by 3D geometry
 * - Mirrored in the reflective fluid ground
 * - Changing perspective as the camera navigates
 * - Strictly isolated during global brand transitions
 */
export function SpatialTypography() {
  const { currentStateIndex, stateProgress, healthStatus } = useExperienceStore();
  const { isTransitioning } = useRouter();

  const state1Group = useRef<THREE.Group>(null);
  const state2Group = useRef<THREE.Group>(null);
  const state3Group = useRef<THREE.Group>(null);
  const state4Group = useRef<THREE.Group>(null);
  const state5Group = useRef<THREE.Group>(null);
  const state6Group = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    // Transition State Isolation:
    // If a brand transition is active, immediately hide all state typography
    if (isTransitioning) {
      const hideGroup = (group: THREE.Group | null) => {
        if (!group) return;
        group.visible = false;
        group.children.forEach((child: any) => {
          if (child.material) {
            child.material.opacity = 0;
          }
        });
      };
      hideGroup(state1Group.current);
      hideGroup(state2Group.current);
      hideGroup(state3Group.current);
      hideGroup(state4Group.current);
      hideGroup(state5Group.current);
      hideGroup(state6Group.current);
      return;
    }

    // Opacity helpers for each state
    const getOpacity = (targetIdx: number) => {
      if (currentStateIndex === targetIdx) {
        if (stateProgress < 0.15) return stateProgress / 0.15;
        if (stateProgress > 0.85) return (1 - stateProgress) / 0.15;
        return 1.0;
      }
      return 0.0;
    };

    const updateGroupOpacity = (group: THREE.Group | null, targetOpacity: number) => {
      if (!group) return;
      group.visible = targetOpacity > 0.01;
      const dampFactor = targetOpacity === 0 ? 14 : 7;
      group.children.forEach((child: any) => {
        if (child.material) {
          child.material.transparent = true;
          child.material.opacity = THREE.MathUtils.damp(
            child.material.opacity ?? 0,
            targetOpacity,
            dampFactor,
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

    // Jitter state 4 (DETECT / REGRESSION) during regression
    if (state4Group.current && healthStatus === 'regression') {
      state4Group.current.position.x = (Math.random() - 0.5) * 0.03;
      state4Group.current.position.y = 1.8 + (Math.random() - 0.5) * 0.03;
    }
  });

  return (
    <group>
      {/* ── STATE 01: SYSTEM (Monumental RELIQ behind core) ── */}
      <group ref={state1Group} position={[0, 0, -2.6]}>
        <Text
          fontSize={3.2}
          letterSpacing={0.12}
          color="#D9DDE2"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.45}
          depthOffset={1}
        >
          RELIQ
        </Text>
        <Text
          position={[0, -1.5, 0]}
          fontSize={0.28}
          letterSpacing={0.25}
          color="#AEB5BE"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.60}
        >
          SHIP AI CHANGES WITH CONFIDENCE
        </Text>
      </group>

      {/* ── STATE 02: DATA (DATA — 500 Active Test Cases) ── */}
      <group ref={state2Group} position={[0.4, 0.4, -1.6]} rotation={[0, -0.1, 0]}>
        <Text
          fontSize={1.8}
          letterSpacing={0.15}
          color="#D9DDE2"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.45}
          depthOffset={1}
        >
          DATA
        </Text>
        <Text
          position={[0, -0.9, 0]}
          fontSize={0.65}
          letterSpacing={0.08}
          color="#D9DDE2"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.75}
          depthOffset={1}
        >
          500
        </Text>
        <Text
          position={[0, -1.35, 0]}
          fontSize={0.22}
          letterSpacing={0.2}
          color="#AEB5BE"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.55}
          depthOffset={1}
        >
          ACTIVE TEST CASES
        </Text>
      </group>

      {/* ── STATE 03: EVALUATION (COMPARE — 94.8% Accuracy) ── */}
      <group ref={state3Group} position={[2.2, 0.3, -1.8]} rotation={[0, -0.2, 0]}>
        <Text
          fontSize={1.7}
          letterSpacing={0.12}
          color="#D9DDE2"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.52}
          depthOffset={1}
        >
          COMPARE
        </Text>
        <Text
          position={[0, -0.85, 0]}
          fontSize={0.7}
          letterSpacing={0.05}
          color="#E6E8EB"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.75}
          depthOffset={1}
        >
          94.8%
        </Text>
        <Text
          position={[0, -1.3, 0]}
          fontSize={0.22}
          letterSpacing={0.2}
          color="#AEB5BE"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.55}
          depthOffset={1}
        >
          BASELINE ACCURACY
        </Text>
      </group>

      {/* ── STATE 04: REGRESSION (DETECT — 89.7% Warning) ── */}
      <group ref={state4Group} position={[0, 1.8, -2.4]}>
        <Text
          fontSize={1.9}
          letterSpacing={0.18}
          color="#D7DBE0"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.55}
          depthOffset={1}
        >
          DETECT
        </Text>
        <Text
          position={[0, -0.85, 0]}
          fontSize={0.32}
          letterSpacing={0.28}
          color="#E5673E"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.60}
          depthOffset={1}
        >
          REGRESSION DETECTED
        </Text>
      </group>

      {/* ── STATE 05: INVESTIGATION (INVESTIGATION — 47 Failed Cases) ── */}
      <group ref={state5Group} position={[1.8, 0.1, -1.8]} rotation={[0, -0.25, 0]}>
        <Text
          fontSize={1.6}
          letterSpacing={0.15}
          color="#D9DDE2"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.58}
          depthOffset={1}
        >
          INVESTIGATION
        </Text>
        <Text
          position={[0, -0.85, 0]}
          fontSize={2.4}
          letterSpacing={0.05}
          color="#E6E8EB"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.75}
          depthOffset={1}
        >
          47
        </Text>
        <Text
          position={[0, -1.8, 0]}
          fontSize={0.32}
          letterSpacing={0.2}
          color="#AEB5BE"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.55}
          depthOffset={1}
        >
          ISOLATED FAILURES
        </Text>
      </group>

      {/* ── STATE 06: CONFIDENCE / TRANSITION (SHIP — 96.8% Target) ── */}
      <group ref={state6Group} position={[0, 0.2, -1.8]}>
        <Text
          position={[0, 1.2, 0]}
          fontSize={0.3}
          letterSpacing={0.35}
          color="#B8C0C8"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.60}
          depthOffset={1}
        >
          ROOT-CAUSE ISOLATED
        </Text>
        <Text
          position={[0, 0.3, 0]}
          fontSize={2.0}
          letterSpacing={0.04}
          color="#E6E8EB"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.82}
          depthOffset={1}
        >
          96.8%
        </Text>
        <Text
          position={[0, -0.6, 0]}
          fontSize={0.22}
          letterSpacing={0.25}
          color="#FF6B35"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.62}
          depthOffset={1}
        >
          AI RELIABILITY ASSURED
        </Text>
      </group>
    </group>
  );
}
