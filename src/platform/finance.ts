/**
 * Finance: tarieven, snapshots, aanbetaling, override (FO §25–§31).
 *
 * Tarieven zijn versieerbaar. Een boeking bewaart een snapshot, zodat een
 * latere tariefwijziging oude boekingen niet verandert.
 */

import type { GebruikerRechten, Prijstype } from './types.ts';
import { magSchrijven } from './rechten.ts';

export const STANDAARD_AANBETALING_EURO = 100;
export const STANDAARD_BETAALTERMIJN_DAGEN = 14;

export interface Tariefregel {
  verhuurtype: string;
  prijstype: Prijstype;
  bedrag: number | null;
  geldigVanaf: string;
  geldigTot?: string | null;
}

export interface TariefSnapshot {
  verhuurtype: string;
  prijstype: Prijstype;
  bedrag: number | null;
  geldigVanaf: string;
  vastgelegdOp: string;
}

export const INITIELE_TARIEVEN: readonly Tariefregel[] = [
  { verhuurtype: 'expositie', prijstype: 'vast', bedrag: 490, geldigVanaf: '2020-01-01', geldigTot: '2028-12-31' },
  { verhuurtype: 'expositie', prijstype: 'vast', bedrag: 525, geldigVanaf: '2029-01-01' },
  { verhuurtype: 'bruiloft', prijstype: 'vast', bedrag: 550, geldigVanaf: '2020-01-01', geldigTot: '2028-12-31' },
  { verhuurtype: 'bruiloft', prijstype: 'vast', bedrag: 590, geldigVanaf: '2029-01-01' },
  { verhuurtype: 'concert', prijstype: 'op_aanvraag', bedrag: null, geldigVanaf: '2020-01-01', geldigTot: '2028-12-31' },
  { verhuurtype: 'concert', prijstype: 'op_aanvraag', bedrag: null, geldigVanaf: '2029-01-01' },
  { verhuurtype: 'diverse', prijstype: 'vanaf', bedrag: 250, geldigVanaf: '2020-01-01', geldigTot: '2028-12-31' },
  { verhuurtype: 'diverse', prijstype: 'vanaf', bedrag: 275, geldigVanaf: '2029-01-01' },
];

export function kiesTarief(
  regels: readonly Tariefregel[],
  verhuurtype: string,
  opDatum: string,
): Tariefregel | null {
  const kandidaten = regels.filter((regel) => {
    if (regel.verhuurtype !== verhuurtype) return false;
    if (regel.geldigVanaf > opDatum) return false;
    if (regel.geldigTot && regel.geldigTot < opDatum) return false;
    return true;
  });
  kandidaten.sort((a, b) => b.geldigVanaf.localeCompare(a.geldigVanaf));
  return kandidaten[0] ?? null;
}

export function tariefSnapshot(regel: Tariefregel, vastgelegdOp: string): TariefSnapshot {
  return {
    verhuurtype: regel.verhuurtype,
    prijstype: regel.prijstype,
    bedrag: regel.bedrag,
    geldigVanaf: regel.geldigVanaf,
    vastgelegdOp,
  };
}

export function magFinanceOverride(rechten: GebruikerRechten): boolean {
  return magSchrijven(rechten, 'finance');
}

export function aanbetalingOverride(input: {
  standaardBedrag: number;
  afgesprokenBedrag: number;
  reden: string;
  rechten: GebruikerRechten;
}): { ok: boolean; melding?: string; audit?: { van: number; naar: number; reden: string } } {
  if (!magFinanceOverride(input.rechten)) {
    return { ok: false, melding: 'Alleen Finance-schrijfrechten mogen een bedrag overrulen.' };
  }
  if (!input.reden.trim()) {
    return { ok: false, melding: 'Bij een override is een reden verplicht.' };
  }
  return {
    ok: true,
    audit: { van: input.standaardBedrag, naar: input.afgesprokenBedrag, reden: input.reden.trim() },
  };
}

/**
 * Handmatige bankcontrole: aanbetaling ontvangen → automatisch definitief,
 * tenzij het type geen verplichte aanbetaling heeft.
 */
export function naAanbetalingOntvangen(aanbetalingVerplichtVoorDefinitief: boolean): {
  boekingStatus: 'definitief' | 'optie';
  kalenderBezet: boolean;
} {
  if (!aanbetalingVerplichtVoorDefinitief) {
    return { boekingStatus: 'definitief', kalenderBezet: true };
  }
  return { boekingStatus: 'definitief', kalenderBezet: true };
}
