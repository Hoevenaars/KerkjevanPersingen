/**
 * Generieke grens tegen historische backfill.
 * Een schakelaar die vandaag op Aan of Test gaat, start geen mail
 * waarvan het trigger-moment vóór die grens ligt.
 */

export function grensVoorActivatie(actiefVanaf: string | null | undefined, vandaag: string): string {
  if (actiefVanaf && /^\d{4}-\d{2}-\d{2}$/.test(actiefVanaf)) return actiefVanaf;
  return vandaag;
}

export function triggerValtBinnenGrens(geplandOp: string, actiefVanaf: string | null | undefined): boolean {
  if (!actiefVanaf) return true;
  return geplandOp >= actiefVanaf;
}

export interface BackfillGeval {
  geplandOp: string;
  alAfgehandeld: boolean;
  alVerzonden: boolean;
  geannuleerd: boolean;
}

export function magJobStarten(geval: BackfillGeval, actiefVanaf: string | null | undefined): boolean {
  if (geval.geannuleerd || geval.alVerzonden || geval.alAfgehandeld) return false;
  return triggerValtBinnenGrens(geval.geplandOp, actiefVanaf);
}
