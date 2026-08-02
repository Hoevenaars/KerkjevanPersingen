/**
 * Validatie van een verhuuraanvraag. Bewust vrij van imports.
 *
 * Deze module raakt geen netwerk, geen CMS en geen mailkoppeling. Daardoor is hij zonder
 * bouwstap of mocks te testen, en dat is precies wat je wilt bij de enige echte logica
 * in dit project: een aanvraag die onterecht wordt afgekeurd, merkt niemand op.
 */

export const SOORTEN = [
  { waarde: 'bruiloft', label: 'Bruiloft' },
  { waarde: 'concert', label: 'Concert' },
  { waarde: 'expositie', label: 'Expositie' },
  { waarde: 'vergadering', label: 'Vergadering' },
  { waarde: 'viering', label: 'Viering' },
  { waarde: 'anders', label: 'Iets anders' },
] as const;

const GELDIGE_SOORTEN = SOORTEN.map((s) => s.waarde) as readonly string[];

export interface Aanvraag {
  datum: string;
  soort: string;
  personen: string;
  naam: string;
  email: string;
  telefoon: string;
  toelichting: string;
}

export type Fouten = Partial<Record<keyof Aanvraag | 'algemeen', string>>;

export const LEGE_AANVRAAG: Aanvraag = {
  datum: '',
  soort: '',
  personen: '',
  naam: '',
  email: '',
  telefoon: '',
  toelichting: '',
};

export function leesFormulier(data: FormData): Aanvraag {
  const lees = (k: keyof Aanvraag) => String(data.get(k) ?? '').trim();
  return {
    datum: lees('datum'),
    soort: lees('soort'),
    personen: lees('personen'),
    naam: lees('naam'),
    email: lees('email'),
    telefoon: lees('telefoon'),
    toelichting: lees('toelichting'),
  };
}

export function valideer(a: Aanvraag): Fouten {
  const fouten: Fouten = {};

  if (!a.datum) fouten.datum = 'Kies een datum.';
  else if (Number.isNaN(Date.parse(a.datum))) fouten.datum = 'Deze datum begrijpen we niet.';
  else if (new Date(a.datum) < new Date(new Date().toDateString()))
    fouten.datum = 'Kies een datum in de toekomst.';

  if (!a.soort) fouten.soort = 'Kies wat voor bijeenkomst het wordt.';
  else if (!GELDIGE_SOORTEN.includes(a.soort)) fouten.soort = 'Kies een optie uit de lijst.';

  const aantal = Number(a.personen);
  if (!a.personen) fouten.personen = 'Vul een aantal personen in.';
  else if (!Number.isInteger(aantal) || aantal < 1 || aantal > 500)
    fouten.personen = 'Vul een heel aantal tussen 1 en 500 in.';

  if (!a.naam) fouten.naam = 'Vul je naam in.';
  else if (a.naam.length > 120) fouten.naam = 'Deze naam is te lang.';

  if (!a.email) fouten.email = 'Vul je e-mailadres in.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email))
    fouten.email = 'Dit e-mailadres klopt niet. Controleer op een typefout.';

  if (a.telefoon && a.telefoon.replace(/\D/g, '').length < 8)
    fouten.telefoon = 'Dit telefoonnummer lijkt niet compleet.';

  if (a.toelichting.length > 3000) fouten.toelichting = 'Houd de toelichting korter.';

  return fouten;
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
