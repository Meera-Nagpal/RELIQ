/* ============================================================
   RELIQ — Server-Side AI Provider Proxy & Evaluation Middleware
   
   Secure Node.js HTTP middleware mounted in Vite dev/preview server.
   Reads credentials strictly from server environment (process.env / .env.local).
   
   SECURITY PROTOCOLS:
   - Credentials NEVER sent to browser/client bundle.
   - Credentials NEVER logged in console, terminal, or output records.
   - Status endpoint only exposes boolean readiness (true/false).
   - Retries on transient 429 rate limits with exponential backoff.
   - Hosts full server-side evaluation execution layer (/api/evaluations/*).
   ============================================================ */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  deleteRunFromDisk,
  getJobStatus,
  getRunFromDisk,
  getRunsFromDisk,
  runServerEvaluation,
  startEvaluationJob,
  validateEvaluationOptions,
} from './evaluationService';
import {
  fetchWithRetry,
  getApiKey,
  parseJsonBody,
  sendJson,
} from './serverUtils';
import { providerScheduler } from './providerScheduler';
import { handleProjectRoutes } from './routes/projectRoutes';
import { handleDatasetRoutes } from './routes/datasetRoutes';
import { handleVersionRoutes } from './routes/versionRoutes';
import { handleSettingsRoutes } from './routes/settingsRoutes';
import { handleEvaluationDbRoutes } from './routes/evaluationDbRoutes';
import { evaluationDbService } from './services/evaluationDbService';
import { sendError } from './routes/httpUtils';
import { getDatabase } from './db/database';
import { seedDatabase } from './db/seed';
import { GROQ_MODEL_REGISTRY } from '../evaluation/judgeRegistry';

export { getApiKey, fetchWithRetry, parseJsonBody, sendJson };

export function createReliqProxyMiddleware() {
  return async function reliqProxyMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ) {
    const [parsedUrl, rawQuery] = (req.url || '').split('?');
    const query = new URLSearchParams(rawQuery || '');

    // Safe local development CORS headers
    const origin = req.headers.origin;
    if (origin && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Reliq-Provider');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    // ── Database REST Endpoints: Projects & Settings ────────────
    if (parsedUrl.startsWith('/api/projects')) {
      if (parsedUrl.includes('/settings')) {
        const handled = await handleSettingsRoutes(req, res, parsedUrl);
        if (handled) return;
      } else {
        const handled = await handleProjectRoutes(req, res, parsedUrl);
        if (handled) return;
      }
    }

    // ── Database REST Endpoints: Datasets & Test Cases ──────────
    if (parsedUrl.startsWith('/api/datasets')) {
      const handled = await handleDatasetRoutes(req, res, parsedUrl, query);
      if (handled) return;
    }

    // ── Database REST Endpoints: Model Versions ─────────────────
    if (parsedUrl.startsWith('/api/versions')) {
      const handled = await handleVersionRoutes(req, res, parsedUrl, query);
      if (handled) return;
    }

    // ── Database REST Endpoints: Evaluation Runs Extensions ─────
    if (parsedUrl.startsWith('/api/evaluations/runs/')) {
      if (
        parsedUrl.endsWith('/release-decision') ||
        parsedUrl.endsWith('/results') ||
        parsedUrl.endsWith('/failures')
      ) {
        const handled = await handleEvaluationDbRoutes(req, res, parsedUrl);
        if (handled) return;
      }
    }

    // ── Status Endpoint: GET /api/providers/status ───────────────
    if (req.method === 'GET' && parsedUrl === '/api/providers/status') {
      sendJson(res, 200, {
        gemini: Boolean(getApiKey('GEMINI_API_KEY')),
        openai: Boolean(getApiKey('OPENAI_API_KEY')),
        anthropic: Boolean(getApiKey('ANTHROPIC_API_KEY')),
        groq: Boolean(getApiKey('GROQ_API_KEY')),
        cerebras: Boolean(getApiKey('CEREBRAS_API_KEY')),
        Gemini: getApiKey('GEMINI_API_KEY') ? 'READY' : 'NOT_CONFIGURED',
        Groq: getApiKey('GROQ_API_KEY') ? 'READY' : 'NOT_CONFIGURED',
        Cerebras: getApiKey('CEREBRAS_API_KEY') ? 'READY' : 'NOT_CONFIGURED',
        OpenAI: getApiKey('OPENAI_API_KEY') ? 'READY' : 'NOT_CONFIGURED',
        Anthropic: getApiKey('ANTHROPIC_API_KEY') ? 'READY' : 'NOT_CONFIGURED',
        quotaStatus: providerScheduler.getAllProviderStatuses(),
      });
      return;
    }

    // ── Quota & Rate Limit Diagnostics: GET /api/providers/quota-status ──
    if (req.method === 'GET' && parsedUrl === '/api/providers/quota-status') {
      sendJson(res, 200, {
        providers: providerScheduler.getAllProviderStatuses(),
      });
      return;
    }

    // ── Platform Health Endpoint: GET /api/health ───────────────
    if (req.method === 'GET' && parsedUrl === '/api/health') {
      let databaseStatus = 'disconnected';
      try {
        const db = getDatabase();
        const row = db.prepare('SELECT 1 as alive').get() as { alive?: number };
        if (row && row.alive === 1) {
          databaseStatus = 'connected';
        }
      } catch (dbErr: any) {
        databaseStatus = `error: ${dbErr.message}`;
      }

      const isHealthy = databaseStatus === 'connected';
      sendJson(res, isHealthy ? 200 : 503, {
        status: isHealthy ? 'healthy' : 'unhealthy',
        database: databaseStatus,
        service: 'RELIQ Evaluation Platform',
        version: '2.7.5',
        backendExecution: 'enabled',
        providers: {
          gemini: getApiKey('GEMINI_API_KEY') ? 'READY' : 'NOT_CONFIGURED',
          groq: getApiKey('GROQ_API_KEY') ? 'READY' : 'NOT_CONFIGURED',
          cerebras: getApiKey('CEREBRAS_API_KEY') ? 'READY' : 'NOT_CONFIGURED',
          openai: getApiKey('OPENAI_API_KEY') ? 'READY' : 'NOT_CONFIGURED',
          anthropic: getApiKey('ANTHROPIC_API_KEY') ? 'READY' : 'NOT_CONFIGURED',
        },
        quotaStatus: providerScheduler.getAllProviderStatuses(),
      });
      return;
    }

    // ── Evaluations API: POST /api/evaluations/run ──────────────
    if (req.method === 'POST' && parsedUrl === '/api/evaluations/run') {
      try {
        const body = await parseJsonBody(req);
        const isAsync = body.async !== false; // Default to asynchronous execution

        console.log('[BACKEND] Evaluation request received');
        if (body.dataset?.name) {
          console.log(`[BACKEND] Dataset: ${body.dataset.name}`);
        }
        const scenarioCount = body.maxCases || body.dataset?.cases?.length || 'all';
        console.log(`[BACKEND] Scenarios: ${scenarioCount}`);
        if (body.baselineVersion) {
          console.log(`[BACKEND] Baseline: ${body.baselineVersion.provider} / ${body.baselineVersion.modelIdentifier}`);
        }
        if (body.candidateVersion) {
          console.log(`[BACKEND] Candidate: ${body.candidateVersion.provider} / ${body.candidateVersion.modelIdentifier}`);
        }
        if (body.judgeConfig?.enabled) {
          console.log(`[BACKEND] Judge: ${body.judgeConfig.provider} / ${body.judgeConfig.modelIdentifier}`);
        }

        // Synchronously validate all options (dataset, versions, judge independence) before proceeding
        validateEvaluationOptions(body);

        if (isAsync) {
          const { runId } = startEvaluationJob(body);
          sendJson(res, 202, {
            runId,
            status: 'RUNNING',
            message: 'Evaluation initiated on RELIQ server.',
          });
          return;
        } else {
          // Synchronous execution path
          const run = await runServerEvaluation(body);
          sendJson(res, 200, run);
          return;
        }
      } catch (err: any) {
        console.error(`[BACKEND ERROR]\nRoute: POST /api/evaluations/run\nError: ${err.message}`);
        sendJson(res, 400, {
          error: err.message || 'Failed to execute evaluation on server',
        });
        return;
      }
    }

    // ── Evaluations API: GET /api/evaluations/status/:runId ─────
    if (req.method === 'GET' && parsedUrl.startsWith('/api/evaluations/status/')) {
      const runId = parsedUrl.replace('/api/evaluations/status/', '').trim();
      const job = getJobStatus(runId);

      if (!job) {
        sendJson(res, 404, {
          error: `Evaluation run '${runId}' not found.`,
          runId,
        });
        return;
      }

      sendJson(res, 200, {
        runId: job.runId,
        status: job.status,
        progress: job.progress,
        startTime: job.startTime,
        endTime: job.endTime,
        run: job.run,
        error: job.error,
      });
      return;
    }

    // ── Evaluations API: GET /api/evaluations/runs ──────────────
    if (req.method === 'GET' && parsedUrl === '/api/evaluations/runs') {
      try {
        const runs = evaluationDbService.getEvaluationRuns();
        sendJson(res, 200, { runs });
      } catch (err: any) {
        sendJson(res, 500, { error: err.message, runs: [] });
      }
      return;
    }

    // ── Evaluations API: GET /api/evaluations/runs/:id ──────────
    if (req.method === 'GET' && parsedUrl.startsWith('/api/evaluations/runs/')) {
      const runId = parsedUrl.replace('/api/evaluations/runs/', '').trim();
      const run = evaluationDbService.getEvaluationRunById(runId);
      if (!run) {
        sendError(res, 404, 'RUN_NOT_FOUND', `Evaluation run '${runId}' not found`);
        return;
      }
      sendJson(res, 200, run);
      return;
    }

    // ── Evaluations API: DELETE /api/evaluations/runs/:id ───────
    if (req.method === 'DELETE' && parsedUrl.startsWith('/api/evaluations/runs/')) {
      const runId = parsedUrl.replace('/api/evaluations/runs/', '').trim();
      let deletedFromDb = false;
      try {
        const db = getDatabase();
        const delRes = db.prepare('DELETE FROM evaluation_runs WHERE id = ?').run(runId);
        deletedFromDb = delRes.changes > 0;
      } catch {}
      const deletedFromDisk = deleteRunFromDisk(runId);
      if (!deletedFromDisk && !deletedFromDb) {
        sendError(res, 404, 'RUN_NOT_FOUND', `Evaluation run '${runId}' not found`);
        return;
      }
      sendJson(res, 200, { success: true, runId });
      return;
    }

    // ── Seed Reset API: POST /api/seed/reset or /api/reset ──────
    if (req.method === 'POST' && (parsedUrl === '/api/seed/reset' || parsedUrl === '/api/reset')) {
      try {
        const db = getDatabase();
        const result = seedDatabase(db);
        sendJson(res, 200, { success: true, result });
      } catch (err: any) {
        sendError(res, 500, 'SEED_RESET_FAILED', err.message);
      }
      return;
    }

    // ── Foreign API Boundary Notice: /api/v1/* ──────────────────
    if (parsedUrl.startsWith('/api/v1/')) {
      sendJson(res, 404, {
        error: 'Not Found: /api/v1/* endpoints belong to the separate iTantra backend, not RELIQ.',
        service: 'RELIQ Evaluation Platform (v2.7.5)',
        supportedEndpoints: [
          '/api/health',
          '/api/providers/status',
          '/api/evaluations/run',
          '/api/evaluations/status/:runId',
          '/api/evaluations/runs',
          '/api/providers/gemini',
          '/api/providers/groq',
          '/api/providers/openai',
          '/api/providers/anthropic',
        ],
      });
      return;
    }

    // ── Google Gemini: POST /api/providers/gemini ───────────────
    if (req.method === 'POST' && parsedUrl === '/api/providers/gemini') {
      const apiKey = getApiKey('GEMINI_API_KEY');
      if (!apiKey) {
        sendJson(res, 401, {
          error: 'GEMINI_API_KEY is not configured in server-side environment (.env.local).',
          provider: 'google',
        });
        return;
      }

      try {
        const body = await parseJsonBody(req);
        const model = body.model || 'gemini-1.5-pro-002';
        const caseId = body.metadata?.testCaseId || 'n/a';
        const maxOut = body.generationConfig?.maxOutputTokens ?? 'default';
        console.log(`[RELIQ Proxy] -> GEMINI POST model=${model} maxOutputTokens=${maxOut} (case=${caseId})`);

        let contents = body.contents || [];
        const sysText =
          typeof body.systemInstruction === 'string'
            ? body.systemInstruction
            : body.systemInstruction?.parts?.[0]?.text;

        if (sysText && contents.length > 0 && contents[0].parts?.[0]?.text) {
          const userText = contents[0].parts[0].text;
          if (!userText.includes(sysText)) {
            contents = [
              {
                role: 'user',
                parts: [{ text: `[System Directive: ${sysText}]\n\n${userText}` }],
              },
              ...contents.slice(1),
            ];
          }
        }

        const { response, retries, latencyMs } = await fetchWithRetry({
          url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            model
          )}:generateContent?key=${apiKey}`,
          init: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents,
              generationConfig: body.generationConfig,
            }),
          },
          maxRetries: 1,
          baseDelayMs: 1000,
          timeoutMs: 30000,
        });

        const data = await response.json().catch(() => ({
          error: { message: `Non-JSON HTTP ${response.status} response from Google Gemini API` },
        }));

        if (!response.ok) {
          const errMsg = data.error?.message || data.error || 'Google Gemini API returned error';
          console.log(`[RELIQ Proxy] <- GEMINI ${response.status} ERROR: ${errMsg} (latency=${latencyMs}ms, retries=${retries})`);
          sendJson(res, response.status, {
            error: errMsg,
            rawResponse: data,
            latencyMs,
            retries,
            provider: 'google',
          });
          return;
        }

        const usageMetadata = data.usageMetadata || {};
        const inTok = usageMetadata.promptTokenCount ?? 0;
        const outTok = usageMetadata.candidatesTokenCount ?? 0;
        const thinkTok = usageMetadata.thoughtsTokenCount ?? usageMetadata.thoughtTokenCount;
        console.log(
          `[RELIQ Proxy] <- GEMINI 200 OK | Latency: ${latencyMs}ms | Retries: ${retries} | In: ${inTok} | Out: ${outTok}${
            thinkTok !== undefined ? ` | Thinking: ${thinkTok}` : ''
          }`
        );

        sendJson(res, 200, {
          ...data,
          _reliq_telemetry: {
            latencyMs,
            retries,
          },
        });
      } catch (err: any) {
        sendJson(res, 500, {
          error: `Internal server proxy error: ${err.message}`,
          provider: 'google',
        });
      }
      return;
    }

    // ── OpenAI: POST /api/providers/openai ──────────────────────
    if (req.method === 'POST' && parsedUrl === '/api/providers/openai') {
      const apiKey = getApiKey('OPENAI_API_KEY');
      if (!apiKey) {
        sendJson(res, 401, {
          error: 'OPENAI_API_KEY is not configured in server-side environment (.env.local).',
          provider: 'openai',
        });
        return;
      }

      try {
        const body = await parseJsonBody(req);

        const { response, retries, latencyMs } = await fetchWithRetry({
          url: 'https://api.openai.com/v1/chat/completions',
          init: {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
          },
          maxRetries: 3,
          baseDelayMs: 1000,
          timeoutMs: 30000,
        });

        const data = await response.json().catch(() => ({
          error: { message: `Non-JSON HTTP ${response.status} response from OpenAI API` },
        }));

        if (!response.ok) {
          sendJson(res, response.status, {
            error: data.error?.message || data.error || 'OpenAI API returned error',
            rawResponse: data,
            latencyMs,
            retries,
            provider: 'openai',
          });
          return;
        }

        sendJson(res, 200, {
          ...data,
          _reliq_telemetry: {
            latencyMs,
            retries,
          },
        });
      } catch (err: any) {
        sendJson(res, 500, {
          error: `Internal server proxy error: ${err.message}`,
          provider: 'openai',
        });
      }
      return;
    }

    // ── Anthropic: POST /api/providers/anthropic ────────────────
    if (req.method === 'POST' && parsedUrl === '/api/providers/anthropic') {
      const apiKey = getApiKey('ANTHROPIC_API_KEY');
      if (!apiKey) {
        sendJson(res, 401, {
          error: 'ANTHROPIC_API_KEY is not configured in server-side environment (.env.local).',
          provider: 'anthropic',
        });
        return;
      }

      try {
        const body = await parseJsonBody(req);

        const { response, retries, latencyMs } = await fetchWithRetry({
          url: 'https://api.anthropic.com/v1/messages',
          init: {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(body),
          },
          maxRetries: 3,
          baseDelayMs: 1000,
          timeoutMs: 30000,
        });

        const data = await response.json().catch(() => ({
          error: { message: `Non-JSON HTTP ${response.status} response from Anthropic API` },
        }));

        if (!response.ok) {
          sendJson(res, response.status, {
            error: data.error?.message || data.error || 'Anthropic API returned error',
            rawResponse: data,
            latencyMs,
            retries,
            provider: 'anthropic',
          });
          return;
        }

        sendJson(res, 200, {
          ...data,
          _reliq_telemetry: {
            latencyMs,
            retries,
          },
        });
      } catch (err: any) {
        sendJson(res, 500, {
          error: `Internal server proxy error: ${err.message}`,
          provider: 'anthropic',
        });
      }
      return;
    }

    // ── LLM Judge Model Availability Check: POST or GET /api/judge/test ──
    if ((req.method === 'POST' || req.method === 'GET') && parsedUrl.startsWith('/api/judge/test')) {
      const apiKey = getApiKey('GROQ_API_KEY');
      if (!apiKey) {
        sendJson(res, 200, {
          status: 'API KEY MISSING',
          available: false,
          error: 'GROQ_API_KEY is not configured in server environment (.env.local).',
        });
        return;
      }

      let modelId = 'groq/compound';
      if (req.method === 'POST') {
        const body = await parseJsonBody(req).catch(() => ({}));
        modelId = body.model || body.modelIdentifier || modelId;
      } else {
        const queryParams = new URL(req.url || '', 'http://localhost').searchParams;
        modelId = queryParams.get('model') || modelId;
      }

      const descriptor = GROQ_MODEL_REGISTRY[modelId];
      if (!descriptor || !descriptor.isJudgeEligible) {
        sendJson(res, 200, {
          status: 'MODEL NOT ACCESSIBLE',
          available: false,
          model: modelId,
          error: `Model '${modelId}' is not an eligible Groq judge model.`,
        });
        return;
      }

      try {
        const startTime = performance.now();
        const testRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: modelId,
            messages: [{ role: 'user', content: 'Ping' }],
            max_tokens: 1,
            temperature: 0.0,
          }),
        });
        const latencyMs = Math.round(performance.now() - startTime);

        if (testRes.ok) {
          const testData = await testRes.json();
          if (testData.choices && testData.choices.length > 0) {
            sendJson(res, 200, {
              status: 'AVAILABLE',
              available: true,
              model: modelId,
              displayName: descriptor.displayName,
              latencyMs,
            });
            return;
          }
        }

        if (testRes.status === 401 || testRes.status === 403 || testRes.status === 404) {
          sendJson(res, 200, {
            status: 'MODEL NOT ACCESSIBLE',
            available: false,
            model: modelId,
            httpStatus: testRes.status,
            error: `Model not accessible on Groq account (HTTP ${testRes.status})`,
          });
          return;
        }

        sendJson(res, 200, {
          status: 'REQUEST FAILED',
          available: false,
          model: modelId,
          httpStatus: testRes.status,
          error: `Groq request failed with status ${testRes.status}`,
        });
      } catch (err: any) {
        sendJson(res, 200, {
          status: 'UNAVAILABLE',
          available: false,
          model: modelId,
          error: err.message,
        });
      }
      return;
    }

    // ── Groq Models List: GET /api/providers/groq/models ─────────
    if (req.method === 'GET' && parsedUrl === '/api/providers/groq/models') {
      const apiKey = getApiKey('GROQ_API_KEY');
      if (!apiKey) {
        sendJson(res, 401, {
          error: 'GROQ_API_KEY is not configured in server-side environment (.env.local).',
          provider: 'groq',
        });
        return;
      }

      try {
        const response = await fetch('https://api.groq.com/openai/v1/models', {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });
        if (response.ok) {
          const data = await response.json();
          const models = (data.data || [])
            .filter((m: any) => m.active !== false)
            .map((m: any) => m.id);
          sendJson(res, 200, { models, configured: true });
          return;
        }
        sendJson(res, response.status, { error: 'Failed to fetch Groq models', models: [] });
      } catch (err: any) {
        sendJson(res, 500, { error: err.message, models: [] });
      }
      return;
    }

    // ── Groq: POST /api/providers/groq ──────────────────────────
    if (req.method === 'POST' && parsedUrl === '/api/providers/groq') {
      const apiKey = getApiKey('GROQ_API_KEY');
      if (!apiKey) {
        sendJson(res, 401, {
          error: 'GROQ_API_KEY is not configured in server-side environment (.env.local).',
          provider: 'groq',
        });
        return;
      }

      try {
        const body = await parseJsonBody(req);
        const { metadata, ...groqPayload } = body;
        const caseId = metadata?.testCaseId || 'n/a';

        const isGptOss = groqPayload.model === 'openai/gpt-oss-20b' || groqPayload.model === 'openai/gpt-oss-120b';
        if (isGptOss && !groqPayload.reasoning_effort) {
          groqPayload.reasoning_effort = 'medium';
        }

        console.log(`[RELIQ Proxy] -> GROQ POST model=${groqPayload.model} (case=${caseId}, reasoning=${groqPayload.reasoning_effort || 'none'})`);

        const { response, retries, latencyMs } = await fetchWithRetry({
          url: 'https://api.groq.com/openai/v1/chat/completions',
          init: {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(groqPayload),
          },
          maxRetries: 3,
          baseDelayMs: 1000,
          timeoutMs: 30000,
        });

        const rateLimits = {
          limitRequests: response.headers.get('x-ratelimit-limit-requests') || undefined,
          remainingRequests: response.headers.get('x-ratelimit-remaining-requests') || undefined,
          resetRequests: response.headers.get('x-ratelimit-reset-requests') || undefined,
          limitTokens: response.headers.get('x-ratelimit-limit-tokens') || undefined,
          remainingTokens: response.headers.get('x-ratelimit-remaining-tokens') || undefined,
          resetTokens: response.headers.get('x-ratelimit-reset-tokens') || undefined,
          retryAfter: response.headers.get('retry-after') || undefined,
        };

        const data = await response.json().catch(() => ({
          error: { message: `Non-JSON HTTP ${response.status} response from Groq API` },
        }));

        if (!response.ok) {
          const errMsg = data.error?.message || data.error || 'Groq API returned error';
          console.log(`[RELIQ Proxy] <- GROQ ${response.status} ERROR: ${errMsg} (latency=${latencyMs}ms, retries=${retries})`);
          sendJson(res, response.status, {
            error: errMsg,
            rawResponse: data,
            latencyMs,
            retries,
            rateLimits,
            provider: 'groq',
          });
          return;
        }

        const usage = data.usage || {};
        const inTok = usage.prompt_tokens ?? 0;
        const outTok = usage.completion_tokens ?? 0;
        console.log(
          `[RELIQ Proxy] <- GROQ 200 OK | Latency: ${latencyMs}ms | Retries: ${retries} | In: ${inTok} | Out: ${outTok}`
        );

        sendJson(res, 200, {
          ...data,
          _reliq_telemetry: {
            latencyMs,
            retries,
            rateLimits,
          },
        });
      } catch (err: any) {
        sendJson(res, 500, {
          error: `Internal server proxy error: ${err.message}`,
          provider: 'groq',
        });
      }
      return;
    }

    // ── Cerebras Models List: GET /api/providers/cerebras/models ─
    if (req.method === 'GET' && parsedUrl === '/api/providers/cerebras/models') {
      const apiKey = getApiKey('CEREBRAS_API_KEY');
      if (!apiKey) {
        sendJson(res, 401, {
          error: 'CEREBRAS_API_KEY is not configured in server-side environment (.env.local).',
          provider: 'cerebras',
        });
        return;
      }

      try {
        const response = await fetch('https://api.cerebras.ai/v1/models', {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });
        if (response.ok) {
          const data = await response.json();
          const models = (data.data || [])
            .filter((m: any) => m.active !== false)
            .map((m: any) => m.id);
          sendJson(res, 200, { models, configured: true });
          return;
        }
        sendJson(res, response.status, { error: 'Failed to fetch Cerebras models', models: ['gpt-oss-120b', 'llama3.1-8b'] });
      } catch (err: any) {
        sendJson(res, 500, { error: err.message, models: ['gpt-oss-120b', 'llama3.1-8b'] });
      }
      return;
    }

    // ── Cerebras: POST /api/providers/cerebras ──────────────────
    if (req.method === 'POST' && parsedUrl === '/api/providers/cerebras') {
      const apiKey = getApiKey('CEREBRAS_API_KEY');
      if (!apiKey) {
        sendJson(res, 401, {
          error: 'CEREBRAS_API_KEY is not configured in server-side environment (.env.local).',
          provider: 'cerebras',
        });
        return;
      }

      try {
        const body = await parseJsonBody(req);
        const { metadata, ...cerebrasPayload } = body;
        const caseId = metadata?.testCaseId || 'n/a';
        console.log(`[RELIQ Proxy] -> CEREBRAS POST model=${cerebrasPayload.model} (case=${caseId})`);

        const { response, retries, latencyMs } = await fetchWithRetry({
          url: 'https://api.cerebras.ai/v1/chat/completions',
          init: {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(cerebrasPayload),
          },
          maxRetries: 3,
          baseDelayMs: 1000,
          timeoutMs: 30000,
        });

        const rateLimits = {
          limitRequests: response.headers.get('x-ratelimit-limit-requests-day') || undefined,
          remainingRequests: response.headers.get('x-ratelimit-remaining-requests-day') || undefined,
          resetRequests: response.headers.get('x-ratelimit-reset-requests-day') || undefined,
          limitTokens: response.headers.get('x-ratelimit-limit-tokens-minute') || undefined,
          remainingTokens: response.headers.get('x-ratelimit-remaining-tokens-minute') || undefined,
          resetTokens: response.headers.get('x-ratelimit-reset-tokens-minute') || undefined,
          retryAfter: response.headers.get('retry-after') || undefined,
        };

        const data = await response.json().catch(() => ({
          error: { message: `Non-JSON HTTP ${response.status} response from Cerebras API` },
        }));

        if (!response.ok) {
          const errMsg = data.error?.message || data.error || 'Cerebras API returned error';
          console.log(`[RELIQ Proxy] <- CEREBRAS ${response.status} ERROR: ${errMsg} (latency=${latencyMs}ms, retries=${retries})`);
          sendJson(res, response.status, {
            error: errMsg,
            rawResponse: data,
            latencyMs,
            retries,
            rateLimits,
            provider: 'cerebras',
          });
          return;
        }

        const usage = data.usage || {};
        const inTok = usage.prompt_tokens ?? 0;
        const outTok = usage.completion_tokens ?? 0;
        console.log(
          `[RELIQ Proxy] <- CEREBRAS 200 OK | Latency: ${latencyMs}ms | Retries: ${retries} | In: ${inTok} | Out: ${outTok}`
        );

        sendJson(res, 200, {
          ...data,
          _reliq_telemetry: {
            latencyMs,
            retries,
            rateLimits,
          },
        });
      } catch (err: any) {
        sendJson(res, 500, {
          error: `Internal server proxy error: ${err.message}`,
          provider: 'cerebras',
        });
      }
      return;
    }

    next();
  };
}
