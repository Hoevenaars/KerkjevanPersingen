/**
 * Verhuurregels (FO §10–§15, §76).
 *
 * Expositie: exact één weekend (zaterdag + zondag), ondeelbaar.
 * Overige verhuur: alleen maandag t/m vrijdag, aaneengesloten dagen toegestaan.
 * Interne activiteiten: iedere dag, optioneel blokkerend.
 *
 * Deze harde blokkades gelden straks in /beheer én op het publieke formulier.
 * Het huidige formulier blijft een waarschuwing; deze module is de nieuwe bron.
 */

import { dagenInPeriode, isDoordeweeks, isZaterdag, isZondag, weekendVan } from './datum.ts';
import { STANDAARD_VERHUURTYPEN, type Dagregel, type Periode, type Verhuurtype } from './types.ts';

export interface VerhuurFout {
  veld: 'start' | 'eind' | 'periode' | 'type';
  melding: string;
}

export interface VerhuurUitkomst {
  ok: boolean;
  periode?: Periode;
  fouten: VerhuurFout[];
}

export function dagregelVoor(
  sleutel: string,
  typen: readonly Verhuurtype[] = STANDAARD_VERHUURTYPEN,
): Dagregel | null {
  return typen.find((type) => type.sleutel === sleutel && type.actief)?.dagregel ?? null;
}

export function kiesExpositieWeekend(zaterdag: string): VerhuurUitkomst {
  if (!isZaterdag(zaterdag)) {
    return {
      ok: false,
      fouten: [{ veld: 'start', melding: 'Kies een weekend. Een expositie begint altijd op zaterdag.' }],
    };
  }
  const { zondag } = weekendVan(zaterdag);
  return { ok: true, periode: { start: zaterdag, eind: zondag }, fouten: [] };
}

export function valideerVerhuurperiode(
  typeSleutel: string,
  start: string,
  eind: string,
  typen: readonly Verhuurtype[] = STANDAARD_VERHUURTYPEN,
): VerhuurUitkomst {
  const regel = dagregelVoor(typeSleutel, typen);
  if (!regel) {
    return { ok: false, fouten: [{ veld: 'type', melding: 'Onbekend of inactief verhuurtype.' }] };
  }
  if (eind < start) {
    return {
      ok: false,
      fouten: [{ veld: 'eind', melding: 'De einddatum ligt vóór de startdatum.' }],
    };
  }

  if (regel === 'expositie_weekend') return valideerExpositie(start, eind);
  if (regel === 'doordeweeks') return valideerDoordeweeks(start, eind);
  return { ok: true, periode: { start, eind }, fouten: [] };
}

function valideerExpositie(start: string, eind: string): VerhuurUitkomst {
  const fouten: VerhuurFout[] = [];
  if (!isZaterdag(start)) {
    fouten.push({ veld: 'start', melding: 'Een expositie begint altijd op zaterdag.' });
  }
  if (!isZondag(eind)) {
    fouten.push({ veld: 'eind', melding: 'Een expositie eindigt altijd op zondag.' });
  }
  if (fouten.length === 0) {
    const weekend = weekendVan(start);
    if (start !== weekend.zaterdag || eind !== weekend.zondag) {
      fouten.push({
        veld: 'periode',
        melding: 'Een expositie is precies één weekend: zaterdag én zondag.',
      });
    }
  }
  if (fouten.length) return { ok: false, fouten };
  return { ok: true, periode: { start, eind }, fouten: [] };
}

function valideerDoordeweeks(start: string, eind: string): VerhuurUitkomst {
  const dagen = dagenInPeriode(start, eind);
  const weekendDagen = dagen.filter((dag) => !isDoordeweeks(dag));
  if (weekendDagen.length) {
    return {
      ok: false,
      fouten: [
        {
          veld: 'periode',
          melding: 'Bruiloften, concerten en diverse bijeenkomsten kunnen alleen maandag t/m vrijdag plaatsvinden.',
        },
      ],
    };
  }
  return { ok: true, periode: { start, eind }, fouten: [] };
}

export function expositieWeekendBeschikbaar(
  zaterdag: string,
  zondag: string,
  bezetteDagen: ReadonlySet<string>,
): { ok: boolean; melding?: string } {
  const zaBezet = bezetteDagen.has(zaterdag);
  const zoBezet = bezetteDagen.has(zondag);
  if (zaBezet || zoBezet) {
    return { ok: false, melding: 'Weekend niet beschikbaar.' };
  }
  return { ok: true };
}

export function periodeDagenBeschikbaar(
  periode: Periode,
  bezetteDagen: ReadonlySet<string>,
): { ok: boolean; melding?: string } {
  const botsing = dagenInPeriode(periode.start, periode.eind).find((dag) => bezetteDagen.has(dag));
  if (botsing) {
    return { ok: false, melding: `Deze periode is niet beschikbaar (bezet op ${botsing}).` };
  }
  return { ok: true };
}
