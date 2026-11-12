/**
 * Verhuurtype alleen invullen als de titel het type zelf noemt.
 * Een weekend of een gastbegeleider is geen bewijs. Pasen en Pinksteren blijven leeg.
 */

import { isPeriodeLabel } from './planning.ts';

export type VerhuurSleutel = 'expositie' | 'bruiloft' | 'concert' | 'diverse';

export type VerhuurClassificatie =
  | { uitkomst: 'zeker'; type: VerhuurSleutel; reden: string }
  | { uitkomst: 'review'; reden: string };

export function classificeerVerhuurtype(titel: string): VerhuurClassificatie {
  const tekst = titel.toLowerCase();
  if (/pasen|pinksteren/.test(tekst)) {
    return { uitkomst: 'review', reden: 'Pasen of Pinksteren is geen verhuurtype.' };
  }
  if (/huwelijk|bruiloft/.test(tekst)) {
    return { uitkomst: 'zeker', type: 'bruiloft', reden: 'De titel noemt huwelijk of bruiloft.' };
  }
  if (/concert/.test(tekst)) {
    return { uitkomst: 'zeker', type: 'concert', reden: 'De titel noemt concert.' };
  }
  if (/expositie/.test(tekst)) {
    return { uitkomst: 'zeker', type: 'expositie', reden: 'De titel noemt expositie.' };
  }
  if (/\bdiverse\b/.test(tekst)) {
    return { uitkomst: 'zeker', type: 'diverse', reden: 'De titel noemt diverse.' };
  }
  return {
    uitkomst: 'review',
    reden: 'Geen betrouwbaar type in de titel. Een weekend wordt niet automatisch expositie.',
  };
}

/** Weergave. De opgeslagen titel blijft staan. */
export function leesbareTitel(titel: string, huurder: string): string {
  const naam = huurder.trim();
  if (isPeriodeLabel(titel) && naam) return naam;
  return titel.trim() || naam || 'Zonder titel';
}

const WEG_VAN_GASTBEGELEIDERBORD = new Set(['geannuleerd', 'afgewezen', 'gearchiveerd']);

/**
 * Het gastbegeleiderbord toont elke boeking in de gekozen periode.
 * Geannuleerd, afgewezen en gearchiveerd blijven weg. Een leeg verhuurtype
 * (zoals bij geïmporteerde weekenden) is geen reden om de boeking te verbergen.
 */
export function hoortOpGastbegeleiderbord(status: string): boolean {
  return !WEG_VAN_GASTBEGELEIDERBORD.has(status);
}

export type BegeleiderKeuze = 'alle' | 'ja' | 'nee';

/** Zelfde opschoning als de zoekbalk van de verhuuragenda. */
export function leesGastbegeleiderZoek(ruw: string | null): string {
  return (ruw ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** Eén keuze. Beide of geen van beide betekent: alle boekingen. */
export function leesBegeleiderKeuze(waarden: readonly string[]): BegeleiderKeuze {
  const gekozen = new Set(waarden.filter((waarde) => waarde === 'ja' || waarde === 'nee'));
  if (gekozen.size !== 1) return 'alle';
  return gekozen.has('ja') ? 'ja' : 'nee';
}

export function pastBegeleiderKeuze(heeftKoppeling: boolean, keuze: BegeleiderKeuze): boolean {
  if (keuze === 'ja') return heeftKoppeling;
  if (keuze === 'nee') return !heeftKoppeling;
  return true;
}

export function pastGastbegeleiderZoek(zoek: string, velden: readonly string[]): boolean {
  const naald = zoek.trim().toLocaleLowerCase('nl');
  if (!naald) return true;
  return velden.join(' ').toLocaleLowerCase('nl').includes(naald);
}

/** Exposities verwachten een begeleider. Andere types alleen als er al een koppeling is. */
export function gastbegeleiderRelevant(input: { soort: string; heeftKoppeling: boolean }): boolean {
  return input.soort === 'expositie' || input.heeftKoppeling;
}

export function gastbegeleiderOntbreekt(input: { soort: string; heeftKoppeling: boolean }): boolean {
  return input.soort === 'expositie' && !input.heeftKoppeling;
}
