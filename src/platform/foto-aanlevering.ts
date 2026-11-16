/**
 * Mail en link waarmee een huurder een ontbrekende afbeelding alsnog aanlevert.
 * De link is een geheim. Die hoort in de mail, niet in een log of een flashmelding.
 */

import { kerkjeMail } from '../lib/kerkje-mail.ts';

export const FOTO_AANLEVER_DAGEN = 14;
export const FOTO_AANLEVER_ONDERWERP = 'Je afbeelding voor het Kerkje van Persingen';

export function fotoAanleverUrl(basisUrl: string, token: string): string {
  const schoon = token.trim();
  if (schoon.length < 20 || /[^A-Za-z0-9_-]/.test(schoon)) return '';
  let basis: URL;
  try {
    basis = new URL(basisUrl);
  } catch {
    return '';
  }
  if (basis.protocol !== 'https:' && basis.protocol !== 'http:') return '';
  return `${basis.origin}/klant/aanleveren/?token=${encodeURIComponent(schoon)}&beeld=1`;
}

export function briefFotoAanlevering(naam: string, url: string): { onderwerp: string; html: string; text: string } {
  const aanhef = naam.trim().split(/\s+/)[0] || naam.trim();
  const mail = kerkjeMail({
    titel: 'Afbeelding bij je activiteit',
    aanhef: aanhef ? `Beste ${aanhef},` : 'Beste,',
    hoofdtekst: [
      'Je tekst voor het Kerkje van Persingen is binnen. De afbeelding is daarbij niet meegekomen.',
      `Wil je die alsnog aanleveren? Je tekst staat al klaar op de pagina. De link werkt ${FOTO_AANLEVER_DAGEN} dagen.`,
    ].join('\n\n'),
    slot: 'Lukt het niet, bel dan 06 52 66 84 49.',
    ondertekening: 'Stichting Het Kerkje van Persingen',
    cta: [{ label: 'Afbeelding aanleveren', href: url }],
  });
  return { onderwerp: FOTO_AANLEVER_ONDERWERP, html: mail.html, text: mail.text };
}
