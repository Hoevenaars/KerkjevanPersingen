import { maandagVanWeekIso, activiteitRaaktPeriode } from './week.ts';

export type VriendFrequentie = 'wekelijks' | 'tweewekelijks' | 'maandelijks';

export type ProgrammaPeriode = { start: string; eind: string };

export type NieuwsbriefMailMeta = {
  kop: string;
  intro: string;
  onderwerp: string;
  agendaKop?: string;
  legeAgendaTekst: string;
};

export const FREQUENTIE_LABELS: Record<VriendFrequentie, string> = {
  wekelijks: 'Elke week',
  tweewekelijks: 'Elke twee weken',
  maandelijks: 'Eens per maand',
};

const GELDIGE_FREQUENTIES = new Set<string>(Object.keys(FREQUENTIE_LABELS));

export function isGeldigeFrequentie(waarde: string): waarde is VriendFrequentie {
  return GELDIGE_FREQUENTIES.has(waarde);
}

function ymdAmsterdam(datum: Date): string {
  return datum.toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
}

function dagenToevoegen(ymd: string, dagen: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dagen);
  return d.toISOString().slice(0, 10);
}

function eindeVanMaand(ymd: string): string {
  const [jaar, maand] = ymd.split('-').map(Number);
  return new Date(Date.UTC(jaar, maand, 0, 12, 0, 0)).toISOString().slice(0, 10);
}

function maandNaam(datum: Date): string {
  return datum.toLocaleDateString('nl-NL', { month: 'long', timeZone: 'Europe/Amsterdam' });
}

/**
 * Datumbereik waarvoor activiteiten in de mail getoond worden.
 * - wekelijks: komende week (vandaag t/m zondag)
 * - tweewekelijks: komende 14 dagen
 * - maandelijks: rest van de kalendermaand
 */
export function programmaPeriode(
  frequentie: VriendFrequentie,
  datum = new Date(),
): ProgrammaPeriode {
  const start = ymdAmsterdam(datum);
  switch (frequentie) {
    case 'wekelijks': {
      const [jaar, maand, dag] = start.split('-').map(Number);
      const utc = new Date(Date.UTC(jaar, maand - 1, dag, 12, 0, 0));
      const weekdag = utc.getUTCDay();
      const naarZondag = weekdag === 0 ? 0 : 7 - weekdag;
      return { start, eind: dagenToevoegen(start, naarZondag) };
    }
    case 'tweewekelijks':
      return { start, eind: dagenToevoegen(start, 13) };
    case 'maandelijks':
      return { start, eind: eindeVanMaand(start) };
  }
}

export function mailMeta(frequentie: VriendFrequentie, datum = new Date()): NieuwsbriefMailMeta {
  switch (frequentie) {
    case 'wekelijks':
      return {
        kop: 'Deze week in Persingen',
        intro: 'Elke week een kort bericht over wat er speelt in en om het kerkje.',
        onderwerp: 'Deze week in Persingen',
        legeAgendaTekst:
          'Er is deze week geen activiteit gepland. Bekijk de volledige agenda voor komende data.',
      };
    case 'tweewekelijks':
      return {
        kop: 'Komende twee weken in Persingen',
        intro:
          'Eens in de twee weken een kort bericht — hier wat er de komende twee weken te doen is in en om het kerkje.',
        onderwerp: 'Komende twee weken in Persingen',
        agendaKop: 'Agenda komende twee weken',
        legeAgendaTekst:
          'Er staan de komende twee weken geen activiteiten gepland. Bekijk de volledige agenda voor komende data.',
      };
    case 'maandelijks': {
      const maand = maandNaam(datum);
      return {
        kop: `${maand.charAt(0).toUpperCase()}${maand.slice(1)} in Persingen`,
        intro: `Eens per maand een kort bericht — hier het programma voor de rest van ${maand}.`,
        onderwerp: `${maand.charAt(0).toUpperCase()}${maand.slice(1)} in Persingen`,
        agendaKop: `Agenda in ${maand}`,
        legeAgendaTekst:
          'Er staan deze maand geen activiteiten meer gepland. Bekijk de volledige agenda voor komende data.',
      };
    }
  }
}

/** Filtert activiteiten die overlappen met de programmaperiode van deze frequentie. */
export function filterActiviteitenInPeriode<T extends { start: string; eind?: string }>(
  activiteiten: T[],
  frequentie: VriendFrequentie,
  datum = new Date(),
): T[] {
  const periode = programmaPeriode(frequentie, datum);
  return activiteiten.filter((activiteit) =>
    activiteitRaaktPeriode(activiteit.start, activiteit.eind, periode.start, periode.eind),
  );
}

/** ISO-weeknummer (1–53) van de kalenderweek waarin `datum` valt (Amsterdam). */
export function isoWeekNummer(datum: Date): number {
  const maandag = maandagVanWeekIso(datum);
  const d = new Date(`${maandag}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const week1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4, 12, 0, 0));
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86_400_000 - 3 + ((week1.getUTCDay() + 6) % 7)) / 7,
    )
  );
}

/** Vrijdag van de nieuwsbriefverzending in Amsterdam (YYYY-MM-DD). */
function vrijdagAmsterdam(datum: Date): { jaar: number; maand: number; dag: number } {
  const ymd = datum.toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
  const [jaar, maand, dag] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(jaar, maand - 1, dag, 12, 0, 0));
  const weekdag = utc.getUTCDay();
  const naarVrijdag = weekdag <= 5 ? 5 - weekdag : 5 - weekdag + 7;
  utc.setUTCDate(utc.getUTCDate() + naarVrijdag);
  return {
    jaar: utc.getUTCFullYear(),
    maand: utc.getUTCMonth() + 1,
    dag: utc.getUTCDate(),
  };
}

/** Eerste vrijdag van de maand (dag 1–7). */
export function isEersteVrijdagVanMaand(datum: Date): boolean {
  const { dag } = vrijdagAmsterdam(datum);
  return dag <= 7;
}

/**
 * Bepaalt of een vriend de nieuwsbrief van deze verzendronde moet ontvangen.
 * - wekelijks: elke vrijdag
 * - tweewekelijks: om de week (even ISO-weeknummers)
 * - maandelijks: alleen op de eerste vrijdag van de maand
 */
export function ontvangtDezeVerzending(
  frequentie: VriendFrequentie | undefined,
  datum = new Date(),
): boolean {
  const keuze = frequentie ?? 'wekelijks';
  switch (keuze) {
    case 'wekelijks':
      return true;
    case 'tweewekelijks':
      return isoWeekNummer(datum) % 2 === 0;
    case 'maandelijks':
      return isEersteVrijdagVanMaand(datum);
  }
}
