import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * robots.txt volgt automatisch de afscherming.
 * Zolang SITE_PASSWORD gezet is, wordt alles geweerd. Bij livegang (variabele weg)
 * schakelt dit vanzelf om. Zo kan er geen robots.txt achterblijven die de site
 * onzichtbaar houdt.
 *
 * AI-crawlers zijn bewust toegestaan (14_SEO_AI_SEARCH.md §5): een verhuurlocatie
 * wint bij vindbaarheid via AI-assistenten. Wil het bestuur dat niet, dan zijn de
 * regels hieronder het enige dat aangepast hoeft te worden.
 */
export const GET: APIRoute = () => {
  const afgeschermd = Boolean(process.env.SITE_PASSWORD ?? import.meta.env.SITE_PASSWORD);

  const body = afgeschermd
    ? `# Site is nog niet openbaar.\nUser-agent: *\nDisallow: /\n`
    : `User-agent: *
Allow: /
Disallow: /api/

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
