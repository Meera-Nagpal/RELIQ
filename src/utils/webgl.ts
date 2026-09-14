/* ============================================================
   RELIQ — WebGL Detection & Capability Utilities
   ============================================================ */

/** Check if WebGL is available */
export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl2') || canvas.getContext('webgl'))
    );
  } catch {
    return false;
  }
}

/** Check if WebGL2 is available */
export function isWebGL2Available(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl2');
  } catch {
    return false;
  }
}

/** Get max texture size supported by GPU */
export function getMaxTextureSize(): number {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return 0;
    return gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  } catch {
    return 0;
  }
}

/** Check if device prefers reduced motion */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Detect if device is mobile */
export function isMobileDevice(): boolean {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  
  const isMobileUA = /iPhone|iPod|Android/i.test(ua) || /iPad/i.test(ua);
  const isIPad = platform === 'MacIntel' && maxTouchPoints > 1;
  const isSmallScreen = Math.min(screen.width, window.innerWidth || screen.width) < 768;
  
  return isMobileUA || isIPad || isSmallScreen;
}

/** Get optimal DPR for the device */
export function getOptimalDpr(tier: 'high' | 'medium' | 'low' | 'fallback'): [number, number] {
  switch (tier) {
    case 'high':
      return [1, 2];
    case 'medium':
      return [1, 1.5];
    case 'low':
      return [1, 1];
    default:
      return [1, 1];
  }
}
