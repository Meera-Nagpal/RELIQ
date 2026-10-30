/* ============================================================
   RELIQ — Supabase Authentication & User Session Routes
   
   Endpoints:
   - POST /api/auth/signup
   - POST /api/auth/signin
   - POST /api/auth/signout
   - GET  /api/auth/me
   - GET  /api/auth/status
   
   SECURITY PROTOCOLS:
   - Password hashes never touch application server; delegated to Supabase Auth.
   - JWT tokens validated via Supabase Auth service.
   - Secrets and service keys never returned to client.
   ============================================================ */

import type { IncomingMessage, ServerResponse } from 'http';
import { parseJsonBody, sendJson } from '../serverUtils';
import { sendError } from './httpUtils';
import { getSupabaseAdmin, getSupabaseUrl, isSupabaseConfigured } from '../db/supabaseClient';

/**
 * Extracts and verifies the authenticated user from the Authorization header.
 * Returns the Supabase User object or null if unauthenticated.
 */
export async function getAuthenticatedUser(req: IncomingMessage): Promise<{
  id: string;
  email?: string;
  role?: string;
} | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7).trim();
  if (!token) return null;

  if (!isSupabaseConfigured()) {
    // If Supabase is not configured, support local token or null
    return null;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return null;
    }
    return {
      id: data.user.id,
      email: data.user.email,
      role: data.user.role,
    };
  } catch {
    return null;
  }
}

export async function handleAuthRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: string
): Promise<boolean> {
  if (!parsedUrl.startsWith('/api/auth')) {
    return false;
  }

  // 1. GET /api/auth/status
  if (req.method === 'GET' && parsedUrl === '/api/auth/status') {
    sendJson(res, 200, {
      enabled: isSupabaseConfigured(),
      provider: isSupabaseConfigured() ? 'supabase' : 'local',
      supabaseUrl: getSupabaseUrl() ? true : false,
    });
    return true;
  }

  // 2. GET /api/auth/me
  if (req.method === 'GET' && (parsedUrl === '/api/auth/me' || parsedUrl === '/api/auth/user')) {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      sendJson(res, 200, {
        authenticated: false,
        user: null,
      });
      return true;
    }

    sendJson(res, 200, {
      authenticated: true,
      user,
    });
    return true;
  }

  // 3. POST /api/auth/signup
  if (req.method === 'POST' && parsedUrl === '/api/auth/signup') {
    if (!isSupabaseConfigured()) {
      sendError(res, 503, 'AUTHENTICATION_UNAVAILABLE', 'Supabase authentication is not configured in this environment.');
      return true;
    }

    try {
      const body = await parseJsonBody<{ email?: string; password?: string; name?: string }>(req);
      if (!body.email || !body.password) {
        sendError(res, 400, 'INVALID_CREDENTIALS', 'Email and password are required.');
        return true;
      }

      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.auth.signUp({
        email: body.email,
        password: body.password,
        options: {
          data: { name: body.name },
        },
      });

      if (error) {
        sendError(res, 400, 'SIGNUP_FAILED', error.message);
        return true;
      }

      sendJson(res, 201, {
        user: data.user
          ? {
              id: data.user.id,
              email: data.user.email,
            }
          : null,
        session: data.session
          ? {
              accessToken: data.session.access_token,
              expiresAt: data.session.expires_at,
            }
          : null,
        message: 'Account created successfully.',
      });
      return true;
    } catch (err: any) {
      sendError(res, 500, 'SIGNUP_ERROR', err?.message || 'Failed to process signup request.');
      return true;
    }
  }

  // 4. POST /api/auth/signin
  if (req.method === 'POST' && parsedUrl === '/api/auth/signin') {
    if (!isSupabaseConfigured()) {
      sendError(res, 503, 'AUTHENTICATION_UNAVAILABLE', 'Supabase authentication is not configured in this environment.');
      return true;
    }

    try {
      const body = await parseJsonBody<{ email?: string; password?: string }>(req);
      if (!body.email || !body.password) {
        sendError(res, 400, 'INVALID_CREDENTIALS', 'Email and password are required.');
        return true;
      }

      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: body.email,
        password: body.password,
      });

      if (error) {
        sendError(res, 401, 'INVALID_LOGIN', error.message);
        return true;
      }

      sendJson(res, 200, {
        user: {
          id: data.user.id,
          email: data.user.email,
        },
        session: {
          accessToken: data.session.access_token,
          expiresAt: data.session.expires_at,
        },
      });
      return true;
    } catch (err: any) {
      sendError(res, 500, 'SIGNIN_ERROR', err?.message || 'Failed to process signin request.');
      return true;
    }
  }

  // 5. POST /api/auth/signout
  if (req.method === 'POST' && parsedUrl === '/api/auth/signout') {
    sendJson(res, 200, {
      success: true,
      message: 'Signed out successfully.',
    });
    return true;
  }

  return false;
}
