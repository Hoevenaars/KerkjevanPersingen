/**
 * Eén visuele omlijsting voor transactionele Kerkje-mail.
 * De nieuwsbrief gebruikt deze wrapper niet.
 */

export const KERKJE_MAIL_MERK = 'data-kerkje-mail="1"';

const SITE = 'https://kerkjepersingen.nl';
/** Publiek HTTPS-zegel. Geen sessie. De woordmerktekst blijft staan als de afbeelding geblokkeerd wordt. */
export const KERKJE_LOGO_URL = `${SITE}/logo-klein.png`;
const LOGO_ALT = 'Zegel van het Kerkje van Persingen';

const PINE = '#4A5235';
const BRICK = '#9C4A2F';
const CREAM = '#FAF8F3';
const CREAM_DEEP = '#F1EBDD';
const INK = '#1A1A1A';
const INK_SOFT = '#4A4A44';

export interface KerkjeMailCta {
  label: string;
  href: string;
  secundair?: boolean;
}

export interface KerkjeMailInvoer {
  titel: string;
  aanhef?: string;
  introductie?: string;
  /** Platte hoofdtekst voor de tekstmail en, zonder hoofdHtml, ook voor de HTML-kaart. */
  hoofdtekst?: string;
  /** Opgemaakte hoofdtekst. Vervangt de platte hoofdtekst in de HTML, niet in de tekstmail. */
  hoofdHtml?: string;
  slot?: string;
  ondertekening?: string;
  secundair?: string;
  cta?: KerkjeMailCta[];
  /** Eén inhoudsblok, bijvoorbeeld een gegevenstabel. Geen tweede omlijsting. */
  extraBlok?: string;
}

export interface KerkjeMail {
  html: string;
  text: string;
}

function escapeHtml(waarde: string): string {
  return waarde
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function alOmlijst(fragment: string | undefined): boolean {
  return Boolean(fragment?.includes(KERKJE_MAIL_MERK) || fragment?.includes('data-kerkje-mail'));
}

function paragrafen(tekst: string): string {
  return tekst
    .split(/\n{2,}/)
    .map((blok) => blok.trim())
    .filter(Boolean)
    .map((blok) => {
      const regels = escapeHtml(blok).replace(/\n/g, '<br />');
      return `<p style="margin:0 0 16px;line-height:1.6;color:${INK_SOFT};">${regels}</p>`;
    })
    .join('\n');
}

function knop(cta: KerkjeMailCta): string {
  const bg = cta.secundair ? '#ffffff' : BRICK;
  const color = cta.secundair ? BRICK : '#ffffff';
  const border = cta.secundair ? `1px solid ${BRICK}` : `1px solid ${BRICK}`;
  return `<a href="${escapeHtml(cta.href)}" style="display:inline-block;margin:0 12px 12px 0;padding:12px 22px;background:${bg};color:${color};border:${border};text-decoration:none;font-weight:600;font-size:15px;line-height:1.3;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(cta.label)}</a>`;
}

function tekstDelen(invoer: KerkjeMailInvoer, knoppen: KerkjeMailCta[]): string {
  const regels: string[] = [invoer.titel.trim()];
  const stukken = [invoer.aanhef, invoer.introductie, invoer.hoofdtekst, invoer.slot, invoer.secundair];
  for (const stuk of stukken) {
    const schoon = stuk?.trim();
    if (schoon) regels.push('', schoon);
  }
  for (const cta of knoppen) {
    regels.push('', `${cta.label}: ${cta.href}`);
  }
  if (invoer.ondertekening?.trim()) {
    regels.push('', 'Met vriendelijke groet,', invoer.ondertekening.trim());
  }
  regels.push(
    '',
    'Stichting Het Kerkje van Persingen',
    'Persingensestraat 7, 6575 JA Persingen',
    '06 52 66 84 49',
    SITE,
  );
  return regels.join('\n');
}

/** Transactionele mail: één kaart, tekstfallback uit dezelfde velden. */
export function kerkjeMail(invoer: KerkjeMailInvoer): KerkjeMail {
  if (alOmlijst(invoer.hoofdHtml) || alOmlijst(invoer.extraBlok)) {
    throw new Error('Deze inhoud is al een Kerkje-mail. Een tweede omlijsting wordt niet gezet.');
  }
  const titel = invoer.titel.trim() || 'Kerkje van Persingen';
  const knoppen = (invoer.cta ?? []).filter((cta) => cta.label.trim() && cta.href.trim());
  const aanhef = invoer.aanhef?.trim() ?? '';
  const intro = invoer.introductie?.trim() ?? '';
  const slot = invoer.slot?.trim() ?? '';
  const secundair = invoer.secundair?.trim() ?? '';
  const ondertekening = invoer.ondertekening?.trim() ?? '';
  const extra = invoer.extraBlok?.trim() ?? '';
  const lichaam = extra
    ? ''
    : invoer.hoofdHtml?.trim()
      || (invoer.hoofdtekst?.trim() ? paragrafen(invoer.hoofdtekst) : '');

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(titel)}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
  <table role="presentation" ${KERKJE_MAIL_MERK} width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:${CREAM};">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;border-collapse:collapse;">
          <tr>
            <td style="padding:0 0 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                  <td width="48" valign="middle" style="width:48px;padding:0;">
                    <img src="${KERKJE_LOGO_URL}" width="44" height="45" alt="${LOGO_ALT}" style="display:block;border:0;width:44px;height:auto;" />
                  </td>
                  <td valign="middle" style="padding:0 0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.3;color:${PINE};">
                    Kerkje van Persingen
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border:1px solid #e4dccb;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="background:${PINE};padding:22px 28px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.35;color:#ffffff;">
                    ${escapeHtml(titel)}
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${INK};">
                    ${aanhef ? `<p style="margin:0 0 16px;line-height:1.6;color:${INK};">${escapeHtml(aanhef)}</p>` : ''}
                    ${intro ? `<p style="margin:0 0 16px;line-height:1.6;color:${INK_SOFT};">${escapeHtml(intro)}</p>` : ''}
                    ${lichaam}
                    ${extra}
                    ${slot ? `<p style="margin:8px 0 0;line-height:1.6;color:${INK_SOFT};">${escapeHtml(slot)}</p>` : ''}
                    ${knoppen.length ? `<p style="margin:24px 0 8px;">${knoppen.map(knop).join('')}</p>` : ''}
                    ${secundair ? `<p style="margin:8px 0 0;font-size:14px;line-height:1.55;color:${INK_SOFT};">${escapeHtml(secundair)}</p>` : ''}
                    ${
                      ondertekening
                        ? `<p style="margin:28px 0 8px;line-height:1.55;color:${INK_SOFT};">Met vriendelijke groet,<br /><span style="color:${INK};">${escapeHtml(ondertekening).replace(/\n/g, '<br />')}</span></p>`
                        : ''
                    }
                  </td>
                </tr>
                <tr>
                  <td style="background:${CREAM_DEEP};padding:18px 28px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${INK_SOFT};">
                    Stichting Het Kerkje van Persingen<br />
                    Persingensestraat 7, 6575 JA Persingen<br />
                    06 52 66 84 49<br />
                    <a href="${SITE}/" style="color:${PINE};text-decoration:none;">kerkjepersingen.nl</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { html, text: tekstDelen({ ...invoer, titel }, knoppen) };
}
