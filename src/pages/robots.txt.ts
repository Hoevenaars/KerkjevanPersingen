import type { APIRoute } from 'astro';
import { robotsBody } from '../lib/seo';

export const prerender = false;

/**
 * robots.txt volgt automatisch de afscherming (zelfde regels als de middleware:
 * SITE_PASSWORD én LIVE_VANAF). Zo kan er geen robots.txt achterblijven die de
 * site onzichtbaar houdt nadat de site zelf al open is.
 *
 * AI-crawlers zijn bewust toegestaan op publieke pagina's (14_SEO_AI_SEARCH.md §5).
 * Hun blok herhaalt de privépaden: een specifiek User-agent-blok vervangt `*`
 * en zou /beheer, /api, /vrienden en /klant anders vrijgeven.
 */
function isAfgeschermd(): boolean {
  const password = process.env.SITE_PASSWORD ?? import.meta.env.SITE_PASSWORD;
  if (!password) return false;

  const liveVanaf = import.meta.env.LIVE_VANAF ?? process.env.LIVE_VANAF;
  if (!liveVanaf) return true;

  const moment = new Date(liveVanaf);
  if (Number.isNaN(moment.getTime())) return true;
  return new Date() < moment;
}

export const GET: APIRoute = () => {
  return new Response(robotsBody(isAfgeschermd()), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
