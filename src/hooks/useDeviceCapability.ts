import { useEffect, useState } from 'react';
import { getGPUTier } from 'detect-gpu';
import { isMobileDevice, isWebGLAvailable } from '../utils/webgl';
import { useExperienceStore } from '../store/experienceStore';

/**
 * Hook to detect device tier and capabilities on mount
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

      try {
        const gpuTier = await getGPUTier();
        let tier: 'high' | 'medium' | 'low' | 'fallback' = 'fallback';
        
        if (gpuTier.tier >= 3 && !mobile) {
          tier = 'high';
        } else if (gpuTier.tier >= 2) {
          tier = 'medium';
        } else if (gpuTier.tier >= 1) {
          tier = 'low';
        }
        
        setCapabilityTier(tier);
        setCapability({ tier, isMobile: mobile, webglAvailable: true });
      } catch (error) {
        setCapabilityTier('low');
        setCapability({ tier: 'low', isMobile: mobile, webglAvailable: true });
      }
    }
    
    detect();
  }, [setCapabilityTier, setWebglAvailable]);

  return capability;
}
