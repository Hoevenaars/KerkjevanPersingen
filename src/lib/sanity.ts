import type { Aanvraag } from './validatie.ts';
import { maandagVanWeekIso, type VrijWeekend } from './week.ts';
import type { VriendFrequentie } from './nieuwsbrief-frequentie.ts';
import { directeFotoUrl } from './agenda-zichtbaarheid.ts';

export { maandagVanWeekIso };
export { formatDatum, formatDatumBereik } from './datum.ts';
export type { VrijWeekend };
export type { VriendFrequentie };

/** Sanity-studio en de CDN zitten niet meer in deze applicatie. */
export const sanityConfigured = false;

function geenSanity(): never {
  throw new Error('Sanity is geen runtimebron. Deze flow leest en schrijft alleen Supabase.');
}

/** Alleen een http(s)- of sitepad. Een oud Sanity-assetobject levert geen URL. */
export function publiekeFotoUrl(source: unknown, _width = 1200, _height?: number): string | null {
  return directeFotoUrl(source);
}

export function imageUrl(source: unknown, _width = 1200, _height?: number): string | null {
  return directeFotoUrl(source);
}

export function mailImageUrl(source: unknown, _width = 1120, _height = 560): string | null {
  return directeFotoUrl(source);
}

// --- Vrienden van het kerkje ---

export interface Vriend {
  _id: string;
  naam?: string;
  email: string;
  actief: boolean;
  frequentie?: VriendFrequentie;
  uitschrijfToken: string;
}

export async function maakVriendAan(_input: { naam: string; email: string }): Promise<void> {
  geenSanity();
}

export async function getActieveVrienden(): Promise<Vriend[]> {
  geenSanity();
}

export async function getVriendenVoorVerzending(_datum = new Date()): Promise<Vriend[]> {
  geenSanity();
}

export async function getVriendByToken(_uitschrijfToken: string): Promise<Vriend | null> {
  geenSanity();
}

export async function deactiveerVriend(_id: string): Promise<void> {
  geenSanity();
}

export async function updateVriendFrequentie(_id: string, _frequentie: VriendFrequentie): Promise<void> {
  geenSanity();
}

/**
 * E-mail voor voorbereidings- en reviewmails, in deze volgorde:
 * veld op de boeking, anders het adresboek, anders de oorspronkelijke aanvraag.
 * Komt nooit in de publieke agenda-query.
 */
export async function getHuurderEmail(_activiteitId: string): Promise<string | null> {
  geenSanity();
}

// --- Wekelijkse nieuwsbrief ---

export interface NieuwsbriefContent {
  _id: string;
  week: string;
  kortNieuws?: string;
  kortNieuwsFoto?: unknown;
  kortNieuwsFotoAlt?: string;
  donatieUpdate?: string;
  geannuleerd: boolean;
  verstuurd: boolean;
}

/** Vindt het nieuwsbrief-document voor de week waarin `datum` valt (maandag t/m zondag). */
export async function getNieuwsbriefVoorWeek(_datum: Date): Promise<NieuwsbriefContent | null> {
  geenSanity();
}

export async function markeerNieuwsbriefVerstuurd(_id: string): Promise<void> {
  geenSanity();
}

export async function maakOfUpdateNieuwsbriefStatus(_datum: Date): Promise<string | null> {
  geenSanity();
}

export async function bewaarAanvraag(_aanvraag: Aanvraag): Promise<void> {
  geenSanity();
}

export { activiteitenVoorKalender, kiesGepubliceerdeActiviteit, mergeKalenderBronnen } from './sanity-documenten.ts';

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

/** Loopt deze activiteit vandaag, ongeacht wanneer hij begon of eindigt? */
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

/** Beschikbaarheidskalender: alleen gepubliceerde bezetting plus de publieke agenda.
 *  De site-token ziet anders concepten, Content Releases en draft-overlays
 *  (`previewDrafts` haalt `drafts.` van `_id` af). Die zette 7-8 november grijs
 *  terwijl Studio en de agenda leeg waren. Geen fallback naar raw: dat haalt
 *  dezelfde concepten terug. Publieke concepten blijven bezet via de agenda. */
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
 * vandaag loopt telt niet mee als "volgende" — dat voorkomt dat dezelfde activiteit
 * dubbel in beeld komt.
 */
export async function getAgendaOverzicht(): Promise<AgendaOverzicht> {
  // Blokkades (winterstop) staan op de agenda als "Bezet", niet als eerstvolgende activiteit.
  const lijst = (await getPubliekeAgenda(80)).filter((item) => item.soort !== 'blokkade');
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
  const { leesActiviteitOpSlug } = await import('./publiek-lezen.ts');
  return leesActiviteitOpSlug(slug);
}

/**
 * De eerstvolgende N weekenden waarin minstens één van de twee dagen (zaterdag
 * of zondag) nog vrij is. Telt dus ook halfbezette weekenden mee — als er
 * onverwacht een dag vrijkomt, staat dat weekend meteen weer in de lijst.
 */
export async function getEerstvolgendeVrijeWeekenden(aantal = 3): Promise<VrijWeekend[]> {
  const { leesEerstvolgendeVrijeWeekenden } = await import('./publiek-lezen.ts');
  return leesEerstvolgendeVrijeWeekenden(aantal);
}

/**
 * Ontvangstadres voor aanvragen, bewerkbaar door iedereen met CMS-toegang.
 * Valt terug op CONTACT_FALLBACK_EMAIL als het veld leeg of ongeldig is, zodat een
 * typefout in het CMS nooit stilzwijgend alle aanvragen laat verdwijnen.
 */
export async function getOntvangstAdres(): Promise<string> {
  geenSanity();
}

export async function getExtraOntvangstAdres(): Promise<string> {
  geenSanity();
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
