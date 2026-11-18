/**
 * Eén poort voor alles wat om betaling vraagt of een factuur meestuurt.
 * Ontbreekt de schakelaar, of is de status niet exact 'actief', dan gaat er niets uit.
 * Featurevlaggen en een deployment lezen deze functie niet om haar aan te zetten.
 */

import { magAutomatiseringUitvoeren, type Automatisering, type Verzendbesluit } from './automatisering.ts';

export const BETALINGSCOMMUNICATIE = 'betalingscommunicatie';

export const BETALING_DICHT = 'Betalingscommunicatie staat uit. Er is geen factuur uitgegeven en er is geen betalingsmail verzonden.';

export const BETALINGS_TEMPLATES = [
  'booking_approved_payment_required',
  'booking_payment_reminder',
  'booking_payment_final_reminder',
  'internal_payment_overdue',
  'aanbetaling_check_paul',
] as const;

export function isBetalingsTemplate(templateId: string | null | undefined): boolean {
  return BETALINGS_TEMPLATES.includes(String(templateId ?? '') as (typeof BETALINGS_TEMPLATES)[number]);
}

export function bijlageIsFactuur(bestandsnaam: string | null | undefined): boolean {
  return /factuur/i.test(String(bestandsnaam ?? ''));
}

export function raaktBetalingscommunicatie(input: {
  sleutel?: string | null;
  templateId?: string | null;
  bijlagen?: readonly { bestandsnaam?: string | null }[] | null;
}): boolean {
  if (input.sleutel === 'betaalherinnering' || input.sleutel === BETALINGSCOMMUNICATIE) return true;
  if (isBetalingsTemplate(input.templateId)) return true;
  return (input.bijlagen ?? []).some((bijlage) => bijlageIsFactuur(bijlage.bestandsnaam));
}

/** Alleen de databasewaarde telt. Geen rij, een andere status of een leeg register blijft uit. */
export function betalingscommunicatieBesluit(register: readonly Automatisering[] | null | undefined): Verzendbesluit {
  if (!register || register.length === 0) {
    return { uitvoeren: false, provider: false, reden: BETALING_DICHT, status: 'uit', modus: 'uit' };
  }
  const besluit = magAutomatiseringUitvoeren(BETALINGSCOMMUNICATIE, register);
  if (besluit.modus !== 'aan' && besluit.modus !== 'test') {
    return { ...besluit, uitvoeren: false, provider: false, modus: 'uit', reden: BETALING_DICHT };
  }
  return besluit;
}
