/* ============================================================
   RELIQ — Lightweight Client Router Hook with Global Ripple Transitions
   
   Supports / for the 3D marketing landing page and #/app/*
   for the functional RELIQ product workspace.
   
   Orchestrates:
   - Synchronized 3-ring ripple page transitions on route changes
   - Protection against double-click multiple overlays
   - prefers-reduced-motion immediate navigation support
   - Zero-overhead subscriber model across all components
   ============================================================ */

import { useEffect, useState, useCallback } from 'react';

export type AppView =
  | 'dashboard'
  | 'projects'
  | 'datasets'
  | 'evaluations'
  | 'regressions'
  | 'settings';

export interface RouteState {
  isApp: boolean;
  appView: AppView;
  fullPath: string;
}

function parseHash(hash: string): RouteState {
  const cleanHash = hash.replace(/^#\/?/, ''); // e.g. "app/dashboard" or ""

  if (cleanHash.startsWith('app')) {
    const parts = cleanHash.split('/');
    const view = (parts[1] as AppView) || 'dashboard';
    const validViews: AppView[] = [
      'dashboard',
      'projects',
      'datasets',
      'evaluations',
      'regressions',
      'settings',
    ];
    return {
      isApp: true,
      appView: validViews.includes(view) ? view : 'dashboard',
      fullPath: `#/app/${view}`,
    };
  }

  return {
    isApp: false,
    appView: 'dashboard',
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
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function triggerGlobalTransition(callback?: () => void, durationMs = 650) {
  if (globalIsTransitioning) return;

  if (isReducedMotion()) {
    if (callback) callback();
    return;
  }

  // Clear any dangling timers
  if (routeChangeTimer) clearTimeout(routeChangeTimer);
  if (transitionCleanupTimer) clearTimeout(transitionCleanupTimer);

  notifyTransitionListeners(true);

  // Perform callback / route shift at midpoint of ripple expansion
  routeChangeTimer = setTimeout(() => {
    if (callback) {
      try {
        callback();
      } catch (e) {
        console.error('Error executing transition callback:', e);
      }
    }
  }, 240);

  // Complete and remove overlay
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

    // If destination is identical to current hash, do nothing
    if (typeof window !== 'undefined' && window.location.hash === target) {
      return;
    }

    // Skip animation if explicitly requested or already in transition
    if (options?.skipTransition || globalIsTransitioning) {
      if (typeof window !== 'undefined') window.location.hash = target;
      return;
    }

    // Execute with global ripple transition
    triggerGlobalTransition(() => {
      if (typeof window !== 'undefined') {
        window.location.hash = target;
      }
    });
  }, []);

  const triggerTransition = useCallback((action: () => void) => {
    triggerGlobalTransition(action);
  }, []);

  return {
    ...route,
    isTransitioning,
    navigate,
    triggerTransition,
  };
}
