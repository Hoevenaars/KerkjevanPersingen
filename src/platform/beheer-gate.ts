import { beheerZichtbaar } from './bron.ts';

function leesOmgeving(): Record<string, unknown> {
  const runtime = typeof process !== 'undefined' ? process.env : undefined;
  const meta = import.meta.env as Record<string, unknown>;
  // Bracket-notatie: Vite mag process.env.BEHEER_ENABLED niet op build-time
  // naar undefined inlinen, anders blijft Preview eeuwig dicht.
  return {
    BEHEER_ENABLED: runtime?.['BEHEER_ENABLED'] ?? meta.BEHEER_ENABLED,
    VERCEL_ENV: runtime?.['VERCEL_ENV'] ?? meta.VERCEL_ENV,
    DEV: meta.DEV,
  };
}

export function isBeheerEnabled(): boolean {
  return beheerZichtbaar(leesOmgeving());
}

export function beheerUitResponse(): Response {
  return new Response(null, {
    status: 404,
    headers: { 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
