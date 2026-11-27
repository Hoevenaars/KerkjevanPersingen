/**
 * Wanneer een optie vanzelf definitief wordt.
 * Dezelfde checklist als het aanvraagdossier: goedgekeurde aanvraag,
 * de actuele goedgekeurde contractversie is ondertekend, en de aanbetaling
 * is ontvangen of niet vereist. Een ontbrekende gereed-regel blokkeert dit niet.
 * Er gaat hier geen mail uit.
 */

export interface ContractVersieVoorwaarde {
  ondertekening: string;
  bestuur: string;
  bestuurVerplicht: boolean;
}

export interface DefinitiefInvoer {
  boekingStatus: string;
  aanvraagStatus: string | null;
  versie: ContractVersieVoorwaarde | null;
  aanbetalingBedrag: number | null;
  aanbetalingOntvangen: boolean;
  aanbetalingTegenstrijdig: boolean;
  betalingVereist?: 'aanbetaling' | 'volledig' | 'geen';
  volledigBetaald?: boolean;
  overlapt: boolean;
}

export const DEFINITIEF_REDEN = 'Checklist compleet: goedgekeurde aanvraag, actuele ondertekende contractversie en de vereiste betaling.';

export function aanbetalingVoorwaarde(
  regels: readonly { soort: string; status: string }[],
  vlag: boolean,
): { ontvangen: boolean; tegenstrijdig: boolean } {
  const actief = regels.filter((regel) => regel.soort === 'aanbetaling' && regel.status !== 'geannuleerd');
  const ontvangen = actief.some((regel) => regel.status === 'ontvangen');
  const open = actief.some((regel) => regel.status === 'open');
  if (ontvangen && open) return { ontvangen: false, tegenstrijdig: true };
  if (ontvangen) return { ontvangen: true, tegenstrijdig: false };
  if (actief.length === 0 && vlag) return { ontvangen: true, tegenstrijdig: false };
  return { ontvangen: false, tegenstrijdig: false };
}

export function magAutomatischDefinitief(invoer: DefinitiefInvoer): boolean {
  if (invoer.boekingStatus !== 'optie' && invoer.boekingStatus !== 'optie_verlopen') return false;
  if (invoer.aanvraagStatus !== 'goedgekeurd') return false;
  if (!invoer.versie || invoer.versie.ondertekening !== 'ontvangen') return false;
  if (invoer.versie.bestuurVerplicht && invoer.versie.bestuur !== 'akkoord') return false;
  const vereist = invoer.betalingVereist ?? ((invoer.aanbetalingBedrag ?? 0) > 0 ? 'aanbetaling' : 'volledig');
  if (vereist === 'aanbetaling' && (invoer.aanbetalingTegenstrijdig || !invoer.aanbetalingOntvangen)) return false;
  if (vereist === 'volledig' && invoer.volledigBetaald !== true) return false;
  if (invoer.overlapt) return false;
  return true;
}
