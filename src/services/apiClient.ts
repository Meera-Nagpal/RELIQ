/* ============================================================
   RELIQ — Frontend API Client Helper
   
   Provides:
   - Typed fetch wrapper for REST endpoints (/api/...)
   - Standardized ApiError normalization ({ error: { code, message } })
   - Network failure detection with visible error propagation
   - Configurable base URL for testing and SSR environments
   ============================================================ */

export class ApiError extends Error {
  public code: string;
  public status: number;
  public details?: any;

  constructor(message: string, code = 'API_ERROR', status = 500, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;

    // Maintain prototype chain in transpiled environments
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

/**
 * Resolves the authenticated JWT/Bearer token from localStorage.
 * Checks reliq_auth_token, supabase_auth_token, and standard Supabase session keys (sb-*-auth-token).
 */
export function getStoredAuthToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  const directToken = localStorage.getItem('reliq_auth_token') || localStorage.getItem('supabase_auth_token');
  if (directToken) return directToken;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const item = localStorage.getItem(key);
        if (item) {
          const parsed = JSON.parse(item);
          if (parsed && typeof parsed === 'object') {
            if (typeof parsed.access_token === 'string') return parsed.access_token;
            if (parsed.currentSession && typeof parsed.currentSession.access_token === 'string') {
              return parsed.currentSession.access_token;
            }
          }
        }
      }
    }
  } catch {}
  return null;
}

export interface RetryConfig {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
}

/**
 * Executes a fetch request with automatic exponential backoff and jitter for transient
 * network failures and server 502/503/504 gateway/availability errors.
 * Configured specifically to bridge Render production cold starts (15-30s).
 */
export async function fetchWithRetryTransient(
  fetchFn: () => Promise<Response>,
  options: number | RetryConfig = 4
): Promise<Response> {
  const config: RetryConfig = typeof options === 'number' ? { maxRetries: options } : options;
  const maxRetries = config.maxRetries ?? 4;
  const initialDelayMs = config.initialDelayMs ?? 400;
  const maxDelayMs = config.maxDelayMs ?? 8000;

  let attempt = 0;
  while (true) {
    try {
      const res = await fetchFn();
      const isUnavailable = res.status === 502 || res.status === 503 || res.status === 504;
      if (isUnavailable && attempt < maxRetries) {
        attempt++;
        const backoffMs = Math.min(
          maxDelayMs,
          Math.round(initialDelayMs * Math.pow(2, attempt) + Math.random() * 150)
        );
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
      return res;
    } catch (err: any) {
      if (attempt < maxRetries) {
        attempt++;
        const backoffMs = Math.min(
          maxDelayMs,
          Math.round(initialDelayMs * Math.pow(2, attempt) + Math.random() * 150)
        );
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Standard fetch wrapper that automatically forwards the user's Authorization Bearer token
 * and retries transient gateway errors.
 */
export async function fetchWithAuth(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getStoredAuthToken();
  const headers = new Headers(init?.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const isIdempotent = !init?.method || init.method === 'GET' || init.method === 'HEAD' || init.method === 'OPTIONS';
  const maxRetries = isIdempotent ? 4 : 1;
  return fetchWithRetryTransient(
    () => fetch(input, { ...init, headers }),
    maxRetries
  );
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private buildUrl(endpoint: string, params?: Record<string, string | number | boolean | undefined>): string {
    let url = this.baseUrl ? `${this.baseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}` : endpoint;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, val] of Object.entries(params)) {
        if (val !== undefined && val !== null) {
          searchParams.append(key, String(val));
        }
      }
      const qs = searchParams.toString();
      if (qs) {
        url += (url.includes('?') ? '&' : '?') + qs;
      }
    }
    return url;
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { params, headers, ...rest } = options;
    const url = this.buildUrl(endpoint, params);
    const token = getStoredAuthToken();

    const mergedHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((headers as Record<string, string>) || {}),
    };

    if (rest.body && typeof rest.body === 'string' && !mergedHeaders['Content-Type']) {
      mergedHeaders['Content-Type'] = 'application/json';
    }

    let response: Response;
    try {
      const isIdempotent = !rest.method || rest.method === 'GET' || rest.method === 'HEAD' || rest.method === 'OPTIONS';
      response = await fetchWithRetryTransient(
        () => fetch(url, { ...rest, headers: mergedHeaders }),
        isIdempotent ? 4 : 1
      );
    } catch (err: any) {
      throw new ApiError(
        `Backend service unreachable (${err.message || 'Network request failed'})`,
        'NETWORK_ERROR',
        0
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as unknown as T;
    }

    // Parse JSON or text
    let data: any;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch {
        data = null;
      }
    } else {
      try {
        const text = await response.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      const errPayload = data && typeof data === 'object' ? data.error : null;
      const code = errPayload && typeof errPayload === 'object' && errPayload.code
        ? errPayload.code
        : typeof errPayload === 'string'
        ? errPayload
        : `HTTP_${response.status}`;

      const message = errPayload && typeof errPayload === 'object' && errPayload.message
        ? errPayload.message
        : typeof errPayload === 'string'
        ? errPayload
        : data && typeof data === 'object' && data.message
        ? data.message
        : response.statusText || `Request failed with status ${response.status}`;

      const details = errPayload && typeof errPayload === 'object' ? errPayload.details : undefined;

      throw new ApiError(message, code, response.status, details);
    }

    return data as T;
  }

  get<T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET', params });
  }

  post<T>(endpoint: string, body?: any, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(endpoint: string, body?: any, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(endpoint: string, body?: any, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  async checkHealth(): Promise<HealthReport> {
    return checkBackendHealth(this.baseUrl);
  }
}

export interface HealthReport {
  status: 'NOMINAL' | 'DEGRADED' | 'OFFLINE';
  latencyMs: number;
  database?: string;
  databaseType?: string;
  uptimeSec?: number;
  service?: string;
  version?: string;
  timestamp?: string;
  error?: string;
}

/**
 * Directly checks backend API availability and database connectivity.
 * Accurately determines if the service is NOMINAL (200 + connected), DEGRADED (200 + reconnecting),
 * or OFFLINE (502/503/504 or network unreachable).
 */
export async function checkBackendHealth(baseUrl?: string): Promise<HealthReport> {
  const start = Date.now();
  const base = baseUrl !== undefined ? baseUrl : apiClient.getBaseUrl();
  const healthUrl = base ? `${base.replace(/\/+$/, '')}/api/health` : '/api/health';

  try {
    const res = await fetch(healthUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const latencyMs = Date.now() - start;

    if (res.ok) {
      const data = await res.json().catch(() => null);
      const isDegraded =
        data?.status === 'degraded' ||
        (typeof data?.database === 'string' && !data.database.includes('connected'));

      return {
        status: isDegraded ? 'DEGRADED' : 'NOMINAL',
        latencyMs,
        database: typeof data?.database === 'string' ? data.database : data?.database?.status,
        databaseType: data?.databaseType || data?.database?.type,
        uptimeSec: data?.uptimeSec,
        service: data?.service,
        version: data?.version,
        timestamp: data?.timestamp || new Date().toISOString(),
      };
    }

    return {
      status: 'OFFLINE',
      latencyMs,
      error: `HTTP ${res.status} ${res.statusText}`,
    };
  } catch (err: any) {
    return {
      status: 'OFFLINE',
      latencyMs: Date.now() - start,
      error: err?.message || 'Backend service unreachable',
    };
  }
}

const defaultBaseUrl =
  (typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL)) ||
  '';

export const apiClient = new ApiClient(defaultBaseUrl);
