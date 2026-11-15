/**
 * Contractpakket: één PDF met de bevroren overeenkomst en de
 * toepasselijke voorwaarden. Een mail zonder geldige PDF gaat niet weg.
 */

import { createHash } from 'node:crypto';
import { pdfBevatTekst, pdfBytes } from './documenten/pdf.ts';
import { DOCUMENTVERSIE } from './documenten/teksten-v1.ts';
import { veldenUitContracttekst, vulPdfSjabloon } from './documenten/pdf-sjabloon.ts';

export const PRIVACY_URL = 'https://kerkjepersingen.nl/privacyverklaring/';
export const TEKEN_BASIS = 'https://kerkjepersingen.nl';

export interface PakketBron {
  tekst: string;
  voorwaardenTekst: string;
  huisregelsTekst: string;
  plattegrondTekst: string;
  soort: string;
}

export interface PdfBijlage {
  bestandsnaam: string;
  inhoud: Uint8Array;
}

export interface BijlageManifest {
  bestandsnaam: string;
  bytes: number;
  sha256: string;
  mime: 'application/pdf';
}

export function contractPakketTekst(bron: PakketBron): string {
  const delen = [bron.tekst.trim(), bron.voorwaardenTekst.trim(), bron.huisregelsTekst.trim()];
  if (bron.soort.trim().toLowerCase() === 'expositie' && bron.plattegrondTekst.trim()) {
    delen.push(bron.plattegrondTekst.trim());
  }
  return delen.filter(Boolean).join('\n\f\n');
}

export function contractMailTekst(input: {
  naam: string;
  contractnummer: string;
  versie: number;
  voorwaardenVersie?: string;
  link: string | null;
}): string {
  const voornaam = input.naam.trim().split(/\s+/)[0] || 'huurder';
  const versieVoorwaarden = input.voorwaardenVersie || DOCUMENTVERSIE;
  const regels = [
    `Beste ${voornaam},`,
    '',
    `Bij deze mail zit het volledige contractpakket als PDF: huurovereenkomst ${input.contractnummer}, documentversie ${input.versie}.`,
    `In die PDF staan de overeenkomst en de verhuurvoorwaarden versie ${versieVoorwaarden}.`,
    `Privacyverklaring: ${PRIVACY_URL}`,
  ];
  if (input.link) {
    regels.push(
      `Dezelfde versie bekijkt en ondertekent u via deze persoonlijke link: ${input.link}`,
      'De link verloopt. Ondertekenen is een elektronische bevestiging en geen gekwalificeerde elektronische handtekening.',
    );
  }
  regels.push(
    'Dit bericht maakt de reservering nog niet definitief. Dat gebeurt volgens de betaalafspraken in het contract, inclusief een eventuele aanbetaling.',
  );
  return regels.join('\n');
}

export function tekenUrl(token: string, basis = TEKEN_BASIS): string {
  return `${basis.replace(/\/$/, '')}/tekenen/${token}`;
}

export function tekenLinkGeldig(link: string, basis = TEKEN_BASIS): boolean {
  try {
    const url = new URL(link);
    const verwacht = new URL(basis);
    if (url.origin !== verwacht.origin) return false;
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return false;
    return /^\/tekenen\/[A-Za-z0-9_-]{43}$/.test(url.pathname);
  } catch {
    return false;
  }
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function pdfBijlageFout(bijlage: PdfBijlage, contractnummer?: string): string | null {
  const naam = bijlage.bestandsnaam.trim();
  if (!/^[\w.\- ]+\.pdf$/i.test(naam) || naam.length > 120) {
    return 'De bijlage heeft geen geldige PDF-naam. Er is geen mail verstuurd.';
  }
  const bytes = bijlage.inhoud;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 800) {
    return 'De PDF-bijlage is leeg of te klein. Er is geen mail verstuurd.';
  }
  if (bytes.byteLength > 8_000_000) {
    return 'De PDF-bijlage is te groot. Er is geen mail verstuurd.';
  }
  const kop = String.fromCharCode(...bytes.slice(0, 5));
  const staart = Buffer.from(bytes.slice(-32)).toString('latin1');
  if (kop !== '%PDF-' || !staart.includes('%%EOF')) {
    return 'De bijlage is geen geldige PDF. Er is geen mail verstuurd.';
  }
  if (contractnummer) {
    if (!pdfBevatTekst(bytes, contractnummer) || !pdfBevatTekst(bytes, 'Verhuurvoorwaarden')) {
      return 'De PDF bevat niet het contract en de voorwaarden. Er is geen mail verstuurd.';
    }
  }
  return null;
}

export async function maakContractPdf(
  bron: PakketBron,
  bestandsnaam: string,
  contractnummer: string,
  sjabloon?: Uint8Array | null,
): Promise<{ ok: true; bijlage: PdfBijlage; manifest: BijlageManifest } | { ok: false; melding: string }> {
  const tekst = contractPakketTekst(bron);
  if (!tekst.includes(contractnummer) || !tekst.includes(bron.voorwaardenTekst.slice(0, 40))) {
    return { ok: false, melding: 'Het contractpakket is onvolledig. Er is geen mail verstuurd.' };
  }
  let inhoud: Uint8Array;
  if (sjabloon && sjabloon.byteLength > 0) {
    const velden = veldenUitContracttekst(bron.tekst);
    if (!velden || velden.contractnummer !== contractnummer) {
      return { ok: false, melding: 'De contracttekst levert geen mergevelden. Er is geen mail verstuurd.' };
    }
    const gevuld = await vulPdfSjabloon({ sjabloon, velden, bijlage: bron });
    if (!gevuld.ok) return gevuld;
    inhoud = gevuld.pdf;
  } else {
    inhoud = pdfBytes(tekst);
  }
  const bijlage = { bestandsnaam, inhoud };
  const fout = pdfBijlageFout(bijlage, contractnummer);
  if (fout) return { ok: false, melding: fout };
  return {
    ok: true,
    bijlage,
    manifest: {
      bestandsnaam,
      bytes: inhoud.byteLength,
      sha256: sha256Hex(inhoud),
      mime: 'application/pdf',
    },
  };
}

/** De vorm die de mailprovider als attachments ontvangt. Leeg is geen geldige contractmail. */
export function resendAttachments(bijlagen: readonly PdfBijlage[], contractnummer?: string): { filename: string; content: Buffer }[] {
  if (bijlagen.length === 0) {
    throw new Error('De mail heeft geen bijlage. Er is niets verstuurd.');
  }
  return bijlagen.map((bijlage) => {
    const fout = pdfBijlageFout(bijlage, contractnummer);
    if (fout) throw new Error(fout);
    return { filename: bijlage.bestandsnaam, content: Buffer.from(bijlage.inhoud) };
  });
}

export function contractmailMagWeg(input: {
  tekst: string;
  link: string;
  bijlagen: readonly PdfBijlage[];
  contractnummer: string;
}): string | null {
  if (!input.tekst.includes(PRIVACY_URL)) return 'De privacyverklaring ontbreekt in de mail. Er is niets verstuurd.';
  if (!input.tekst.toLowerCase().includes('verhuurvoorwaarden')) {
    return 'De mail noemt de verhuurvoorwaarden niet. Er is niets verstuurd.';
  }
  if (!tekenLinkGeldig(input.link) || !input.tekst.includes(input.link)) {
    return 'De tekenlink ontbreekt of is ongeldig. Er is geen mail verstuurd.';
  }
  try {
    const attachments = resendAttachments(input.bijlagen, input.contractnummer);
    if (attachments.length === 0 || attachments[0].content.byteLength < 800) {
      return 'De PDF zit niet in de bijlagen. Er is geen mail verstuurd.';
    }
  } catch (error) {
    return error instanceof Error ? error.message : 'De bijlage is ongeldig. Er is geen mail verstuurd.';
  }
  return null;
}
