/* ============================================================
   RELIQ — Server Utilities & Resilient HTTP Transport
   
   Secure Node.js utilities for server-side evaluation execution:
   - Safe API key extraction from process.env / .env.local without client leakage
   - Resilient fetch with exponential backoff and jitter for transient errors
   - HTTP request/response JSON serialization helpers
   ============================================================ */

import fs from 'fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';

const MAX_BODY_BYTES = 25 * 1024 * 1024; // 25 MB limit

export function parseJsonBody<T = any>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    let receivedBytes = 0;
    let aborted = false;
    req.on('data', (chunk: Buffer | string) => {
      if (aborted) return;
      receivedBytes += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
      if (receivedBytes > MAX_BODY_BYTES) {
        aborted = true;
        reject(new Error('Request body exceeds maximum allowed size (25 MB)'));
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (aborted) return;
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

export function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let envCacheLoaded = false;
const envFileCache = new Map<string, string>();

/**
 * Inconsistent environment variable aliases across platforms, providers, and legacy conventions.
 */
export const KEY_ALIASES: Record<string, string[]> = {
  GROQ_API_KEY: ['GROQ_API_KEY', 'GROQ_API_TOKEN', 'GROQ_KEY', 'GROQ_TOKEN'],
  GEMINI_API_KEY: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_KEY', 'GOOGLE_KEY'],
  CEREBRAS_API_KEY: ['CEREBRAS_API_KEY', 'CEREBRAS_KEY', 'CEREBRAS_API_TOKEN'],
  OPENAI_API_KEY: ['OPENAI_API_KEY', 'OPENAI_KEY', 'OPENAI_API_TOKEN'],
  ANTHROPIC_API_KEY: ['ANTHROPIC_API_KEY', 'ANTHROPIC_KEY', 'ANTHROPIC_API_TOKEN'],
};

/**
 * Strips accidental wrapping quotes (single or double) and trims whitespace.
 */
export function cleanKeyValue(val?: string | null): string | undefined {
  if (val === undefined || val === null) return undefined;
  let trimmed = String(val).trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Loads .env.local and .env strictly for local development.
 * Never requires or attempts to read physical files in production (Render).
 */
function ensureEnvCacheLoaded(): void {
  if (envCacheLoaded) return;
  envCacheLoaded = true;

  // In production (e.g. Render), process.env is injected by hosting infrastructure.
  // Physical .env.local / .env files are NOT required and dotenv loading is skipped.
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  const candidatePaths = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env.local'),
    path.resolve(process.cwd(), '..', '.env'),
  ];

  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8');
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const idx = trimmed.indexOf('=');
            const k = trimmed.substring(0, idx).trim();
            const v = cleanKeyValue(trimmed.substring(idx + 1));
            if (k && v && !envFileCache.has(k)) {
              envFileCache.set(k, v);
            }
          }
        }
      }
    } catch {}
  }
}

/**
 * Safely retrieve an API key from process.env or cached .env.local without exposing it to client.
 * In production (Render), reads directly from process.env without requiring any physical .env.local file.
 */
export function getApiKey(name: string): string | undefined {
  // 1. Direct process.env check (Production / Render environment variables)
  if (typeof process !== 'undefined' && process.env) {
    if (process.env[name] !== undefined) {
      return cleanKeyValue(process.env[name]);
    }

    // Check known aliases for this key in process.env
    const aliases = KEY_ALIASES[name] || [];
    for (const alias of aliases) {
      if (process.env[alias] !== undefined) {
        return cleanKeyValue(process.env[alias]);
      }
    }
  }

  // 2. Local development fallback (strictly when NODE_ENV !== 'production')
  if (process.env.NODE_ENV !== 'production') {
    ensureEnvCacheLoaded();
    const cached = cleanKeyValue(envFileCache.get(name));
    if (cached) {
      process.env[name] = cached;
      return cached;
    }
    const aliases = KEY_ALIASES[name] || [];
    for (const alias of aliases) {
      const cachedAlias = cleanKeyValue(envFileCache.get(alias));
      if (cachedAlias) {
        process.env[name] = cachedAlias;
        return cachedAlias;
      }
    }
  }

  return undefined;
}

/**
 * Parses duration strings like "787ms", "1.82s", "1m2.4s" into milliseconds.
 */
export function parseDurationHeaderMs(val?: string | null): number {
  if (!val) return 0;
  const str = String(val).trim();
  if (!str) return 0;

  // Pure numeric seconds
  if (/^\d+(\.\d+)?$/.test(str)) {
    return Math.ceil(parseFloat(str) * 1000);
  }

  let totalMs = 0;
  const minMatch = str.match(/(\d+(?:\.\d+)?)m(?!s)/i);
  if (minMatch) totalMs += parseFloat(minMatch[1]) * 60000;
  const secMatch = str.match(/(\d+(?:\.\d+)?)s/i);
  if (secMatch) totalMs += parseFloat(secMatch[1]) * 1000;
  const msMatch = str.match(/(\d+(?:\.\d+)?)ms/i);
  if (msMatch) totalMs += parseFloat(msMatch[1]);

  return Math.ceil(totalMs);
}

export const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504, 529]);
export const PERMANENT_STATUS_CODES = new Set([400, 401, 402, 403, 404]);

export interface FetchWithRetryOptions {
  url: string;
  init: RequestInit;
  maxRetries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
}

export interface FetchWithRetryResult {
  response: Response;
  retries: number;
  latencyMs: number;
}

/**
 * Executes outbound HTTP requests with persistent keep-alive connections,
 * bounded retries, and adaptive rate-limit backoff.
 * - Transient errors (429, 500, 502, 503, 504, 529, timeouts): retried with backoff + jitter.
 * - Permanent errors (400, 401, 402, 403, 404): never retried, returned immediately.
 */
export async function fetchWithRetry(options: FetchWithRetryOptions): Promise<FetchWithRetryResult> {
  const {
    url,
    init,
    maxRetries = 3,
    baseDelayMs = 600,
    timeoutMs = 30000,
  } = options;

  const startTime = Date.now();
  let retries = 0;
  let lastError: any = null;

  // Reuse persistent HTTP connections via keep-alive headers
  const mergedHeaders: Record<string, string> = {
    Connection: 'keep-alive',
    ...(init.headers as Record<string, string> || {}),
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...init,
        headers: mergedHeaders,
        keepalive: true,
        signal: controller.signal,
      });

      clearTimeout(timer);

      // Never retry permanent client/auth errors
      if (PERMANENT_STATUS_CODES.has(response.status)) {
        return {
          response,
          retries,
          latencyMs: Date.now() - startTime,
        };
      }

      // If transient status and retries remain, calculate waitMs and sleep before next attempt
      if (TRANSIENT_STATUS_CODES.has(response.status) && attempt < maxRetries) {
        retries++;
        let waitMs = 0;

        // 1. Check sub-second token reset header (e.g., Groq x-ratelimit-reset-tokens: "787ms" or "1.4s")
        const resetTokensHeader =
          response.headers.get('x-ratelimit-reset-tokens') ||
          response.headers.get('x-ratelimit-reset-tokens-minute');
        if (resetTokensHeader) {
          const parsedResetMs = parseDurationHeaderMs(resetTokensHeader);
          if (parsedResetMs > 0 && parsedResetMs <= 15000) {
            waitMs = Math.max(waitMs, Math.max(150, parsedResetMs + 100));
          }
        }

        // 2. Check standard retry-after header (always take Math.max so both RPM and TPM limits are respected)
        const retryAfterHeader = response.headers.get('retry-after');
        if (retryAfterHeader) {
          const parsedSeconds = parseFloat(retryAfterHeader);
          if (!isNaN(parsedSeconds) && parsedSeconds > 0) {
            waitMs = Math.max(waitMs, Math.min(65000, Math.ceil(parsedSeconds * 1000) + 250));
          }
        }

        if (!waitMs) {
          try {
            const bodyCloned = await response.clone().text();
            const match =
              bodyCloned.match(/try again in ([\d\.]+)ms/i);
            if (match) {
              const ms = parseFloat(match[1]);
              if (!isNaN(ms) && ms > 0) {
                waitMs = Math.min(65000, Math.ceil(ms) + 100);
              }
            }
            if (!waitMs) {
              const secMatch =
                bodyCloned.match(/try again in ([\d\.]+)s/i) ||
                bodyCloned.match(/retry in ([\d\.]+)s/i) ||
                bodyCloned.match(/retry after ([\d\.]+)s/i);
              if (secMatch) {
                const seconds = parseFloat(secMatch[1]);
                if (!isNaN(seconds) && seconds > 0) {
                  waitMs = Math.min(65000, Math.ceil(seconds * 1000) + 150);
                }
              }
            }
            if (!waitMs) {
              try {
                const parsedBody = JSON.parse(bodyCloned);
                const retryInfo = parsedBody?.error?.details?.find(
                  (d: any) => d?.['@type']?.includes('RetryInfo') || d?.retryDelay
                );
                if (retryInfo?.retryDelay) {
                  const sec = parseFloat(String(retryInfo.retryDelay).replace('s', ''));
                  if (!isNaN(sec) && sec > 0) {
                    waitMs = Math.min(65000, Math.ceil(sec * 1000) + 250);
                  }
                }
              } catch {}
            }
          } catch {}
        }

        // Fallback to exponential backoff with jitter if no explicit retry-after
        if (!waitMs) {
          const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
          const jitter = Math.floor(Math.random() * 150);
          waitMs = Math.min(15000, exponentialDelay + jitter);
        } else if (response.status === 429) {
          // Add staggered jitter on explicit 429 waits so concurrent workers never collide on retry
          waitMs += (retries - 1) * 500 + Math.floor(Math.random() * 350);
        }

        console.log(`[RELIQ Transport] Rate limit or transient error (${response.status}) — backoff wait ${waitMs}ms before retry ${attempt + 1}/${maxRetries}...`);
        await sleep(waitMs);
        continue;
      }

      return {
        response,
        retries,
        latencyMs: Date.now() - startTime,
      };
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        retries++;
        const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
        const jitter = Math.floor(Math.random() * 150);
        const waitMs = Math.min(15000, exponentialDelay + jitter);
        console.log(`[RELIQ Transport] Network error (${err.message}) — backoff wait ${waitMs}ms before retry ${attempt + 1}/${maxRetries}...`);
        await sleep(waitMs);
        continue;
      }
    }
  }

  throw lastError || new Error('Network request failed after retries');
}

/**
 * Strips JS-style line comments (// ...), block comments, and trailing commas from a JSON string,
 * preserving strings and valid JSON tokens.
 */
export function stripJsonCommentsAndTrailingCommas(raw: string): string {
  let result = '';
  let inString = false;
  let stringChar = '';
  let isEscaped = false;
  let i = 0;

  while (i < raw.length) {
    const char = raw[i];
    const nextChar = raw[i + 1];

    if (inString) {
      result += char;
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === stringChar) {
        inString = false;
      }
      i++;
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      stringChar = char;
      result += char;
      i++;
      continue;
    }

    // Single-line comment //
    if (char === '/' && nextChar === '/') {
      i += 2;
      while (i < raw.length && raw[i] !== '\n' && raw[i] !== '\r') {
        i++;
      }
      continue;
    }

    // Multi-line comment /* ... */
    if (char === '/' && nextChar === '*') {
      i += 2;
      while (i < raw.length && !(raw[i] === '*' && raw[i + 1] === '/')) {
        i++;
      }
      i += 2; // skip */
      continue;
    }

    result += char;
    i++;
  }

  // Strip trailing commas before closing braces or brackets: , \s* } or , \s* ]
  return result.replace(/,\s*([\}\]])/g, '$1');
}

/**
 * Scans a JSON string and detects duplicate property keys within the same object scope.
 */
export function findDuplicateJsonKeys(raw: string): string[] {
  const duplicates: string[] = [];
  const stack: Set<string>[] = [];
  let inString = false;
  let isEscaped = false;
  let currentString = '';

  const cleaned = stripJsonCommentsAndTrailingCommas(raw);

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];

    if (inString) {
      if (isEscaped) {
        currentString += char;
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
        currentString += char;
      } else if (char === '"') {
        inString = false;
        let nextNonWs = i + 1;
        while (nextNonWs < cleaned.length && /\s/.test(cleaned[nextNonWs])) {
          nextNonWs++;
        }
        if (cleaned[nextNonWs] === ':') {
          const key = currentString;
          const currentScope = stack[stack.length - 1];
          if (currentScope) {
            if (currentScope.has(key)) {
              if (!duplicates.includes(key)) {
                duplicates.push(key);
              }
            } else {
              currentScope.add(key);
            }
          }
        }
        currentString = '';
      } else {
        currentString += char;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      currentString = '';
      continue;
    }

    if (char === '{') {
      stack.push(new Set<string>());
    } else if (char === '}') {
      stack.pop();
    }
  }

  return duplicates;
}

export interface NormalizedProviderError {
  normalizedCode: string;
  category: 'AUTHENTICATION' | 'RATE_LIMIT' | 'TIMEOUT' | 'NETWORK' | 'SERVER_ERROR' | 'UNKNOWN';
  message: string;
  httpStatus?: number;
}

/**
 * Authoritative provider boundary error normalizer.
 * Normalizes HTTP status codes and operational exceptions into canonical domain error types:
 * - HTTP 401: AUTHENTICATION_ERROR
 * - HTTP 402: PROVIDER_CREDITS_EXHAUSTED / PAYMENT_REQUIRED
 * - HTTP 403: PROVIDER_FORBIDDEN
 * - HTTP 429: PROVIDER_RATE_LIMIT
 * - HTTP 5xx: PROVIDER_SERVER_ERROR
 * - Timeout:  PROVIDER_TIMEOUT
 * - Network:  PROVIDER_NETWORK_ERROR
 */
export function normalizeProviderError(
  status?: number,
  errorOrMsg?: any
): NormalizedProviderError {
  const code = typeof errorOrMsg === 'object' ? errorOrMsg?.code : undefined;
  const msg = typeof errorOrMsg === 'string' ? errorOrMsg : (errorOrMsg?.message || '');
  const lower = String(msg).toLowerCase();

  // 401: AUTHENTICATION_ERROR
  if (
    status === 401 ||
    code === 'AUTHENTICATION_ERROR' ||
    code === 'AUTH_FAILED' ||
    code === 'AUTH_MISSING_KEY' ||
    lower.includes('api key') ||
    lower.includes('unauthorized')
  ) {
    return {
      normalizedCode: 'AUTHENTICATION_ERROR',
      category: 'AUTHENTICATION',
      message: msg || 'Provider authentication failed or API key missing (HTTP 401)',
      httpStatus: status || 401,
    };
  }

  // 402: PROVIDER_CREDITS_EXHAUSTED / PAYMENT_REQUIRED
  if (
    status === 402 ||
    code === 'PROVIDER_CREDITS_EXHAUSTED' ||
    code === 'PAYMENT_REQUIRED' ||
    lower.includes('payment required') ||
    lower.includes('credits exhausted') ||
    lower.includes('insufficient credits') ||
    lower.includes('insufficient funds')
  ) {
    return {
      normalizedCode: 'PROVIDER_CREDITS_EXHAUSTED',
      category: 'RATE_LIMIT',
      message: msg || 'Provider credits exhausted / payment required (HTTP 402)',
      httpStatus: status || 402,
    };
  }

  // 403: PROVIDER_FORBIDDEN
  if (
    status === 403 ||
    code === 'PROVIDER_FORBIDDEN' ||
    code === 'FORBIDDEN' ||
    lower.includes('forbidden') ||
    lower.includes('permission denied') ||
    lower.includes('access denied')
  ) {
    return {
      normalizedCode: 'PROVIDER_FORBIDDEN',
      category: 'AUTHENTICATION',
      message: msg || 'Provider request forbidden / permission denied (HTTP 403)',
      httpStatus: status || 403,
    };
  }

  // 429: PROVIDER_RATE_LIMIT
  if (
    status === 429 ||
    code === 'PROVIDER_RATE_LIMIT' ||
    code === 'RATE_LIMIT_EXCEEDED' ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests')
  ) {
    return {
      normalizedCode: 'PROVIDER_RATE_LIMIT',
      category: 'RATE_LIMIT',
      message: msg || 'Provider rate limit or quota exceeded (HTTP 429)',
      httpStatus: status || 429,
    };
  }

  // 5xx: PROVIDER_SERVER_ERROR
  if (
    (status !== undefined && status >= 500 && status < 600) ||
    code === 'PROVIDER_SERVER_ERROR' ||
    code === 'SERVER_ERROR' ||
    code === 'PROVIDER_ERROR'
  ) {
    return {
      normalizedCode: 'PROVIDER_SERVER_ERROR',
      category: 'SERVER_ERROR',
      message: msg || `Provider server error (HTTP ${status || 500})`,
      httpStatus: status || 500,
    };
  }

  // Timeout: PROVIDER_TIMEOUT
  if (
    status === 408 ||
    status === 504 ||
    code === 'PROVIDER_TIMEOUT' ||
    code === 'TIMEOUT' ||
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('aborted')
  ) {
    return {
      normalizedCode: 'PROVIDER_TIMEOUT',
      category: 'TIMEOUT',
      message: msg || 'Provider request timed out',
      httpStatus: status || 504,
    };
  }

  // Network: PROVIDER_NETWORK_ERROR
  if (
    code === 'PROVIDER_NETWORK_ERROR' ||
    code === 'NETWORK_ERROR' ||
    lower.includes('network') ||
    lower.includes('econnrefused') ||
    lower.includes('socket') ||
    lower.includes('fetch failed') ||
    lower.includes('und_err')
  ) {
    return {
      normalizedCode: 'PROVIDER_NETWORK_ERROR',
      category: 'NETWORK',
      message: msg || 'Provider network socket or connectivity error',
      httpStatus: status,
    };
  }

  return {
    normalizedCode: 'PROVIDER_ERROR',
    category: 'UNKNOWN',
    message: msg || 'Provider returned operational error',
    httpStatus: status,
  };
}

