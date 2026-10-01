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

export function gastbegeleiderRelevant(input: { soort: string; heeftKoppeling: boolean }): boolean {
  return input.soort === 'expositie' || input.heeftKoppeling;
}

export function gastbegeleiderOntbreekt(input: { soort: string; heeftKoppeling: boolean }): boolean {
  return input.soort === 'expositie' && !input.heeftKoppeling;
}
