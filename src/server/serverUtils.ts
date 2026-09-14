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

export function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer | string) => {
      body += chunk;
    });
    req.on('end', () => {
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

/**
 * Safely retrieve an API key from process.env or .env.local without exposing it to client.
 */
export function getApiKey(name: string): string | undefined {
  if (process.env[name] !== undefined) {
    return process.env[name].trim() || undefined;
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
            let v = trimmed.substring(idx + 1).trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
              v = v.slice(1, -1);
            }
            if (k === name && v) {
              process.env[name] = v;
              return v;
            }
          }
        }
      }
    } catch {}
  }

  return undefined;
}

export const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504, 529]);
export const PERMANENT_STATUS_CODES = new Set([400, 401, 403, 404]);

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
 * Executes outbound HTTP requests with bounded retries and exponential backoff.
 * - Transient errors (429, 500, 502, 503, 504, 529, timeouts): retried with backoff + jitter.
 * - Permanent errors (400, 401, 403, 404): never retried, returned immediately.
 */
export async function fetchWithRetry(options: FetchWithRetryOptions): Promise<FetchWithRetryResult> {
  const {
    url,
    init,
    maxRetries = 3,
    baseDelayMs = 1000,
    timeoutMs = 30000,
  } = options;

  const startTime = Date.now();
  let retries = 0;
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...init,
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
        const retryAfterHeader = response.headers.get('retry-after');
        if (retryAfterHeader) {
          const parsedSeconds = parseFloat(retryAfterHeader);
          if (!isNaN(parsedSeconds) && parsedSeconds > 0) {
            waitMs = Math.min(65000, Math.ceil(parsedSeconds * 1000) + 1000);
          }
        }
        if (!waitMs) {
          try {
            const bodyCloned = await response.clone().text();
            const match = bodyCloned.match(/retry in ([\d\.]+)s/i) || bodyCloned.match(/retry after ([\d\.]+)s/i);
            if (match) {
              const seconds = parseFloat(match[1]);
              if (!isNaN(seconds) && seconds > 0) {
                waitMs = Math.min(65000, Math.ceil(seconds * 1000) + 1000);
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
                    waitMs = Math.min(65000, Math.ceil(sec * 1000) + 1000);
                  }
                }
              } catch {}
            }
          } catch {}
        }

        // Fallback to exponential backoff with jitter if no explicit retry-after
        if (!waitMs) {
          const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
          const jitter = Math.floor(Math.random() * 250);
          waitMs = Math.min(30000, exponentialDelay + jitter);
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
        const jitter = Math.floor(Math.random() * 250);
        const waitMs = Math.min(30000, exponentialDelay + jitter);
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
