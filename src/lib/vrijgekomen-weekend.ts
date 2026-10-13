/**
 * Banner onder de kop van de website.
 *
 * Twee vormen, dezelfde balk, via Beheer → Publiceren
 * (instellingen.vrijgekomen_weekend_banner):
 * - een vrij expositieweekend, met datumkaarten die uit dat weekend komen;
 * - alleen tekst, zonder datum. Die blijft staan tot hij wordt uitgezet.
 *
 * Zonder opgeslagen instelling blijft 17 en 18 oktober 2026 de terugval,
 * zodat de banner niet stil verdwijnt.
 *
 * Staat op alle publieke pagina's behalve `/verhuur/aanvragen`.
 * Na afloop van een gekozen weekend verdwijnt die vorm vanzelf — Nederlandse tijd.
 */

import { komendWeekend } from './week.ts';

/** Terugval zolang de instelling niet gelezen kan worden. */
export const VRIJGEKOMEN_WEEKEND_BANNER_AAN = true;

const BASIS_TEKST = {
  eyebrow: 'Onverwacht vrij',
  titel: 'Een uniek expositieweekend is vrijgekomen',
  tekst:
    'Presenteer jouw werk in het Kerkje van Persingen. Dit weekend is nu beschikbaar — vraag het aan voordat het weer vergeven is.',
} as const;

export const VRIJGEKOMEN_WEEKEND_SLEUTEL = 'vrijgekomen_weekend_banner';

export const BANNER_TEKST_GRENZEN = {
  eyebrow: 80,
  titel: 140,
  tekst: 400,
  knop: 80,
  link: 300,
} as const;

export type BannerSoort = 'weekend' | 'tekst';

export interface VrijgekomenWeekendInstelling {
  actief: boolean;
  /** Ontbreekt bij oudere records: dat is een vrij weekend. */
  soort: BannerSoort;
  /** Zaterdag YYYY-MM-DD, of leeg als er nog geen weekend is gekozen. */
  zaterdag: string;
  eyebrow: string;
  titel: string;
  tekst: string;
  knop: string;
  link: string;
}

export const STANDAARD_VRIJGEKOMEN_WEEKEND: VrijgekomenWeekendInstelling = {
  actief: VRIJGEKOMEN_WEEKEND_BANNER_AAN,
  soort: 'weekend',
  zaterdag: '2026-10-17',
  eyebrow: '',
  titel: '',
  tekst: '',
  knop: '',
  link: '',
};

export type WeekendDatumKaart = {
  ymd: string;
  weekdag: string;
  dag: string;
  maand: string;
};

export interface VrijgekomenWeekendInhoud {
  soort: BannerSoort;
  zaterdag: string;
  zondag: string;
  eyebrow: string;
  titel: string;
  tekst: string;
  knop: string;
  periode: string;
  kaarten: WeekendDatumKaart[];
  /** Bestemming van de knop: het aanvraagformulier, of een vrije link bij alleen tekst. */
  aanvraagPad: string;
}

export interface BezettingVoorWeekend {
  start?: string;
  eind?: string;
  soort?: string;
  status?: string;
  publicatiestatus?: string | null;
  zichtbaarheid?: string | null;
  levenscyclus?: string | null;
  geannuleerd?: boolean;
  blokkeert?: boolean;
}

const BLOKKERENDE_BOEKING = new Set(['optie', 'definitief', 'migratie_vastgelegd', 'optie_verlopen']);

function plusDagen(ymd: string, dagen: number): string {
  const utc = new Date(`${ymd}T12:00:00Z`);
  utc.setUTCDate(utc.getUTCDate() + dagen);
  return utc.toISOString().slice(0, 10);
}

function plusMaanden(ymd: string, maanden: number): string {
  const [jaar, maand, dag] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(jaar, maand - 1 + maanden, dag, 12, 0, 0));
  return utc.toISOString().slice(0, 10);
}

export function isZaterdag(ymd: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) && new Date(`${ymd}T12:00:00Z`).getUTCDay() === 6;
}

export function zondagVanZaterdag(zaterdag: string): string {
  return plusDagen(zaterdag, 1);
}

function vandaagInAmsterdam(nu: Date): string {
  return nu.toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
}

function nlOnderdelen(ymd: string): { weekdag: string; dag: string; maand: string; maandKort: string; jaar: string } {
  const d = new Date(`${ymd}T12:00:00Z`);
  const opties = { timeZone: 'UTC' } as const;
  return {
    weekdag: d.toLocaleDateString('nl-NL', { ...opties, weekday: 'long' }),
    dag: d.toLocaleDateString('nl-NL', { ...opties, day: 'numeric' }),
    maand: d.toLocaleDateString('nl-NL', { ...opties, month: 'long' }),
    maandKort: d.toLocaleDateString('nl-NL', { ...opties, month: 'short' }),
    jaar: d.toLocaleDateString('nl-NL', { ...opties, year: 'numeric' }),
  };
}

function datumKaart(ymd: string): WeekendDatumKaart {
  const deel = nlOnderdelen(ymd);
  return { ymd, weekdag: deel.weekdag, dag: deel.dag, maand: deel.maandKort };
}

/** Korte datumzin voor de knop, bijvoorbeeld "17 en 18 oktober". */
export function kortePeriode(zaterdag: string, zondag: string): string {
  const za = nlOnderdelen(zaterdag);
  const zo = nlOnderdelen(zondag);
  if (za.maand === zo.maand && za.jaar === zo.jaar) return `${za.dag} en ${zo.dag} ${za.maand}`;
  return `${za.dag} ${za.maand} en ${zo.dag} ${zo.maand}`;
}

/** Keuzelabel, bijvoorbeeld "17 en 18 oktober 2026". */
export function labelVanWeekend(zaterdag: string, zondag: string): string {
  const za = nlOnderdelen(zaterdag);
  const zo = nlOnderdelen(zondag);
  if (za.maand === zo.maand && za.jaar === zo.jaar) return `${za.dag} en ${zo.dag} ${za.maand} ${za.jaar}`;
  return `${za.dag} ${za.maand} ${za.jaar} en ${zo.dag} ${zo.maand} ${zo.jaar}`;
}

/** Volledige periode, bijvoorbeeld "zaterdag 17 en zondag 18 oktober 2026". */
export function periodeVanWeekend(zaterdag: string, zondag: string): string {
  const za = nlOnderdelen(zaterdag);
  const zo = nlOnderdelen(zondag);
  if (za.maand === zo.maand && za.jaar === zo.jaar) {
    return `${za.weekdag} ${za.dag} en ${zo.weekdag} ${zo.dag} ${za.maand} ${za.jaar}`;
  }
  return `${za.weekdag} ${za.dag} ${za.maand} ${za.jaar} en ${zo.weekdag} ${zo.dag} ${zo.maand} ${zo.jaar}`;
}

export function knopVanWeekend(zaterdag: string, zondag: string): string {
  return `Vraag ${kortePeriode(zaterdag, zondag)} aan`;
}

export function bannerInhoud(zaterdag: string): VrijgekomenWeekendInhoud {
  const zondag = zondagVanZaterdag(zaterdag);
  return {
    soort: 'weekend',
    zaterdag,
    zondag,
    ...BASIS_TEKST,
    knop: knopVanWeekend(zaterdag, zondag),
    periode: periodeVanWeekend(zaterdag, zondag),
    kaarten: [datumKaart(zaterdag), datumKaart(zondag)],
    aanvraagPad: `/verhuur/aanvragen/?datum=${zaterdag}&datumTot=${zondag}&soort=expositie`,
  };
}

function begrens(waarde: string | null | undefined, max: number): string {
  return (waarde ?? '').trim().slice(0, max);
}

/** Alleen een pad op deze site, of een https-adres. Geen javascript: of protocol-relatieve link. */
export function veiligeBannerLink(waarde: string): string {
  const link = waarde.trim();
  if (!link || link.length > BANNER_TEKST_GRENZEN.link) return '';
  if (link.startsWith('/') && !link.startsWith('//') && !link.includes('\\') && !/[\s\u0000-\u001f]/.test(link)) {
    return link;
  }
  if (!link.startsWith('https://') || /[\s\u0000-\u001f]/.test(link)) return '';
  try {
    const url = new URL(link);
    if (url.protocol !== 'https:' || !url.hostname) return '';
    return link;
  } catch {
    return '';
  }
}

function tekstBannerInhoud(instelling: VrijgekomenWeekendInstelling): VrijgekomenWeekendInhoud | null {
  const titel = begrens(instelling.titel, BANNER_TEKST_GRENZEN.titel);
  const tekst = begrens(instelling.tekst, BANNER_TEKST_GRENZEN.tekst);
  if (!titel && !tekst) return null;
  const link = veiligeBannerLink(instelling.link);
  const knop = begrens(instelling.knop, BANNER_TEKST_GRENZEN.knop);
  const toonKnop = Boolean(knop && link);
  return {
    soort: 'tekst',
    zaterdag: '',
    zondag: '',
    eyebrow: begrens(instelling.eyebrow, BANNER_TEKST_GRENZEN.eyebrow),
    titel,
    tekst,
    knop: toonKnop ? knop : '',
    periode: '',
    kaarten: [],
    aanvraagPad: toonKnop ? link : '',
  };
}

/** Weekend krijgt datumkaarten. Alleen tekst krijgt die niet. */
export function inhoudUitInstelling(instelling: VrijgekomenWeekendInstelling): VrijgekomenWeekendInhoud | null {
  if (instelling.soort === 'tekst') return tekstBannerInhoud(instelling);
  if (!isZaterdag(instelling.zaterdag)) return null;
  return bannerInhoud(instelling.zaterdag);
}

const standaardInhoud = bannerInhoud(STANDAARD_VRIJGEKOMEN_WEEKEND.zaterdag);

export const VRIJGEKOMEN_EXPOSITIE_WEEKEND = {
  zaterdag: standaardInhoud.zaterdag,
  zondag: standaardInhoud.zondag,
  eyebrow: standaardInhoud.eyebrow,
  titel: standaardInhoud.titel,
  tekst: standaardInhoud.tekst,
  knop: standaardInhoud.knop,
} as const;

export function weekendDatumKaarten(zaterdag = STANDAARD_VRIJGEKOMEN_WEEKEND.zaterdag): [WeekendDatumKaart, WeekendDatumKaart] {
  const [zaterdagKaart, zondagKaart] = bannerInhoud(zaterdag).kaarten;
  return [zaterdagKaart, zondagKaart];
}

export function aanvraagPadVrijgekomenWeekend(zaterdag = STANDAARD_VRIJGEKOMEN_WEEKEND.zaterdag): string {
  return bannerInhoud(zaterdag).aanvraagPad;
}

/** Of het weekend in de copy nog in de toekomst of gaande is. */
export function weekendNogBeschikbaar(nu = new Date(), zondag = VRIJGEKOMEN_EXPOSITIE_WEEKEND.zondag): boolean {
  return vandaagInAmsterdam(nu) <= zondag;
}

export function toonVrijgekomenWeekendBanner(
  nu = new Date(),
  instelling: VrijgekomenWeekendInstelling = STANDAARD_VRIJGEKOMEN_WEEKEND,
): boolean {
  if (!instelling.actief) return false;
  if (instelling.soort === 'tekst') return Boolean(instelling.titel.trim() || instelling.tekst.trim());
  if (!isZaterdag(instelling.zaterdag)) return false;
  return weekendNogBeschikbaar(nu, zondagVanZaterdag(instelling.zaterdag));
}

export function weekendVolledigVrij(zaterdag: string, bezetteDagen: ReadonlySet<string>): boolean {
  if (!isZaterdag(zaterdag)) return false;
  const zondag = zondagVanZaterdag(zaterdag);
  return !bezetteDagen.has(zaterdag) && !bezetteDagen.has(zondag);
}

/**
 * Banner aan, weekend nog niet voorbij, en — als de bezetting bekend is —
 * beide dagen nog vrij. Zonder bezetting blijft de banner staan.
 */
export function bannerZichtbaar(
  instelling: VrijgekomenWeekendInstelling,
  nu = new Date(),
  bezetteDagen: ReadonlySet<string> | null = null,
): boolean {
  if (!toonVrijgekomenWeekendBanner(nu, instelling)) return false;
  if (instelling.soort === 'tekst') return true;
  if (!bezetteDagen) return true;
  return weekendVolledigVrij(instelling.zaterdag, bezetteDagen);
}

/** Op het aanvraagformulier zelf zou de banner alleen afleiden. */
export function toonVrijgekomenWeekendBannerOpPagina(
  pad: string,
  nu = new Date(),
  instelling: VrijgekomenWeekendInstelling = STANDAARD_VRIJGEKOMEN_WEEKEND,
  bezetteDagen: ReadonlySet<string> | null = null,
): boolean {
  if (pad.startsWith('/verhuur/aanvragen')) return false;
  return bannerZichtbaar(instelling, nu, bezetteDagen);
}

export interface VrijWeekendKeuze {
  zaterdag: string;
  zondag: string;
  /** Korte keuze in de lijst, bijvoorbeeld "17 en 18 oktober 2026". */
  label: string;
  periode: string;
  knop: string;
}

/**
 * Komende weekenden waarin zaterdag én zondag vrij zijn.
 * Een deels bezet weekend hoort niet in de keuze: de banner noemt beide dagen.
 */
export function volledigVrijeWeekenden(
  bezetteDagen: ReadonlySet<string>,
  nu = new Date(),
  maandenVooruit = 18,
): VrijWeekendKeuze[] {
  const vandaag = vandaagInAmsterdam(nu);
  const horizon = plusMaanden(vandaag, maandenVooruit);
  const resultaat: VrijWeekendKeuze[] = [];
  let zaterdag = komendWeekend(nu).zaterdag;
  let veiligheid = 0;
  while (zaterdag <= horizon && veiligheid < 120) {
    const zondag = zondagVanZaterdag(zaterdag);
    if (zondag >= vandaag && weekendVolledigVrij(zaterdag, bezetteDagen)) {
      resultaat.push({
        zaterdag,
        zondag,
        label: labelVanWeekend(zaterdag, zondag),
        periode: periodeVanWeekend(zaterdag, zondag),
        knop: knopVanWeekend(zaterdag, zondag),
      });
    }
    zaterdag = plusDagen(zaterdag, 7);
    veiligheid++;
  }
  return resultaat;
}

const BEZETTENDE_ZICHTBAARHEID = new Set(['publiek', 'bezet']);

/**
 * Zelfde bezetting als de verhuurkalender, uit de gegevens die Beheer al heeft:
 * blokkerende boekingen, interne blokkades en zichtbare agenda-items.
 */
export function bezetteDagenUitBronnen(
  bronnen: {
    boekingen?: readonly BezettingVoorWeekend[];
    blokkades?: readonly BezettingVoorWeekend[];
    agenda?: readonly BezettingVoorWeekend[];
  },
  bezetteKalenderDagen: (items: readonly BezettingVoorWeekend[]) => Set<string>,
): Set<string> {
  const items: BezettingVoorWeekend[] = [];
  for (const boeking of bronnen.boekingen ?? []) {
    if (!boeking.status || !BLOKKERENDE_BOEKING.has(boeking.status)) continue;
    items.push(boeking);
  }
  for (const blokkade of bronnen.blokkades ?? []) {
    if (blokkade.blokkeert === false) continue;
    items.push({ ...blokkade, soort: blokkade.soort || 'blokkade' });
  }
  for (const item of bronnen.agenda ?? []) {
    if (item.geannuleerd || item.levenscyclus === 'geannuleerd') continue;
    const zichtbaarheid = item.publicatiestatus ?? item.zichtbaarheid ?? '';
    if (!BEZETTENDE_ZICHTBAARHEID.has(zichtbaarheid)) continue;
    items.push(item);
  }
  return bezetteKalenderDagen(items);
}

function tekstVan(waarde: unknown): string {
  return typeof waarde === 'string' ? waarde.trim() : '';
}

function leegTekst(): Pick<VrijgekomenWeekendInstelling, 'eyebrow' | 'titel' | 'tekst' | 'knop' | 'link'> {
  return { eyebrow: '', titel: '', tekst: '', knop: '', link: '' };
}

export function parseVrijgekomenWeekend(waarde: unknown): VrijgekomenWeekendInstelling | null {
  const bron = typeof waarde === 'string' ? veiligeJson(waarde) : waarde;
  if (!bron || typeof bron !== 'object') return null;
  const rij = bron as Record<string, unknown>;
  const zaterdag = tekstVan(rij.zaterdag);
  return {
    actief: rij.actief === true || rij.actief === 'true',
    soort: rij.soort === 'tekst' ? 'tekst' : 'weekend',
    zaterdag: isZaterdag(zaterdag) ? zaterdag : '',
    eyebrow: begrens(tekstVan(rij.eyebrow), BANNER_TEKST_GRENZEN.eyebrow),
    titel: begrens(tekstVan(rij.titel), BANNER_TEKST_GRENZEN.titel),
    tekst: begrens(tekstVan(rij.tekst), BANNER_TEKST_GRENZEN.tekst),
    knop: begrens(tekstVan(rij.knop), BANNER_TEKST_GRENZEN.knop),
    link: begrens(tekstVan(rij.link), BANNER_TEKST_GRENZEN.link),
  };
}

function veiligeJson(tekst: string): unknown {
  try {
    return JSON.parse(tekst);
  } catch {
    return null;
  }
}

export function vrijgekomenWeekendRij(instelling: VrijgekomenWeekendInstelling): {
  sleutel: string;
  groep: string;
  waarde: {
    actief: boolean;
    soort: BannerSoort;
    zaterdag: string | null;
    eyebrow: string;
    titel: string;
    tekst: string;
    knop: string;
    link: string | null;
  };
  toelichting: string;
} {
  const link = veiligeBannerLink(instelling.link);
  return {
    sleutel: VRIJGEKOMEN_WEEKEND_SLEUTEL,
    groep: 'website',
    waarde: {
      actief: instelling.actief,
      soort: instelling.soort === 'tekst' ? 'tekst' : 'weekend',
      zaterdag: isZaterdag(instelling.zaterdag) ? instelling.zaterdag : null,
      eyebrow: begrens(instelling.eyebrow, BANNER_TEKST_GRENZEN.eyebrow),
      titel: begrens(instelling.titel, BANNER_TEKST_GRENZEN.titel),
      tekst: begrens(instelling.tekst, BANNER_TEKST_GRENZEN.tekst),
      knop: begrens(instelling.knop, BANNER_TEKST_GRENZEN.knop),
      link: link || null,
    },
    toelichting: 'Banner voor een vrij expositieweekend of alleen tekst',
  };
}

function tekstUitFormulier(form: { get(naam: string): FormDataEntryValue | null }): VrijgekomenWeekendInstelling {
  return {
    ...leegTekst(),
    actief: false,
    soort: 'tekst',
    zaterdag: '',
    eyebrow: begrens(String(form.get('eyebrow') ?? ''), BANNER_TEKST_GRENZEN.eyebrow),
    titel: begrens(String(form.get('titel') ?? ''), BANNER_TEKST_GRENZEN.titel),
    tekst: begrens(String(form.get('tekst') ?? '').replace(/\s+/g, ' '), BANNER_TEKST_GRENZEN.tekst),
    knop: begrens(String(form.get('knop') ?? ''), BANNER_TEKST_GRENZEN.knop),
    link: begrens(String(form.get('link') ?? ''), BANNER_TEKST_GRENZEN.link),
  };
}

function controleerTekst(instelling: VrijgekomenWeekendInstelling, actief: boolean): void {
  if (actief && !instelling.titel && !instelling.tekst) {
    throw new Error('Vul een titel of tekst in.');
  }
  if (instelling.knop && !instelling.link) {
    throw new Error('Vul een link in bij de knop, of laat de knop leeg.');
  }
  if (instelling.link && !instelling.knop) {
    throw new Error('Vul een knoptekst in, of laat de link leeg.');
  }
  if (instelling.link && !veiligeBannerLink(instelling.link)) {
    throw new Error('De link moet beginnen met / of https://.');
  }
}

export function bannerUitFormulier(
  form: {
    get(naam: string): FormDataEntryValue | null;
    getAll(naam: string): FormDataEntryValue[];
  },
  vrijeZaterdagen: ReadonlySet<string>,
): VrijgekomenWeekendInstelling {
  const actief = form.getAll('actief').some((waarde) => String(waarde) === '1');
  const soort: BannerSoort = String(form.get('soort') ?? '') === 'tekst' ? 'tekst' : 'weekend';
  const tekst = tekstUitFormulier(form);
  const ruweZaterdag = String(form.get('zaterdag') ?? '').trim();
  if (soort === 'tekst') {
    controleerTekst(tekst, actief);
    return {
      ...tekst,
      actief,
      soort,
      zaterdag: isZaterdag(ruweZaterdag) ? ruweZaterdag : '',
    };
  }
  if (!ruweZaterdag) {
    if (actief) throw new Error('Kies een vrij weekend.');
    return { ...tekst, actief: false, soort: 'weekend', zaterdag: '' };
  }
  if (!isZaterdag(ruweZaterdag) || !vrijeZaterdagen.has(ruweZaterdag)) {
    throw new Error('Dit weekend is niet vrij. Kies een beschikbaar weekend.');
  }
  return { ...tekst, actief, soort: 'weekend', zaterdag: ruweZaterdag };
}

/**
 * Resultaat van publieke_vrijgekomen_weekend_banner().
 * Een fout (functie ontbreekt) toont het standaardweekend, zodat de banner
 * niet stil verdwijnt. Een lege respons betekent: uitgezet of voorbij.
 */
export function bannerUitRpc(
  data: unknown,
  error: { message: string } | null,
  nu = new Date(),
): VrijgekomenWeekendInstelling | null {
  if (error) {
    return toonVrijgekomenWeekendBanner(nu, STANDAARD_VRIJGEKOMEN_WEEKEND)
      ? STANDAARD_VRIJGEKOMEN_WEEKEND
      : null;
  }
  if (!data || typeof data !== 'object') return null;
  const rij = data as Record<string, unknown>;
  if (rij.soort === 'tekst') {
    const instelling: VrijgekomenWeekendInstelling = {
      actief: true,
      soort: 'tekst',
      zaterdag: '',
      eyebrow: begrens(tekstVan(rij.eyebrow), BANNER_TEKST_GRENZEN.eyebrow),
      titel: begrens(tekstVan(rij.titel), BANNER_TEKST_GRENZEN.titel),
      tekst: begrens(tekstVan(rij.tekst), BANNER_TEKST_GRENZEN.tekst),
      knop: begrens(tekstVan(rij.knop), BANNER_TEKST_GRENZEN.knop),
      link: begrens(tekstVan(rij.link), BANNER_TEKST_GRENZEN.link),
    };
    return toonVrijgekomenWeekendBanner(nu, instelling) ? instelling : null;
  }
  const zaterdag = tekstVan(rij.zaterdag);
  if (!isZaterdag(zaterdag)) return null;
  const instelling: VrijgekomenWeekendInstelling = {
    ...leegTekst(),
    actief: true,
    soort: 'weekend',
    zaterdag,
  };
  return toonVrijgekomenWeekendBanner(nu, instelling) ? instelling : null;
}
