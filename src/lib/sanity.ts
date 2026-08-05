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
  toonVanafMaanden?: string;
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
  fotoAlt,
  toonVanafMaanden
`;

async function veiligeQuery<T>(query: string, params: Record<string, unknown> = {}): Promise<T[]> {
  if (!client) return [];
  try {
    return await client.fetch<T[]>(query, params);
  } catch (error) {
    console.error('[sanity] query mislukt', { query, error });
    return [];
  }
}

function cutoffVandaag(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

function startVanDag(iso: string): number {
  const d = new Date(iso);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function loopVandaag(a: Activiteit, vandaag: number): boolean {
  const start = startVanDag(a.start);
  const eind = a.eind ? startVanDag(a.eind) : start;
  return start <= vandaag && vandaag <= eind;
}

/**
 * Is deze activiteit al "aan de beurt" om getoond te worden, gezien
 * toonVanafMaanden? Zonder die instelling: altijd ja. Rekent in hele maanden
 * vanaf vandaag — geen kalenderprecisie tot op de dag nodig voor dit doel.
 */
function magAlGetoondWorden(a: Activiteit): boolean {
  if (!a.toonVanafMaanden) return true;
  const maanden = Number(a.toonVanafMaanden);
  if (!maanden) return true;

  const start = new Date(a.start);
  const drempel = new Date(start);
  drempel.setUTCMonth(drempel.getUTCMonth() - maanden);

  return new Date() >= drempel;
}

/**
 * Publieke agenda: alles wat nog relevant is — lopend of toekomstig — én al
 * "aan de beurt" is volgens toonVanafMaanden.
 */
export async function getPubliekeAgenda(limit = 30): Promise<Activiteit[]> {
  const resultaat = await veiligeQuery<Activiteit>(
    `*[_type == "activiteit" && zichtbaarheid == "publiek"
       && (
         (defined(eind) && eind >= $cutoff) ||
         (!defined(eind) && start >= $cutoff)
       )
     ] | order(start asc) [0...$limit] { ${ACTIVITEIT_VELDEN} }`,
    { cutoff: cutoffVandaag(), limit }
  );
  return resultaat.filter(magAlGetoondWorden);
}

/** Beschikbaarheidskalender: alles wat de datum blokkeert, zonder details prijs te geven.
 *  Bewust zonder datumfilter — het bestuur plant tot in 2028. Ook zonder
 *  toonVanafMaanden-filter: de kalender toont "bezet", geen inhoud, dus die regel
 *  is hier niet relevant. */
export function getBezetteData(): Promise<Activiteit[]> {
  return veiligeQuery<Activiteit>(
    `*[_type == "activiteit" && zichtbaarheid != "verborgen"]
     | order(start asc) { ${ACTIVITEIT_VELDEN} }`
  );
}

export interface AgendaOverzicht {
  vandaag: Activiteit | null;
  volgende: Activiteit | null;
  daarna: Activiteit | null;
}

export async function getAgendaOverzicht(): Promise<AgendaOverzicht> {
  const lijst = await getPubliekeAgenda(20); // filtert al op magAlGetoondWorden
  const vandaag = startVanDag(new Date().toISOString());

  const lopend = lijst.find((a) => loopVandaag(a, vandaag)) ?? null;
  const toekomstig = lijst.filter((a) => startVanDag(a.start) > vandaag);

  return {
    vandaag: lopend,
    volgende: toekomstig[0] ?? null,
    daarna: toekomstig[1] ?? null,
  };
}

export async function getActiviteitBySlug(slug: string): Promise<Activiteit | null> {
  const rij = await veiligeQuery<Activiteit>(
    `*[_type == "activiteit" && zichtbaarheid == "publiek" && slug.current == $slug][0...1]
     { ${ACTIVITEIT_VELDEN} }`,
    { slug }
  );
  const gevonden = rij[0] ?? null;
  // Ook een direct-URL-bezoek respecteert toonVanafMaanden — anders zou een
  // vroegtijdig ingevoerde activiteit alsnog vindbaar zijn via een geraden link.
  return gevonden && magAlGetoondWorden(gevonden) ? gevonden : null;
}

export interface VrijWeekend {
  zaterdag: string; // YYYY-MM-DD
  zondag: string;
  zaterdagVrij: boolean;
  zondagVrij: boolean;
}

/**
 * De eerstvolgende N weekenden waarin minstens één van de twee dagen (zaterdag
 * of zondag) nog vrij is. Telt dus ook halfbezette weekenden mee — als er
 * onverwacht een dag vrijkomt, staat dat weekend meteen weer in de lijst.
 */
export async function getEerstvolgendeVrijeWeekenden(aantal = 3): Promise<VrijWeekend[]> {
  const bezet = await getBezetteData();

  const bezetteDagen = new Set<string>();
  for (const item of bezet) {
    if (item.zichtbaarheid === 'verborgen') continue;
    const van = new Date(item.start);
    const tot = item.eind ? new Date(item.eind) : van;
    const loper = new Date(Date.UTC(van.getUTCFullYear(), van.getUTCMonth(), van.getUTCDate()));
    const eindDag = new Date(Date.UTC(tot.getUTCFullYear(), tot.getUTCMonth(), tot.getUTCDate()));
    let veiligheid = 0;
    while (loper <= eindDag && veiligheid < 400) {
      bezetteDagen.add(loper.toISOString().slice(0, 10));
      loper.setUTCDate(loper.getUTCDate() + 1);
      veiligheid++;
    }
  }

  const resultaat: VrijWeekend[] = [];
  const nu = new Date();
  let dag = new Date(Date.UTC(nu.getUTCFullYear(), nu.getUTCMonth(), nu.getUTCDate()));

  // Naar de eerstvolgende zaterdag toe lopen (getUTCDay: 0=zo .. 6=za).
  while (dag.getUTCDay() !== 6) {
    dag.setUTCDate(dag.getUTCDate() + 1);
  }

  let veiligheid = 0;
  while (resultaat.length < aantal && veiligheid < 260) {
    const zaterdag = dag.toISOString().slice(0, 10);
    const zondagDatum = new Date(dag);
    zondagDatum.setUTCDate(zondagDatum.getUTCDate() + 1);
    const zondag = zondagDatum.toISOString().slice(0, 10);

    const zaterdagVrij = !bezetteDagen.has(zaterdag);
    const zondagVrij = !bezetteDagen.has(zondag);

    if (zaterdagVrij || zondagVrij) {
      resultaat.push({ zaterdag, zondag, zaterdagVrij, zondagVrij });
    }

    dag.setUTCDate(dag.getUTCDate() + 7);
    veiligheid++;
  }

  return resultaat;
}

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
    timeZone: 'Europe/Amsterdam',
  });
  if (!metTijd) return datum;
  const tijd = d.toLocaleTimeString('nl-NL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Amsterdam',
  });
  return `${datum}, ${tijd} uur`;
}

/** Korte datumnotatie voor de vrije-weekenden-lijst, bijv. "14-15 juni". */
export function formatWeekend(w: VrijWeekend): string {
  const za = new Date(w.zaterdag + 'T00:00:00Z');
  const zo = new Date(w.zondag + 'T00:00:00Z');
  const maandZa = za.toLocaleDateString('nl-NL', { month: 'long', timeZone: 'Europe/Amsterdam' });
  const maandZo = zo.toLocaleDateString('nl-NL', { month: 'long', timeZone: 'Europe/Amsterdam' });
  const dagZa = za.getUTCDate();
  const dagZo = zo.getUTCDate();
  return maandZa === maandZo ? `${dagZa}-${dagZo} ${maandZa}` : `${dagZa} ${maandZa} - ${dagZo} ${maandZo}`;
}
