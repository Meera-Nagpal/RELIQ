import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useExperienceStore } from '../store/experienceStore';

/**
 * Data Connections component
 * Thin connecting lines between moving data points, evaluation signals,
 * and isolated failure clusters during investigation.
 */
export function DataConnections() {
  const lineRef = useRef<THREE.LineSegments>(null);
  const materialRef = useRef<THREE.LineBasicMaterial>(null);
  const failureClusterRef = useRef<THREE.Group>(null);

  const { healthStatus, currentStateIndex } = useExperienceStore();

  const nodeCount = 60;

  // Base dynamic test case nodes
  const nodes = useMemo(() => {
    return Array.from({ length: nodeCount }).map(() => ({
      position: new THREE.Vector3(
        (Math.random() - 0.5) * 7.5,
        (Math.random() - 0.5) * 3.5,
        (Math.random() - 0.5) * 7.5
      ),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.015,
        (Math.random() - 0.5) * 0.015,
        (Math.random() - 0.5) * 0.015
      )
    }));
  }, []);

  // Pre-generate 47 isolated failure nodes for State 05 (INVESTIGATION)
  const failureNodes = useMemo(() => {
    return Array.from({ length: 47 }).map(() => ({
      pos: [
        -1.2 + (Math.random() - 0.5) * 1.8,
        0.1 + (Math.random() - 0.5) * 1.2,
        0.6 + (Math.random() - 0.5) * 1.6
      ] as [number, number, number],
      pulseOffset: Math.random() * Math.PI * 2
    }));
  }, []);

  // Pre-allocate geometry buffers
  const maxConnections = (nodeCount * (nodeCount - 1)) / 2;
  const positions = useMemo(() => new Float32Array(maxConnections * 6), [maxConnections]);

  useFrame((state, delta) => {
    if (!lineRef.current || !materialRef.current) return;

    let connectionThreshold = 2.1;
    const targetColor = new THREE.Color('#4DA6FF');

    if (healthStatus === 'warning') {
      targetColor.set('#FF6B35');
      connectionThreshold = 1.6;
    } else if (healthStatus === 'regression') {
      targetColor.set('#FF2200');
      connectionThreshold = 0.9; // Connections fracture
    } else if (healthStatus === 'recovered') {
      targetColor.set('#55DDFF');
      connectionThreshold = 2.3;
    }

    materialRef.current.color.lerp(targetColor, delta * 3.0);

    // Update node positions
    nodes.forEach(node => {
      node.position.add(node.velocity);
      if (Math.abs(node.position.x) > 3.8) node.velocity.x *= -1;
      if (Math.abs(node.position.y) > 1.8) node.velocity.y *= -1;
      if (Math.abs(node.position.z) > 3.8) node.velocity.z *= -1;
    });

    let vertexIndex = 0;

    for (let i = 0; i < nodeCount; i++) {
      for (let j = i + 1; j < nodeCount; j++) {
        const dist = nodes[i].position.distanceTo(nodes[j].position);

        if (dist < connectionThreshold) {
          positions[vertexIndex++] = nodes[i].position.x;
          positions[vertexIndex++] = nodes[i].position.y;
          positions[vertexIndex++] = nodes[i].position.z;

          positions[vertexIndex++] = nodes[j].position.x;
          positions[vertexIndex++] = nodes[j].position.y;
          positions[vertexIndex++] = nodes[j].position.z;
        }
      }
    }

    const geometry = lineRef.current.geometry;
    geometry.setDrawRange(0, vertexIndex / 3);
    geometry.attributes.position.needsUpdate = true;

    // Failure cluster visibility in State 4/5
    if (failureClusterRef.current) {
      const isInvestigating = currentStateIndex === 4 || currentStateIndex === 3;
      const targetOpacity = isInvestigating ? 1.0 : 0.0;
      failureClusterRef.current.visible = targetOpacity > 0.01;

      failureClusterRef.current.children.forEach((child: any, idx) => {
        if (child.material) {
          const fn = failureNodes[idx];
          const pulse = Math.sin(state.clock.elapsedTime * 4 + (fn?.pulseOffset || 0)) * 0.4 + 0.6;
          child.material.opacity = THREE.MathUtils.damp(
            child.material.opacity,
            targetOpacity * pulse,
            4,
            delta
          );
        }
      });
    }
  });

  return (
    <group>
      {/* ── Main Dynamic Network Graph ── */}
      <lineSegments ref={lineRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            usage={THREE.DynamicDrawUsage}
          />
        </bufferGeometry>
        <lineBasicMaterial
          ref={materialRef}
          color="#4DA6FF"
          transparent={true}
          opacity={0.35}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      {/* ── 47 Isolated Failure Cluster Nodes (State 05) ── */}
      <group ref={failureClusterRef}>
        {failureNodes.map((node, i) => (
          <mesh key={i} position={node.pos}>
            <sphereGeometry args={[0.035, 12, 12]} />
            <meshBasicMaterial
              color="#FF3311"
              transparent
              opacity={0}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}
