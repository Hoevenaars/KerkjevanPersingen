/**
 * Afzender en Reply-To voor alle Resend-mail.
 * send.kerkjepersingen.nl ontvangt geen mail. Reply-To mag daar nooit naartoe wijzen.
 */

import { MAILTEMPLATE_META } from '../platform/mailtemplates/meta.ts';

export const NOREPLY_ADRES = 'noreply@send.kerkjepersingen.nl';
export const VAN_ADRES = `Het Kerkje van Persingen <${NOREPLY_ADRES}>`;
export const CONTRACTBEHEER_EMAIL = 'contractbeheer.kvp@gmail.com';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Templates en sleutels waarbij Beantwoorden naar de aanvrager of huurder moet. */
const ANTWOORD_NAAR_AANVRAGER = new Set([
  'aanvraag_bestuur',
  'contact_bestuur',
  'internal_booking_review_required',
  'internal_booking_information_received',
  'internal_payment_overdue',
  'internal_content_overdue',
  'internal_content_review_required',
  'aanbetaling_check_paul',
  'content_ter_beoordeling',
  'optie_verlopen_contractbeheerder',
]);

export function emailUitAdres(waarde: string): string {
  const match = waarde.match(/<([^>]+)>/);
  return (match?.[1] ?? waarde).trim().toLowerCase();
}

export function isNoreplyAdres(waarde: string): boolean {
  return emailUitAdres(waarde) === NOREPLY_ADRES;
}

/** Een adres dat een mens kan beantwoorden. Nooit het sending-only noreply-adres. */
export function veiligReplyTo(waarde: string | null | undefined): string {
  const kern = emailUitAdres(waarde ?? '');
  if (!kern || !EMAIL.test(kern) || kern === NOREPLY_ADRES) return CONTRACTBEHEER_EMAIL;
  return kern;
}

function antwoordNaarAanvrager(input: {
  sleutel?: string;
  templateId?: string;
  ontvangerRol?: string;
}): boolean {
  const sleutel = input.sleutel ?? '';
  const templateId = input.templateId ?? '';
  const rol = (input.ontvangerRol ?? '').toLowerCase();
  if (rol === 'huurder' || rol === 'gastheer' || rol === 'planning' || rol === 'reservelijst') return false;
  if (templateId === 'internal_host_required') return false;
  if (ANTWOORD_NAAR_AANVRAGER.has(sleutel) || ANTWOORD_NAAR_AANVRAGER.has(templateId)) return true;
  if (rol === 'bestuur' || rol === 'finance') return true;
  const meta = templateId ? MAILTEMPLATE_META[templateId] : undefined;
  if (!meta) return false;
  const ontvanger = meta.ontvanger.toLowerCase();
  if (
    ontvanger.includes('aanvrager') ||
    ontvanger.includes('huurder') ||
    ontvanger.includes('gastheer') ||
    ontvanger.includes('reservelijst') ||
    ontvanger.includes('planning')
  ) {
    return false;
  }
  return ontvanger.includes('bestuur') || ontvanger.includes('finance');
}

/**
 * Reply-To voor één mail.
 * Interne notificatie over een aanvraag gaat naar de aanvrager.
 * Mail aan aanvrager, huurder, gastheer of reservelijst gaat naar contractbeheer.
 * Interne mail zonder tegenpartij gaat ook naar contractbeheer, niet naar noreply.
 */
export function replyToVoor(input: {
  sleutel?: string;
  templateId?: string;
  ontvangerRol?: string;
  aanvragerEmail?: string | null;
  replyTo?: string | null;
}): string {
  const expliciet = input.replyTo?.trim();
  if (expliciet && !isNoreplyAdres(expliciet) && EMAIL.test(emailUitAdres(expliciet))) {
    return emailUitAdres(expliciet);
  }
  if (antwoordNaarAanvrager(input)) return veiligReplyTo(input.aanvragerEmail);
  return CONTRACTBEHEER_EMAIL;
}
