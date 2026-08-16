import { createClient, type SanityClient } from '@sanity/client';
import imageUrlBuilder from '@sanity/image-url';
import { SOORTEN, type Aanvraag } from './validatie';
import { maandagVanWeekIso } from './week';

export { maandagVanWeekIso };

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

/** JPEG i.p.v. WebP: Outlook en sommige webmail tonen WebP niet. */
export function mailImageUrl(source: unknown, width = 1120, height = 560): string | null {
  if (!builder || !source) return null;
  return builder
    .image(source as never)
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
export async function maakVriendAan(input: { naam: string; email: string }): Promise<void> {
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
    uitschrijfToken: genereerToken(),
    aangemeldOp: new Date().toISOString(),
  });
}

export async function getActieveVrienden(): Promise<Vriend[]> {
  if (!client) return [];
  try {
    return await client.fetch<Vriend[]>(
      `*[_type == "vriend" && actief == true]{ _id, naam, email, actief, uitschrijfToken }`
    );
  } catch (error) {
    console.error('[sanity] ophalen actieve vrienden mislukt', error);
    return [];
  }
}

export async function getVriendByToken(uitschrijfToken: string): Promise<Vriend | null> {
  if (!client) return null;
  try {
    // Groq-parameter mag niet `token` heten: @sanity/client typt dat veld als `never`
    // omdat het botst met de client-optie `token` (de API-sleutel).
    return await client.fetch<Vriend | null>(
      `*[_type == "vriend" && uitschrijfToken == $uitschrijfToken][0]{ _id, naam, email, actief, uitschrijfToken }`,
      { uitschrijfToken }
    );
  } catch (error) {
    console.error('[sanity] ophalen vriend via token mislukt', error);
    return null;
  }
}

export async function deactiveerVriend(id: string): Promise<void> {
  if (!client) return;
  await client.patch(id).set({ actief: false }).commit();
}

/**
 * E-mail voor voorbereidings- en reviewmails, in deze volgorde:
 * veld op de boeking, anders het adresboek, anders de oorspronkelijke aanvraag.
 * Komt nooit in de publieke agenda-query.
 */
export async function getHuurderEmail(activiteitId: string): Promise<string | null> {
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
  donatieUpdate?: string;
  geannuleerd: boolean;
  verstuurd: boolean;
}

/** Vindt het nieuwsbrief-document voor de week waarin `datum` valt (maandag t/m zondag). */
export async function getNieuwsbriefVoorWeek(datum: Date): Promise<NieuwsbriefContent | null> {
  if (!client) return null;
  const isoMaandag = maandagVanWeekIso(datum);

  try {
    return await client.fetch<NieuwsbriefContent | null>(
      `*[_type == "nieuwsbrief" && week == $isoMaandag][0]{
        _id, week, kortNieuws, donatieUpdate, geannuleerd, verstuurd
      }`,
      { isoMaandag }
    );
  } catch (error) {
    console.error('[sanity] ophalen nieuwsbrief-content mislukt', error);
    return null;
  }
}

export async function markeerNieuwsbriefVerstuurd(id: string): Promise<void> {
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

/**
 * Start van vandaag (00:00 UTC), niet het exacte huidige moment.
 *
 * Reden: met `start >= now()` verdween een activiteit uit beeld zodra de klok voorbij
 * de starttijd was, ook al liep hij die dag nog gewoon door. Deze cutoff houdt een
 * activiteit de hele dag zichtbaar, ongeacht hoe laat hij begon.
 */
function cutoffVandaag(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
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

/**
 * Een tweede, vast ontvangstadres (naast het primaire ontvangstAdres), bedoeld
 * voor iemand die standaard een kopie van elke aanvraag wil zien zonder dat dit
 * de BCC-noodoplossing is. Leeg als het veld niet is ingesteld.
 */
export async function getExtraOntvangstAdres(): Promise<string> {
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

/**
 * Toont een datum/tijd altijd in Nederlandse tijd, ongeacht in welke tijdzone
 * de server draait. Zonder expliciete timeZone gebruikt toLocaleTimeString de
 * tijdzone van de server (Vercel = UTC), niet automatisch Amsterdamse tijd —
 * dat gaf tot 2 uur verschil bij activiteiten met een tijdstip.
 */
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

/**
 * Toont één datum, of een volledige periode als de activiteit een eind-datum
 * heeft (bijv. "zaterdag 12 en zondag 13 september 2026"). Zonder eind-datum
 * gedraagt dit zich identiek aan formatDatum(iso, false).
 *
 * Reden: bij een meerdaagse activiteit (bijv. een weekend-expositie) toonde de
 * homepage alleen de startdatum, terwijl bezoekers vaak willen weten dat het
 * ook op de tweede dag te bezoeken is.
 */
export function formatDatumBereik(activiteit: Pick<Activiteit, 'start' | 'eind'>): string {
  if (!activiteit.eind) return formatDatum(activiteit.start, false);

  const start = new Date(activiteit.start);
  const eind = new Date(activiteit.eind);
  const zelfdeMaand =
    start.getUTCMonth() === eind.getUTCMonth() && start.getUTCFullYear() === eind.getUTCFullYear();

  const dagStart = start.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    timeZone: 'Europe/Amsterdam',
  });
  const volledigEind = eind.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Amsterdam',
  });

  if (zelfdeMaand) {
    return `${dagStart} en ${volledigEind}`;
  }

  const volledigStart = start.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Amsterdam',
  });
  return `${volledigStart} t/m ${volledigEind}`;
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
