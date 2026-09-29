/**
 * Publieke projectgegevens voor /beheer.
 * De publishable key hoort in de browser te mogen; RLS beperkt de data.
 * De service-role key staat hier bewust niet — die blijft een Vercel-secret.
 */

export const STANDAARD_SUPABASE_URL = 'https://xskqpefeumylrticrphp.supabase.co';
export const STANDAARD_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Xygy4sCKoWc7WJc3Wh1PWQ_io5qJrph';
export const STANDAARD_SUPER_ADMIN_EMAIL = 'nhoevenaars@gmail.com';

export function supabaseLoginUitOmgeving(
  env: Record<string, unknown>,
  gebruikStandaard = false,
): { url: string; publishableKey: string } | null {
  const url = eerste(
    env.SUPABASE_URL,
    env.PUBLIC_SUPABASE_URL,
    gebruikStandaard ? STANDAARD_SUPABASE_URL : '',
  );
  const publishableKey = eerste(
    env.SUPABASE_PUBLISHABLE_KEY,
    env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    env.SUPABASE_ANON_KEY,
    env.PUBLIC_SUPABASE_ANON_KEY,
    gebruikStandaard ? STANDAARD_SUPABASE_PUBLISHABLE_KEY : '',
  );
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

function eerste(...waarden: unknown[]): string {
  for (const waarde of waarden) {
    const tekst = String(waarde ?? '').trim();
    if (tekst) return tekst;
  }
  return '';
}
