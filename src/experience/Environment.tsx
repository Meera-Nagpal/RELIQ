import React, { useMemo } from 'react';
import * as THREE from 'three';

/**
 * Background atmosphere (minimal star field).
 */
export function Environment() {
  const count = 100;
  
  const [positions] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Generate stars far away
      const r = 15 + Math.random() * 10;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      pos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    return [pos];
  }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute 
          attach="attributes-position" 
          args={[positions, 3]} 
        />
      </bufferGeometry>
      <pointsMaterial 
        size={0.05}
        color="#ffffff"
        transparent={true}
        opacity={0.3}
        sizeAttenuation={true}
      />
    </points>
  );
}
