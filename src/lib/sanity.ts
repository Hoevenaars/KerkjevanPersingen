import { createClient, type SanityClient } from '@sanity/client';
import imageUrlBuilder from '@sanity/image-url';

const projectId = process.env.SANITY_PROJECT_ID ?? import.meta.env.SANITY_PROJECT_ID;
const dataset = process.env.SANITY_DATASET ?? import.meta.env.SANITY_DATASET ?? 'production';
const token = process.env.SANITY_API_TOKEN ?? import.meta.env.SANITY_API_TOKEN;

export const sanityConfigured = Boolean(projectId);

const client: SanityClient | null = sanityConfigured
  ? createClient({
      projectId: projectId!,
      dataset,
      apiVersion: '2024-10-01',
      useCdn: false,
      token,
    })
  : null;

const builder = client ? imageUrlBuilder(client) : null;

/** Beeldverwerking gebeurt bij Sanity, niet bij het bestuur.
 *  Een staande telefoonfoto van 6 MB komt er als bijgesneden WebP uit. */
export function imageUrl(source: unknown, width = 1200, height?: number): string | null {
  if (!builder || !source) return null;
  let url = builder.image(source as never).width(width).format('webp').quality(78);
  if (height) url = url.height(height).fit('crop');
  return url.url();
}

export type Zichtbaarheid = 'verborgen' | 'bezet' | 'publiek';

export interface Activiteit {
  _id: string;
  slug: string;
  interneTitel: string;
  publiekeTitel?: string;
  start: string;
  eind?: string;
  soort: string;
  zichtbaarheid: Zichtbaarheid;
  omschrijving?: string;
  foto?: unknown;
  fotoAlt?: string;
}

const ACTIVITEIT_VELDEN = `
  _id,
  "slug": slug.current,
  interneTitel,
  publiekeTitel,
  start,
  eind,
  soort,
  zichtbaarheid,
  omschrijving,
  foto,
  fotoAlt
`;

/**
 * 02_CODING_STANDARDS.md §6: nooit silent fail, maar een storing bij Sanity mag de
 * hele pagina niet neerhalen. Bij een fout krijg je een lege agenda plus een log —
 * het leeg-scenario op de landingspagina vangt dat visueel netjes op.
 */
async function veiligeQuery<T>(query: string, params: Record<string, unknown> = {}): Promise<T[]> {
  if (!client) return [];
  try {
    return await client.fetch<T[]>(query, params);
  } catch (error) {
    console.error('[sanity] query mislukt', { query, error });
    return [];
  }
}

/** Publieke agenda: alleen wat het bestuur bewust openbaar heeft gezet. */
export function getPubliekeActiviteiten(): Promise<Activiteit[]> {
  return veiligeQuery<Activiteit>(
    `*[_type == "activiteit" && zichtbaarheid == "publiek" && start >= now()]
     | order(start asc) { ${ACTIVITEIT_VELDEN} }`
  );
}

/**
 * Beschikbaarheidskalender: alles wat de datum blokkeert, zonder details prijs te geven.
 *
 * Bewust zonder datumfilter. Het bestuur plant tot in 2028, en de kalender moet ook
 * maanden ver vooruit kloppen. Bij een paar honderd boekingen is dat verwaarloosbaar;
 * loopt dat op, dan wordt een filter per zichtbare periode de volgende stap.
 */
export function getBezetteData(): Promise<Activiteit[]> {
  return veiligeQuery<Activiteit>(
    `*[_type == "activiteit" && zichtbaarheid != "verborgen"]
     | order(start asc) { ${ACTIVITEIT_VELDEN} }`
  );
}

export async function getEerstvolgende(): Promise<Activiteit | null> {
  const rij = await veiligeQuery<Activiteit>(
    `*[_type == "activiteit" && zichtbaarheid == "publiek" && start >= now()]
     | order(start asc)[0...1] { ${ACTIVITEIT_VELDEN} }`
  );
  return rij[0] ?? null;
}

export async function getActiviteitBySlug(slug: string): Promise<Activiteit | null> {
  const rij = await veiligeQuery<Activiteit>(
    `*[_type == "activiteit" && zichtbaarheid == "publiek" && slug.current == $slug][0...1]
     { ${ACTIVITEIT_VELDEN} }`,
    { slug }
  );
  return rij[0] ?? null;
}

/**
 * Ontvangstadres voor aanvragen, bewerkbaar door iedereen met CMS-toegang.
 * Valt terug op CONTACT_FALLBACK_EMAIL als het veld leeg of ongeldig is, zodat een
 * typefout in het CMS nooit stilzwijgend alle aanvragen laat verdwijnen.
 */
export async function getOntvangstAdres(): Promise<string> {
  const fallback =
    process.env.CONTACT_FALLBACK_EMAIL ?? import.meta.env.CONTACT_FALLBACK_EMAIL ?? '';

  if (!client) return fallback;

  try {
    const instellingen = await client.fetch<{ ontvangstAdres?: string } | null>(
      `*[_type == "instellingen"][0]{ ontvangstAdres }`
    );
    const adres = instellingen?.ontvangstAdres?.trim();
    if (adres && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adres)) return adres;
    console.warn('[sanity] ontvangstAdres leeg of ongeldig, terugval op CONTACT_FALLBACK_EMAIL');
    return fallback;
  } catch (error) {
    console.error('[sanity] ophalen ontvangstAdres mislukt, terugval gebruikt', error);
    return fallback;
  }
}

export function formatDatum(iso: string, metTijd = true): string {
  const d = new Date(iso);
  const datum = d.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  if (!metTijd) return datum;
  const tijd = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  return `${datum}, ${tijd} uur`;
}
