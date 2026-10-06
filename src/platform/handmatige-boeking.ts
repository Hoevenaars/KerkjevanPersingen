/**
 * Handmatige boeking vanuit beheer, zonder publieke aanvraag.
 * Een expositie blijft één weekend; overige verhuur blijft doordeweeks.
 * Er gaat hier geen mail uit.
 */

import { isYmd } from './datum.ts';
import { STANDAARD_VERHUURTYPEN, type Verhuurtype } from './types.ts';
import { valideerVerhuurperiode } from './verhuur.ts';

export type HandmatigeBoekingStatus = 'optie' | 'definitief';

export interface HandmatigeBoeking {
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
  status: HandmatigeBoekingStatus;
  reden: string;
}

export function leesHandmatigeBoeking(
  ruw: {
    naam?: string;
    email?: string;
    telefoon?: string;
    adres?: string;
    verhuurtype?: string;
    start?: string;
    eind?: string;
    personen?: string;
    toelichting?: string;
    titel?: string;
    status?: string;
    reden?: string;
  },
  typen: readonly Verhuurtype[] = STANDAARD_VERHUURTYPEN,
): { ok: true; boeking: HandmatigeBoeking } | { ok: false; melding: string } {
  const naam = (ruw.naam ?? '').trim();
  const email = (ruw.email ?? '').trim();
  const telefoon = (ruw.telefoon ?? '').trim();
  const adres = (ruw.adres ?? '').trim();
  const verhuurtype = (ruw.verhuurtype ?? '').trim();
  const start = (ruw.start ?? '').trim();
  const eind = ((ruw.eind ?? '').trim() || start);
  const personen = (ruw.personen ?? '').trim();
  const toelichting = (ruw.toelichting ?? '').trim();
  const titel = (ruw.titel ?? '').trim() || naam;
  const status = ruw.status === 'definitief' ? 'definitief' : ruw.status === 'optie' || !ruw.status ? 'optie' : '';
  const reden = (ruw.reden ?? '').trim();
  const fouten: string[] = [];

  if (naam.length < 2) fouten.push('Vul de naam van de huurder in.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fouten.push('Vul een geldig e-mailadres in.');
  if (status !== 'optie' && status !== 'definitief') fouten.push('Kies optie of definitief.');
  if (status === 'definitief' && !reden) fouten.push('Een reden is verplicht als je de boeking meteen definitief vastlegt.');
  if (!isYmd(start) || !kalenderdag(start)) fouten.push('Kies een geldige startdatum.');
  if (!isYmd(eind) || !kalenderdag(eind)) fouten.push('Kies een geldige einddatum.');

  if (fouten.length === 0) {
    const periode = valideerVerhuurperiode(verhuurtype, start, eind, typen);
    if (!periode.ok) fouten.push(...periode.fouten.map((fout) => fout.melding));
  }

  if (fouten.length > 0 || (status !== 'optie' && status !== 'definitief')) {
    return { ok: false, melding: fouten[0] ?? 'De boeking is niet volledig.' };
  }

  return {
    ok: true,
    boeking: {
      naam,
      email,
      telefoon,
      adres,
      verhuurtype,
      start,
      eind,
      personen,
      toelichting,
      titel,
      status,
      reden,
    },
  };
}

export function boekingNummer(start: string, stuk = willekeurigStuk()): string {
  return `KVP-${start.replaceAll('-', '')}-${stuk}`;
}

function kalenderdag(ymd: string): boolean {
  const [jaar, maand, dag] = ymd.split('-').map(Number);
  const datum = new Date(Date.UTC(jaar, maand - 1, dag));
  return datum.getUTCFullYear() === jaar && datum.getUTCMonth() === maand - 1 && datum.getUTCDate() === dag;
}

function willekeurigStuk(): string {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}
