/* ============================================================
   RELIQ — Server-Side Provider Request Scheduler & Rate Limiter
   
   Provides:
   - Per-provider serialized request queues with configurable minimum inter-request delay
   - Independent queues: Gemini pacing never delays Groq requests
   - Cooldown and quota exhaustion tracking with Retry-After and RPC RetryInfo
   - Pre-flight quota check to prevent doomed evaluation runs
   - Evaluation run lock to prevent concurrent runs from competing for provider quota
   ============================================================ */

import { parseDurationHeaderMs, getApiKey } from './serverUtils';

export type ProviderQuotaStatus = 'AVAILABLE' | 'COOLING_DOWN' | 'QUOTA_EXHAUSTED';

export interface ProviderRateLimitState {
  providerId: string;
  status: ProviderQuotaStatus;
  configured?: boolean;
  isConfigured?: boolean;
  coolingDownUntil: number; // Unix timestamp ms
  cooldownRemainingMs: number;
  lastRequestTime: number;
  minDelayMs: number;
  maxConcurrency?: number;
  activeRequests?: number;
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

interface BucketRuntimeState {
  activeCount: number;
  maxConcurrency: number;
  waiters: Array<() => void>;
  admissionQueue: Promise<void>;
  lastRequestTime: number;
  adaptiveWaitUntil: number;
  remainingTokens?: number;
  recentAdmissions: number[];
  rpmTokens: number;
  lastRpmRefillTime: number;
}

export class ProviderScheduler {
  private static instance: ProviderScheduler;

  // Provider states keyed by provider identifier (e.g. 'google', 'groq', 'openai', 'anthropic')
  private states = new Map<string, ProviderRateLimitState>();

  // Per-bucket runtime state (keyed by provider or provider:model)
  private buckets = new Map<string, BucketRuntimeState>();

  // Provider-level concurrency gate (controls total active requests across models sharing the same API key)
  private providerWaiters = new Map<string, Array<() => void>>();
  private providerActiveCounts = new Map<string, number>();

  // Mutex for evaluation runs to prevent concurrent runs from consuming quota simultaneously
  private activeRunLock: Promise<void> | null = null;
  private currentActiveRunId: string | null = null;

  constructor() {
    // Initialize default known providers
    this.initProvider('google', this.resolveMinDelay('google', 4000), this.resolveMaxConcurrency('google', 4));
    this.initProvider('groq', this.resolveMinDelay('groq', 0), this.resolveMaxConcurrency('groq', 8));
    this.initProvider('cerebras', this.resolveMinDelay('cerebras', 0), this.resolveMaxConcurrency('cerebras', 8));
    this.initProvider('openai', this.resolveMinDelay('openai', 100), this.resolveMaxConcurrency('openai', 8));
    this.initProvider('anthropic', this.resolveMinDelay('anthropic', 100), this.resolveMaxConcurrency('anthropic', 6));
  }

  public static getInstance(): ProviderScheduler {
    if (!ProviderScheduler.instance) {
      ProviderScheduler.instance = new ProviderScheduler();
    }
    return ProviderScheduler.instance;
  }

  private resolveMinDelay(provider: string, defaultMs: number): number {
    if (typeof process === 'undefined' || !process.env) return defaultMs;

    const norm = this.normalizeProvider(provider);
    // Check specific provider env (e.g. GEMINI_MIN_DELAY_MS, GROQ_MIN_DELAY_MS, GOOGLE_MIN_DELAY_MS)
    const candidateKeys = [
      `${norm.toUpperCase()}_MIN_DELAY_MS`,
      `${provider.toUpperCase()}_MIN_DELAY_MS`,
    ];
    if (norm === 'google') {
      candidateKeys.push('GEMINI_MIN_DELAY_MS', 'GOOGLE_MIN_DELAY_MS');
    }

    for (const key of candidateKeys) {
      if (process.env[key]) {
        const parsed = parseInt(process.env[key]!, 10);
        if (!isNaN(parsed) && parsed >= 0) return parsed;
      }
    }

    // Check global default env PROVIDER_REQUEST_DELAY_MS
    if (process.env.PROVIDER_REQUEST_DELAY_MS) {
      const parsed = parseInt(process.env.PROVIDER_REQUEST_DELAY_MS, 10);
      if (!isNaN(parsed) && parsed >= 0) return parsed;
    }

    return defaultMs;
  }

  private resolveMaxConcurrency(provider: string, defaultMax: number): number {
    if (typeof process === 'undefined' || !process.env) return defaultMax;

    const norm = this.normalizeProvider(provider);
    const candidateKeys = [
      `${norm.toUpperCase()}_MAX_CONCURRENCY`,
      `${provider.toUpperCase()}_MAX_CONCURRENCY`,
    ];
    if (norm === 'google') {
      candidateKeys.push('GEMINI_MAX_CONCURRENCY', 'GOOGLE_MAX_CONCURRENCY');
    }

    for (const key of candidateKeys) {
      if (process.env[key]) {
        const parsed = parseInt(process.env[key]!, 10);
        if (!isNaN(parsed) && parsed >= 1) return parsed;
      }
    }

    // Fall back to global EVALUATION_CONCURRENCY if configured
    if (process.env.EVALUATION_CONCURRENCY) {
      const parsed = parseInt(process.env.EVALUATION_CONCURRENCY, 10);
      if (!isNaN(parsed) && parsed >= 1) return parsed;
    }

    return defaultMax;
  }

  public initProvider(providerId: string, minDelayMs: number, maxConcurrency?: number): void {
    const norm = this.normalizeProvider(providerId);
    const resolvedMax = maxConcurrency ?? this.resolveMaxConcurrency(norm, norm === 'google' ? 4 : 8);
    if (!this.states.has(norm)) {
      this.states.set(norm, {
        providerId: norm,
        status: 'AVAILABLE',
        coolingDownUntil: 0,
        cooldownRemainingMs: 0,
        lastRequestTime: 0,
        minDelayMs,
        maxConcurrency: resolvedMax,
        activeRequests: 0,
        consecutiveRateLimits: 0,
        totalRequests: 0,
        totalRateLimits: 0,
      });
    } else {
      const state = this.states.get(norm)!;
      state.minDelayMs = minDelayMs;
      if (maxConcurrency !== undefined) {
        state.maxConcurrency = maxConcurrency;
      }
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

  private getBucketKey(normProvider: string, modelId?: string): string {
    if (!modelId) return normProvider;
    const cleanModel = String(modelId).toLowerCase().trim();
    return cleanModel ? `${normProvider}:${cleanModel}` : normProvider;
  }

  private getOrCreateBucket(bucketKey: string, maxConcurrency: number): BucketRuntimeState {
    let effectiveMax = maxConcurrency;
    // Strict concurrency limit for Qwen models on Groq to prevent exceeding the 1,000 OTPM rate limit
    if (bucketKey.toLowerCase().includes('qwen')) {
      effectiveMax = Math.min(2, maxConcurrency);
    }
    let bucket = this.buckets.get(bucketKey);
    if (!bucket) {
      bucket = {
        activeCount: 0,
        maxConcurrency: effectiveMax,
        waiters: [],
        admissionQueue: Promise.resolve(),
        lastRequestTime: 0,
        adaptiveWaitUntil: 0,
        remainingTokens: undefined,
        recentAdmissions: [],
        rpmTokens: 30,
        lastRpmRefillTime: Date.now(),
      };
      this.buckets.set(bucketKey, bucket);
    } else {
      bucket.maxConcurrency = effectiveMax;
    }
    return bucket;
  }

  public getBucketRemainingTokens(providerId: string, modelId?: string): number | undefined {
    const norm = this.normalizeProvider(providerId);
    const bucketKey = this.getBucketKey(norm, modelId);
    const bucket = this.buckets.get(bucketKey);
    if (!bucket || bucket.remainingTokens === undefined) return undefined;
    // Estimate token bucket replenishment since last update (~120 tokens/sec on Groq 8,000 TPM)
    const elapsedSec = Math.max(0, (Date.now() - bucket.lastRequestTime) / 1000);
    return Math.min(8000, bucket.remainingTokens + Math.floor(elapsedSec * 120));
  }

  public getBucketRecentAdmissionCount(providerId: string, modelId?: string, windowMs = 60000): number {
    const norm = this.normalizeProvider(providerId);
    const bucketKey = this.getBucketKey(norm, modelId);
    const bucket = this.buckets.get(bucketKey);
    if (!bucket) return 0;
    const cutoff = Date.now() - windowMs;
    return bucket.recentAdmissions.filter((ts) => ts > cutoff).length;
  }

  public getBucketActiveCount(providerId: string, modelId?: string): number {
    const norm = this.normalizeProvider(providerId);
    const bucketKey = this.getBucketKey(norm, modelId);
    const bucket = this.buckets.get(bucketKey);
    return bucket ? bucket.activeCount : 0;
  }

  /**
   * Updates per-model/provider token-bucket telemetry from response headers so the scheduler
   * can proactively pace requests right before a token bucket runs dry instead of hitting 429s.
   */
  public updateRateLimitInfo(
    providerId: string,
    modelId: string | undefined,
    rateLimit?: {
      limitRequests?: number | string;
      remainingRequests?: number | string;
      resetRequests?: string;
      limitTokens?: number | string;
      remainingTokens?: number | string;
      resetTokens?: string;
      retryAfter?: string;
    }
  ): void {
    if (!rateLimit) return;
    const norm = this.normalizeProvider(providerId);
    const state = this.states.get(norm);
    const bucketKey = this.getBucketKey(norm, modelId);
    const bucket = this.getOrCreateBucket(bucketKey, state?.maxConcurrency || 8);

    const isQwen = bucketKey.toLowerCase().includes('qwen');
    const remTokens = rateLimit.remainingTokens !== undefined ? Number(rateLimit.remainingTokens) : NaN;
    const parsedResetMs = rateLimit.resetTokens ? parseDurationHeaderMs(rateLimit.resetTokens) : 0;
    const parsedRetryAfterMs = rateLimit.retryAfter ? parseDurationHeaderMs(rateLimit.retryAfter) : 0;
    const effectiveResetMs = Math.max(parsedResetMs, parsedRetryAfterMs);

    if (!isNaN(remTokens)) {
      bucket.remainingTokens = remTokens;
      // Stricter token buffer for Qwen (strict 1,000 OTPM limit on Groq)
      const tokenThreshold = isQwen ? 1200 : 1000;
      if (remTokens < tokenThreshold) {
        let waitMs = 0;
        if (effectiveResetMs > 0) {
          waitMs = effectiveResetMs + Math.floor(Math.random() * 300 + 100);
        } else {
          waitMs = isQwen
            ? 1500
            : (remTokens < 500 ? Math.min(1800, Math.max(350, Math.ceil(((650 - remTokens) / 133) * 1000))) : 200);
        }
        bucket.adaptiveWaitUntil = Math.max(bucket.adaptiveWaitUntil, Date.now() + waitMs);
      }
    } else if (effectiveResetMs > 0) {
      bucket.adaptiveWaitUntil = Math.max(bucket.adaptiveWaitUntil, Date.now() + effectiveResetMs + Math.floor(Math.random() * 300 + 100));
    }
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

    // Cooldown has expired, auto-restore status if it was cooling down or quota exhausted
    if (state.status === 'COOLING_DOWN' || state.status === 'QUOTA_EXHAUSTED') {
      state.status = 'AVAILABLE';
      state.coolingDownUntil = 0;
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
    details?: { quotaMetric?: string; quotaId?: string; isDailyExhausted?: boolean; modelId?: string }
  ): void {
    const norm = this.normalizeProvider(providerId);
    if (!this.states.has(norm)) {
      this.initProvider(norm, this.resolveMinDelay(norm, norm === 'google' ? 4000 : 0));
    }
    const state = this.states.get(norm)!;

    const safeSec = Math.max(1, Math.min(180, cooldownSec || 60));
    // Apply controlled jitter to backoff so parallel workers do not collide upon waking
    const jitterMs = Math.floor(Math.random() * 400 + 100);
    const cooldownUntil = Date.now() + safeSec * 1000 + jitterMs;

    if (details?.modelId) {
      const bucketKey = this.getBucketKey(norm, details.modelId);
      const bucket = this.getOrCreateBucket(bucketKey, state.maxConcurrency || 8);
      bucket.adaptiveWaitUntil = Math.max(bucket.adaptiveWaitUntil, cooldownUntil);
      bucket.rpmTokens = Math.min(bucket.rpmTokens, 2);
      bucket.lastRpmRefillTime = Date.now();
    } else {
      state.coolingDownUntil = cooldownUntil;
    }

    state.consecutiveRateLimits++;
    state.totalRateLimits++;
    state.lastError = errorMessage;

    if (details?.quotaMetric) state.quotaMetric = details.quotaMetric;
    if (details?.quotaId) state.quotaId = details.quotaId;

    if (details?.isDailyExhausted || details?.quotaId?.includes('PerDay')) {
      state.status = 'QUOTA_EXHAUSTED';
      state.coolingDownUntil = cooldownUntil;
    } else if (!details?.modelId) {
      state.status = 'COOLING_DOWN';
    }

    console.warn(
      `[RELIQ ProviderScheduler] Recorded ${state.status} on ${norm}${details?.modelId ? ` (${details.modelId})` : ''}: cooldown ${safeSec}s. (Consecutive: ${state.consecutiveRateLimits}, Metric: ${state.quotaMetric || 'default'})`
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
    for (const [key, bucket] of this.buckets.entries()) {
      if (key === norm || key.startsWith(`${norm}:`)) {
        bucket.adaptiveWaitUntil = 0;
        bucket.recentAdmissions = [];
        bucket.rpmTokens = 30;
        bucket.lastRpmRefillTime = Date.now();
        bucket.remainingTokens = undefined;
      }
    }
  }

  /**
   * Checks whether the given provider has an API key configured in the environment.
   */
  public isProviderConfigured(providerId: string): boolean {
    const norm = this.normalizeProvider(providerId);
    if (norm === 'google' || norm === 'gemini') {
      return Boolean(getApiKey('GEMINI_API_KEY') || getApiKey('GOOGLE_API_KEY'));
    }
    if (norm === 'groq') return Boolean(getApiKey('GROQ_API_KEY'));
    if (norm === 'cerebras') return Boolean(getApiKey('CEREBRAS_API_KEY'));
    if (norm === 'openai') return Boolean(getApiKey('OPENAI_API_KEY'));
    if (norm === 'anthropic') return Boolean(getApiKey('ANTHROPIC_API_KEY'));
    if (norm === 'demo' || norm === 'test') return true;
    return false;
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
    const isConfigured = this.isProviderConfigured(norm);

    const now = Date.now();
    const remainingMs = Math.max(0, state.coolingDownUntil - now);

    // Auto-clear cooldown if time has passed
    let status = state.status;
    if (remainingMs === 0 && (status === 'COOLING_DOWN' || status === 'QUOTA_EXHAUSTED')) {
      status = 'AVAILABLE';
      state.status = 'AVAILABLE';
      state.coolingDownUntil = 0;
    }

    return {
      ...state,
      status,
      configured: isConfigured,
      isConfigured,
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
    result['gemini'] = result['google'];
    return result;
  }

  private resolveProviderMaxConcurrency(norm: string): number {
    if (norm === 'groq') {
      const custom = process.env.GROQ_GLOBAL_MAX_CONCURRENCY || process.env.GROQ_MAX_CONCURRENCY;
      if (custom) {
        const parsed = parseInt(custom, 10);
        if (!isNaN(parsed) && parsed >= 1) return parsed;
      }
      return 2; // Safe global concurrency cap across all Groq buckets to avoid quota exhaustion on shared API key
    }
    const state = this.states.get(norm);
    return state?.maxConcurrency || 8;
  }

  private async acquireProviderSlot(norm: string): Promise<void> {
    const max = this.resolveProviderMaxConcurrency(norm);
    const active = this.providerActiveCounts.get(norm) || 0;
    if (active < max) {
      this.providerActiveCounts.set(norm, active + 1);
      return;
    }
    let waiters = this.providerWaiters.get(norm);
    if (!waiters) {
      waiters = [];
      this.providerWaiters.set(norm, waiters);
    }
    await new Promise<void>((resolve) => {
      waiters!.push(resolve);
    });
    this.providerActiveCounts.set(norm, (this.providerActiveCounts.get(norm) || 0) + 1);
  }

  private releaseProviderSlot(norm: string): void {
    const cur = this.providerActiveCounts.get(norm) || 1;
    this.providerActiveCounts.set(norm, Math.max(0, cur - 1));
    const max = this.resolveProviderMaxConcurrency(norm);
    const waiters = this.providerWaiters.get(norm);
    if (waiters && waiters.length > 0 && (this.providerActiveCounts.get(norm) || 0) < max) {
      const next = waiters.shift()!;
      next();
    }
  }

  private async acquireConcurrencySlot(bucket: BucketRuntimeState): Promise<void> {
    if (bucket.activeCount < bucket.maxConcurrency) {
      bucket.activeCount++;
      return;
    }
    await new Promise<void>((resolve) => {
      bucket.waiters.push(resolve);
    });
    bucket.activeCount++;
  }

  private releaseConcurrencySlot(bucket: BucketRuntimeState): void {
    bucket.activeCount = Math.max(0, bucket.activeCount - 1);
    if (bucket.waiters.length > 0 && bucket.activeCount < bucket.maxConcurrency) {
      const next = bucket.waiters.shift()!;
      next();
    }
  }

  /**
   * Schedules a task with bounded concurrency per provider/model bucket,
   * admission-gate inter-request pacing (minDelayMs), and adaptive token-bucket cooldowns.
   */
  public async schedule<T>(providerId: string, taskFn: () => Promise<T>, modelId?: string): Promise<T> {
    const norm = this.normalizeProvider(providerId);
    if (!this.states.has(norm)) {
      this.initProvider(norm, this.resolveMinDelay(norm, norm === 'google' ? 4000 : 0));
    }
    const state = this.states.get(norm)!;
    const bucketKey = this.getBucketKey(norm, modelId);
    const bucket = this.getOrCreateBucket(bucketKey, state.maxConcurrency || 8);

    // 1. Acquire provider-wide concurrency slot (prevents shared API key quota exhaustion across models)
    await this.acquireProviderSlot(norm);

    try {
      // 2. Acquire concurrency slot for this specific provider/model bucket
      await this.acquireConcurrencySlot(bucket);

      try {
        // 3. Pass through the bucket's admission gate to respect cooldowns, adaptive pacing, and minDelayMs
        let releaseAdmission: () => void = () => {};
        const prevAdmission = bucket.admissionQueue;
        bucket.admissionQueue = new Promise<void>((resolve) => {
          releaseAdmission = resolve;
        });

        await prevAdmission;
        try {
          // Wait for provider-wide or model-specific cooldown
          const now = Date.now();
          const cooldownTarget = Math.max(state.coolingDownUntil, bucket.adaptiveWaitUntil);
          if (cooldownTarget > now) {
            const waitMs = cooldownTarget - now;
            await new Promise((r) => setTimeout(r, waitMs));
          }

          // Model-specific pacing for Qwen on Groq: adaptive token-headroom protection
          const isQwen = bucketKey.toLowerCase().includes('qwen');
          if (norm === 'groq' && isQwen) {
            const qwenElapsed = Date.now() - bucket.lastRequestTime;
            // Only apply extended spacing if remaining tokens are critically low (<800)
            const minQwenSpacing = (bucket.remainingTokens !== undefined && bucket.remainingTokens < 800) ? 800 : 180;
            if (bucket.lastRequestTime > 0 && qwenElapsed < minQwenSpacing) {
              const qwenWait = minQwenSpacing - qwenElapsed + Math.floor(Math.random() * 20);
              await new Promise((r) => setTimeout(r, qwenWait));
            }
          }

          // Continuous-time virtual token bucket for per-model Groq requests:
          // Allows burst throughput for 27-case suites while maintaining steady-state pacing
          if (norm === 'groq' && modelId && state.minDelayMs === 0) {
            const nowBeforeWait = Date.now();
            const winCutoff = nowBeforeWait - 60000;
            bucket.recentAdmissions = bucket.recentAdmissions.filter((ts) => ts > winCutoff);

            const elapsedRefillSec = Math.max(0, (nowBeforeWait - bucket.lastRpmRefillTime) / 1000);
            bucket.rpmTokens = Math.min(30, bucket.rpmTokens + elapsedRefillSec * 1.0);
            bucket.lastRpmRefillTime = nowBeforeWait;

            let targetSpacingMs = 0;
            if (bucket.rpmTokens > 12) {
              targetSpacingMs = 0;
            } else if (bucket.rpmTokens > 5) {
              targetSpacingMs = 30;
            } else if (bucket.rpmTokens > 2) {
              targetSpacingMs = 90;
            } else {
              targetSpacingMs = 200;
            }

            if (bucket.lastRequestTime > 0 && targetSpacingMs > 0) {
              const sinceLastBucketMs = Date.now() - bucket.lastRequestTime;
              if (sinceLastBucketMs < targetSpacingMs) {
                await new Promise((r) => setTimeout(r, targetSpacingMs - sinceLastBucketMs));
              }
            }

            const nowAfterWait = Date.now();
            const waitRefillSec = Math.max(0, (nowAfterWait - bucket.lastRpmRefillTime) / 1000);
            bucket.rpmTokens = Math.max(0, Math.min(30, bucket.rpmTokens + waitRefillSec * 1.0) - 1);
            bucket.lastRpmRefillTime = nowAfterWait;
          }

          // Enforce minimum inter-request delay since last request in this bucket/provider
          const refLastTime = Math.max(state.lastRequestTime, bucket.lastRequestTime);
          const elapsedSinceLast = Date.now() - refLastTime;
          if (state.minDelayMs > 0 && elapsedSinceLast < state.minDelayMs) {
            const pacingWait = state.minDelayMs - elapsedSinceLast;
            await new Promise((r) => setTimeout(r, pacingWait));
          }

          const admitTs = Date.now();
          state.lastRequestTime = admitTs;
          bucket.lastRequestTime = admitTs;
          bucket.recentAdmissions.push(admitTs);
          state.totalRequests++;
          state.activeRequests = (state.activeRequests || 0) + 1;
        } finally {
          releaseAdmission();
        }

        // 4. Execute task concurrently outside the admission lock
        const result = await taskFn();
        this.recordSuccess(norm);
        return result;
      } finally {
        state.activeRequests = Math.max(0, (state.activeRequests || 1) - 1);
        this.releaseConcurrencySlot(bucket);
      }
    } finally {
      this.releaseProviderSlot(norm);
    }
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
      await new Promise((r) => setTimeout(r, 250));
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
