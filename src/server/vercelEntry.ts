/* ============================================================
   RELIQ — Vercel Serverless API Gateway Entry Point
   
   Direct serverless function adapter for Vercel deployment:
   - Initializes the SQLite database singleton (writes to /tmp/reliq.db on Vercel)
   - Wraps and delegates directly to createReliqProxyMiddleware()
   - Reconstructs request URL from rewrites (e.g. /api?reliq_path=health -> /api/health)
   - Zero duplication of routing, business logic, or evaluation semantics
   ============================================================ */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { initializeDatabase } from './db/database';
import { createReliqProxyMiddleware } from './proxyMiddleware';

// Track database initialization error if any occurs on container startup
let initError: { message: string; stack?: string } | null = null;
try {
  initializeDatabase();
} catch (err: any) {
  console.error('[VERCEL API] Failed to initialize SQLite database:', err?.message || err);
  initError = {
    message: err?.message || String(err),
    stack: err?.stack,
  };
}

// Instantiate proxy middleware once per container lifetime
const reliqMiddleware = createReliqProxyMiddleware();

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    // Reconstruct original /api/* URL when routed through Vercel query rewrites
    const rawUrl = req.url || '';
    const [pathname, rawQuery] = rawUrl.split('?');
    const query = new URLSearchParams(rawQuery || '');
    const reliqPath = query.get('reliq_path');

    if (reliqPath !== null) {
      query.delete('reliq_path');
      const remainingQuery = query.toString();
      const cleanPath = reliqPath.replace(/^\/+/, '');
      req.url = `/api/${cleanPath}` + (remainingQuery ? `?${remainingQuery}` : '');
    } else if (rawUrl.startsWith('/api/index.js')) {
      req.url = rawUrl.replace(/^\/api\/index\.js/, '/api');
    }

    // Delegate directly to the existing RELIQ proxy & evaluation middleware
    await reliqMiddleware(req, res, () => {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `Route not found: ${req.method || 'GET'} ${req.url}` }));
    });
  } catch (err: any) {
    console.error('[VERCEL API ERROR]', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Internal Server Error in Vercel Gateway',
      message: err?.message || String(err),
      stack: err?.stack,
      initError,
      url: req.url,
    }));
  }
}
