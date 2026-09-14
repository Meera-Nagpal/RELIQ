import * as THREE from 'three';

/**
 * Custom shader for GPU-driven data particles.
 */
export const particleShader = {
  uniforms: {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#FFFFFF') },
    uHealthFactor: { value: 1.0 }
  },
  vertexShader: `
    uniform float uTime;
    uniform float uHealthFactor;
    
    attribute float aRandomness;
    attribute float aScale;
    
    varying vec3 vColor;

    void main() {
      vec3 pos = position;
      
      // Perturb position based on time and randomness
      float speedFactor = mix(2.0, 0.5, uHealthFactor);
      pos.x += sin(uTime * speedFactor + aRandomness * 10.0) * 0.1;
      pos.y += cos(uTime * speedFactor + aRandomness * 10.0) * 0.1;
      pos.z += sin(uTime * speedFactor * 0.5 + aRandomness * 5.0) * 0.1;
      
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      
      // Size attenuation based on distance
      gl_PointSize = (20.0 * aScale) * (1.0 / -mvPosition.z);
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    
    void main() {
      // Circular alpha falloff
      vec2 center = gl_PointCoord - vec2(0.5);
      float dist = length(center);
      float alpha = 1.0 - smoothstep(0.1, 0.5, dist);
      
      if (alpha < 0.01) discard;
      
      gl_FragColor = vec4(uColor, alpha * 0.8);
    }
  `
};
