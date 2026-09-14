/* ============================================================
   RELIQ — Lightweight Client Router Hook
   
   Supports / for the 3D marketing landing page and #/app/*
   for the functional RELIQ product workspace.
   ============================================================ */

import { useEffect, useState } from 'react';

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

export function useRouter() {
  const [route, setRoute] = useState<RouteState>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseHash(window.location.hash));
    };

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (path: string) => {
    // path can be "/" or "#/app/dashboard" or "app/evaluations"
    let target = path;
    if (!target.startsWith('#')) {
      target = target.startsWith('/') ? `#${target}` : `#/${target}`;
    }
    window.location.hash = target;
  };

  return {
    ...route,
    navigate,
  };
}
