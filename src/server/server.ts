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

async function startServer() {
  loadLocalEnv();

  const PORT = Number(process.env.RELIQ_SERVER_PORT || process.env.PORT || 3001);
  const HOST = '127.0.0.1';
  const ENV_NAME = process.env.NODE_ENV || 'development';

  // Use programmatic Vite SSR server for seamless TypeScript module resolution
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });

  const { createReliqProxyMiddleware } = await vite.ssrLoadModule('/src/server/proxyMiddleware.ts');
  const reliqMiddleware = createReliqProxyMiddleware();

  const server = http.createServer((req, res) => {
    const method = req.method || 'GET';
    const url = req.url?.split('?')[0] || '';

    // Backend request logging
    console.log(`[BACKEND] ${method} ${url}`);

    reliqMiddleware(req, res, () => {
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
