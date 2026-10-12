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
  return menselijkAdres(waarde) ?? CONTRACTBEHEER_EMAIL;
}

/** Trimt, haalt een adres uit "Naam <adres>" en weigert het sending-only noreply-adres. */
export function menselijkAdres(waarde: string | null | undefined): string | null {
  const kern = emailUitAdres(waarde ?? '');
  if (!kern || !EMAIL.test(kern) || kern === NOREPLY_ADRES) return null;
  return kern;
}

function redenGeenAntwoordAdres(waarde: string | null | undefined): 'leeg' | 'ongeldig' | 'noreply' {
  const kern = emailUitAdres(waarde ?? '');
  if (!kern) return 'leeg';
  if (kern === NOREPLY_ADRES) return 'noreply';
  return 'ongeldig';
}

/**
 * Reply-To voor een interne aanvraagnotificatie.
 * Ongeldig of ontbrekend aanvrageradres valt terug op contractbeheer en wordt gelogd.
 * noreply wordt nooit als bewuste Reply-To gebruikt.
 */
export function replyToInterneAanvraag(
  kandidaten: Array<string | null | undefined>,
  context: { sleutel?: string } = {},
): string {
  for (const kandidaat of kandidaten) {
    const adres = menselijkAdres(kandidaat);
    if (adres) return adres;
  }
  console.warn('[mail] aanvrageradres ontbreekt of is ongeldig; reply-to valt terug op contractbeheer', {
    sleutel: context.sleutel ?? '',
    reden: kandidaten.map((kandidaat) => redenGeenAntwoordAdres(kandidaat)),
  });
  return CONTRACTBEHEER_EMAIL;
}

/** Reply-To op de MIME-regel, met weergavenaam als die er is. */
export function replyToHeader(adres: string, naam?: string | null): string {
  const kern = menselijkAdres(adres) ?? CONTRACTBEHEER_EMAIL;
  const label = (naam ?? '').replace(/["<>\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
  return label ? `${label} <${kern}>` : kern;
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

export function richtingVoorMail(input: {
  sleutel?: string;
  templateId?: string;
  ontvangerRol?: string;
  richting?: 'intern' | 'aanvrager';
}): 'intern' | 'aanvrager' {
  if (input.richting === 'intern' || input.richting === 'aanvrager') return input.richting;
  return antwoordNaarAanvrager(input) ? 'intern' : 'aanvrager';
}

/**
 * Reply-To voor één mail.
 * Interne notificatie over een aanvraag gaat naar de aanvrager.
 * Mail aan aanvrager, huurder, gastheer of reservelijst gaat naar contractbeheer.
 * Een expliciet Reply-To overschrijft die richting niet, en noreply wint nooit.
 */
export function replyToVoor(input: {
  sleutel?: string;
  templateId?: string;
  ontvangerRol?: string;
  aanvragerEmail?: string | null;
  replyTo?: string | null;
  richting?: 'intern' | 'aanvrager';
}): string {
  if (richtingVoorMail(input) === 'aanvrager') return CONTRACTBEHEER_EMAIL;
  return replyToInterneAanvraag([input.aanvragerEmail, input.replyTo], {
    sleutel: input.sleutel ?? input.templateId,
  });
}
