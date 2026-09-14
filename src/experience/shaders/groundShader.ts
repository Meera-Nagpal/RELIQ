/**
 * Custom shader for the reflective digital water / fluid ground plane.
 * Simulates data behaving as a fluid:
 * - Concentric data ripples emanating from the central core footprint
 * - Subtle wave surface tension
 * - Health-reactive distortion and caustic light lines
 */
export const groundShader = {
  uniforms: {
    uTime: { value: 0 },
    uDistortion: { value: 0 },
    uScrollProgress: { value: 0 },
    uScrollVelocity: { value: 0 },
    uHealthFactor: { value: 1.0 },
  },
  vertexShader: `
    uniform float uTime;
    uniform float uDistortion;
    uniform float uScrollProgress;
    uniform float uScrollVelocity;
    uniform float uHealthFactor;
    
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    varying float vRipple;

    // Simplex 2D noise
    vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
    float snoise(vec2 v){
      const vec4 C = vec4(0.211324865405187, 0.366025403784439,
               -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy));
      vec2 x0 = v -   i + dot(i, C.xx);
      vec2 i1;
      i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod(i, 289.0);
      vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
        + i.x + vec3(0.0, i1.x, 1.0 ));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
        dot(x12.zw,x12.zw)), 0.0);
      m = m*m;
      m = m*m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    void main() {
      vUv = uv;
      vec3 pos = position;
      
      // Distance from center (underneath core)
      float dist = length(pos.xy);
      
      // Concentric circular data wave rings
      float waveFreq = 2.2;
      float waveSpeed = uTime * (1.2 + abs(uScrollVelocity) * 2.0);
      float rings = sin(dist * waveFreq - waveSpeed) * exp(-dist * 0.18);
      
      // Organic fluid micro-turbulence
      float turbulence = snoise(pos.xy * 0.18 + uTime * 0.3) * (0.08 + uDistortion * 0.25);
      
      // Vertical displacement
      float totalWave = (rings * 0.12 + turbulence) * (1.0 + (1.0 - uHealthFactor) * 1.5);
      pos.z += totalWave;
      vRipple = totalWave;
      
      vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uDistortion;
    uniform float uHealthFactor;
    
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    varying float vRipple;

    void main() {
      // Deep obsidian digital fluid base
      vec3 fluidBase = vec3(0.02, 0.035, 0.05);
      
      // Distance from core origin
      float dist = length(vWorldPosition.xz);
      
      // Concentric grid pulse lines
      float ringLine = abs(fract(dist * 0.6 - uTime * 0.15) - 0.5);
      float gridPulse = smoothstep(0.46, 0.49, ringLine);
      
      // Fine digital coordinate lines
      vec2 gridUv = fract(vWorldPosition.xz * 0.8);
      float fineGrid = step(0.97, gridUv.x) + step(0.97, gridUv.y);
      fineGrid *= exp(-dist * 0.12);
      
      // Crest specular caustics
      float crest = smoothstep(0.04, 0.12, vRipple);
      
      // Accent tint based on system health
      vec3 healthyAccent = vec3(1.0, 0.42, 0.21); // #FF6B35
      vec3 dangerAccent  = vec3(1.0, 0.15, 0.05); // #FF2200
      vec3 activeAccent  = mix(dangerAccent, healthyAccent, uHealthFactor);
      
      // Digital fluid color composition
      vec3 finalColor = fluidBase;
      finalColor += activeAccent * gridPulse * 0.12;
      finalColor += vec3(0.3, 0.5, 0.7) * fineGrid * 0.15;
      finalColor += activeAccent * crest * (0.4 + uDistortion * 0.6);
      
      // Radial vignette so the fluid fades naturally into the horizon
      float vignette = exp(-dist * 0.08);
      float alpha = clamp(0.75 * vignette + crest * 0.3, 0.0, 0.95);
      
      gl_FragColor = vec4(finalColor, alpha);
    }
  `
};
