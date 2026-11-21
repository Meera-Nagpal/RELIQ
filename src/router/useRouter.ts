/* ============================================================
   RELIQ — Client Router Hook with Global Ripple Transitions & Deep-Linking
   
   Supports:
   - Full-route navigation across 3D landing ("/") and workspace ("#/app/*")
   - Sub-resource ID navigation (e.g. #/app/evaluations/:runId, #/app/datasets/:datasetId)
   - Dynamic query parameter synchronization (e.g. ?filter=regression&severity=critical)
   - Synchronized 3-ring ripple page transitions on route changes
   - prefers-reduced-motion immediate navigation support
   ============================================================ */

import { useEffect, useState, useCallback } from 'react';

export type AppView =
  | 'overview'
  | 'dashboard'
  | 'evaluations'
  | 'new-evaluation'
  | 'datasets'
  | 'models'
  | 'judges'
  | 'history'
  | 'regressions'
  | 'details'
  | 'settings'
  | 'projects';

export interface RouteState {
  isApp: boolean;
  appView: AppView;
  subId?: string;
  queryParams: Record<string, string>;
  fullPath: string;
}

function parseHash(hash: string): RouteState {
  const cleanHash = hash.replace(/^#\/?/, ''); // e.g. "app/dashboard/run-123?filter=all"

  if (cleanHash.startsWith('app')) {
    const [pathPart, queryPart] = cleanHash.split('?');
    const parts = pathPart.split('/');
    const view = (parts[1] as AppView) || 'overview';
    const subId = parts[2] ? decodeURIComponent(parts[2]) : undefined;

    const validViews: AppView[] = [
      'overview',
      'dashboard',
      'evaluations',
      'new-evaluation',
      'datasets',
      'models',
      'judges',
      'history',
      'regressions',
      'details',
      'settings',
      'projects',
    ];
    const resolvedView = validViews.includes(view) ? view : 'overview';

    const queryParams: Record<string, string> = {};
    if (queryPart) {
      const searchParams = new URLSearchParams(queryPart);
      searchParams.forEach((val, key) => {
        queryParams[key] = val;
      });
    }

    const subPath = subId ? `/${encodeURIComponent(subId)}` : '';
    const queryString = queryPart ? `?${queryPart}` : '';

    return {
      isApp: true,
      appView: resolvedView,
      subId,
      queryParams,
      fullPath: `#/app/${resolvedView}${subPath}${queryString}`,
    };
  }

  return {
    isApp: false,
    appView: 'overview',
    queryParams: {},
    fullPath: '#/',
  };
}

// ─────────────────────────────────────────────────────────────
// Centralized Transition State & Subscriber System
// ─────────────────────────────────────────────────────────────
type TransitionListener = (isTransitioning: boolean) => void;
const transitionListeners = new Set<TransitionListener>();
let globalIsTransitioning = false;
let routeChangeTimer: any = null;
let transitionCleanupTimer: any = null;

function notifyTransitionListeners(transitioning: boolean) {
  globalIsTransitioning = transitioning;
  transitionListeners.forEach((listener) => {
    try {
      listener(transitioning);
    } catch {
      // ignore
    }
  });
}

function isReducedMotion(): boolean {
  const win = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? (globalThis as any).window : undefined;
  if (!win || !win.matchMedia) return false;
  try {
    return win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function triggerGlobalTransition(
  callback?: () => void,
  durationMs = 2500
) {
  if (globalIsTransitioning) return;

  if (isReducedMotion()) {
    if (callback) callback();
    return;
  }

  if (routeChangeTimer) clearTimeout(routeChangeTimer);
  if (transitionCleanupTimer) clearTimeout(transitionCleanupTimer);

  notifyTransitionListeners(true);

  const midpoint = Math.max(50, Math.floor(durationMs * 0.52));
  routeChangeTimer = setTimeout(() => {
    if (callback) {
      try {
        callback();
      } catch (e) {
        console.error('Error executing transition callback:', e);
      }
    }
  }, midpoint);

  transitionCleanupTimer = setTimeout(() => {
    notifyTransitionListeners(false);
  }, durationMs);
}

export function useRouter() {
  const [route, setRoute] = useState<RouteState>(() => parseHash(typeof window !== 'undefined' ? window.location.hash : ''));
  const [isTransitioning, setIsTransitioning] = useState<boolean>(() => globalIsTransitioning);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseHash(window.location.hash));
    };

    const onTransitionChange: TransitionListener = (transitioning) => {
      setIsTransitioning(transitioning);
    };

    transitionListeners.add(onTransitionChange);
    window.addEventListener('hashchange', onHashChange);

    return () => {
      transitionListeners.delete(onTransitionChange);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  const navigate = useCallback((path: string, options?: { skipTransition?: boolean }) => {
    let target = path;
    if (!target.startsWith('#')) {
      target = target.startsWith('/') ? `#${target}` : `#/${target}`;
    }

    if (typeof window !== 'undefined' && window.location.hash === target) {
      return;
    }

    if (options?.skipTransition || globalIsTransitioning) {
      if (typeof window !== 'undefined') window.location.hash = target;
      return;
    }

    triggerGlobalTransition(() => {
      if (typeof window !== 'undefined') {
        window.location.hash = target;
      }
    }, 2500);
  }, []);

  const setQueryParam = useCallback((key: string, value: string | null) => {
    const current = parseHash(typeof window !== 'undefined' ? window.location.hash : '');
    if (!current.isApp) return;

    const params = new URLSearchParams();
    Object.entries(current.queryParams).forEach(([k, v]) => {
      if (k !== key) params.set(k, v);
    });
    if (value !== null && value !== undefined && value !== '') {
      params.set(key, value);
    }

    const subPath = current.subId ? `/${encodeURIComponent(current.subId)}` : '';
    const qs = params.toString() ? `?${params.toString()}` : '';
    window.location.hash = `#/app/${current.appView}${subPath}${qs}`;
  }, []);

  const navigateToResource = useCallback((view: AppView, subId?: string, query?: Record<string, string>) => {
    const subPath = subId ? `/${encodeURIComponent(subId)}` : '';
    const params = new URLSearchParams(query || {});
    const qs = params.toString() ? `?${params.toString()}` : '';
    navigate(`app/${view}${subPath}${qs}`);
  }, [navigate]);

  const triggerTransition = useCallback((action: () => void) => {
    triggerGlobalTransition(action, 2500);
  }, []);

  return {
    ...route,
    isTransitioning,
    navigate,
    setQueryParam,
    navigateToResource,
    triggerTransition,
  };
}
