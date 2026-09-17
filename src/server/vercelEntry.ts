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

// Initialize SQLite database singleton for this serverless instance
try {
  initializeDatabase();
} catch (err: any) {
  console.error('[VERCEL API] Failed to initialize SQLite database:', err?.message || err);
}

// Instantiate proxy middleware once per container lifetime
const reliqMiddleware = createReliqProxyMiddleware();

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
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
  }

  // Delegate directly to the existing RELIQ proxy & evaluation middleware
  await reliqMiddleware(req, res, () => {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: `Route not found: ${req.method || 'GET'} ${req.url}` }));
  });
}
