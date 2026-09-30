/**
 * Server-only Supabase-clients voor /beheer.
 * Service-role blijft hier; nooit in client-side code.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';
import type { Database } from './database.types.ts';
import { supabaseLoginUitOmgeving } from './supabase-project.ts';

export interface SupabaseOmgeving {
  url: string;
  publishableKey: string;
  serviceRoleKey: string;
}

export function leesSupabaseOmgeving(env?: Record<string, unknown>): SupabaseOmgeving | null {
  const bron = env ?? (typeof process !== 'undefined' ? process.env : {});
  // Ontbrekende url/key vallen terug op het project Kerkje van Persingen.
  // Een expliciet gezet adres of sleutel blijft leidend.
  const login = supabaseLoginUitOmgeving(bron, true);
  if (!login) return null;
  const serviceRoleKey = String(bron.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  return { url: login.url, publishableKey: login.publishableKey, serviceRoleKey };
}

export function supabaseGeconfigureerd(env?: Record<string, unknown>): boolean {
  return leesSupabaseOmgeving(env) !== null;
}

export function supabaseAdminBeschikbaar(env?: Record<string, unknown>): boolean {
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

export function maakBeheerAdminClient(env?: Record<string, unknown>): SupabaseClient<Database> | null {
  const cfg = leesSupabaseOmgeving(env);
  if (!cfg?.serviceRoleKey) return null;
  return createClient<Database>(cfg.url, cfg.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
