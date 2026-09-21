import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { useExperienceStore } from '../store/experienceStore';

/**
 * SpatialTypography
 *
 * Monumental 3D typography integrated into the RELIQ WebGL scene.
 *
 * Design principles:
 * - Typography remains part of the 3D world rather than behaving like a HUD.
 * - Large background words create the editorial / technical-surrealism feel.
 * - Foreground metrics remain readable through the main overlay system.
 * - Positions are intentionally kept inside safer viewport bounds.
 * - State transitions fade smoothly with experience progress.
 */
export function SpatialTypography() {
  const { currentStateIndex, stateProgress, healthStatus } =
    useExperienceStore();

  const state1Group = useRef<THREE.Group>(null);
  const state2Group = useRef<THREE.Group>(null);
  const state3Group = useRef<THREE.Group>(null);
  const state4Group = useRef<THREE.Group>(null);
  const state5Group = useRef<THREE.Group>(null);
  const state6Group = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    /**
     * Smooth opacity envelope for each experience state.
     */
    const getOpacity = (targetIdx: number) => {
      if (currentStateIndex !== targetIdx) {
        return 0;
      }

      if (stateProgress < 0.15) {
        return stateProgress / 0.15;
      }

      if (stateProgress > 0.85) {
        return (1 - stateProgress) / 0.15;
      }

      return 1;
    };

    /**
     * Smoothly applies opacity to all text objects in a state group.
     */
    const updateGroupOpacity = (
      group: THREE.Group | null,
      targetOpacity: number
    ) => {
      if (!group) return;

      group.visible = targetOpacity > 0.01;

      group.children.forEach((child: THREE.Object3D) => {
        const material = (child as any).material;

        if (!material) return;

        material.transparent = true;

        material.opacity = THREE.MathUtils.damp(
          material.opacity ?? 0,
          targetOpacity,
          6,
          delta
        );
      });
    };

    updateGroupOpacity(state1Group.current, getOpacity(0));
    updateGroupOpacity(state2Group.current, getOpacity(1));
    updateGroupOpacity(state3Group.current, getOpacity(2));
    updateGroupOpacity(state4Group.current, getOpacity(3));
    updateGroupOpacity(state5Group.current, getOpacity(4));
    updateGroupOpacity(state6Group.current, getOpacity(5));

    /**
     * DETECT / REGRESSION atmospheric jitter.
     *
     * Keep the jitter around the intentionally lowered
     * y = 1.25 baseline so the typography does not jump
     * back into the old clipped position.
     */
    if (state4Group.current && healthStatus === 'regression') {
      state4Group.current.position.x =
        (Math.random() - 0.5) * 0.03;

      state4Group.current.position.y =
        1.25 + (Math.random() - 0.5) * 0.03;
    }
  });

  return (
    <group>

      {/* =========================================================
          STATE 01 — SYSTEM
          Monumental RELIQ background typography
      ========================================================= */}
      <group
        ref={state1Group}
        position={[0, 0, -2.6]}
      >
        <Text
          fontSize={3.2}
          letterSpacing={0.12}
          color="#F2F2F2"
          anchorX="center"
          anchorY="middle"
          fillOpacity={1}
          depthOffset={1}
        >
          RELIQ
        </Text>

        <Text
          position={[0, -1.5, 0]}
          fontSize={0.28}
          letterSpacing={0.25}
          color="#888888"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.9}
        >
          SHIP AI CHANGES WITH CONFIDENCE
        </Text>
      </group>

      {/* =========================================================
          STATE 02 — DATA / RUN
          ========================================================= */}
      <group
        ref={state2Group}
        position={[-2.0, 0.35, 1.2]}
        rotation={[0, 0.25, 0]}
      >
        <Text
          fontSize={1.8}
          letterSpacing={0.15}
          color="#FF6B35"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.8}
        >
          RUN
        </Text>

        <Text
          position={[0, -0.9, 0]}
          fontSize={0.65}
          letterSpacing={0.08}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.9}
        >
          500
        </Text>

        <Text
          position={[0, -1.35, 0]}
          fontSize={0.22}
          letterSpacing={0.16}
          color="#888888"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.8}
        >
          ACTIVE TEST CASES
        </Text>
      </group>

      {/* =========================================================
          STATE 03 — COMPARE / EVALUATION
          Positioned lower/right to avoid overlay collision.
      ========================================================= */}
      <group
        ref={state3Group}
        position={[2.2, -0.2, -1.8]}
        rotation={[0, -0.2, 0]}
      >
        <Text
          fontSize={1.7}
          letterSpacing={0.12}
          color="#4DA6FF"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.24}
          depthOffset={1}
        >
          COMPARE
        </Text>

        <Text
          position={[0, -0.85, 0]}
          fontSize={0.7}
          letterSpacing={0.05}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.24}
          depthOffset={1}
        >
          94.8%
        </Text>

        <Text
          position={[0, -1.3, 0]}
          fontSize={0.22}
          letterSpacing={0.16}
          color="#888888"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.22}
          depthOffset={1}
        >
          BASELINE ACCURACY
        </Text>
      </group>

      {/* =========================================================
          STATE 04 — DETECT / REGRESSION
          Dark/muted typography intentionally avoids bright red.
      ========================================================= */}
      <group
        ref={state4Group}
        position={[0, 1.25, -1.2]}
      >
        <Text
          fontSize={1.9}
          letterSpacing={0.18}
          color="#3A180E"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.24}
          depthOffset={1}
        >
          DETECT
        </Text>

        <Text
          position={[0, -0.85, 0]}
          fontSize={0.32}
          letterSpacing={0.24}
          color="#4A2012"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.24}
          depthOffset={1}
        >
          REGRESSION DETECTED
        </Text>
      </group>

      {/* =========================================================
          STATE 05 — INVESTIGATION
          Pulled inward so the full word remains visible.
      ========================================================= */}
      <group
        ref={state5Group}
        position={[-0.85, 0.1, 0.8]}
        rotation={[0, 0.25, 0]}
      >
        <Text
          fontSize={1.45}
          letterSpacing={0.10}
          color="#FF9955"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.8}
        >
          INVESTIGATE
        </Text>

        <Text
          position={[0, -0.78, 0]}
          fontSize={0.9}
          letterSpacing={0.05}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.9}
        >
          47
        </Text>

        <Text
          position={[0, -1.27, 0]}
          fontSize={0.22}
          letterSpacing={0.16}
          color="#888888"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.8}
        >
          ISOLATED FAILURES
        </Text>
      </group>

      {/* =========================================================
          STATE 06 — CONFIDENCE / SHIP
          Lowered slightly so 96.8% remains fully visible.
      ========================================================= */}
      <group
        ref={state6Group}
        position={[0, -0.15, 1.4]}
      >
        <Text
          position={[0, 1.2, 0]}
          fontSize={0.3}
          letterSpacing={0.30}
          color="#4DA6FF"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.9}
        >
          ROOT-CAUSE ISOLATED
        </Text>

        <Text
          position={[0, 0.05, 0]}
          fontSize={1.6}
          letterSpacing={0.04}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
          fillOpacity={1}
        >
          96.8%
        </Text>

        <Text
          position={[0, -0.6, 0]}
          fontSize={0.22}
          letterSpacing={0.20}
          color="#FF6B35"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.9}
        >
          AI RELIABILITY ASSURED
        </Text>
      </group>

    </group>
  );
}