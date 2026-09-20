/* ============================================================
   RELIQ — Automated Visual Verification Script
   Serves dist/ statically and captures screenshots of all 6 states
   using Headless Microsoft Edge via Chrome DevTools Protocol.
   ============================================================ */

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const PREVIEW_PORT = 5210;
const CDP_PORT = 9224;
const DIST_DIR = path.resolve('dist');
const SCREENSHOT_DIR = path.resolve('screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function createStaticServer() {
  return http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
    let filePath = path.join(DIST_DIR, reqPath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(content);
    } catch (err) {
      res.writeHead(404);
      res.end('Not found');
    }
  });
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 0;
    this.callbacks = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.msgId;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function main() {
  const server = createStaticServer();
  await new Promise((resolve) => server.listen(PREVIEW_PORT, '127.0.0.1', resolve));
  console.log(`Static server running at http://127.0.0.1:${PREVIEW_PORT}`);

  const edgeExe = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const tmpUserData = path.join(os.tmpdir(), `edge-cdp-${Date.now()}`);

  console.log('Launching headless Edge on CDP port', CDP_PORT);
  const edgeProcess = spawn(
    edgeExe,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${tmpUserData}`,
      '--disable-gpu',
      '--no-first-run',
      '--window-size=1920,1080',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  await wait(2500);

  let targets = [];
  for (let i = 0; i < 12; i++) {
    try {
      targets = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${CDP_PORT}/json`, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
        }).on('error', reject);
      });
      if (targets.length > 0) break;
    } catch {}
    await wait(500);
  }

  const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
  if (!pageTarget) {
    throw new Error('No Edge CDP page target found');
  }

  console.log('Connecting CDP client to', pageTarget.webSocketDebuggerUrl);
  const cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const url = `http://127.0.0.1:${PREVIEW_PORT}/`;
  console.log('Navigating to', url);
  await cdp.send('Page.navigate', { url });

  // Wait for React and Three.js canvas initialization
  await wait(3500);

  const states = [
    { name: '01_overview_system', progress: 0.0, desc: 'Overview (SYSTEM)' },
    { name: '02_run_data', progress: 0.18, desc: 'Stage 01: RUN (DATA)' },
    { name: '03_compare_ledger', progress: 0.44, desc: 'Stage 02: COMPARE (Model Ledger)' },
    { name: '04_detect_regression', progress: 0.58, desc: 'Stage 03: DETECT (REGRESSION)' },
    { name: '05_investigate', progress: 0.74, desc: 'Stage 04: INVESTIGATE (47 Cases)' },
    { name: '06_ship_confidence', progress: 0.92, desc: 'Stage 05: SHIP (Confidence 96.8%)' },
  ];

  for (const st of states) {
    console.log(`Setting state: ${st.desc} (scrollProgress: ${st.progress})`);
    await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const totalScrollHeight = document.documentElement.scrollHeight - window.innerHeight;
          window.scrollTo(0, ${st.progress} * totalScrollHeight);
        })()
      `,
    });
    await wait(2200);

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const filePath = path.join(SCREENSHOT_DIR, `${st.name}.png`);
    fs.writeFileSync(filePath, Buffer.from(shot.data, 'base64'));
    console.log(`  ✓ Saved screenshot: ${filePath}`);
  }

  // Also capture COMPARE at 1280x720 to verify responsive safe bounds
  console.log('Testing 1280x720 responsive layout for COMPARE');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await wait(1000);
  const shot1280 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'compare_1280x720.png'), Buffer.from(shot1280.data, 'base64'));
  console.log('  ✓ Saved 1280x720 screenshot');

  cdp.close();
  edgeProcess.kill();
  server.close();
  console.log('\nVisual verification screenshots captured successfully!');
}

main().catch((err) => {
  console.error('Visual verification failed:', err);
  process.exit(1);
});
