/**
 * SEO- en GEO-gegevens die op meerdere plekken hetzelfde moeten zijn:
 * JSON-LD in Base.astro, Event-markup op agenda-detail, en llms.txt.
 *
 * Coördinaten: OpenStreetMap/Nominatim voor Persingensestraat 7, Persingen
 * (place_id 110103022). Adres gelijk aan wat op /organisatie/ en in de footer staat.
 */

import { eindVoorWeergave } from './datum.ts';

export const SITE_URL = 'https://kerkjepersingen.nl';

export const FACEBOOK_URL =
  'https://www.facebook.com/profile.php?id=100082161927118&locale=nl_NL';

export const VENUE = {
  name: 'Kerkje van Persingen',
  description:
    'Rijksmonumentaal kerkje uit circa 1350 in de Ooijpolder, te huur voor bruiloften, exposities, concerten en bijeenkomsten.',
  telephone: '+31652668449',
  image: `${SITE_URL}/og-default.jpg`,
  address: {
    '@type': 'PostalAddress' as const,
    streetAddress: 'Persingensestraat 7',
    postalCode: '6575 JA',
    addressLocality: 'Persingen',
    addressRegion: 'Gelderland',
    addressCountry: 'NL',
  },
  geo: {
    '@type': 'GeoCoordinates' as const,
    latitude: 51.8410785,
    longitude: 5.9175163,
  },
};

/** Breedte/hoogte van public/og-default.jpg — nodig voor consistente social previews. */
export const OG_IMAGE = {
  pad: '/og-default.jpg',
  width: 1200,
  height: 630,
};

/**
 * Canonieke URL met afsluitende slash, gelijk aan de interne links.
 * /contact en /contact/ wijzen zo naar dezelfde URL, zonder redirect.
 */
export function canoniekUrl(pathname: string, site = SITE_URL): string {
  if (!pathname || pathname === '/') return new URL('/', site).href;
  const zonderQuery = pathname.split('?')[0] ?? '/';
  const schoon = zonderQuery.replace(/\/+$/, '');
  if (!schoon) return new URL('/', site).href;
  return new URL(`${schoon}/`, site).href;
}

/** Eén regel voor title en description; CMS-tekst mag geen regeleinden in meta zetten. */
export function metaTekst(waarde: string): string {
  return waarde.replace(/\s+/g, ' ').trim();
}

/** Alleen het vaste social-beeld heeft bekende afmetingen. Andere beelden niet verzinnen. */
export function isStandaardOgBeeld(image: string): boolean {
  if (image === OG_IMAGE.pad) return true;
  try {
    const pad = image.startsWith('http://') || image.startsWith('https://') ? new URL(image).pathname : image;
    return pad === OG_IMAGE.pad;
  } catch {
    return false;
  }
}

/**
 * JSON-LD voor een inline script. `<` wordt geëscapet zodat CMS-tekst
 * de scripttag niet kan sluiten.
 */
export function jsonLdInScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const SITEMAP_SITE = SITE_URL;

function xmlTekst(waarde: string): string {
  return waarde
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Sitemap zonder verzonnen lastmod. Een datum van "vandaag" op elke request
 * is geen wijzigingsdatum en wordt door Google genegeerd of gewantrouwd.
 */
export function bouwSitemap(
  items: { pad: string; prioriteit: string }[],
  site = SITEMAP_SITE,
): string {
  const urls = items
    .map((item) => {
      const loc = xmlTekst(new URL(item.pad, site).href);
      return `  <url>\n    <loc>${loc}</loc>\n    <priority>${xmlTekst(item.prioriteit)}</priority>\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** Paden die niet in de index horen. Zelfde lijst voor elke user-agent. */
export const ROBOTS_PRIVE = ['/api/', '/vrienden/', '/admin', '/beheer', '/klant'] as const;

const AI_CRAWLERS = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended'] as const;

function robotsGroep(userAgent: string): string {
  const regels = ['Allow: /', ...ROBOTS_PRIVE.map((pad) => `Disallow: ${pad}`)];
  return [`User-agent: ${userAgent}`, ...regels].join('\n');
}

/**
 * Openbare robots.txt. Een specifiek User-agent-blok vervangt `*` en neemt
 * die Disallow-regels niet over, dus de privépaden staan in elk blok.
 */
export function robotsBody(afgeschermd: boolean): string {
  if (afgeschermd) {
    return `# Site is nog niet openbaar.\nUser-agent: *\nDisallow: /\n`;
  }

  return [
    robotsGroep('*'),
    '',
    '# AI-crawlers expliciet toegestaan op publieke pagina\'s.',
    '# Privépaden staan per crawler opnieuw: dit blok vervangt de *-regels.',
    '',
    AI_CRAWLERS.map((agent) => robotsGroep(agent)).join('\n\n'),
    '',
    '# Samenvatting voor AI-assistenten',
    '# https://kerkjepersingen.nl/llms.txt',
    '',
    'Sitemap: https://kerkjepersingen.nl/sitemap.xml',
    '',
  ].join('\n');
}

export function venueJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': ['HistoricalLandmark', 'EventVenue'],
    name: VENUE.name,
    description: VENUE.description,
    url: SITE_URL,
    telephone: VENUE.telephone,
    image: VENUE.image,
    address: VENUE.address,
    geo: VENUE.geo,
    hasMap: `https://www.openstreetmap.org/?mlat=${VENUE.geo.latitude}&mlon=${VENUE.geo.longitude}#map=18/${VENUE.geo.latitude}/${VENUE.geo.longitude}`,
    sameAs: [FACEBOOK_URL],
    isAccessibleForFree: false,
    publicAccess: true,
  };
}

const EVENT_TYPE: Record<string, string> = {
  expositie: 'ExhibitionEvent',
  concert: 'MusicEvent',
};

export function eventJsonLd(activiteit: {
  publiekeTitel?: string;
  omschrijving?: string;
  start: string;
  eind?: string;
  soort?: string;
  slug: string;
  imageUrl?: string | null;
}) {
  const naam = activiteit.publiekeTitel ?? 'Activiteit';
  const type = (activiteit.soort && EVENT_TYPE[activiteit.soort]) || 'Event';

  return {
    '@context': 'https://schema.org',
    '@type': type,
    name: naam,
    description:
      activiteit.omschrijving?.slice(0, 300) ??
      `${naam} in het kerkje van Persingen.`,
    startDate: activiteit.start,
    endDate: eindVoorWeergave(activiteit),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    url: `${SITE_URL}/agenda/${activiteit.slug}/`,
    image: activiteit.imageUrl ? absolutiseer(activiteit.imageUrl) : VENUE.image,
    location: {
      '@type': 'EventVenue',
      name: VENUE.name,
      address: VENUE.address,
      geo: VENUE.geo,
    },
    organizer: {
      '@type': 'NGO',
      name: 'Stichting Het Kerkje van Persingen',
      url: `${SITE_URL}/organisatie/`,
    },
  };
}

function absolutiseer(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return new URL(url, SITE_URL).href;
}
