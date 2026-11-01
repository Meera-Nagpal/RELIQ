/* ============================================================
   RELIQ — Evaluation Caching Engine
   
   Provides deterministic caching of model responses and evaluation scores:
   - In-memory fast LRU cache
   - Persistent backend cache via Supabase / SQLite
   - SHA-256 cryptographic cache keys
   - Token & cost preservation
   - Configurable TTL and cache bypass options
   ============================================================ */

import crypto from 'crypto';
import type { ModelRequest, ModelResponse } from '../providers/types';
import { isSupabaseConfigured, isSupabaseDriverActive } from '../server/db/supabaseClient';
import { supabaseRepository } from '../server/db/supabaseRepository';
import { getDatabase } from '../server/db/database';

export interface CacheEntry {
  response: ModelResponse;
  cachedAt: number;
}

export class EvaluationCache {
  private memoryCache = new Map<string, CacheEntry>();
  // Bounded in-memory cache to strictly preserve Render's 512 MB memory limit
  private maxMemoryEntries = process.env.NODE_ENV === 'production' ? 150 : 500;
  private ttlMs = 30 * 60 * 1000; // 30 minutes in-memory TTL

  /**
   * Generates a deterministic SHA-256 cache key from request parameters.
   */
  computeCacheKey(req: ModelRequest): string {
    const raw = JSON.stringify({
      provider: req.metadata?.provider || 'unknown',
      model: req.modelIdentifier,
      input: req.input,
      systemPrompt: req.systemPrompt || '',
      temperature: req.temperature ?? 0.2,
      maxTokens: req.maxTokens ?? 2048,
      reasoningEffort: req.reasoningEffort || '',
    });
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Retrieves a cached model response if available.
   */
  async get(req: ModelRequest, bypass = false): Promise<ModelResponse | null> {
    if (bypass) return null;
    const key = this.computeCacheKey(req);

    // 1. In-memory check with TTL expiration
    const mem = this.memoryCache.get(key);
    if (mem) {
      if (Date.now() - mem.cachedAt < this.ttlMs) {
        return {
          ...mem.response,
          usage: {
            ...mem.response.usage,
            cachedTokens: (mem.response.usage.cachedTokens || 0) + (mem.response.usage.totalTokens || 0),
            latencyMs: 1, // Cached response is instantaneous
          },
        };
      } else {
        this.memoryCache.delete(key);
      }
    }

    // 2. Persistent storage check
    // In production Supabase mode, NEVER invoke SQLite
    if (isSupabaseDriverActive()) {
      if (isSupabaseConfigured()) {
        try {
          const row = await supabaseRepository.getCachedResponse(key);
          if (row) {
            const resp: ModelResponse = {
              output: row.responseText,
              usage: {
                ...(row.usage || {}),
                model: req.modelIdentifier,
                provider: req.metadata?.provider || 'cached',
                latencyMs: 1,
              },
              isDemoMode: false,
            };
            this.setMemory(key, resp);
            return resp;
          }
        } catch {
          // Non-blocking persistent cache lookup error
        }
      }
      return null;
    }

    // SQLite local fallback only
    try {
      const db = getDatabase();
      // Check if sqlite table exists
      const exists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='evaluation_cache'")
        .get();
      if (exists) {
        const row = db
          .prepare('SELECT response_text, usage_json, latency_ms FROM evaluation_cache WHERE cache_key = ?')
          .get(key) as any;
        if (row) {
          const usage = row.usage_json ? JSON.parse(row.usage_json) : {};
          const resp: ModelResponse = {
            output: row.response_text,
            usage: {
              ...usage,
              model: req.modelIdentifier,
              provider: req.metadata?.provider || 'cached',
              latencyMs: 1,
            },
            isDemoMode: false,
          };
          this.setMemory(key, resp);
          return resp;
        }
      }
    } catch {
      // Non-blocking cache lookup error
    }

    return null;
  }

  private setMemory(key: string, resp: ModelResponse) {
    if (this.memoryCache.size >= this.maxMemoryEntries) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) this.memoryCache.delete(firstKey);
    }
    this.memoryCache.set(key, { response: resp, cachedAt: Date.now() });
  }

  /**
   * Stores a model response in memory and persistent storage.
   */
  async set(req: ModelRequest, resp: ModelResponse): Promise<void> {
    // Only cache successful non-empty responses
    if (resp.usage?.error || !resp.output?.trim()) return;

    const key = this.computeCacheKey(req);
    const promptHash = crypto.createHash('sha256').update(req.input).digest('hex').substring(0, 16);

    this.setMemory(key, resp);

    // In production Supabase mode, NEVER invoke SQLite
    if (isSupabaseDriverActive()) {
      if (isSupabaseConfigured()) {
        try {
          await supabaseRepository.setCachedResponse(
            key,
            req.modelIdentifier,
            resp.usage.provider || 'unknown',
            promptHash,
            resp.output,
            resp.usage,
            resp.usage.latencyMs
          );
        } catch {
          // Non-blocking persistent cache write error
        }
      }
      return;
    }

    // SQLite local fallback only
    try {
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS evaluation_cache (
          cache_key TEXT PRIMARY KEY,
          model TEXT NOT NULL,
          provider TEXT NOT NULL,
          prompt_hash TEXT NOT NULL,
          response_text TEXT NOT NULL,
          usage_json TEXT,
          latency_ms REAL,
          created_at TEXT NOT NULL
        );
      `);
      db.prepare(`
        INSERT OR REPLACE INTO evaluation_cache (
          cache_key, model, provider, prompt_hash, response_text, usage_json, latency_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        key,
        req.modelIdentifier,
        resp.usage.provider || 'unknown',
        promptHash,
        resp.output,
        JSON.stringify(resp.usage),
        resp.usage.latencyMs,
        new Date().toISOString()
      );
    } catch {
      // Non-blocking persistent cache write error
    }
  }

  /**
   * Clears the in-memory cache to release heap.
   */
  clearMemory(): void {
    this.memoryCache.clear();
  }

  /**
   * Returns current memory cache entry count.
   */
  getMemoryEntryCount(): number {
    return this.memoryCache.size;
  }
}

export const evaluationCache = new EvaluationCache();
