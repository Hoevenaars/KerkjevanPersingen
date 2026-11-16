/**
 * Handmatige boeking door een bestuurder, zonder publiek aanvraagformulier.
 * De zichtbare fase is Nieuw, In behandeling of Gereed.
 * Definitief blijft een aparte boekingsstatus.
 * Een interne activiteit krijgt geen huurder, contract of betaling.
 */

import { beschikbaarheidVoor, type Beschikbaarheid, type ConflictRegel, type FaseWereld } from './aanvraag-fase.ts';
import { isYmd } from './datum.ts';
import { STANDAARD_VERHUURTYPEN, type Verhuurtype } from './types.ts';
import { valideerVerhuurperiode } from './verhuur.ts';

export const INTERNE_TITEL_PREFIX = 'Interne activiteit — ';

export const INTERNE_SOORTEN = [
  { sleutel: 'grote_schoonmaak', naam: 'Grote schoonmaak' },
  { sleutel: 'onderhoud', naam: 'Onderhoud' },
  { sleutel: 'bestuursvergadering', naam: 'Bestuursvergadering' },
  { sleutel: 'voorbereiding', naam: 'Voorbereiding evenement' },
  { sleutel: 'overig', naam: 'Overig' },
] as const;

export type InterneSoort = (typeof INTERNE_SOORTEN)[number]['sleutel'];

export const AANVRAAG_FASEN = ['nieuw', 'in_behandeling', 'gereed'] as const;
export type AanvraagFaseKeuze = (typeof AANVRAAG_FASEN)[number];

export const FASE_KEUZE_LABEL: Record<AanvraagFaseKeuze, string> = {
  nieuw: 'Nieuw',
  in_behandeling: 'In behandeling',
  gereed: 'Gereed',
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIJD = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface HandmatigeBoeking {
  soort: 'verhuur' | 'intern';
  naam: string;
  email: string;
  telefoon: string;
  adres: string;
  verhuurtype: string;
  start: string;
  eind: string;
  personen: string;
  toelichting: string;
  titel: string;
  fase: AanvraagFaseKeuze;
  definitief: boolean;
  contractVerzonden: boolean;
  contractOndertekend: boolean;
  aanbetalingOntvangen: boolean;
  uitzondering: string;
  interneSoort: InterneSoort | '';
  heleDag: boolean;
  tijdVan: string;
  tijdTot: string;
  opmerkingen: string;
  mail: boolean;
  bevestigConflict: boolean;
  conflictReden: string;
}

export interface AdviesRegel {
  naam: string;
  periode: string;
  tekst: string;
  href: string;
}

export type AdviesUitkomst = 'beschikbaar' | 'aanvraag' | 'bezet' | 'geblokkeerd' | 'onvolledig';

export interface Beschikbaarheidsadvies {
  uitkomst: AdviesUitkomst;
  kop: string;
  tekst: string;
  regels: AdviesRegel[];
  aanvragen: AdviesRegel[];
}

export interface Bevestiging {
  templateId: 'booking_request_received' | 'booking_confirmed';
  automatieSleutel: 'aanvraag_bevestiging' | 'statusmail_huurder';
  naam: string;
  pastBij: string;
}

type Ruw = Record<string, string | undefined>;

export function interneSoortNaam(sleutel: string): string {
  return INTERNE_SOORTEN.find((soort) => soort.sleutel === sleutel)?.naam ?? '';
}

export function interneAgendaTitel(soortNaam: string): string {
  return `${INTERNE_TITEL_PREFIX}${soortNaam}`;
}

export function isInterneActiviteitTitel(titel: string): boolean {
  return titel.trim().startsWith(INTERNE_TITEL_PREFIX);
}

export function leesHandmatigeBoeking(
  ruw: Ruw,
  typen: readonly Verhuurtype[] = STANDAARD_VERHUURTYPEN,
): { ok: true; boeking: HandmatigeBoeking } | { ok: false; melding: string } {
  const ruweSoort = ruw.soortBoeking ?? (ruw.soort === 'intern' || ruw.soort === 'verhuur' ? ruw.soort : '');
  const soort = ruweSoort === 'intern' ? 'intern' : ruweSoort === 'verhuur' || !ruweSoort ? 'verhuur' : '';
  const fase = (AANVRAAG_FASEN as readonly string[]).includes(ruw.fase ?? '')
    ? (ruw.fase as AanvraagFaseKeuze)
    : '';
  const vlag = (sleutel: string) => ruw[sleutel] === 'ja' || ruw[sleutel] === 'on' || ruw[sleutel] === 'true';
  const fouten: string[] = [];
  if (soort !== 'verhuur' && soort !== 'intern') fouten.push('Kies reguliere verhuur of een interne activiteit.');

  const basis: HandmatigeBoeking = {
    soort: soort === 'intern' ? 'intern' : 'verhuur',
    naam: (ruw.naam ?? '').trim(),
    email: (ruw.email ?? '').trim(),
    telefoon: (ruw.telefoon ?? '').trim(),
    adres: (ruw.adres ?? '').trim(),
    verhuurtype: (ruw.verhuurtype ?? '').trim(),
    start: (ruw.start ?? '').trim(),
    eind: ((ruw.eind ?? '').trim() || (ruw.start ?? '').trim()),
    personen: (ruw.personen ?? '').trim(),
    toelichting: (ruw.toelichting ?? '').trim(),
    titel: (ruw.titel ?? '').trim(),
    fase: fase || 'nieuw',
    definitief: vlag('definitief'),
    contractVerzonden: vlag('contract_verzonden'),
    contractOndertekend: vlag('contract_ondertekend'),
    aanbetalingOntvangen: vlag('aanbetaling'),
    uitzondering: (ruw.uitzondering ?? ruw.reden ?? '').trim(),
    interneSoort: (INTERNE_SOORTEN as readonly { sleutel: string }[]).some((item) => item.sleutel === ruw.interne_soort)
      ? (ruw.interne_soort as InterneSoort)
      : '',
    heleDag: ruw.hele_dag === 'ja' || ruw.hele_dag === 'on' || ruw.hele_dag === 'true' || ruw.hele_dag == null,
    tijdVan: (ruw.tijd_van ?? '').trim(),
    tijdTot: (ruw.tijd_tot ?? '').trim(),
    opmerkingen: (ruw.opmerkingen ?? '').trim(),
    mail: ruw.mail === 'ja',
    bevestigConflict: vlag('bevestig_conflict'),
    conflictReden: (ruw.conflict_reden ?? '').trim(),
  };

    if (soort === 'intern') {
    const datum = (ruw.datum ?? ruw.start ?? '').trim();
    basis.titel = (ruw.interne_omschrijving ?? ruw.titel ?? '').trim();
    basis.start = datum;
    basis.eind = datum;
    basis.fase = 'gereed';
    basis.definitief = false;
    basis.mail = false;
    basis.heleDag = ruw.hele_dag !== 'nee';
    if (basis.titel.length < 2) fouten.push('Vul een titel of omschrijving in.');
    if (!basis.interneSoort) fouten.push('Kies het soort interne activiteit.');
    if (basis.interneSoort === 'overig' && basis.titel.length < 2) {
      fouten.push('Beschrijf de interne activiteit bij Overig.');
    }
    if (!isYmd(datum) || !kalenderdag(datum)) fouten.push('Kies een geldige datum.');
    if (!basis.heleDag) {
      if (!TIJD.test(basis.tijdVan) || !TIJD.test(basis.tijdTot)) fouten.push('Vul een begin- en eindtijd in, of kies gehele dag.');
      else if (basis.tijdTot <= basis.tijdVan) fouten.push('De eindtijd moet na de begintijd liggen.');
    }
  } else {
    basis.titel = basis.titel || basis.naam;
    if (!fase) fouten.push('Kies de fase Nieuw, In behandeling of Gereed.');
    else basis.fase = fase;
    if (basis.naam.length < 2) fouten.push('Vul de naam van de huurder in.');
    if (!EMAIL.test(basis.email)) fouten.push('Vul een geldig e-mailadres in.');
    if (!isYmd(basis.start) || !kalenderdag(basis.start)) fouten.push('Kies een geldige startdatum.');
    if (!isYmd(basis.eind) || !kalenderdag(basis.eind)) fouten.push('Kies een geldige einddatum.');
    if (fouten.length === 0) {
      const periode = valideerVerhuurperiode(basis.verhuurtype, basis.start, basis.eind, typen);
      if (!periode.ok) fouten.push(...periode.fouten.map((fout) => fout.melding));
    }
    if (basis.fase === 'nieuw' && basis.definitief) {
      fouten.push('Een nieuwe aanvraag wordt niet meteen definitief. Kies Gereed en leg de uitzondering vast.');
    }
    if (basis.definitief && !basis.uitzondering) {
      fouten.push('Een reden is verplicht als je de boeking meteen definitief vastlegt.');
    }
    if (basis.fase === 'gereed' && !basis.definitief && !basis.uitzondering) {
      fouten.push('Gereed zonder definitieve boeking slaat de bestaande checklist over. Vul een reden in.');
    }
    if (basis.mail && !EMAIL.test(basis.email)) fouten.push('Een bevestigingsmail heeft een geldig e-mailadres nodig.');
  }

  if (fouten.length > 0) return { ok: false, melding: fouten[0] ?? 'De boeking is niet volledig.' };
  return { ok: true, boeking: basis };
}

export function periodeVanBoeking(boeking: Pick<HandmatigeBoeking, 'start' | 'eind'>): { start: string; eind: string } | null {
  if (!isYmd(boeking.start) || !kalenderdag(boeking.start)) return null;
  const eind = boeking.eind || boeking.start;
  if (!isYmd(eind) || !kalenderdag(eind) || eind < boeking.start) return null;
  return { start: boeking.start, eind };
}

/**
 * Herordent het bestaande advies. De overlap komt uit beschikbaarheidVoor.
 */
export function adviesUitBeschikbaarheid(
  bron: Beschikbaarheid,
  opties: { tijden?: readonly { titel: string; tijd: string }[] } = {},
): Beschikbaarheidsadvies {
  if (bron.uitkomst === 'onvolledig') {
    return {
      uitkomst: 'onvolledig',
      kop: bron.kop,
      tekst: bron.tekst,
      regels: [],
      aanvragen: [],
    };
  }
  const tijdVan = new Map((opties.tijden ?? []).map((item) => [item.titel, item.tijd]));
  const verrijk = (regel: ConflictRegel): AdviesRegel => {
    const tijd = tijdVan.get(regel.naam);
    return {
      naam: regel.naam,
      periode: regel.periode,
      tekst: tijd ? `${regel.tekst} · ${tijd}` : regel.tekst,
      href: regel.href,
    };
  };
  const regels = bron.blokkades.map(verrijk);
  const aanvragen = bron.aanvragen.map(verrijk);
  const geblokkeerd = regels.filter((regel) => /winterstop|blokkade|blokkerende/i.test(regel.tekst) && !isInterneActiviteitTitel(regel.naam));
  const bezet = regels.filter((regel) => !geblokkeerd.includes(regel));
  if (geblokkeerd.length > 0) {
    return {
      uitkomst: 'geblokkeerd',
      kop: 'Geblokkeerd',
      tekst: 'De periode valt binnen een winterstop of een andere blokkade.',
      regels: [...geblokkeerd, ...bezet],
      aanvragen,
    };
  }
  if (bezet.length > 0) {
    return {
      uitkomst: 'bezet',
      kop: 'Bezet',
      tekst: 'Er is al een reservering of interne activiteit in deze periode. Een bestaande boeking of aanvraag blijft staan.',
      regels: bezet,
      aanvragen,
    };
  }
  if (aanvragen.length > 0) {
    return {
      uitkomst: 'aanvraag',
      kop: 'Let op: aanvraag in behandeling',
      tekst: 'Er loopt al een aanvraag voor deze periode. Er is nog geen definitieve boeking overschreven.',
      regels: [],
      aanvragen,
    };
  }
  return {
    uitkomst: 'beschikbaar',
    kop: 'Beschikbaar',
    tekst: 'Er zijn geen conflicterende boekingen of aanvragen aangetroffen.',
    regels: [],
    aanvragen: [],
  };
}

export function adviesVoorPeriode(
  wereld: FaseWereld,
  start: string,
  eind: string,
  eigenTijd: string | null = null,
): Beschikbaarheidsadvies {
  const bron = beschikbaarheidVoor(
    { id: '__handmatig__', status: 'nieuw', naam: '', start, eind },
    wereld,
  );
  const tijden = wereld.blokkades
    .map((blok) => ({ titel: blok.titel, tijd: tijdUitNotities(blok.notities ?? '') }))
    .filter((item): item is { titel: string; tijd: string } => Boolean(item.tijd));
  const advies = adviesUitBeschikbaarheid(bron, { tijden });
  return verrijkTijdoverlap(advies, { start, eind, tijd: eigenTijd }, wereld);
}

export function magAfwijken(advies: Beschikbaarheidsadvies, boeking: HandmatigeBoeking): { ok: true } | { ok: false; melding: string } {
  if (advies.uitkomst === 'onvolledig') return { ok: false, melding: advies.tekst };
  if (advies.uitkomst === 'beschikbaar') return { ok: true };
  if (!boeking.bevestigConflict) {
    return { ok: false, melding: 'Bevestig de waarschuwing als je bewust van het beschikbaarheidsadvies afwijkt.' };
  }
  if (!boeking.conflictReden) {
    return { ok: false, melding: 'Een reden is verplicht bij een afwijking van het beschikbaarheidsadvies.' };
  }
  return { ok: true };
}

export function bevestigingVoor(boeking: HandmatigeBoeking): Bevestiging | null {
  if (boeking.soort === 'intern' || !boeking.mail) return null;
  if (!EMAIL.test(boeking.email)) return null;
  if (boeking.definitief) {
    return {
      templateId: 'booking_confirmed',
      automatieSleutel: 'statusmail_huurder',
      naam: 'Reservering definitief',
      pastBij: 'De boeking wordt als definitief vastgelegd. De mail zegt dat de reservering definitief is.',
    };
  }
  return {
    templateId: 'booking_request_received',
    automatieSleutel: 'aanvraag_bevestiging',
    naam: 'Aanvraag ontvangen',
    pastBij: 'De reservering is nog niet definitief. De mail zegt dat de aanvraag nog geen definitieve reservering is.',
  };
}

export function mailDedup(boeking: HandmatigeBoeking, templateId: string): string {
  return `handmatig:${boeking.email.toLowerCase()}:${boeking.start}:${boeking.eind}:${templateId}`;
}

export function notitiesVoorIntern(boeking: HandmatigeBoeking): string {
  const soort = interneSoortNaam(boeking.interneSoort);
  const tijd = boeking.heleDag ? 'Tijd: gehele dag' : `Tijd: ${boeking.tijdVan}-${boeking.tijdTot}`;
  return [
    `Soort: ${soort}`,
    boeking.titel && boeking.titel !== soort ? `Omschrijving: ${boeking.titel}` : '',
    tijd,
    boeking.opmerkingen ? `Opmerkingen: ${boeking.opmerkingen}` : '',
  ].filter(Boolean).join('\n');
}

export function tijdUitNotities(notities: string): string {
  const regel = notities.split('\n').find((lijn) => lijn.startsWith('Tijd: '));
  return regel ? regel.slice('Tijd: '.length) : '';
}

export function boekingNummer(start: string, stuk = willekeurigStuk()): string {
  return `KVP-${start.replaceAll('-', '')}-${stuk}`;
}

export function procesTekst(boeking: HandmatigeBoeking): string {
  const deel = (aan: boolean, label: string) => `${label}: ${aan ? 'ja' : 'nee'}`;
  return [
    deel(boeking.contractVerzonden, 'contract verzonden'),
    deel(boeking.contractOndertekend, 'contract ondertekend'),
    deel(boeking.aanbetalingOntvangen, 'aanbetaling ontvangen'),
    deel(boeking.definitief, 'definitieve boeking'),
  ].join(', ');
}

function verrijkTijdoverlap(
  advies: Beschikbaarheidsadvies,
  eigen: { start: string; eind: string; tijd: string | null },
  wereld: FaseWereld,
): Beschikbaarheidsadvies {
  if (!eigen.tijd || advies.uitkomst === 'beschikbaar' || advies.uitkomst === 'onvolledig') return advies;
  const regels = advies.regels.map((regel) => {
    const blok = wereld.blokkades.find((item) => item.titel === regel.naam);
    const bestaand = tijdUitNotities(blok?.notities ?? '');
    if (!bestaand || bestaand === 'gehele dag' || eigen.tijd === 'gehele dag') return regel;
    const [van, tot] = bestaand.split('-');
    const [eigenVan, eigenTot] = (eigen.tijd ?? '').split('-');
    if (!van || !tot || !eigenVan || !eigenTot) return regel;
    if (tijdenOverlappen(eigenVan, eigenTot, van, tot)) return regel;
    return {
      ...regel,
      tekst: `${regel.tekst} De tijden ${eigen.tijd} en ${bestaand} overlappen niet. De kalender rekent in dagen; afwijken blijft een bewuste keuze.`,
    };
  });
  return { ...advies, regels };
}

export function tijdenOverlappen(vanA: string, totA: string, vanB: string, totB: string): boolean {
  return vanA < totB && vanB < totA;
}

function kalenderdag(ymd: string): boolean {
  const [jaar, maand, dag] = ymd.split('-').map(Number);
  const datum = new Date(Date.UTC(jaar, maand - 1, dag));
  return datum.getUTCFullYear() === jaar && datum.getUTCMonth() === maand - 1 && datum.getUTCDate() === dag;
}

function willekeurigStuk(): string {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}
