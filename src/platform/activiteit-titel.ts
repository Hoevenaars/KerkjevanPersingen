/**
 * Eén weergave voor activiteitstitels.
 * Alleen een expositie krijgt het vaste voorvoegsel "Expositie:".
 * De opgeslagen titel blijft de kale naam.
 */

const VOORVOEGSEL = /^expositie\s*:?\s*/i;

export function titelZonderExpositiePrefix(titel: string | null | undefined): string {
  let rest = (titel ?? '').trim();
  while (VOORVOEGSEL.test(rest)) rest = rest.replace(VOORVOEGSEL, '').trim();
  return rest;
}

export function isExpositieType(type: string | null | undefined): boolean {
  return (type ?? '').trim().toLowerCase() === 'expositie';
}

/** Weergavetitel. Andere types blijven ongemoeid. Een bestaand voorvoegsel telt één keer. */
export function formatActiviteitTitel(type: string | null | undefined, titel: string | null | undefined): string {
  const ruw = (titel ?? '').trim();
  if (!ruw) return '';
  if (!isExpositieType(type)) return ruw;
  const kern = titelZonderExpositiePrefix(ruw);
  return kern ? `Expositie: ${kern}` : '';
}

/** Wat er in het invulveld staat: nooit het vaste voorvoegsel. */
export function titelVoorInvoer(type: string | null | undefined, titel: string | null | undefined): string {
  const ruw = (titel ?? '').trim();
  if (!isExpositieType(type)) return ruw;
  return titelZonderExpositiePrefix(ruw);
}

export function titelVoorOpslag(type: string | null | undefined, titel: string | null | undefined): string {
  const ruw = (titel ?? '').trim();
  if (!isExpositieType(type)) return ruw;
  return titelZonderExpositiePrefix(ruw);
}
