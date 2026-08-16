import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * robots.txt volgt automatisch de afscherming (zelfde regels als de middleware:
 * SITE_PASSWORD én LIVE_VANAF). Zo kan er geen robots.txt achterblijven die de
 * site onzichtbaar houdt nadat de site zelf al open is.
 *
 * AI-crawlers zijn bewust toegestaan (14_SEO_AI_SEARCH.md §5): een verhuurlocatie
 * wint bij vindbaarheid via AI-assistenten. Wil het bestuur dat niet, dan zijn de
 * regels hieronder het enige dat aangepast hoeft te worden.
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
  const body = isAfgeschermd()
    ? `# Site is nog niet openbaar.\nUser-agent: *\nDisallow: /\n`
    : `User-agent: *
Allow: /
Disallow: /api/
Disallow: /vrienden/
Disallow: /admin

# AI-crawlers expliciet toegestaan
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

Sitemap: https://kerkjepersingen.nl/sitemap.xml
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
