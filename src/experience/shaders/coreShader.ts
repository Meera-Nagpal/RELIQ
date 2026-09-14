import * as THREE from 'three';

/**
 * Custom shader material for the central Reliability Core object.
 * Features Simplex 3D noise-based displacement, Fresnel edge glow,
 * chromatic shifts, and health-reactive surface tension.
 */
export const coreShader = {
  uniforms: {
    uTime: { value: 0 },
    uHealthFactor: { value: 1.0 }, // 1.0 = healthy/calm, 0.0 = regression/distorted
    uScrollProgress: { value: 0 },
    uAccentColor: { value: new THREE.Color('#FF6B35') },
    uSecondaryColor: { value: new THREE.Color('#4DA6FF') },
    uDangerColor: { value: new THREE.Color('#FF2200') },
  },
  vertexShader: `
    uniform float uTime;
    uniform float uHealthFactor;
    uniform float uScrollProgress;
    
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vWorldPosition;
    varying float vNoise;

    // Simplex 3D Noise (Ian McEwan, Ashima Arts)
    vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
    vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
    float snoise(vec3 v){ 
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i  = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min( g.xyz, l.zxy );
      vec3 i2 = max( g.xyz, l.zxy );
      vec3 x1 = x0 - i1 + 1.0 * C.xxx;
      vec3 x2 = x0 - i2 + 2.0 * C.xxx;
      vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
      i = mod(i, 289.0); 
      vec4 p = permute( permute( permute( 
                 i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
               + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
               + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
      float n_ = 1.0/7.0;
      vec3  ns = n_ * D.wyz - D.xzx;
      float nsz = ns.z * ns.z;
      vec4 j = p - 49.0 * floor(p * nsz);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_ );
      vec4 x = x_ *ns.x + ns.yyyy;
      vec4 y = y_ *ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4( x.xy, y.xy );
      vec4 b1 = vec4( x.zw, y.zw );
      vec4 s0 = floor(b0)*2.0 + 1.0;
      vec4 s1 = floor(b1)*2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
      vec3 p0 = vec3(a0.xy,h.x);
      vec3 p1 = vec3(a0.zw,h.y);
      vec3 p2 = vec3(a1.xy,h.z);
      vec3 p3 = vec3(a1.zw,h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
      p0 *= norm.x;
      p1 *= norm.y;
      p2 *= norm.z;
      p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                    dot(p2,x2), dot(p3,x3) ) );
    }

    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      
      // Multi-frequency noise calculation
      float instability = 1.0 - uHealthFactor;
      float speed = mix(0.4, 2.2, instability);
      float baseNoise = snoise(position * 2.5 + uTime * speed);
      float fineNoise = snoise(position * 5.0 - uTime * speed * 1.5) * 0.5;
      float noiseValue = baseNoise + fineNoise;
      vNoise = noiseValue;
      
      // Displacement scales dramatically during regression
      float displacementAmp = mix(0.04, 0.38, instability);
      vec3 displacedPosition = position + normal * (noiseValue * displacementAmp);
      
      vec4 worldPos = modelMatrix * vec4(displacedPosition, 1.0);
      vWorldPosition = worldPos.xyz;
      
      vec4 modelViewPosition = viewMatrix * worldPos;
      vViewPosition = -modelViewPosition.xyz;
      gl_Position = projectionMatrix * modelViewPosition;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uHealthFactor;
    uniform vec3 uAccentColor;
    uniform vec3 uSecondaryColor;
    uniform vec3 uDangerColor;
    
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vWorldPosition;
    varying float vNoise;

    void main() {
      // Fresnel effect for radiant crystalline edge glow
      vec3 viewDir = normalize(vViewPosition);
      float fresnel = dot(viewDir, vNormal);
      fresnel = clamp(1.0 - fresnel, 0.0, 1.0);
      float fresnelPow = mix(3.0, 1.8, 1.0 - uHealthFactor);
      fresnel = pow(fresnel, fresnelPow);
      
      // Deep crystalline base color
      vec3 deepBase = vec3(0.015, 0.025, 0.04);
      
      // Health color interpolation:
      // Healthy (1.0) -> Warm Amber #FF6B35 & Cyan #4DA6FF
      // Warning (0.7) -> Intense Amber
      // Regression (0.0 - 0.3) -> Pulsing Crimson #FF2200
      vec3 healthyColor = mix(uAccentColor, uSecondaryColor, 0.25);
      vec3 currentStatusColor = mix(uDangerColor, healthyColor, smoothstep(0.1, 0.8, uHealthFactor));
      
      // High-frequency energy pulse
      float pulse = sin(uTime * mix(2.0, 8.0, 1.0 - uHealthFactor) + vNoise * 4.0) * 0.5 + 0.5;
      vec3 glowColor = mix(currentStatusColor, vec3(1.0, 0.9, 0.8), pulse * 0.35);
      
      // Combine base with radiant glow
      float intensity = mix(1.2, 2.5, 1.0 - uHealthFactor);
      vec3 finalColor = mix(deepBase, glowColor, fresnel * intensity);
      
      // Internal facet caustic highlights
      float caustic = pow(clamp(sin(vNoise * 6.0 + uTime * 2.0), 0.0, 1.0), 4.0);
      finalColor += currentStatusColor * caustic * 0.4;
      
      // Additive alpha falloff
      float alpha = clamp(fresnel * intensity + 0.15 + caustic * 0.2, 0.0, 0.95);
      
      gl_FragColor = vec4(finalColor, alpha);
    }
  `
};
