/**
 * Eén poort voor alles wat om betaling vraagt of een factuur meestuurt.
 * Ontbreekt de schakelaar, of is de status niet exact 'actief', dan gaat er niets uit.
 * Featurevlaggen en een deployment lezen deze functie niet om haar aan te zetten.
 */

import { magAutomatiseringUitvoeren, TEMPLATES_LEGACY, type Automatisering, type Verzendbesluit } from './automatisering.ts';
import { MAILTEMPLATE_META } from './mailtemplates/meta.ts';

export const BETALINGSCOMMUNICATIE = 'betalingscommunicatie';

export const BETALING_DICHT = 'Betalingscommunicatie staat uit. Er is geen factuur uitgegeven en er is geen betalingsmail verzonden.';

/**
 * Expliciete financiële sjablonen. Lidmaatschap is de classificatie.
 * Een naam, een bestandsnaam of een woord in de tekst beslist hier niet.
 */
export const FINANCIELE_SJABLONEN = [
  'booking_approved_payment_required',
  'booking_payment_reminder',
  'booking_payment_final_reminder',
  'internal_payment_overdue',
  'aanbetaling_check_paul',
] as const;

export const BETALINGS_TEMPLATES = FINANCIELE_SJABLONEN;

/** Bekende berichten die geen betaling vragen. De huurovereenkomst hoort hier: die laat tekenen en noemt de betaalafspraak, zonder een factuur of een verzoek om nu te betalen. */
const GEEN_BETALING_EXTRA = [
  'contract_begeleiding',
  'huurovereenkomst',
  'foto_aanlevering',
  ...TEMPLATES_LEGACY.filter((id) => !FINANCIELE_SJABLONEN.includes(id as (typeof FINANCIELE_SJABLONEN)[number])),
] as const;

const GEEN_BETALING = new Set<string>([
  ...Object.keys(MAILTEMPLATE_META).filter((id) => !FINANCIELE_SJABLONEN.includes(id as (typeof FINANCIELE_SJABLONEN)[number])),
  ...GEEN_BETALING_EXTRA,
]);

export type Berichtsoort = 'betaling' | 'geen_betaling';

export function isBetalingsTemplate(templateId: string | null | undefined): boolean {
  return FINANCIELE_SJABLONEN.includes(String(templateId ?? '') as (typeof FINANCIELE_SJABLONEN)[number]);
}

/**
 * Soort op de plek waar het bericht ontstaat.
 * Een onbekend of leeg sjabloon, inclusief vrije tekst, blijft null en gaat dus niet als gewone mail de deur uit.
 */
export function berichtsoortVoorSjabloon(sjabloon: string | null | undefined): Berichtsoort | null {
  const id = String(sjabloon ?? '').trim();
  if (!id || id === 'vrij') return null;
  if (isBetalingsTemplate(id)) return 'betaling';
  if (GEEN_BETALING.has(id)) return 'geen_betaling';
  return null;
}

/** Alleen een expliciete geen_betaling blijft buiten de poort. Al het andere is financieel. */
export function isFinancieelBericht(berichtsoort: string | null | undefined): boolean {
  return berichtsoort !== 'geen_betaling';
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
