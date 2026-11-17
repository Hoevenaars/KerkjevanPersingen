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

export interface PlanningBoeking {
  id: string;
  start: string;
  eind: string;
  titel: string;
  huurder: string;
  soort: string;
  status: string;
  gastheerId?: string;
}

/**
 * Het account hoort bij een expositiebegeleider via het e-mailadres.
 * Zonder adres telt een unieke naam. Meerdere namen blijven leeg.
 */
export function gastheerIdsVanPersoon(
  gastheren: readonly { id: string; naam: string; email: string }[],
  persoon: { email?: string; naam?: string },
): string[] {
  const mail = (persoon.email ?? '').trim().toLocaleLowerCase('nl');
  if (mail) {
    const opMail = gastheren.filter((gast) => gast.email.trim().toLocaleLowerCase('nl') === mail);
    if (opMail.length > 0) return opMail.map((gast) => gast.id);
  }
  const naam = (persoon.naam ?? '').trim().toLocaleLowerCase('nl');
  if (!naam) return [];
  const opNaam = gastheren.filter((gast) => gast.naam.trim().toLocaleLowerCase('nl') === naam);
  return opNaam.length === 1 ? opNaam.map((gast) => gast.id) : [];
}

function sorteerPlanning(a: PlanningBoeking, b: PlanningBoeking): number {
  return a.start.localeCompare(b.start) || a.titel.localeCompare(b.titel, 'nl');
}

/**
 * Alleen de diensten van deze persoon, en exposities die nog niemand hebben.
 * Verleden, andere begeleiders en boekingen zonder begeleider blijven weg.
 */
export function deelGastbegeleiderPlanning(input: {
  boekingen: readonly PlanningBoeking[];
  vandaag: string;
  eigenIds: readonly string[];
  toewijzingen: readonly { boekingId: string; relatieId: string }[];
}): { eigen: PlanningBoeking[]; open: PlanningBoeking[] } {
  const eigenIds = new Set(input.eigenIds);
  const perBoeking = new Map<string, Set<string>>();
  for (const toe of input.toewijzingen) {
    if (!toe.relatieId) continue;
    const ids = perBoeking.get(toe.boekingId) ?? new Set<string>();
    ids.add(toe.relatieId);
    perBoeking.set(toe.boekingId, ids);
  }
  const vanMij = (boeking: PlanningBoeking): boolean => {
    if (boeking.gastheerId && eigenIds.has(boeking.gastheerId)) return true;
    const ids = perBoeking.get(boeking.id);
    if (!ids) return false;
    for (const id of ids) if (eigenIds.has(id)) return true;
    return false;
  };
  const heeftKoppeling = (boeking: PlanningBoeking): boolean => {
    if (boeking.gastheerId) return true;
    return (perBoeking.get(boeking.id)?.size ?? 0) > 0;
  };
  const lopend = input.boekingen.filter(
    (boeking) => hoortOpGastbegeleiderbord(boeking.status) && boeking.eind >= input.vandaag,
  );
  return {
    eigen: lopend.filter(vanMij).sort(sorteerPlanning),
    open: lopend
      .filter((boeking) => gastbegeleiderOntbreekt({ soort: boeking.soort, heeftKoppeling: heeftKoppeling(boeking) }))
      .sort(sorteerPlanning),
  };
}
