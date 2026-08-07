/**
 * Validatie van een verhuuraanvraag. Bewust vrij van imports.
 *
 * Deze module raakt geen netwerk, geen CMS en geen mailkoppeling. Daardoor is hij zonder
 * bouwstap of mocks te testen, en dat is precies wat je wilt bij de enige echte logica
 * in dit project: een aanvraag die onterecht wordt afgekeurd, merkt niemand op.
 *
 * Vier soorten (was vijf): "Diverse bijeenkomsten" vervangt "Viering" en "Anders" —
 * dekt onder meer uitvaarten, herdenkingen, lezingen en vergelijkbare bijeenkomsten.
 * Expositie staat voorop: dat is de corebusiness.
 *
 * "datumTot" is optioneel: veel verhuur is een heel weekend (zaterdag én zondag),
 * niet één dag. Leeg laten betekent een eendaagse aanvraag.
 *
 * De expositie-specifieke velden (website, eerderGeexposeerd, medeExposanten,
 * akkoordVoorwaarden) staan altijd in het formulier (nodig zonder JavaScript),
 * maar worden alleen inhoudelijk afgedwongen wanneer soort === 'expositie'.
 * "Aantal personen" werkt precies andersom: verplicht voor alle typen BEHALVE
 * expositie (Nelleke, contractbeheer: bezoekersaantal van een expositie is
 * vooraf niet in te schatten).
 */

export const SOORTEN = [
  { waarde: 'expositie', label: 'Expositie' },
  { waarde: 'bruiloft', label: 'Bruiloft' },
  { waarde: 'concert', label: 'Concert' },
  { waarde: 'diverse', label: 'Diverse bijeenkomsten' },
] as const;

const GELDIGE_SOORTEN = SOORTEN.map((s) => s.waarde) as readonly string[];

export interface Aanvraag {
  datum: string;
  datumTot: string;
  soort: string;
  personen: string;
  naam: string;
  email: string;
  adres: string;
  telefoon: string;
  toelichting: string;
  // Alleen relevant bij expositie:
  website: string;
  eerderGeexposeerd: string; // 'ja' | 'nee' | ''
  medeExposanten: string;
  akkoordVoorwaarden: string; // 'ja' | ''
  // Interne vlag: gezet nadat iemand de weekend-waarschuwing heeft gezien en
  // toch bewust op "Toch versturen" heeft geklikt.
  negeerWaarschuwing: string; // 'ja' | ''
}

export type Fouten = Partial<Record<keyof Aanvraag | 'algemeen', string>>;

export const LEGE_AANVRAAG: Aanvraag = {
  datum: '',
  datumTot: '',
  soort: '',
  personen: '',
  naam: '',
  email: '',
  adres: '',
  telefoon: '',
  toelichting: '',
  website: '',
  eerderGeexposeerd: '',
  medeExposanten: '',
  akkoordVoorwaarden: '',
  negeerWaarschuwing: '',
};

export function leesFormulier(data: FormData): Aanvraag {
  const lees = (k: keyof Aanvraag) => String(data.get(k) ?? '').trim();
  return {
    datum: lees('datum'),
    datumTot: lees('datumTot'),
    soort: lees('soort'),
    personen: lees('personen'),
    naam: lees('naam'),
    email: lees('email'),
    adres: lees('adres'),
    telefoon: lees('telefoon'),
    toelichting: lees('toelichting'),
    website: lees('website'),
    eerderGeexposeerd: lees('eerderGeexposeerd'),
    medeExposanten: lees('medeExposanten'),
    akkoordVoorwaarden: lees('akkoordVoorwaarden'),
    negeerWaarschuwing: lees('negeerWaarschuwing'),
  };
}

export function valideer(a: Aanvraag): Fouten {
  const fouten: Fouten = {};
  const isExpositie = a.soort === 'expositie';

  if (!a.datum) fouten.datum = 'Kies een datum.';
  else if (Number.isNaN(Date.parse(a.datum))) fouten.datum = 'Deze datum begrijpen we niet.';
  else if (new Date(a.datum) < new Date(new Date().toDateString()))
    fouten.datum = 'Kies een datum in de toekomst.';

  if (a.datumTot) {
    if (Number.isNaN(Date.parse(a.datumTot))) {
      fouten.datumTot = 'Deze einddatum begrijpen we niet.';
    } else if (!fouten.datum && a.datumTot < a.datum) {
      fouten.datumTot = 'De einddatum ligt vóór de startdatum.';
    }
  }

  if (!a.soort) fouten.soort = 'Kies wat voor bijeenkomst het wordt.';
  else if (!GELDIGE_SOORTEN.includes(a.soort)) fouten.soort = 'Kies een optie uit de lijst.';

  // Aantal personen: verplicht, BEHALVE bij een expositie.
  if (!isExpositie) {
    const aantal = Number(a.personen);
    if (!a.personen) fouten.personen = 'Vul een aantal personen in.';
    else if (!Number.isInteger(aantal) || aantal < 1 || aantal > 500)
      fouten.personen = 'Vul een heel aantal tussen 1 en 500 in.';
  } else if (a.personen) {
    const aantal = Number(a.personen);
    if (!Number.isInteger(aantal) || aantal < 1 || aantal > 500)
      fouten.personen = 'Vul een heel aantal tussen 1 en 500 in, of laat leeg.';
  }

  if (!a.naam) fouten.naam = 'Vul je naam in.';
  else if (a.naam.length > 120) fouten.naam = 'Deze naam is te lang.';

  if (!a.email) fouten.email = 'Vul je e-mailadres in.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email))
    fouten.email = 'Dit e-mailadres klopt niet. Controleer op een typefout.';

  if (!a.adres) fouten.adres = 'Vul je adres in, inclusief postcode en woonplaats.';
  else if (a.adres.length > 300) fouten.adres = 'Dit adres is te lang.';

if (!a.telefoon) fouten.telefoon = 'Vul je telefoonnummer in.';
  else if (a.telefoon.replace(/\D/g, '').length < 8)
    fouten.telefoon = 'Dit telefoonnummer lijkt niet compleet.';

  if (a.toelichting.length > 3000) fouten.toelichting = 'Houd de toelichting korter.';

  if (a.website && a.website.length > 300) fouten.website = 'Deze link is te lang.';
  if (a.medeExposanten.length > 500) fouten.medeExposanten = 'Houd dit korter.';

  // Consent alleen verplicht bij expositie — bruiloften/concerten hebben geen
  // "huishoudelijk reglement voor exposanten" nodig.
  if (isExpositie && a.akkoordVoorwaarden !== 'ja') {
    fouten.akkoordVoorwaarden = 'Bevestig dat je akkoord gaat met de verhuurvoorwaarden.';
  }

  return fouten;
}

/**
 * Weekendregel voor exposities (bestuursbesluit, augustus 2026):
 * een expositie is in principe een heel weekend (zaterdag + zondag). Uitzondering:
 * als de andere dag van hetzelfde weekend al een bruiloft heeft, mag de resterende
 * dag als losse expositiedag. Dit is bewust een WAARSCHUWING, geen blokkade — het
 * bestuur beoordeelt sowieso elke aanvraag handmatig.
 *
 * Bevestigd (livegang-QA): blijft een waarschuwing, wordt geen harde blokkade.
 * Geldt alleen voor 'expositie'.
 */
export function weekendWaarschuwing(
  a: Pick<Aanvraag, 'soort' | 'datum' | 'datumTot'>,
  isAndereDagBruiloft: (dagIso: string) => boolean
): string | null {
  if (a.soort !== 'expositie' || !a.datum) return null;

  const start = new Date(a.datum + 'T00:00:00Z');
  const dagVdWeek = start.getUTCDay(); // 0 = zondag, 6 = zaterdag

  const eenDag = !a.datumTot || a.datumTot === a.datum;

  if (eenDag) {
    if (dagVdWeek !== 6 && dagVdWeek !== 0) {
      return 'Exposities zijn normaal gesproken een heel weekend. Overleg dit gerust telefonisch als een doordeweekse dag toch nodig is.';
    }
    const andereDag = new Date(start);
    andereDag.setUTCDate(andereDag.getUTCDate() + (dagVdWeek === 6 ? 1 : -1));
    const andereDagIso = andereDag.toISOString().slice(0, 10);

    if (!isAndereDagBruiloft(andereDagIso)) {
      return 'Exposities zijn normaal gesproken een heel weekend (zaterdag én zondag). Eén losse dag is alleen gebruikelijk als de andere dag al een bruiloft heeft.';
    }
    return null;
  }

  const eind = new Date(a.datumTot + 'T00:00:00Z');
  const eindDagVdWeek = eind.getUTCDay();
  const eenDagVerschil = (eind.getTime() - start.getTime()) === 24 * 60 * 60 * 1000;

  const isVolledigWeekend = dagVdWeek === 6 && eindDagVdWeek === 0 && eenDagVerschil;
  if (!isVolledigWeekend) {
    return 'Exposities zijn normaal gesproken een heel weekend (zaterdag én zondag).';
  }
  return null;
}

/**
 * Rate limiting in het geheugen van één instantie. Weert het simpele geval
 * (iemand die twintig keer verstuurt), niet een verdeelde aanval. Bewust geaccepteerd;
 * bij echte spam is Vercel Firewall de volgende stap.
 */
const treffers = new Map<string, number[]>();
const VENSTER_MS = 15 * 60 * 1000;
const MAX_PER_VENSTER = 5;

export function teVaak(sleutel: string): boolean {
  const nu = Date.now();
  const eerder = (treffers.get(sleutel) ?? []).filter((t) => nu - t < VENSTER_MS);
  eerder.push(nu);
  treffers.set(sleutel, eerder);
  return eerder.length > MAX_PER_VENSTER;
}
