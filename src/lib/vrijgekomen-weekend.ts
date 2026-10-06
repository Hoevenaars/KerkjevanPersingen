/**
 * Banner voor een vrij expositieweekend.
 *
 * Zichtbaarheid en het gekozen weekend komen uit Beheer → Publiceren
 * (instellingen.vrijgekomen_weekend_banner). De tekst en de datumkaarten
 * worden uit dat weekend opgebouwd. Zonder opgeslagen instelling blijft
 * 17 en 18 oktober 2026 de terugval, zodat de banner niet stil verdwijnt.
 *
 * Staat op alle publieke pagina's behalve `/verhuur/aanvragen`.
 * Na afloop van het gekozen weekend verdwijnt de banner vanzelf — Nederlandse tijd.
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

export interface VrijgekomenWeekendInstelling {
  actief: boolean;
  /** Zaterdag YYYY-MM-DD, of leeg als er nog geen weekend is gekozen. */
  zaterdag: string;
}

export const STANDAARD_VRIJGEKOMEN_WEEKEND: VrijgekomenWeekendInstelling = {
  actief: VRIJGEKOMEN_WEEKEND_BANNER_AAN,
  zaterdag: '2026-10-17',
};

export type WeekendDatumKaart = {
  ymd: string;
  weekdag: string;
  dag: string;
  maand: string;
};

export interface VrijgekomenWeekendInhoud {
  zaterdag: string;
  zondag: string;
  eyebrow: string;
  titel: string;
  tekst: string;
  knop: string;
  periode: string;
  kaarten: [WeekendDatumKaart, WeekendDatumKaart];
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
    zaterdag,
    zondag,
    ...BASIS_TEKST,
    knop: knopVanWeekend(zaterdag, zondag),
    periode: periodeVanWeekend(zaterdag, zondag),
    kaarten: [datumKaart(zaterdag), datumKaart(zondag)],
    aanvraagPad: `/verhuur/aanvragen/?datum=${zaterdag}&datumTot=${zondag}&soort=expositie`,
  };
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
  return bannerInhoud(zaterdag).kaarten;
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
  if (!instelling.actief || !isZaterdag(instelling.zaterdag)) return false;
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

export function parseVrijgekomenWeekend(waarde: unknown): VrijgekomenWeekendInstelling | null {
  const bron = typeof waarde === 'string' ? veiligeJson(waarde) : waarde;
  if (!bron || typeof bron !== 'object') return null;
  const rij = bron as Record<string, unknown>;
  const zaterdag = tekstVan(rij.zaterdag);
  return {
    actief: rij.actief === true || rij.actief === 'true',
    zaterdag: isZaterdag(zaterdag) ? zaterdag : '',
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
  waarde: { actief: boolean; zaterdag: string | null };
  toelichting: string;
} {
  return {
    sleutel: VRIJGEKOMEN_WEEKEND_SLEUTEL,
    groep: 'website',
    waarde: {
      actief: instelling.actief,
      zaterdag: isZaterdag(instelling.zaterdag) ? instelling.zaterdag : null,
    },
    toelichting: 'Banner voor een vrij expositieweekend',
  };
}

export function bannerUitFormulier(
  form: {
    get(naam: string): FormDataEntryValue | null;
    getAll(naam: string): FormDataEntryValue[];
  },
  vrijeZaterdagen: ReadonlySet<string>,
): VrijgekomenWeekendInstelling {
  const actief = form.getAll('actief').some((waarde) => String(waarde) === '1');
  const zaterdag = String(form.get('zaterdag') ?? '').trim();
  if (!zaterdag) {
    if (actief) throw new Error('Kies een vrij weekend.');
    return { actief: false, zaterdag: '' };
  }
  if (!isZaterdag(zaterdag) || !vrijeZaterdagen.has(zaterdag)) {
    throw new Error('Dit weekend is niet vrij. Kies een beschikbaar weekend.');
  }
  return { actief, zaterdag };
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
  const zaterdag = tekstVan(rij.zaterdag);
  if (!isZaterdag(zaterdag)) return null;
  const instelling: VrijgekomenWeekendInstelling = { actief: true, zaterdag };
  return toonVrijgekomenWeekendBanner(nu, instelling) ? instelling : null;
}
