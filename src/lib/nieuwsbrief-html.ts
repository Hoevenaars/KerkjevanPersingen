/**
 * HTML van de vriendenmail. Geen Resend hier, zodat de opmaak
 * zonder netwerk te testen is. Afbeeldingen zijn absolute URL's: e-mail
 * kan relatieve paden niet tonen.
 */

const SITE = 'https://kerkjepersingen.nl';
export const LOGO_URL = `${SITE}/logo-klein.png`;
export const SFEER_URL = `${SITE}/foto/verhuur-ruimte.jpg`;
export const FOOTER_LANDSCHAP_URL = `${SITE}/foto/footer-landschap.jpg`;

import {
  NIEUWSBRIEF_AFSLUITING,
  NIEUWSBRIEF_GROET,
  NIEUWSBRIEF_INTRO,
  NIEUWSBRIEF_KOP,
  NIEUWSBRIEF_ONDERTITEL,
  type NieuwsbriefMailMeta,
} from './nieuwsbrief-frequentie.ts';

export type { NieuwsbriefMailMeta };
import { CONTRACTBEHEER_EMAIL } from './mail-adressen.ts';

/** Vast Reply-To voor de vriendenmail. Niet de transportfallback. */
export const NIEUWSBRIEF_REPLY_TO = CONTRACTBEHEER_EMAIL;

const PINE = '#4A5235';
const BRICK = '#9C4A2F';
const CREAM = '#FAF8F3';
const CREAM_DEEP = '#F1EBDD';
const SAND = '#D9CFBC';
const INK = '#1A1A1A';
const INK_SOFT = '#4A4A44';

export type NieuwsbriefInhoud = {
  kortNieuws?: string;
  kortNieuwsFotoUrl?: string;
  kortNieuwsFotoAlt?: string;
  donatieUpdate?: string;
  extraBlokken?: { titel: string; tekst: string }[];
};

export type NieuwsbriefActiviteitBlok = {
  titel: string;
  datumTekst: string;
  omschrijving?: string;
  fotoUrl: string;
  fotoAlt: string;
  agendaUrl: string;
  kop: string;
  isExpositie: boolean;
};

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function metRegels(tekst: string): string {
  return escape(tekst).replace(/\n/g, '<br />');
}

function voettekstLink(href: string, label: string): string {
  return `<a href="${escape(href)}" style="color:${CREAM};text-decoration:none;">${escape(label)}</a>`;
}

function preheader(
  _content: NieuwsbriefInhoud | null,
  activiteiten: NieuwsbriefActiviteitBlok[],
): string {
  const activiteit = activiteiten[0];
  if (activiteit) {
    if (activiteiten.length > 1) {
      return `${activiteiten.length} activiteiten in het kerkje — ${activiteit.titel}`;
    }
    return `${activiteit.kop}: ${activiteit.titel}`;
  }
  return 'Wat er te doen is in het kerkje van Persingen.';
}

function renderExtraBlokken(blokken?: { titel: string; tekst: string }[]): string {
  if (!blokken?.length) return '';
  return blokken
    .filter((blok) => blok.titel.trim() || blok.tekst.trim())
    .map(
      (blok) => `
      <tr>
        <td style="padding:20px 32px 0;font-family:Georgia,'Times New Roman',serif;">
          <div style="color:${BRICK};font-size:12px;letter-spacing:0.1em;text-transform:uppercase;font-weight:bold;margin-bottom:8px;font-family:Arial,sans-serif;">
            ${escape(blok.titel.trim() || 'Extra')}
          </div>
          <p style="color:${INK};font-size:15px;line-height:1.6;margin:0;">
            ${blok.tekst.trim() ? metRegels(blok.tekst) : ''}
          </p>
        </td>
      </tr>`,
    )
    .join('');
}

function renderWeekendBlok(activiteit: NieuwsbriefActiviteitBlok): string {
  const bezoek = activiteit.isExpositie
    ? ' Te bezoeken op zaterdag en zondag, van 11.00 tot 17.00 uur.'
    : '';
  const toelichting = activiteit.omschrijving?.trim()
    ? `${activiteit.omschrijving.trim()}${activiteit.omschrijving.trim().endsWith('.') ? '' : '.'}`
    : '';
  const kopRij = activiteit.kop
    ? `
                <div style="color:${BRICK};font-size:12px;letter-spacing:0.1em;text-transform:uppercase;font-weight:bold;margin-bottom:8px;font-family:Arial,sans-serif;">
                  ${escape(activiteit.kop)}
                </div>`
    : '';

  return `
      <tr>
        <td style="padding:20px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${CREAM_DEEP}" style="border-collapse:collapse;background:${CREAM_DEEP};">
            <tr>
              <td style="padding:0;line-height:0;font-size:0;">
                <a href="${escape(activiteit.agendaUrl)}" style="text-decoration:none;">
                  <img src="${escape(activiteit.fotoUrl)}"
                       alt="${escape(activiteit.fotoAlt)}"
                       width="496"
                       style="display:block;width:100%;max-width:496px;height:auto;border:0;" />
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 24px;font-family:Georgia,'Times New Roman',serif;">
                ${kopRij}
                <div style="color:${INK};font-size:20px;line-height:1.35;margin-bottom:8px;">
                  ${escape(activiteit.titel)}
                </div>
                <p style="color:${INK_SOFT};font-size:14px;line-height:1.6;margin:0 0 16px;">
                  ${escape(activiteit.datumTekst)}.${bezoek}${toelichting ? ` ${escape(toelichting)}` : ''}
                </p>
                <a href="${escape(activiteit.agendaUrl)}"
                   style="display:inline-block;background:${BRICK};color:#ffffff;text-decoration:none;padding:10px 20px;font-size:14px;font-family:Georgia,'Times New Roman',serif;">
                  Bekijk in de agenda
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
}

function renderCompactActiviteit(activiteit: NieuwsbriefActiviteitBlok): string {
  const bezoek = activiteit.isExpositie ? ' · za/zo 11.00–17.00' : '';
  return `
      <tr>
        <td style="padding:14px 0;border-top:1px solid ${SAND};font-family:Georgia,'Times New Roman',serif;">
          <div style="color:${INK};font-size:16px;line-height:1.35;margin-bottom:4px;">
            <a href="${escape(activiteit.agendaUrl)}" style="color:${INK};text-decoration:none;">
              ${escape(activiteit.titel)}
            </a>
          </div>
          <div style="color:${INK_SOFT};font-size:14px;line-height:1.5;">
            ${escape(activiteit.datumTekst)}${bezoek}
          </div>
        </td>
      </tr>`;
}

function renderAgendaBlokken(
  activiteiten: NieuwsbriefActiviteitBlok[],
  legeAgendaTekst: string,
): string {
  if (activiteiten.length === 0) {
    return `
      <tr>
        <td style="padding:20px 32px 0;font-family:Georgia,'Times New Roman',serif;">
          <p style="color:${INK_SOFT};font-size:15px;line-height:1.6;margin:0;">
            ${escape(legeAgendaTekst)}
          </p>
        </td>
      </tr>`;
  }

  if (activiteiten.length === 1) {
    return renderWeekendBlok(activiteiten[0]);
  }

  const [eerste, ...rest] = activiteiten;
  return `
      ${renderWeekendBlok(eerste)}
      <tr>
        <td style="padding:8px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${rest.map(renderCompactActiviteit).join('')}
          </table>
        </td>
      </tr>`;
}

export function bouwNieuwsbriefHtml(
  content: NieuwsbriefInhoud | null,
  activiteiten: NieuwsbriefActiviteitBlok[],
  uitschrijfUrl: string,
  meta: NieuwsbriefMailMeta,
): string {
  const preview = escape(preheader(content, activiteiten));
  const activiteitenMetKop = meta.agendaKop && activiteiten.length > 0
    ? activiteiten.map((blok, index) =>
        index === 0 ? { ...blok, kop: meta.agendaKop! } : blok,
      )
    : activiteiten;

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
  <title>${escape(meta.onderwerp)}</title>
  <style>
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; }
  </style>
</head>
<body style="margin:0;padding:0;background:${CREAM};font-family:Georgia,'Times New Roman',serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preview}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;border-collapse:collapse;background:#ffffff;">
          <tr>
            <td style="padding:0;line-height:0;font-size:0;">
              <img src="${SFEER_URL}"
                   alt="Het kerkje van Persingen in de Ooijpolder"
                   width="560"
                   style="display:block;width:100%;max-width:560px;height:auto;border:0;" />
            </td>
          </tr>
          <tr>
            <td style="background:${PINE};padding:16px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                  <td width="52" valign="middle" style="width:52px;padding:0;">
                    <img src="${LOGO_URL}" width="48" height="49" alt="Zegel van het Kerkje van Persingen, opgericht 1350" style="display:block;border:0;" />
                  </td>
                  <td valign="middle" style="padding:0 0 0 14px;font-family:Georgia,'Times New Roman',serif;">
                    <div style="color:${CREAM};font-size:22px;line-height:1.25;font-weight:bold;">
                      ${escape(NIEUWSBRIEF_KOP)}
                    </div>
                    <div style="color:${CREAM};font-size:15px;line-height:1.4;margin-top:4px;font-style:italic;">
                      ${escape(NIEUWSBRIEF_ONDERTITEL)}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;font-family:Georgia,'Times New Roman',serif;">
              <p style="color:${INK};font-size:16px;line-height:1.6;margin:0;">
                Beste vriend van het kerkje,
              </p>
              <p style="color:${INK_SOFT};font-size:15px;line-height:1.6;margin:12px 0 0;">
                ${escape(NIEUWSBRIEF_INTRO)}
              </p>
            </td>
          </tr>
          ${renderAgendaBlokken(activiteitenMetKop, meta.legeAgendaTekst)}
          ${renderExtraBlokken(content?.extraBlokken)}
          <tr>
            <td style="padding:28px 32px 36px;font-family:Georgia,'Times New Roman',serif;">
              <p style="color:${INK};font-size:16px;line-height:1.6;margin:0;">
                ${escape(NIEUWSBRIEF_AFSLUITING)}
              </p>
              <p style="color:${INK};font-size:16px;line-height:1.6;margin:16px 0 0;">
                ${escape(NIEUWSBRIEF_GROET)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0;line-height:0;font-size:0;">
              <img src="${FOOTER_LANDSCHAP_URL}"
                   alt="Het kerkje van Persingen in het landschap van de Ooijpolder"
                   width="560"
                   style="display:block;width:100%;max-width:560px;height:auto;border:0;" />
            </td>
          </tr>
          <tr>
            <td style="background:${PINE};padding:18px 24px;font-family:Georgia,'Times New Roman',serif;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                  <td width="44" valign="middle" style="width:44px;padding:0;">
                    <img src="${LOGO_URL}" width="40" height="41" alt="" style="display:block;border:0;" />
                  </td>
                  <td valign="middle" style="padding:0 0 0 12px;">
                    <div style="color:${CREAM};font-size:16px;line-height:1.35;font-weight:bold;">
                      Stichting Het Kerkje van Persingen
                    </div>
                    <div style="color:${CREAM};font-size:14px;line-height:1.5;margin-top:4px;font-family:Arial,sans-serif;">
                      <a href="${SITE}/contact/" style="color:${CREAM};text-decoration:none;">Persingensestraat 7, 6575 JA Persingen</a><br />
                      <a href="${SITE}/contact/" style="color:${CREAM};text-decoration:none;">06 52 66 84 49</a>
                    </div>
                  </td>
                </tr>
              </table>
              <p style="color:${CREAM};font-size:12px;line-height:1.6;margin:14px 0 0;font-family:Arial,sans-serif;">
                Mail voor vrienden van het kerkje.
              </p>
              <p style="color:${CREAM};font-size:12px;line-height:1.6;margin:8px 0 0;font-family:Arial,sans-serif;">
                ${voettekstLink(`${SITE}/`, 'Website')}
                &nbsp;·&nbsp;
                ${voettekstLink(`${SITE}/agenda/`, 'Agenda')}
                &nbsp;·&nbsp;
                ${voettekstLink(`${SITE}/contact/`, 'Contact')}
                &nbsp;·&nbsp;
                ${voettekstLink(uitschrijfUrl, 'Voorkeuren')}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function bouwNieuwsbriefTekst(
  content: NieuwsbriefInhoud | null,
  activiteiten: NieuwsbriefActiviteitBlok[],
  uitschrijfUrl: string,
  meta: NieuwsbriefMailMeta,
): string {
  const regels = [
    NIEUWSBRIEF_KOP,
    NIEUWSBRIEF_ONDERTITEL,
    '',
    'Beste vriend van het kerkje,',
    '',
    NIEUWSBRIEF_INTRO,
    '',
  ];
  if (activiteiten.length === 0) {
    regels.push(meta.legeAgendaTekst, '');
  } else {
    for (const blok of activiteiten) {
      regels.push(blok.kop, blok.titel, blok.datumTekst);
      if (blok.omschrijving?.trim()) regels.push(blok.omschrijving.trim());
      regels.push(blok.agendaUrl, '');
    }
  }
  for (const blok of content?.extraBlokken ?? []) {
    regels.push(blok.titel, blok.tekst, '');
  }
  regels.push(
    NIEUWSBRIEF_AFSLUITING,
    '',
    NIEUWSBRIEF_GROET,
    '',
    'Voorkeuren of afmelden:',
    uitschrijfUrl,
    '',
    'Stichting Het Kerkje van Persingen',
    'Persingensestraat 7, 6575 JA Persingen',
    `${SITE}/`,
  );
  return regels.join('\n');
}

/** HTML, tekst en expliciet Reply-To. Verstuurt niets. */
export function nieuwsbriefEnvelop(
  content: NieuwsbriefInhoud | null,
  activiteiten: NieuwsbriefActiviteitBlok[],
  uitschrijfUrl: string,
  meta: NieuwsbriefMailMeta,
): { html: string; text: string; replyTo: string; subject: string } {
  const link = uitschrijfUrl.trim();
  if (!link.includes('token=')) {
    throw new Error('Nieuwsbrief mist de afmeldlink.');
  }
  return {
    html: bouwNieuwsbriefHtml(content, activiteiten, link, meta),
    text: bouwNieuwsbriefTekst(content, activiteiten, link, meta),
    replyTo: NIEUWSBRIEF_REPLY_TO,
    subject: meta.onderwerp,
  };
}
