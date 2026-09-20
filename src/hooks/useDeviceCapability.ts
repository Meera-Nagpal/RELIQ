import { useEffect, useState } from 'react';
import { getGPUTier } from 'detect-gpu';
import { isMobileDevice, isWebGLAvailable } from '../utils/webgl';
import { useExperienceStore } from '../store/experienceStore';

function getFastGPUTier(mobile: boolean): 'high' | 'medium' | 'low' {
  if (typeof window === 'undefined') return 'high';
  if (mobile) return 'medium';
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return 'low';
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
    const isDedicated = /nvidia|geforce|radeon|amd|apple/i.test(renderer);
    if (isDedicated) return 'high';
    return (navigator.hardwareConcurrency || 4) >= 8 ? 'high' : 'medium';
  } catch {
    return 'medium';
  }
}

/**
 * Hook to detect device tier and capabilities on mount (non-blocking)
 */
export function useDeviceCapability() {
  const { setCapabilityTier, setWebglAvailable } = useExperienceStore();
  const [capability, setCapability] = useState({
    tier: 'high',
    isMobile: false,
    webglAvailable: true,
  });

  useEffect(() => {
    async function detect() {
      const webgl = isWebGLAvailable();
      const mobile = isMobileDevice();
      setWebglAvailable(webgl);

      if (!webgl) {
        setCapabilityTier('fallback');
        setCapability({ tier: 'fallback', isMobile: mobile, webglAvailable: false });
        return;
      }

      // Fast synchronous evaluation for immediate first paint (<2ms)
      const instantTier = getFastGPUTier(mobile);
      setCapabilityTier(instantTier);
      setCapability({ tier: instantTier, isMobile: mobile, webglAvailable: true });

      // Non-blocking refinement with strict 200ms timeout race guard
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('GPU detection timeout')), 200)
        );
        const gpuTier = await Promise.race([getGPUTier(), timeoutPromise]);
        let refinedTier: 'high' | 'medium' | 'low' = instantTier;

        if (gpuTier && gpuTier.tier >= 3 && !mobile) {
          refinedTier = 'high';
        } else if (gpuTier && gpuTier.tier >= 2) {
          refinedTier = 'medium';
        } else if (gpuTier && gpuTier.tier >= 1) {
          refinedTier = 'low';
        }

        setCapabilityTier(refinedTier);
        setCapability({ tier: refinedTier, isMobile: mobile, webglAvailable: true });
      } catch {
        // Fallback tier already established synchronously without stalling
      }
    }

    detect();
  }, [setCapabilityTier, setWebglAvailable]);

  return capability;
}
