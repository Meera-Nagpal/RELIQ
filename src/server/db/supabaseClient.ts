/* ============================================================
   RELIQ — Supabase Client & Connection Manager
   
   Provides:
   - Singleton admin client with service_role privileges
   - Per-request authenticated user client scoped to user JWT
   - Safe environment variable resolution with no secret exposure
   - Health check and connectivity probes
   ============================================================ */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseAdmin: SupabaseClient | null = null;

export function getSupabaseUrl(): string | null {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || null;
}

export function getSupabaseServiceRoleKey(): string | null {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    null
  );
}

export function getSupabaseAnonKey(): string | null {
  return (
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    null
  );
}

/**
 * Returns true if Supabase URL and service role or anon key are present.
 */
export function isSupabaseConfigured(): boolean {
  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey() || getSupabaseAnonKey();
  return Boolean(url && key);
}

/**
 * Returns true if Supabase is the active database driver.
 * Returns true when RELIQ_DB_DRIVER=supabase_postgresql or when Supabase credentials are configured,
 * unless RELIQ_DB_DRIVER is explicitly set to 'sqlite' (local development & automated tests).
 */
export function isSupabaseDriverActive(): boolean {
  if (process.env.RELIQ_DB_DRIVER === 'sqlite') {
    return false;
  }
  if (process.env.RELIQ_DB_DRIVER === 'supabase_postgresql' || process.env.RELIQ_DB_DRIVER === 'supabase') {
    return true;
  }
  return isSupabaseConfigured();
}

/**
 * Returns the singleton Supabase admin client with service-role permissions.
 * Throws an error if Supabase credentials are not configured.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (supabaseAdmin) return supabaseAdmin;

  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey() || getSupabaseAnonKey();

  if (!url || !key) {
    throw new Error(
      '[RELIQ Supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Ensure they are set in environment.'
    );
  }

  supabaseAdmin = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: {
      schema: 'public',
    },
  });

  return supabaseAdmin;
}

/**
 * Creates an authenticated Supabase client scoped to an incoming user's JWT Bearer token.
 */
export function getSupabaseUserClient(bearerToken?: string): SupabaseClient {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey() || getSupabaseServiceRoleKey();

  if (!url || !anonKey) {
    return getSupabaseAdmin();
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: bearerToken
      ? {
          headers: {
            Authorization: bearerToken.startsWith('Bearer ') ? bearerToken : `Bearer ${bearerToken}`,
          },
        }
      : undefined,
  });
}

/**
 * Validates connectivity to the Supabase PostgreSQL database.
 */
export async function testSupabaseConnection(): Promise<{
  connected: boolean;
  latencyMs: number;
  error?: string;
}> {
  if (!isSupabaseConfigured()) {
    return {
      connected: false,
      latencyMs: 0,
      error: 'Supabase credentials not configured in environment',
    };
  }

  const start = Date.now();
  try {
    const client = getSupabaseAdmin();
    // Test query against projects table
    const { error } = await client.from('projects').select('id', { count: 'exact', head: true });

    if (error) {
      // If table doesn't exist yet, but REST API responded, check rest root
      if (error.code === 'PGRST204' || error.code === '42P01') {
        return {
          connected: true,
          latencyMs: Date.now() - start,
          error: 'Supabase connected, but tables need migration (schema not yet initialized)',
        };
      }
      return {
        connected: false,
        latencyMs: Date.now() - start,
        error: error.message,
      };
    }

    return {
      connected: true,
      latencyMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: err?.message || String(err),
    };
  }
}
