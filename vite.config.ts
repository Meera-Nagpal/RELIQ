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
  if (env.SUPABASE_URL) process.env.SUPABASE_URL = env.SUPABASE_URL;
  if (env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  if (env.SUPABASE_ANON_KEY) process.env.SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
  if (env.RELIQ_DB_DRIVER) process.env.RELIQ_DB_DRIVER = env.RELIQ_DB_DRIVER;

  const middleware = createReliqProxyMiddleware();

  return {
    name: 'reliq-server-proxy',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load environment variables strictly on the server side
  // Do NOT pass VITE_ prefix so secrets are never embedded in client bundles
  const env = loadEnv(mode, projectRoot, '');
  const backendUrl = process.env.RELIQ_BACKEND_URL;

  return {
    root: projectRoot,
    plugins: [react(), reliqServerPlugin(env)],
    server: {
      port: 5173,
      strictPort: false,
      host: true,
      proxy: backendUrl ? {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
        },
      } : undefined,
    },
    preview: {
      port: 5173,
      strictPort: false,
      host: true,
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
