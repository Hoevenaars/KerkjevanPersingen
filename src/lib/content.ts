import { maandagVanWeekIso, type VrijWeekend } from './week.ts';
import type { VriendFrequentie } from './nieuwsbrief-frequentie.ts';
import { directeFotoUrl } from './agenda-zichtbaarheid.ts';
import { isWinterstop } from './winterstop.ts';

export { maandagVanWeekIso };
export { formatDatum, formatDatumBereik } from './datum.ts';
export type { VrijWeekend };
export type { VriendFrequentie };

/** Alleen een http(s)- of sitepad. Een los assetobject levert geen URL. */
export function publiekeFotoUrl(source: unknown, _width = 1200, _height?: number): string | null {
  return directeFotoUrl(source);
}

export function imageUrl(source: unknown, _width = 1200, _height?: number): string | null {
  return directeFotoUrl(source);
}

export function mailImageUrl(source: unknown, _width = 1120, _height = 560): string | null {
  return directeFotoUrl(source);
}

export type Zichtbaarheid = 'verborgen' | 'bezet' | 'publiek';

export type ContentStatus = 'ontbreekt' | 'gevraagd' | 'ontvangen' | 'goedgekeurd' | 'afgewezen';

export interface Activiteit {
  _id: string;
  _originalId?: string;
  slug: string;
  interneTitel: string;
  publiekeTitel?: string;
  start: string;
  eind?: string;
  soort: string;
  zichtbaarheid: Zichtbaarheid;
  omschrijving?: string;
  kunstenaars?: string;
  foto?: unknown;
  fotoAlt?: string;
  toonVanafMaanden?: string;
  contentStatus?: ContentStatus;
  contentstatus?: string | null;
  aangeleverdeTekst?: string;
  aangeleverdeFoto?: unknown;
  korteOmschrijving?: string;
  volledigeOmschrijving?: string;
  praktischeInformatie?: string;
  aanvullendeAfbeeldingen?: string[];
  geannuleerd?: boolean;
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

/** Publieke agenda via Supabase. ToonVanafMaanden filtert in publiek-lezen. */
export async function getPubliekeAgenda(limit = 30): Promise<Activiteit[]> {
  const { leesPubliekeAgenda } = await import('./publiek-lezen.ts');
  return leesPubliekeAgenda(limit);
}

/** Beschikbaarheidskalender uit Supabase: boekingen, blokkades en gepubliceerde activiteiten. */
export async function getBezetteData(): Promise<Activiteit[]> {
  const { leesBezetteData } = await import('./publiek-lezen.ts');
  return leesBezetteData();
}

export interface AgendaOverzicht {
  vandaag: Activiteit | null;
  volgende: Activiteit | null;
  daarna: Activiteit | null;
}

/**
 * Verdeelt de publieke agenda in drie blokken voor de landingspagina: wat vandaag
 * loopt, wat daarna als eerste komt, en wat daarop weer volgt. Een activiteit die
 * vandaag loopt telt niet mee als "volgende".
 */
/**
 * Een lopende winterstop mag de plek "vandaag" innemen.
 * Het eerstvolgende winterseizoen hoort in de homepagevolgorde.
 * Een tweede, later seizoen blijft alleen op de agendapagina.
 */
export function agendaOverzichtUitLijst(lijst: readonly Activiteit[], nu = new Date()): AgendaOverzicht {
  const zichtbaar = lijst.filter((item) => item.soort !== 'blokkade');
  const vandaag = startVanDag(nu.toISOString());
  const lopend = zichtbaar.find((a) => loopVandaag(a, vandaag)) ?? null;
  const toekomstig = zichtbaar.filter((a) => startVanDag(a.start) > vandaag);
  let winterGezien = Boolean(lopend && isWinterstop(lopend.soort));
  const homepage = toekomstig.filter((item) => {
    if (!isWinterstop(item.soort)) return true;
    if (winterGezien) return false;
    winterGezien = true;
    return true;
  });
  return {
    vandaag: lopend,
    volgende: homepage[0] ?? null,
    daarna: homepage[1] ?? null,
  };
}

export async function getAgendaOverzicht(): Promise<AgendaOverzicht> {
  return agendaOverzichtUitLijst(await getPubliekeAgenda(80));
}

export async function getActiviteitBySlug(slug: string): Promise<Activiteit | null> {
  const { leesActiviteitOpSlug } = await import('./publiek-lezen.ts');
  return leesActiviteitOpSlug(slug);
}

/**
 * De eerstvolgende N weekenden waarin minstens één van de twee dagen (zaterdag
 * of zondag) nog vrij is.
 */
export async function getEerstvolgendeVrijeWeekenden(aantal = 3): Promise<VrijWeekend[]> {
  const { leesEerstvolgendeVrijeWeekenden } = await import('./publiek-lezen.ts');
  return leesEerstvolgendeVrijeWeekenden(aantal);
}

/** Bijv. "14-15 juni 2027", of "31 december 2027 - 1 januari 2028" als het
 *  weekend over een maand- of jaargrens heen loopt. */
export function formatWeekend(w: VrijWeekend): string {
  const za = new Date(w.zaterdag + 'T00:00:00Z');
  const zo = new Date(w.zondag + 'T00:00:00Z');
  const maandZa = za.toLocaleDateString('nl-NL', { month: 'long', timeZone: 'Europe/Amsterdam' });
  const maandZo = zo.toLocaleDateString('nl-NL', { month: 'long', timeZone: 'Europe/Amsterdam' });
  const jaarZa = za.getUTCFullYear();
  const jaarZo = zo.getUTCFullYear();
  const dagZa = za.getUTCDate();
  const dagZo = zo.getUTCDate();

  if (maandZa === maandZo && jaarZa === jaarZo) {
    return `${dagZa}-${dagZo} ${maandZa} ${jaarZa}`;
  }
  return `${dagZa} ${maandZa} ${jaarZa} - ${dagZo} ${maandZo} ${jaarZo}`;
}
