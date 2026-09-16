/* ============================================================
   RELIQ — Standalone AI Evaluation Backend Server
   
   Dedicated Node.js server process running on port 3001
   (configurable via RELIQ_SERVER_PORT).
   
   Reuses existing:
   - createReliqProxyMiddleware() from proxyMiddleware.ts
   - evaluationService.ts
   - providerScheduler.ts
   - serverProviders.ts
   ============================================================ */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';

// Safely populate process.env from .env.local without logging values
function loadLocalEnv() {
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

function serveStaticFile(res: http.ServerResponse, filePath: string) {
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
    const stream = fs.createReadStream(filePath);
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

  // Use programmatic Vite SSR server for seamless TypeScript module resolution
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });

  // Initialize SQLite database
  let closeDb: (() => void) | null = null;
  try {
    const dbModule = await vite.ssrLoadModule('/src/server/db/database.ts');
    dbModule.initializeDatabase();
    closeDb = dbModule.closeDatabase;
  } catch (err: any) {
    console.error(`[RELIQ DB] Fatal: Failed to initialize SQLite database:`, err.message);
    process.exit(1);
  }

  const { createReliqProxyMiddleware } = await vite.ssrLoadModule('/src/server/proxyMiddleware.ts');
  const reliqMiddleware = createReliqProxyMiddleware();

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
          const safePath = path.normalize(url).replace(/^(\.\.[\/\\])+/, '');
          const candidatePath = path.join(distDir, safePath);

          if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
            serveStaticFile(res, candidatePath);
            return;
          }

          // SPA Fallback: serve dist/index.html
          const indexPath = path.join(distDir, 'index.html');
          if (fs.existsSync(indexPath)) {
            serveStaticFile(res, indexPath);
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
    console.log('==================================================');
    console.log('RELIQ BACKEND SERVER');
    console.log('==================================================');
    console.log(`Environment: ${ENV_NAME}`);
    console.log(`Host: ${HOST}`);
    console.log(`Port: ${PORT}`);
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
    try {
      closeDb?.();
    } catch {}
    server.close(async () => {
      try {
        await vite.close();
      } catch {}
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
