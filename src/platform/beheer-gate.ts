import { beheerIngeschakeld } from './bron.ts';

export function isBeheerEnabled(): boolean {
  return beheerIngeschakeld({
    BEHEER_ENABLED: process.env.BEHEER_ENABLED ?? import.meta.env.BEHEER_ENABLED,
  });
}

export function beheerUitResponse(): Response {
  return new Response(null, {
    status: 404,
    headers: { 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
