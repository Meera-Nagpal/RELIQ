import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { createReliqProxyMiddleware } from './src/server/proxyMiddleware';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

function reliqServerPlugin(env: Record<string, string>): Plugin {
  // Populate process.env on the server side without leaking to client bundle
  if (env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
  if (env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = env.OPENAI_API_KEY;
  if (env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
  if (env.GROQ_API_KEY) process.env.GROQ_API_KEY = env.GROQ_API_KEY;
  if (env.CEREBRAS_API_KEY) process.env.CEREBRAS_API_KEY = env.CEREBRAS_API_KEY;

  const middleware = createReliqProxyMiddleware();

  return {
    name: 'reliq-server-proxy',
    // In dev mode, Vite proxy forwards /api to the standalone backend on port 3001.
    // Preserved for preview server so production previews function standalone.
    configurePreviewServer(server) {
      const middleware = createReliqProxyMiddleware();
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load environment variables strictly on the server side
  // Do NOT pass VITE_ prefix so secrets are never embedded in client bundles
  const env = loadEnv(mode, projectRoot, '');
  const backendPort = process.env.RELIQ_SERVER_PORT || process.env.PORT || '3001';

  return {
    root: projectRoot,
    plugins: [react(), reliqServerPlugin(env)],
    server: {
      port: 5173,
      strictPort: false,
      host: '127.0.0.1',
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${backendPort}`,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 5173,
      strictPort: false,
      host: '127.0.0.1',
    },
    build: {
      target: 'es2020',
      rollupOptions: {
        output: {
          manualChunks: {
            three: ['three'],
            r3f: ['@react-three/fiber', '@react-three/drei'],
            gsap: ['gsap'],
          },
        },
      },
    },
    optimizeDeps: {
      include: ['three', '@react-three/fiber', '@react-three/drei', 'gsap'],
    },
  };
});

