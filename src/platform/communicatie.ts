/**
 * Communicatie-engine: idempotentie, ontvangers, herplanning (FO §39–§49, §61–§63).
 *
 * Echte verzending = Boeking + Template + Ontvangersrelatie.
 * E-mailwijziging van dezelfde persoon is géén nieuwe ontvanger.
 * Persoon vervangen wél. Testmails tellen niet mee.
 */

import type { CommunicatieStatus, NieuweOntvangerActie } from './types.ts';

export interface VerzendSleutel {
  boekingId: string;
  templateId: string;
  relatieId: string;
}

export interface VerzendRecord extends VerzendSleutel {
  status: CommunicatieStatus;
  templateVersie: number;
  emailOpVerzendmoment?: string;
}

export function verzendSleutel(record: VerzendSleutel): string {
  return `${record.boekingId}::${record.templateId}::${record.relatieId}`;
}

export function alSuccesvolVerzonden(
  historie: readonly VerzendRecord[],
  sleutel: VerzendSleutel,
): boolean {
  const id = verzendSleutel(sleutel);
  return historie.some((rij) => verzendSleutel(rij) === id && rij.status === 'verzonden');
}

export function magAutomatischVerzenden(
  historie: readonly VerzendRecord[],
  sleutel: VerzendSleutel,
): { ok: boolean; reden: string } {
  if (alSuccesvolVerzonden(historie, sleutel)) {
    return { ok: false, reden: 'Deze template is voor deze ontvanger binnen deze boeking al verzonden.' };
  }
  return { ok: true, reden: 'Nog niet verzonden.' };
}

export function isNieuweOntvanger(oudeRelatieId: string | null, nieuweRelatieId: string): boolean {
  return oudeRelatieId !== nieuweRelatieId;
}

export function emailWijzigingIsNieuweOntvanger(): false {
  return false;
}

export function actieVoorNieuweOntvanger(
  instelling: NieuweOntvangerActie,
  historie: readonly VerzendRecord[],
  sleutel: VerzendSleutel,
): 'versturen' | 'concept' | 'overslaan' {
  if (alSuccesvolVerzonden(historie, sleutel)) return 'overslaan';
  if (instelling === 'direct_alsnog') return 'versturen';
  if (instelling === 'als_concept') return 'concept';
  return 'overslaan';
}

export function herplanNaDatumwijziging(status: CommunicatieStatus): {
  herplannen: boolean;
  waarschuwingVerouderd: boolean;
} {
  if (status === 'verzonden') return { herplannen: false, waarschuwingVerouderd: true };
  if (status === 'geannuleerd' || status === 'fout') {
    return { herplannen: false, waarschuwingVerouderd: false };
  }
  return { herplannen: true, waarschuwingVerouderd: false };
}

export function bijAnnulering(status: CommunicatieStatus): CommunicatieStatus {
  if (status === 'verzonden') return 'verzonden';
  if (status === 'fout') return 'fout';
  return 'geannuleerd';
}

export const MAX_VERZENDPOGINGEN = 5;

export function volgendeFoutStatus(pogingen: number): {
  status: 'wachtrij' | 'fout';
  dashboardTaak: boolean;
} {
  if (pogingen >= MAX_VERZENDPOGINGEN) return { status: 'fout', dashboardTaak: true };
  return { status: 'wachtrij', dashboardTaak: false };
}
