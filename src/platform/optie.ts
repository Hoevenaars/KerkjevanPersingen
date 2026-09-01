/**
 * Opties: termijn, uniciteit, verlopen, doorlaten, afwijzen (FO §17–§24, §19).
 *
 * Maximaal één actieve optie per periode. Nieuwe aanvragen mogen wél binnenkomen.
 * Verlopen sluit of verwijdert niets automatisch.
 */

import { periodesOverlappen, voegDagenToe } from './datum.ts';
import type { BoekingStatus, GebruikerRechten, Periode } from './types.ts';
import { isDomeinVerantwoordelijke } from './rechten.ts';

export const STANDAARD_OPTIETERMIJN_DAGEN = 14;

export interface ActieveOptie {
  id: string;
  periode: Periode;
  status: BoekingStatus;
}

export function isActieveOptie(status: BoekingStatus): boolean {
  return status === 'optie';
}

export function optieEinddatum(aangemaaktOpYmd: string, termijnDagen: number): string {
  return voegDagenToe(aangemaaktOpYmd, termijnDagen);
}

/**
 * De termijn wordt als snapshot op de boeking vastgelegd. Latere wijziging
 * van de algemene instelling raakt bestaande opties niet (FO §18).
 */
export function optieSnapshot(aangemaaktOpYmd: string, termijnDagen: number): {
  optieAangemaaktOp: string;
  optietermijnDagen: number;
  optieEinddatum: string;
} {
  return {
    optieAangemaaktOp: aangemaaktOpYmd,
    optietermijnDagen: termijnDagen,
    optieEinddatum: optieEinddatum(aangemaaktOpYmd, termijnDagen),
  };
}

export function kanOptieAanmaken(
  gewenstePeriode: Periode,
  bestaande: readonly ActieveOptie[],
): { ok: boolean; melding?: string } {
  const botsing = bestaande.find(
    (optie) => isActieveOptie(optie.status) && periodesOverlappen(optie.periode, gewenstePeriode),
  );
  if (botsing) {
    return { ok: false, melding: 'Er loopt al een optie voor deze periode.' };
  }
  return { ok: true };
}

export function isOptieVerlopen(optieEind: string, vandaagYmd: string): boolean {
  return vandaagYmd > optieEind;
}

export function actiesBijVerlopen(): {
  nieuweStatus: 'optie_verlopen';
  dashboardTaak: 'optie_verlopen';
  mailNaar: 'contractbeheerder';
  automatischSluiten: false;
} {
  return {
    nieuweStatus: 'optie_verlopen',
    dashboardTaak: 'optie_verlopen',
    mailNaar: 'contractbeheerder',
    automatischSluiten: false,
  };
}

export function magOptieAfhandelen(rechten: GebruikerRechten): boolean {
  return isDomeinVerantwoordelijke(rechten, 'boekingen');
}

export function doorLatenLopen(
  vanafYmd: string,
  voorgesteldeTermijnDagen: number,
  gekozenTermijnDagen?: number,
): { nieuweStatus: 'optie'; nieuweEinddatum: string; termijnDagen: number } {
  const termijn = gekozenTermijnDagen ?? voorgesteldeTermijnDagen;
  return {
    nieuweStatus: 'optie',
    nieuweEinddatum: optieEinddatum(vanafYmd, termijn),
    termijnDagen: termijn,
  };
}

export function optieAfwijzen(): {
  nieuweStatus: 'afgewezen';
  annuleerToekomstigeCommunicatie: true;
  periodeVrijVoorNieuweOptie: true;
  aanvraagBlijftOpen: true;
} {
  return {
    nieuweStatus: 'afgewezen',
    annuleerToekomstigeCommunicatie: true,
    periodeVrijVoorNieuweOptie: true,
    aanvraagBlijftOpen: true,
  };
}

export function magHandmatigDefinitiefMaken(rechten: GebruikerRechten): boolean {
  return isDomeinVerantwoordelijke(rechten, 'boekingen');
}
