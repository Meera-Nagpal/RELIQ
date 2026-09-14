/* ============================================================
   RELIQ — Math & Easing Utilities
   ============================================================ */

/** Linear interpolation */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/** Clamp value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Map a value from one range to another */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

/** Map with clamping */
export function mapRangeClamped(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  return clamp(mapRange(value, inMin, inMax, outMin, outMax), Math.min(outMin, outMax), Math.max(outMin, outMax));
}

/** Smooth step (cubic Hermite) */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Smoother step (quintic) */
export function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Frame-rate independent exponential damping */
export function damp(
  current: number,
  target: number,
  lambda: number,
  dt: number
): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** 3D Perlin-like noise (simplex approximation for shaders) */
export function hash(x: number): number {
  return ((Math.sin(x * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;
}

/** Ease out cubic */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Ease in out cubic */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Ease out elastic (for spring-like effects) */
export function easeOutElastic(t: number): number {
  const c4 = (2 * Math.PI) / 3;
  return t === 0
    ? 0
    : t === 1
    ? 1
    : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}
