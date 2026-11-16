/**
 * Contractpakket: één PDF met de bevroren overeenkomst en de
 * toepasselijke voorwaarden. Een mail zonder geldige PDF gaat niet weg.
 */

import { createHash } from 'node:crypto';
import { formatDatum } from '../lib/datum.ts';
import { kerkjeMail } from '../lib/kerkje-mail.ts';
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

export const CONTRACT_MAIL_ONDERWERP = 'Uw huurovereenkomst | Kerkje van Persingen';
const CONTRACT_KNOP = 'Bekijk en onderteken uw huurovereenkomst';

export interface ContractMailInput {
  naam: string;
  contractnummer: string;
  versie: number;
  voorwaardenVersie?: string;
  link: string | null;
  verlooptOp?: string | null;
}

function mailEscape(waarde: string): string {
  return waarde
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function vervalTekst(iso: string | null | undefined): string | null {
  if (!iso || Number.isNaN(Date.parse(iso))) return null;
  return formatDatum(iso, true);
}

function feitRij(label: string, waarde: string): string {
  return `<tr>
    <td style="padding:8px 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;color:#4A4A44;">${mailEscape(label)}</td>
  </tr>
  <tr>
    <td style="padding:0 16px 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.4;color:#1A1A1A;word-break:break-word;">${mailEscape(waarde)}</td>
  </tr>`;
}

/** Onderwerp, platte tekst en HTML van de contractmail. Dezelfde feiten in beide. */
export function contractMail(input: ContractMailInput): { onderwerp: string; tekst: string; html: string } {
  const huurder = input.naam.replace(/\s+/g, ' ').trim() || 'huurder';
  const versieVoorwaarden = input.voorwaardenVersie || DOCUMENTVERSIE;
  const documentversie = String(input.versie);
  const verval = vervalTekst(input.verlooptOp);
  const link = input.link?.trim() || '';
  const geldig = verval
    ? `Uw persoonlijke ondertekenlink is geldig tot ${verval}.`
    : 'Uw persoonlijke ondertekenlink is tijdelijk geldig.';
  const tekenen = link
    ? [
      'Digitaal ondertekenen',
      'U hoeft niets te printen of terug te sturen. Via onderstaande persoonlijke link kunt u de overeenkomst bekijken en direct digitaal ondertekenen.',
      '',
      CONTRACT_KNOP,
      link,
      '',
      `De digitale overeenkomst is identiek aan de PDF in de bijlage. ${geldig}`,
    ]
    : [];
  const hoofdtekst = [
    'Bij deze e-mail ontvangt u uw huurovereenkomst en de bijbehorende verhuurvoorwaarden als PDF. U kunt alles rustig doorlezen en vervolgens eenvoudig digitaal ondertekenen.',
    '',
    'Uw huurovereenkomst',
    `Contractnummer: ${input.contractnummer}`,
    `Documentversie: ${documentversie}`,
    `Verhuurvoorwaarden: ${versieVoorwaarden}`,
    '',
    ...tekenen,
    '',
    'Wanneer is uw reservering definitief?',
    'Na ondertekening is uw reservering nog niet automatisch definitief. Hiervoor gelden de betaalafspraken uit uw huurovereenkomst, waaronder een eventuele aanbetaling.',
    '',
    'Heeft u vragen over de overeenkomst? Neem gerust contact met ons op. Wij helpen u graag verder.',
    '',
    'We kijken ernaar uit u te verwelkomen in het Kerkje van Persingen!',
    '',
    'Uw digitale ondertekening geldt als elektronische bevestiging en is geen gekwalificeerde elektronische handtekening.',
    '',
    `Bekijk onze privacyverklaring: ${PRIVACY_URL}`,
  ].join('\n');
  const knop = link
    ? `<p style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.4;color:#4A5235;">Digitaal ondertekenen</p>
<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#4A4A44;">U hoeft niets te printen of terug te sturen. Via onderstaande persoonlijke link kunt u de overeenkomst bekijken en direct digitaal ondertekenen.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 12px;border-collapse:collapse;">
  <tr>
    <td bgcolor="#9C4A2F" style="background:#9C4A2F;">
      <a href="${mailEscape(link)}" style="display:inline-block;padding:14px 22px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.3;font-weight:600;color:#ffffff;text-decoration:none;">${CONTRACT_KNOP}</a>
    </td>
  </tr>
</table>
<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#4A4A44;">Werkt de knop niet? Kopieer deze link in uw browser:<br /><a href="${mailEscape(link)}" style="color:#4A5235;word-break:break-all;">${mailEscape(link)}</a></p>
<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#4A4A44;">De digitale overeenkomst is identiek aan de PDF in de bijlage. ${mailEscape(geldig)}</p>`
    : '';
  const hoofdHtml = `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#4A4A44;">Bij deze e-mail ontvangt u uw huurovereenkomst en de bijbehorende verhuurvoorwaarden als PDF. U kunt alles rustig doorlezen en vervolgens eenvoudig digitaal ondertekenen.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;border-collapse:collapse;background:#F1EBDD;">
  <tr><td style="padding:14px 16px 6px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.4;color:#4A5235;">Uw huurovereenkomst</td></tr>
  ${feitRij('Contractnummer', input.contractnummer)}
  ${feitRij('Documentversie', documentversie)}
  ${feitRij('Verhuurvoorwaarden', versieVoorwaarden)}
  <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
</table>
${knop}
<p style="margin:8px 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.4;color:#4A5235;">Wanneer is uw reservering definitief?</p>
<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#4A4A44;">Na ondertekening is uw reservering nog niet automatisch definitief. Hiervoor gelden de betaalafspraken uit uw huurovereenkomst, waaronder een eventuele aanbetaling.</p>
<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#4A4A44;">Heeft u vragen over de overeenkomst? Neem gerust contact met ons op. Wij helpen u graag verder.</p>
<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#4A4A44;">We kijken ernaar uit u te verwelkomen in het Kerkje van Persingen!</p>
<p style="margin:8px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#4A4A44;">Uw digitale ondertekening geldt als elektronische bevestiging en is geen gekwalificeerde elektronische handtekening.</p>
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;"><a href="${PRIVACY_URL}" style="color:#4A5235;">Bekijk onze privacyverklaring</a></p>`;
  const brief = kerkjeMail({
    titel: 'Uw huurovereenkomst',
    aanhef: `Beste ${huurder},`,
    introductie: 'Hartelijk dank voor uw interesse in het huren van het Kerkje van Persingen!',
    hoofdtekst,
    hoofdHtml,
    ondertekening: 'Team Kerkje van Persingen',
  });
  return { onderwerp: CONTRACT_MAIL_ONDERWERP, tekst: brief.text, html: brief.html };
}

export function contractMailTekst(input: ContractMailInput): string {
  return contractMail(input).tekst;
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
