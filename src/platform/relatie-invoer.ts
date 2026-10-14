/**
 * Validatie voor relatie- en gastheerstamgegevens.
 * Technische migratievelden horen hier niet in.
 */

import { normaliseerTestmailadres } from './testmail.ts';

export const RELATIE_VELDEN = [
  'naam',
  'organisatie',
  'email',
  'telefoon',
  'adres',
  'notities',
  'op_reservelijst',
] as const;

export const MIGRATIE_VELDEN = [
  'legacy_source',
  'legacy_id',
  'migration_source',
  'migration_external_id',
  'migration_source_file',
  'migration_source_row',
  'migration_batch_id',
] as const;

export interface RelatieInvoer {
  naam: string;
  organisatie: string;
  email: string;
  telefoon: string;
  adres: string;
  notities: string;
  reservelijst: boolean;
  rollen: string[];
}

export function leesRelatieInvoer(data: { get(naam: string): unknown }): RelatieInvoer | { fout: string } {
  const naam = String(data.get('naam') ?? '').trim();
  if (!naam) return { fout: 'Naam is verplicht.' };
  if (naam.length > 200) return { fout: 'Naam is te lang.' };
  const email = String(data.get('email') ?? '').trim();
  if (email) {
    const check = normaliseerTestmailadres(email);
    if (!check.ok) return { fout: 'E-mailadres is ongeldig. Vul één adres in.' };
  }
  const rollen = String(data.get('rollen') ?? '')
    .split(',')
    .map((rol) => rol.trim())
    .filter(Boolean)
    .slice(0, 12);
  return {
    naam,
    organisatie: String(data.get('organisatie') ?? '').trim().slice(0, 200),
    email: email.toLowerCase(),
    telefoon: String(data.get('telefoon') ?? '').trim().slice(0, 40),
    adres: String(data.get('adres') ?? '').trim().slice(0, 300),
    notities: String(data.get('notities') ?? '').trim().slice(0, 2000),
    reservelijst: data.get('reservelijst') === 'ja' || data.get('reservelijst') === 'on',
    rollen,
  };
}

export function relatieKolommen(invoer: RelatieInvoer): Record<string, unknown> {
  return {
    naam: invoer.naam,
    organisatie: invoer.organisatie || null,
    email: invoer.email || null,
    telefoon: invoer.telefoon || null,
    adres: invoer.adres || null,
    notities: invoer.notities || null,
    op_reservelijst: invoer.reservelijst,
    bijgewerkt_op: new Date().toISOString(),
  };
}

export function gastheerInvoer(data: { get(naam: string): unknown }): RelatieInvoer | { fout: string } {
  const basis = leesRelatieInvoer(data);
  if ('fout' in basis) return basis;
  if (!basis.rollen.includes('gastheer')) basis.rollen.push('gastheer');
  return basis;
}
