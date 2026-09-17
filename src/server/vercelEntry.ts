/* ============================================================
   RELIQ — Vercel Serverless API Gateway Entry Point
   
   Direct serverless function adapter for Vercel deployment:
   - Initializes the SQLite database singleton (writes to /tmp/reliq.db on Vercel)
   - Wraps and delegates directly to createReliqProxyMiddleware()
   - Reconstructs request URL from rewrites (e.g. /api?reliq_path=health -> /api/health)
   - Zero duplication of routing, business logic, or evaluation semantics
   ============================================================ */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { initializeDatabase } from './db/database';
import { createReliqProxyMiddleware } from './proxyMiddleware';

// Lazy-initialize database and middleware on first request to guarantee zero module-load crashes
let initError: { message: string; stack?: string } | null = null;
let reliqMiddleware: any = null;

function getMiddleware() {
  if (!reliqMiddleware) {
    try {
      initializeDatabase();
    } catch (err: any) {
      console.error('[VERCEL API] Failed to initialize SQLite database:', err?.message || err);
      initError = {
        message: err?.message || String(err),
        stack: err?.stack,
      };
    }
    reliqMiddleware = createReliqProxyMiddleware();
  }
  return reliqMiddleware;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const rawUrl = req.url || '';

    // Diagnostic inspection endpoint for production troubleshooting
    if (rawUrl.includes('/diag') || rawUrl.includes('/ping') || rawUrl === '/api/debug') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      let sqliteInfo: any = null;
      try {
        const reqMod = createRequire(import.meta.url);
        const DB = reqMod('better-sqlite3');
        sqliteInfo = { loaded: true, type: typeof DB };
      } catch (sqErr: any) {
        sqliteInfo = { loaded: false, message: sqErr.message, stack: sqErr.stack };
      }
      res.end(JSON.stringify({
        status: 'ok',
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        cwd: process.cwd(),
        url: req.url,
        rawUrl,
        initError,
        sqliteInfo,
        env: {
          VERCEL: process.env.VERCEL,
          NODE_ENV: process.env.NODE_ENV,
          RELIQ_DB_PATH: process.env.RELIQ_DB_PATH,
          hasGemini: Boolean(process.env.GEMINI_API_KEY),
          hasGroq: Boolean(process.env.GROQ_API_KEY),
          hasCerebras: Boolean(process.env.CEREBRAS_API_KEY),
        }
      }, null, 2));
      return;
    }

    const middleware = getMiddleware();
    // Reconstruct original /api/* URL when routed through Vercel query rewrites
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
    await middleware(req, res, () => {
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
