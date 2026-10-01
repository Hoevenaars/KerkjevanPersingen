import { createRequire } from 'node:module';
import { createClient, type SanityClient } from '@sanity/client';
import { SOORTEN, type Aanvraag } from './validatie.ts';
import { maandagVanWeekIso, type VrijWeekend } from './week.ts';
import { ontvangtDezeVerzending, type VriendFrequentie } from './nieuwsbrief-frequentie.ts';
import { directeFotoUrl } from './agenda-zichtbaarheid.ts';
import { noteerSanityOproep } from '../platform/sanity-registratie.ts';
import { huidigeContentBron } from '../platform/bron.ts';

export { maandagVanWeekIso };
export { formatDatum, formatDatumBereik } from './datum.ts';
export type { VrijWeekend };
export type { VriendFrequentie };

const metaEnv = ((import.meta as { env?: Record<string, string | undefined> }).env ?? {}) as Record<string, string | undefined>;
const projectId = process.env.SANITY_PROJECT_ID ?? metaEnv.SANITY_PROJECT_ID;
const dataset = process.env.SANITY_DATASET ?? metaEnv.SANITY_DATASET ?? 'production';
const token = process.env.SANITY_API_TOKEN ?? metaEnv.SANITY_API_TOKEN;

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

if (client) {
  const origineel = client.fetch.bind(client);
  client.fetch = ((...args: Parameters<SanityClient['fetch']>) => {
    noteerSanityOproep('sanity.fetch');
    return origineel(...args);
  }) as SanityClient['fetch'];
}

type ImageChain = {
  width: (n: number) => ImageChain;
  height: (n: number) => ImageChain;
  fit: (mode: string) => ImageChain;
  format: (mode: string) => ImageChain;
  quality: (n: number) => ImageChain;
  url: () => string;
};
type ImageBuilder = {
  image: (source: unknown) => ImageChain;
};

let builder: ImageBuilder | null | undefined;

/** De builder laadt pas als een Sanity-asset echt geresolveerd wordt.
 *  Een http(s)- of sitepad in de Supabase-testmodus raakt dit niet. */
function sanityImageBuilder(): ImageBuilder | null {
  if (builder !== undefined) return builder;
  if (!client) {
    builder = null;
    return builder;
  }
  const require = createRequire(import.meta.url);
  const geladen = require('@sanity/image-url') as { default?: (c: SanityClient) => ImageBuilder } | ((c: SanityClient) => ImageBuilder);
  const maak = typeof geladen === 'function' ? geladen : geladen.default;
  if (!maak) {
    builder = null;
    return builder;
  }
  builder = maak(client);
  return builder;
}

function directeUrl(source: unknown): string | null {
  return directeFotoUrl(source);
}

/** Beeldverwerking gebeurt bij Sanity, niet bij het bestuur.
 *  Een staande telefoonfoto van 6 MB komt er als bijgesneden WebP uit. */
/** Sanity-beeld of, in de Supabase-preview, een directe publieke URL. */
export function publiekeFotoUrl(source: unknown, width = 1200, height?: number): string | null {
  const direct = directeUrl(source);
  if (direct) return direct;
  return imageUrl(source, width, height);
}

export function imageUrl(source: unknown, width = 1200, height?: number): string | null {
  const direct = directeUrl(source);
  if (direct) return direct;
  const actief = sanityImageBuilder();
  if (!actief || !source) return null;
  let url = actief.image(source).width(width).format('webp').quality(78);
  if (height) url = url.height(height).fit('crop');
  return url.url();
}

/** JPEG i.p.v. WebP: Outlook en sommige webmail tonen WebP niet. */
export function mailImageUrl(source: unknown, width = 1120, height = 560): string | null {
  const direct = directeUrl(source);
  if (direct) return direct;
  const actief = sanityImageBuilder();
  if (!actief || !source) return null;
  return actief
    .image(source)
    .width(width)
    .height(height)
    .fit('crop')
    .format('jpg')
    .quality(78)
    .url();
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

function genereerToken(): string {
  return crypto.randomUUID();
}

/**
 * Maakt een nieuwe vriend aan, tenzij het e-mailadres al bestaat. Geen dubbele
 * aanmeldingen: iemand die het formulier twee keer invult (bijv. dubbelklik)
 * krijgt niet twee keer dezelfde mail per week.
 *
 * Wie zich eerder uitschreef en opnieuw aanmeldt, wordt weer geactiveerd (nieuw
 * uitschrijftoken, zodat een oude afmeldlink niet alsnog deactiveren kan).
 */
function blokkeerSanityNaCutover(): void {
  if (huidigeContentBron() === 'supabase') {
    throw new Error('Sanity is geen runtimebron. Deze flow leest en schrijft alleen Supabase.');
  }
}

export async function maakVriendAan(input: { naam: string; email: string }): Promise<void> {
  blokkeerSanityNaCutover();
  if (!client) {
    throw new Error('Sanity is niet geconfigureerd; aanmelding kan niet worden opgeslagen.');
  }

  const bestaand = await client.fetch<{ _id: string; actief: boolean } | null>(
    `*[_type == "vriend" && lower(email) == $email][0]{ _id, actief }`,
    { email: input.email }
  );

  if (bestaand) {
    if (!bestaand.actief) {
      await client
        .patch(bestaand._id)
        .set({
          actief: true,
          frequentie: 'wekelijks',
          naam: input.naam || undefined,
          uitschrijfToken: genereerToken(),
        })
        .commit();
    }
    return;
  }

  await client.create({
    _type: 'vriend',
    naam: input.naam || undefined,
    email: input.email,
    actief: true,
    frequentie: 'wekelijks',
    uitschrijfToken: genereerToken(),
    aangemeldOp: new Date().toISOString(),
  });
}

export async function getActieveVrienden(): Promise<Vriend[]> {
  blokkeerSanityNaCutover();
  if (!client) return [];
  try {
    return await client.fetch<Vriend[]>(
      `*[_type == "vriend" && actief == true]{ _id, naam, email, actief, frequentie, uitschrijfToken }`
    );
  } catch (error) {
    console.error('[sanity] ophalen actieve vrienden mislukt', error);
    return [];
  }
}

/** Actieve vrienden die volgens hun frequentie deze verzendronde mail moeten krijgen. */
export async function getVriendenVoorVerzending(datum = new Date()): Promise<Vriend[]> {
  blokkeerSanityNaCutover();
  const vrienden = await getActieveVrienden();
  return vrienden.filter((vriend) => ontvangtDezeVerzending(vriend.frequentie, datum));
}

export async function getVriendByToken(uitschrijfToken: string): Promise<Vriend | null> {
  blokkeerSanityNaCutover();
  if (!client) return null;
  try {
    // Groq-parameter mag niet `token` heten: @sanity/client typt dat veld als `never`
    // omdat het botst met de client-optie `token` (de API-sleutel).
    return await client.fetch<Vriend | null>(
      `*[_type == "vriend" && uitschrijfToken == $uitschrijfToken][0]{ _id, naam, email, actief, frequentie, uitschrijfToken }`,
      { uitschrijfToken }
    );
  } catch (error) {
    console.error('[sanity] ophalen vriend via token mislukt', error);
    return null;
  }
}

export async function deactiveerVriend(id: string): Promise<void> {
  blokkeerSanityNaCutover();
  if (!client) return;
  await client.patch(id).set({ actief: false }).commit();
}

export async function updateVriendFrequentie(id: string, frequentie: VriendFrequentie): Promise<void> {
  blokkeerSanityNaCutover();
  if (!client) return;
  await client.patch(id).set({ frequentie, actief: true }).commit();
}

/**
 * E-mail voor voorbereidings- en reviewmails, in deze volgorde:
 * veld op de boeking, anders het adresboek, anders de oorspronkelijke aanvraag.
 * Komt nooit in de publieke agenda-query.
 */
export async function getHuurderEmail(activiteitId: string): Promise<string | null> {
  blokkeerSanityNaCutover();
  if (!client) return null;
  try {
    const rij = await client.fetch<{
      huurderEmail?: string;
      huurder?: { email?: string };
      aanvraag?: { email?: string };
    } | null>(
      `*[_type == "activiteit" && _id == $activiteitId][0]{
        huurderEmail,
        huurder->{ email },
        aanvraag->{ email }
      }`,
      { activiteitId }
    );
    const adres = rij?.huurderEmail?.trim() || rij?.huurder?.email?.trim() || rij?.aanvraag?.email?.trim();
    return adres || null;
  } catch (error) {
    console.error('[sanity] ophalen huurder-email mislukt', error);
    return null;
  }
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
export async function getNieuwsbriefVoorWeek(datum: Date): Promise<NieuwsbriefContent | null> {
  blokkeerSanityNaCutover();
  if (!client) return null;
  const isoMaandag = maandagVanWeekIso(datum);

  try {
    return await client.fetch<NieuwsbriefContent | null>(
      `*[_type == "nieuwsbrief" && week == $isoMaandag][0]{
        _id, week, kortNieuws, kortNieuwsFoto, kortNieuwsFotoAlt, donatieUpdate, geannuleerd, verstuurd
      }`,
      { isoMaandag }
    );
  } catch (error) {
    console.error('[sanity] ophalen nieuwsbrief-content mislukt', error);
    return null;
  }
}

export async function markeerNieuwsbriefVerstuurd(id: string): Promise<void> {
  blokkeerSanityNaCutover();
  if (!client) return;
  await client.patch(id).set({ verstuurd: true }).commit();
}

/**
 * Zorgt dat er altijd een nieuwsbrief-document bestaat voor de huidige week,
 * ook als Nelleke niets heeft ingevuld. Zonder dit document is er geen plek om
 * "verstuurd" op te slaan, en zou een herhaalde cron-aanroep dezelfde mail
 * per ongeluk twee keer kunnen versturen.
 */
export async function maakOfUpdateNieuwsbriefStatus(datum: Date): Promise<string | null> {
  blokkeerSanityNaCutover();
  if (!client) return null;

  const bestaand = await getNieuwsbriefVoorWeek(datum);
  if (bestaand) return bestaand._id;

  const isoMaandag = maandagVanWeekIso(datum);

  try {
    const nieuw = await client.create({
      _type: 'nieuwsbrief',
      week: isoMaandag,
      geannuleerd: false,
      verstuurd: false,
    });
    return nieuw._id;
  } catch (error) {
    console.error('[sanity] aanmaken nieuwsbrief-status mislukt', error);
    return null;
  }
}

/**
 * Zet de aanvraag in het CMS als bron: een aanvraag-document (ja/nee-lijst)
 * én een boeking (activiteit) met dezelfde gegevens. De boeking is de
 * single source of truth voor mails. Zichtbaarheid blijft "verborgen" tot
 * het bestuur ja zegt en de datum op "bezet" zet — de publieke kalender
 * verandert dus niet vanzelf.
 */
export async function bewaarAanvraag(a: Aanvraag): Promise<void> {
  blokkeerSanityNaCutover();
  if (!client) {
    console.warn('[sanity] geen client, aanvraag niet opgeslagen in CMS');
    return;
  }

  const email = a.email.toLowerCase();
  const soortLabel = SOORTEN.find((s) => s.waarde === a.soort)?.label ?? a.soort;
  const startDag = a.datum;
  const eindDag = a.datumTot || a.datum;

  try {
    const aanvraagDoc = await client.create({
      _type: 'aanvraag',
      binnengekomenOp: new Date().toISOString(),
      status: 'nieuw',
      naam: a.naam,
      email,
      telefoon: a.telefoon || undefined,
      adres: a.adres || undefined,
      soort: a.soort,
      datum: startDag || undefined,
      datumTot: a.datumTot || undefined,
      personen: a.personen || undefined,
      toelichting: a.toelichting || undefined,
      website: a.website || undefined,
      eerderGeexposeerd: a.eerderGeexposeerd || undefined,
      medeExposanten: a.medeExposanten || undefined,
    });

    if (!startDag) return;

    const boeking = await client.create({
      _type: 'activiteit',
      interneTitel: `${soortLabel}: ${a.naam}`,
      start: `${startDag}T09:00:00.000Z`,
      eind: eindDag ? `${eindDag}T16:00:00.000Z` : undefined,
      soort: a.soort,
      zichtbaarheid: 'verborgen',
      boekingStatus: 'aanvraag',
      huurderNaam: a.naam,
      huurderEmail: email,
      huurderTelefoon: a.telefoon || undefined,
      huurderAdres: a.adres || undefined,
      aantalPersonen: a.personen || undefined,
      toelichtingAanvrager: a.toelichting || undefined,
      website: a.website || undefined,
      eerderGeexposeerd: a.eerderGeexposeerd || undefined,
      medeExposanten: a.medeExposanten || undefined,
      akkoordVoorwaarden: a.akkoordVoorwaarden === 'ja',
      aanvraag: { _type: 'reference', _ref: aanvraagDoc._id },
      toestemmingBeeld: false,
      aanbetalingBinnen: false,
      contentStatus: 'ontbreekt',
    });

    await client.patch(aanvraagDoc._id).set({ boeking: { _type: 'reference', _ref: boeking._id } }).commit();
  } catch (error) {
    console.error('[sanity] aanvraag niet opgeslagen in CMS', error);
  }
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
  blokkeerSanityNaCutover();
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

/**
 * Een tweede, vast ontvangstadres (naast het primaire ontvangstAdres), bedoeld
 * voor iemand die standaard een kopie van elke aanvraag wil zien zonder dat dit
 * de BCC-noodoplossing is. Leeg als het veld niet is ingesteld.
 */
export async function getExtraOntvangstAdres(): Promise<string> {
  blokkeerSanityNaCutover();
  if (!client) return '';
  try {
    const instellingen = await client.fetch<{ extraOntvangstAdres?: string } | null>(
      `*[_type == "instellingen"][0]{ extraOntvangstAdres }`
    );
    const adres = instellingen?.extraOntvangstAdres?.trim();
    if (adres && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adres)) return adres;
    return '';
  } catch (error) {
    console.error('[sanity] ophalen extraOntvangstAdres mislukt', error);
    return '';
  }
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
