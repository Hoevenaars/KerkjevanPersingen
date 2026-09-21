/**
 * Server-only Supabase-clients voor /beheer.
 * Service-role blijft hier; nooit in client-side code.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

export interface SupabaseOmgeving {
  url: string;
  publishableKey: string;
  serviceRoleKey: string;
}

export function leesSupabaseOmgeving(
  env: Record<string, unknown> = typeof process !== 'undefined' ? process.env : {},
): SupabaseOmgeving | null {
  const url = String(env.SUPABASE_URL ?? env.PUBLIC_SUPABASE_URL ?? '').trim();
  const publishableKey = String(
    env.SUPABASE_PUBLISHABLE_KEY ??
      env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      env.SUPABASE_ANON_KEY ??
      env.PUBLIC_SUPABASE_ANON_KEY ??
      '',
  ).trim();
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !publishableKey) return null;
  return { url, publishableKey, serviceRoleKey };
}

export function supabaseGeconfigureerd(
  env: Record<string, unknown> = typeof process !== 'undefined' ? process.env : {},
): boolean {
  return leesSupabaseOmgeving(env) !== null;
}

export function supabaseAdminBeschikbaar(
  env: Record<string, unknown> = typeof process !== 'undefined' ? process.env : {},
): boolean {
  const cfg = leesSupabaseOmgeving(env);
  return Boolean(cfg?.serviceRoleKey);
}

export function maakBeheerServerClient(opties: {
  request: Request;
  cookies: AstroCookies;
  env?: Record<string, unknown>;
  responseHeaders?: Headers;
}): SupabaseClient | null {
  const cfg = leesSupabaseOmgeving(opties.env);
  if (!cfg) return null;
  const extra = opties.responseHeaders;

  return createServerClient(cfg.url, cfg.publishableKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(opties.request.headers.get('Cookie') ?? '');
      },
      setAll(cookiesToSet, headers) {
        for (const cookie of cookiesToSet) {
          opties.cookies.set(cookie.name, cookie.value, cookie.options);
        }
        if (extra && headers) {
          for (const [key, value] of Object.entries(headers)) {
            extra.append(key, value);
          }
        }
      },
    },
  });
}

export function maakBeheerAdminClient(
  env: Record<string, unknown> = typeof process !== 'undefined' ? process.env : {},
): SupabaseClient | null {
  const cfg = leesSupabaseOmgeving(env);
  if (!cfg?.serviceRoleKey) return null;
  return createClient(cfg.url, cfg.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
