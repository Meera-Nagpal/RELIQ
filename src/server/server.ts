/* ============================================================
   RELIQ — Standalone AI Evaluation Backend Server
   
   Dedicated native Node.js HTTP server running on port 3001
   (configurable via process.env.PORT or process.env.RELIQ_SERVER_PORT).
   
   Optimized for Render production (512 MB RAM limit):
   - Pure compiled ESM (zero Vite SSR runtime or Vite module graph overhead in production)
   - Supabase PostgreSQL primary persistence (SQLite completely bypassed in production)
   - Connection-pooled and timeout-guarded database probes
   - Active memory monitoring and proactive cache/job eviction
   - Bounded concurrency for evaluation runs and provider calls
   ============================================================ */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createReliqProxyMiddleware } from './proxyMiddleware';
import { isSupabaseDriverActive, testSupabaseConnection, getSupabaseUrl } from './db/supabaseClient';
import { evaluationCache } from '../evaluation/evaluationCache';
import { pruneOldJobs } from './evaluationService';

// Safely populate process.env from .env.local for local development only without logging values
function loadLocalEnv() {
  // In production (Render), credentials are provided directly via process.env.
  // Physical .env.local / .env files are NOT required and dotenv loading is skipped.
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  const candidateFiles = ['.env.local', '.env'];
  for (const file of candidateFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const idx = trimmed.indexOf('=');
            const key = trimmed.substring(0, idx).trim();
            let val = trimmed.substring(idx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (key && !process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch {}
    }
  }
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStaticFile(res: http.ServerResponse, filePath: string, method = 'GET') {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const stat = fs.statSync(filePath);
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stat.size);
    if (ext !== '.html') {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
    if (method === 'HEAD') {
      res.end();
      return;
    }
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.statusCode = 500;
      }
      res.end();
    });
    stream.pipe(res);
  } catch {
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
}

async function startServer() {
  loadLocalEnv();

  const PORT = Number(process.env.PORT || process.env.RELIQ_SERVER_PORT || 3001);
  const HOST = process.env.HOST || '0.0.0.0';
  const ENV_NAME = process.env.NODE_ENV || 'development';

  // Initialize Database (Supabase PostgreSQL in production, SQLite for local/test only)
  let closeDb: (() => void) | null = null;
  try {
    if (isSupabaseDriverActive()) {
      console.log(`[RELIQ DB] Supabase PostgreSQL mode active (RELIQ_DB_DRIVER=${process.env.RELIQ_DB_DRIVER || 'supabase_postgresql'})`);
      const conn = await testSupabaseConnection();
      if (conn.connected) {
        console.log(`[RELIQ DB] Connected to Supabase PostgreSQL (${getSupabaseUrl()}) in ${conn.latencyMs}ms`);
      } else {
        console.warn(`[RELIQ DB] Supabase probe notice: ${conn.error}`);
      }
      // SQLite initialization is completely skipped in production Supabase mode
    } else {
      console.log(`[RELIQ DB] Local/Test mode: Initializing SQLite database...`);
      const dbModule = await import('./db/database');
      dbModule.initializeDatabase();
      closeDb = dbModule.closeDatabase;
    }
  } catch (err: any) {
    console.error(`[RELIQ DB] Fatal: Failed to initialize database:`, err.message);
    process.exit(1);
  }

  // Create RELIQ Proxy & Evaluation HTTP Middleware
  const reliqMiddleware = createReliqProxyMiddleware();

  // Active Memory Monitor (Guard Render 512 MB RAM ceiling)
  const MEMORY_THRESHOLD_MB = 380; // 75% of 512MB
  const memoryMonitorInterval = setInterval(() => {
    const mem = process.memoryUsage();
    const rssMb = Math.round(mem.rss / (1024 * 1024));
    const heapUsedMb = Math.round(mem.heapUsed / (1024 * 1024));

    if (rssMb > MEMORY_THRESHOLD_MB) {
      console.warn(
        `[RELIQ MEMORY MONITOR] WARNING: High RSS memory (${rssMb}MB > ${MEMORY_THRESHOLD_MB}MB limit, Heap: ${heapUsedMb}MB). Triggering proactive cache eviction...`
      );
      try {
        evaluationCache.clearMemory();
        pruneOldJobs();
        if (typeof (globalThis as any).gc === 'function') {
          (globalThis as any).gc();
        }
      } catch (cleanErr: any) {
        console.error('[RELIQ MEMORY MONITOR] Cache eviction error:', cleanErr?.message || cleanErr);
      }
    }
  }, 30000);
  memoryMonitorInterval.unref();

  const server = http.createServer((req, res) => {
    const method = req.method || 'GET';
    const url = req.url?.split('?')[0] || '';

    // Backend request logging
    console.log(`[BACKEND] ${method} ${url}`);

    reliqMiddleware(req, res, () => {
      // 1. If this is an unhandled /api/* route, return JSON 404
      if (url.startsWith('/api')) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: `Cannot ${method} ${url}` }));
        return;
      }

      // 2. For GET/HEAD requests, serve static assets or SPA index.html fallback
      if (method === 'GET' || method === 'HEAD') {
        const distDir = path.resolve(process.cwd(), 'dist');
        if (fs.existsSync(distDir)) {
          // Normalize requested path to prevent directory traversal
          const candidatePath = path.resolve(distDir, '.' + url);

          if (candidatePath.startsWith(distDir) && fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
            serveStaticFile(res, candidatePath, method);
            return;
          }

          // SPA Fallback: serve dist/index.html
          const indexPath = path.join(distDir, 'index.html');
          if (fs.existsSync(indexPath)) {
            serveStaticFile(res, indexPath, method);
            return;
          }
        }
      }

      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `Cannot ${method} ${url}` }));
    });
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[BACKEND ERROR] Port ${PORT} is already in use.`);
      process.exit(1);
    } else {
      console.error(`[BACKEND ERROR] Server error:`, err.message);
    }
  });

  server.listen(PORT, HOST, () => {
    const mem = process.memoryUsage();
    const rssMb = Math.round(mem.rss / (1024 * 1024));
    console.log('==================================================');
    console.log('RELIQ BACKEND SERVER');
    console.log('==================================================');
    console.log(`Environment: ${ENV_NAME}`);
    console.log(`Host: ${HOST}`);
    console.log(`Port: ${PORT}`);
    console.log(`Initial RSS Memory: ${rssMb}MB (512MB RAM Container Safe)`);
    console.log('Status: READY');
    console.log('==================================================\n');
    console.log('API endpoints:');
    console.log('GET  /api/health');
    console.log('GET  /api/providers/status');
    console.log('GET  /api/providers/quota-status');
    console.log('POST /api/evaluations/run');
    console.log('GET  /api/evaluations/status/:runId');
    console.log('GET  /api/evaluations/runs');
    console.log('GET  /api/evaluations/runs/:id');
    console.log('==================================================');
  });

  let isShuttingDown = false;
  const gracefulShutdown = () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log('\n[BACKEND] Shutdown requested');
    clearInterval(memoryMonitorInterval);
    try {
      closeDb?.();
    } catch {}
    server.close(() => {
      console.log('[BACKEND] Server stopped');
      process.exit(0);
    });
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}

startServer().catch((err) => {
  console.error('[BACKEND ERROR] Failed to start server:', err);
  process.exit(1);
});
