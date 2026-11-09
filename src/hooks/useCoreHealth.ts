/* ============================================================
   RELIQ — Core System Health Reactive Hook
   
   Polls live backend /api/health to reflect real API availability
   and database connection status in UI components (Hero, AppHeader).
   Transitions between NOMINAL, DEGRADED, OFFLINE, and CHECKING.
   ============================================================ */

import { useState, useEffect, useCallback } from 'react';
import { checkBackendHealth, HealthReport } from '../services/apiClient';

export interface CoreHealthState {
  status: 'NOMINAL' | 'DEGRADED' | 'OFFLINE' | 'CHECKING';
  latencyMs: number;
  database?: string;
  databaseType?: string;
  lastChecked: Date | null;
  error?: string;
  isChecking: boolean;
  refresh: () => Promise<HealthReport>;
}

export function useCoreHealth(pollIntervalMs = 25000): CoreHealthState {
  const [health, setHealth] = useState<HealthReport>({
    status: 'NOMINAL',
    latencyMs: 0,
  });
  const [isChecking, setIsChecking] = useState<boolean>(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setIsChecking(true);
    try {
      const res = await checkBackendHealth();
      setHealth(res);
      setLastChecked(new Date());
      return res;
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, pollIntervalMs);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refresh, pollIntervalMs]);

  return {
    status: isChecking && !lastChecked ? 'CHECKING' : health.status,
    latencyMs: health.latencyMs,
    database: health.database,
    databaseType: health.databaseType,
    lastChecked,
    error: health.error,
    isChecking,
    refresh,
  };
}
