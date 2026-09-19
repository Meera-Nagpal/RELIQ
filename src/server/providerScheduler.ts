/* ============================================================
   RELIQ — Server-Side Provider Request Scheduler & Rate Limiter
   
   Provides:
   - Per-provider serialized request queues with configurable minimum inter-request delay
   - Independent queues: Gemini pacing never delays Groq requests
   - Cooldown and quota exhaustion tracking with Retry-After and RPC RetryInfo
   - Pre-flight quota check to prevent doomed evaluation runs
   - Evaluation run lock to prevent concurrent runs from competing for provider quota
   ============================================================ */

export type ProviderQuotaStatus = 'AVAILABLE' | 'COOLING_DOWN' | 'QUOTA_EXHAUSTED';

export interface ProviderRateLimitState {
  providerId: string;
  status: ProviderQuotaStatus;
  coolingDownUntil: number; // Unix timestamp ms
  cooldownRemainingMs: number;
  lastRequestTime: number;
  minDelayMs: number;
  consecutiveRateLimits: number;
  totalRequests: number;
  totalRateLimits: number;
  lastError?: string;
  quotaMetric?: string;
  quotaId?: string;
}

export interface QuotaCheckResult {
  available: boolean;
  status: ProviderQuotaStatus;
  reason?: string;
  remainingSec?: number;
}

export class ProviderScheduler {
  private static instance: ProviderScheduler;

  // Provider states keyed by provider identifier (e.g. 'google', 'groq', 'openai', 'anthropic')
  private states = new Map<string, ProviderRateLimitState>();

  // Per-provider queue promises for sequential chain execution
  private queues = new Map<string, Promise<any>>();

  // Mutex for evaluation runs to prevent concurrent runs from consuming quota simultaneously
  private activeRunLock: Promise<void> | null = null;
  private currentActiveRunId: string | null = null;

  constructor() {
    // Initialize default known providers
    this.initProvider('google', this.resolveMinDelay('google', 4000));
    this.initProvider('groq', this.resolveMinDelay('groq', 0));
    this.initProvider('cerebras', this.resolveMinDelay('cerebras', 0));
    this.initProvider('openai', this.resolveMinDelay('openai', 500));
    this.initProvider('anthropic', this.resolveMinDelay('anthropic', 500));
  }

  public static getInstance(): ProviderScheduler {
    if (!ProviderScheduler.instance) {
      ProviderScheduler.instance = new ProviderScheduler();
    }
    return ProviderScheduler.instance;
  }

  private resolveMinDelay(provider: string, defaultMs: number): number {
    if (typeof process === 'undefined' || !process.env) return defaultMs;

    // Check specific provider env (e.g. GEMINI_MIN_DELAY_MS, GROQ_MIN_DELAY_MS)
    const specificKey = `${provider.toUpperCase()}_MIN_DELAY_MS`;
    if (process.env[specificKey]) {
      const parsed = parseInt(process.env[specificKey]!, 10);
      if (!isNaN(parsed) && parsed >= 0) return parsed;
    }

    // Check global default env PROVIDER_REQUEST_DELAY_MS
    if (process.env.PROVIDER_REQUEST_DELAY_MS) {
      const parsed = parseInt(process.env.PROVIDER_REQUEST_DELAY_MS, 10);
      if (!isNaN(parsed) && parsed >= 0) return parsed;
    }

    return defaultMs;
  }

  public initProvider(providerId: string, minDelayMs: number): void {
    const norm = this.normalizeProvider(providerId);
    if (!this.states.has(norm)) {
      this.states.set(norm, {
        providerId: norm,
        status: 'AVAILABLE',
        coolingDownUntil: 0,
        cooldownRemainingMs: 0,
        lastRequestTime: 0,
        minDelayMs,
        consecutiveRateLimits: 0,
        totalRequests: 0,
        totalRateLimits: 0,
      });
    } else {
      const state = this.states.get(norm)!;
      state.minDelayMs = minDelayMs;
    }
  }

  public normalizeProvider(providerId: string): string {
    const p = String(providerId || '').toLowerCase().trim();
    if (p.includes('gemini') || p.includes('google')) return 'google';
    if (p.includes('groq')) return 'groq';
    if (p.includes('cerebras')) return 'cerebras';
    if (p.includes('openai')) return 'openai';
    if (p.includes('anthropic') || p.includes('claude')) return 'anthropic';
    return p;
  }

  /**
   * Pre-flight check: determines if provider is available or currently in quota exhaustion/cooldown.
   */
  public checkProviderQuota(providerId: string): QuotaCheckResult {
    const norm = this.normalizeProvider(providerId);
    const state = this.states.get(norm);

    if (!state) {
      return { available: true, status: 'AVAILABLE' };
    }

    const now = Date.now();
    if (state.coolingDownUntil > now) {
      const remainingMs = state.coolingDownUntil - now;
      const remainingSec = Math.ceil(remainingMs / 1000);
      return {
        available: false,
        status: state.status,
        remainingSec,
        reason: `PROVIDER RATE LIMIT / QUOTA EXHAUSTED: ${norm} is currently in ${state.status} state. Cooldown remaining: ${remainingSec}s (${state.lastError || 'Rate limit active'}).`,
      };
    }

    // Cooldown has expired, auto-restore status if it was cooling down
    if (state.status === 'COOLING_DOWN') {
      state.status = 'AVAILABLE';
      state.consecutiveRateLimits = 0;
    }

    return { available: true, status: state.status };
  }

  /**
   * Records an upstream 429 or quota exhaustion event for a provider.
   */
  public recordRateLimit(
    providerId: string,
    cooldownSec: number,
    errorMessage?: string,
    details?: { quotaMetric?: string; quotaId?: string; isDailyExhausted?: boolean }
  ): void {
    const norm = this.normalizeProvider(providerId);
    if (!this.states.has(norm)) {
      this.initProvider(norm, this.resolveMinDelay(norm, norm === 'google' ? 4000 : 0));
    }
    const state = this.states.get(norm)!;

    const safeSec = Math.max(1, Math.min(180, cooldownSec || 60));
    state.coolingDownUntil = Date.now() + safeSec * 1000;
    state.consecutiveRateLimits++;
    state.totalRateLimits++;
    state.lastError = errorMessage;

    if (details?.quotaMetric) state.quotaMetric = details.quotaMetric;
    if (details?.quotaId) state.quotaId = details.quotaId;

    if (details?.isDailyExhausted || details?.quotaId?.includes('PerDay')) {
      state.status = 'QUOTA_EXHAUSTED';
    } else {
      state.status = 'COOLING_DOWN';
    }

    console.warn(
      `[RELIQ ProviderScheduler] Recorded ${state.status} on ${norm}: cooldown ${safeSec}s. (Consecutive: ${state.consecutiveRateLimits}, Metric: ${state.quotaMetric || 'default'})`
    );
  }

  /**
   * Records a successful response for a provider.
   */
  public recordSuccess(providerId: string): void {
    const norm = this.normalizeProvider(providerId);
    const state = this.states.get(norm);
    if (state) {
      state.consecutiveRateLimits = 0;
      if (Date.now() >= state.coolingDownUntil) {
        state.status = 'AVAILABLE';
      }
    }
  }

  /**
   * Explicitly clears any active cooldown or quota exhaustion state for testing or admin override.
   */
  public clearProviderCooldown(providerId: string): void {
    const norm = this.normalizeProvider(providerId);
    const state = this.states.get(norm);
    if (state) {
      state.status = 'AVAILABLE';
      state.coolingDownUntil = 0;
      state.cooldownRemainingMs = 0;
      state.consecutiveRateLimits = 0;
      state.lastError = undefined;
    }
  }

  /**
   * Returns current status snapshot for a single provider.
   */
  public getProviderStatus(providerId: string): ProviderRateLimitState {
    const norm = this.normalizeProvider(providerId);
    if (!this.states.has(norm)) {
      this.initProvider(norm, this.resolveMinDelay(norm, norm === 'google' ? 4000 : 0));
    }
    const state = this.states.get(norm)!;
    const now = Date.now();
    const remainingMs = Math.max(0, state.coolingDownUntil - now);

    // Auto-clear cooldown if time has passed
    let status = state.status;
    if (remainingMs === 0 && status === 'COOLING_DOWN') {
      status = 'AVAILABLE';
      state.status = 'AVAILABLE';
    }

    return {
      ...state,
      status,
      cooldownRemainingMs: remainingMs,
    };
  }

  /**
   * Returns current status snapshots for all tracked providers.
   */
  public getAllProviderStatuses(): Record<string, ProviderRateLimitState> {
    const result: Record<string, ProviderRateLimitState> = {};
    for (const key of ['google', 'groq', 'cerebras', 'openai', 'anthropic']) {
      result[key] = this.getProviderStatus(key);
    }
    return result;
  }

  /**
   * Schedules a task to execute with per-provider sequential queueing,
   * pacing, and respect for active cooldowns.
   * Note: Groq tasks are completely decoupled from Google queues.
   */
  public async schedule<T>(providerId: string, taskFn: () => Promise<T>): Promise<T> {
    const norm = this.normalizeProvider(providerId);
    if (!this.states.has(norm)) {
      this.initProvider(norm, this.resolveMinDelay(norm, norm === 'google' ? 4000 : 0));
    }
    const state = this.states.get(norm)!;

    // Chain to the provider's serialized queue
    const currentQueue = this.queues.get(norm) || Promise.resolve();

    const executeTask = async (): Promise<T> => {
      // 1. If currently in cooldown, wait until cooldown ends
      const now = Date.now();
      if (state.coolingDownUntil > now) {
        const waitMs = state.coolingDownUntil - now;
        console.log(
          `[RELIQ ProviderScheduler] ${norm} in cooldown. Pausing queue for ${waitMs}ms...`
        );
        await new Promise((r) => setTimeout(r, waitMs));
      }

      // 2. Enforce minimum inter-request delay since last request
      const elapsedSinceLast = Date.now() - state.lastRequestTime;
      if (state.minDelayMs > 0 && elapsedSinceLast < state.minDelayMs) {
        const pacingWait = state.minDelayMs - elapsedSinceLast;
        console.log(
          `[RELIQ ProviderScheduler] Pacing ${norm}: waiting ${pacingWait}ms to satisfy minDelayMs=${state.minDelayMs}...`
        );
        await new Promise((r) => setTimeout(r, pacingWait));
      }

      // 3. Update execution timestamp and total request count
      state.lastRequestTime = Date.now();
      state.totalRequests++;

      try {
        const result = await taskFn();
        this.recordSuccess(norm);
        return result;
      } catch (err: any) {
        throw err;
      }
    };

    const nextQueue = currentQueue.then(executeTask, executeTask);
    this.queues.set(norm, nextQueue);

    return nextQueue;
  }

  /**
   * Acquires the global evaluation run lock to prevent multiple simultaneous runs
   * from competing for and exhausting the same provider quota.
   */
  public async acquireRunLock(runId: string, timeoutMs = 120000): Promise<() => void> {
    const startTime = Date.now();

    while (this.activeRunLock) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(
          `Evaluation run lock acquisition timed out after ${timeoutMs}ms. Another run (${this.currentActiveRunId}) is currently executing.`
        );
      }
      console.log(
        `[RELIQ ProviderScheduler] Run ${runId} waiting for active run ${this.currentActiveRunId} to release quota lock...`
      );
      await new Promise((r) => setTimeout(r, 1000));
    }

    let releaseFn: () => void = () => {};
    this.currentActiveRunId = runId;
    this.activeRunLock = new Promise<void>((resolve) => {
      releaseFn = () => {
        this.activeRunLock = null;
        this.currentActiveRunId = null;
        resolve();
      };
    });

    return releaseFn;
  }
}

export const providerScheduler = ProviderScheduler.getInstance();
