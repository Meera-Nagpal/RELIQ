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

    const mergedHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...((headers as Record<string, string>) || {}),
    };

    if (rest.body && typeof rest.body === 'string' && !mergedHeaders['Content-Type']) {
      mergedHeaders['Content-Type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await fetch(url, {
        ...rest,
        headers: mergedHeaders,
      });
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
}

export const apiClient = new ApiClient();
