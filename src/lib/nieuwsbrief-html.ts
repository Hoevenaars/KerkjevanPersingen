/**
 * HTML van de vriendenmail. Geen Resend of Sanity hier, zodat de opmaak
 * zonder netwerk te testen is. Afbeeldingen zijn absolute URL's: e-mail
 * kan relatieve paden niet tonen.
 */

const SITE = 'https://kerkjepersingen.nl';
export const LOGO_URL = `${SITE}/logo-klein.png`;
export const SFEER_URL = `${SITE}/foto/verhuur-ruimte.jpg`;
export const FOOTER_LANDSCHAP_URL = `${SITE}/foto/footer-landschap.jpg`;

const PINE = '#4A5235';
const BRICK = '#9C4A2F';
const CREAM = '#FAF8F3';
const CREAM_DEEP = '#F1EBDD';
const SAND = '#D9CFBC';
const INK = '#1A1A1A';
const INK_SOFT = '#4A4A44';

export type NieuwsbriefInhoud = {
  kortNieuws?: string;
  donatieUpdate?: string;
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

function preheader(content: NieuwsbriefInhoud | null, activiteit: NieuwsbriefActiviteitBlok | null): string {
  const nieuws = content?.kortNieuws?.trim();
  if (nieuws) return nieuws.length > 90 ? `${nieuws.slice(0, 87).trimEnd()}…` : nieuws;
  if (activiteit) return `${activiteit.kop}: ${activiteit.titel}`;
  return 'Wat er dit weekend te doen is in het kerkje van Persingen.';
}

function renderKortNieuws(tekst?: string): string {
  if (!tekst?.trim()) return '';
  return `
      <tr>
        <td style="padding:28px 32px 0;font-family:Georgia,'Times New Roman',serif;">
          <div style="color:${BRICK};font-size:12px;letter-spacing:0.1em;text-transform:uppercase;font-weight:bold;margin-bottom:8px;font-family:Arial,sans-serif;">
            Kort nieuws
          </div>
          <p style="color:${INK};font-size:15px;line-height:1.6;margin:0;">
            ${metRegels(tekst)}
          </p>
        </td>
      </tr>`;
}

function renderDonatieUpdate(tekst?: string): string {
  if (!tekst?.trim()) return '';
  return `
      <tr>
        <td style="padding:20px 32px 0;font-family:Georgia,'Times New Roman',serif;">
          <div style="border-left:3px solid ${PINE};padding-left:16px;">
            <div style="color:${PINE};font-size:12px;letter-spacing:0.1em;text-transform:uppercase;font-weight:bold;margin-bottom:6px;font-family:Arial,sans-serif;">
              Dankzij jullie steun
            </div>
            <p style="color:${INK};font-size:15px;line-height:1.6;margin:0;">
              ${metRegels(tekst)}
            </p>
          </div>
        </td>
      </tr>`;
}

function renderWeekendBlok(activiteit: NieuwsbriefActiviteitBlok | null): string {
  if (!activiteit) {
    return `
      <tr>
        <td style="padding:20px 32px 0;font-family:Georgia,'Times New Roman',serif;">
          <p style="color:${INK_SOFT};font-size:15px;line-height:1.6;margin:0;">
            Er is deze week geen activiteit gepland. Bekijk de volledige agenda voor komende data.
          </p>
        </td>
      </tr>`;
  }

  const bezoek = activiteit.isExpositie
    ? ' Te bezoeken op zaterdag en zondag, van 11.00 tot 17.00 uur.'
    : '';
  const toelichting = activiteit.omschrijving?.trim()
    ? `${activiteit.omschrijving.trim()}${activiteit.omschrijving.trim().endsWith('.') ? '' : '.'}`
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
                <div style="color:${BRICK};font-size:12px;letter-spacing:0.1em;text-transform:uppercase;font-weight:bold;margin-bottom:8px;font-family:Arial,sans-serif;">
                  ${escape(activiteit.kop)}
                </div>
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

export function bouwNieuwsbriefHtml(
  content: NieuwsbriefInhoud | null,
  activiteit: NieuwsbriefActiviteitBlok | null,
  uitschrijfUrl: string,
): string {
  const preview = escape(preheader(content, activiteit));

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Deze week in Persingen</title>
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
            <td style="background:${PINE};padding:28px 32px 24px;text-align:center;">
              <img src="${LOGO_URL}" width="72" height="73" alt="Zegel van het Kerkje van Persingen, opgericht 1350" style="display:block;margin:0 auto 14px;border:0;" />
              <div style="color:${SAND};font-size:12px;letter-spacing:0.14em;text-transform:uppercase;font-family:Arial,sans-serif;">
                Vrienden van het kerkje
              </div>
              <div style="color:${CREAM};font-size:24px;line-height:1.3;margin-top:8px;font-family:Georgia,'Times New Roman',serif;">
                Deze week in Persingen
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;font-family:Georgia,'Times New Roman',serif;">
              <p style="color:${INK};font-size:16px;line-height:1.6;margin:0;">
                Beste vriend van het kerkje,
              </p>
              <p style="color:${INK_SOFT};font-size:15px;line-height:1.6;margin:12px 0 0;">
                Elke week een kort bericht: wat er dit weekend te doen is, en waar we mee bezig zijn dankzij de steun van mensen zoals jij.
              </p>
            </td>
          </tr>
          ${renderWeekendBlok(activiteit)}
          ${renderKortNieuws(content?.kortNieuws)}
          ${renderDonatieUpdate(content?.donatieUpdate)}
          <tr>
            <td style="padding:28px 32px 28px;text-align:center;">
              <a href="${SITE}/steun-ons/"
                 style="display:inline-block;border:1.5px solid ${PINE};color:${PINE};text-decoration:none;padding:10px 24px;font-size:14px;font-family:Georgia,'Times New Roman',serif;">
                Steun het kerkje
              </a>
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
            <td style="background:${PINE};padding:24px 32px;text-align:center;font-family:Arial,sans-serif;">
              <img src="${LOGO_URL}" width="28" height="28" alt="" style="display:block;margin:0 auto 12px;border:0;" />
              <p style="color:${CREAM};font-size:13px;line-height:1.6;margin:0 0 10px;">
                Stichting Het Kerkje van Persingen<br />
                Persingensestraat 7, 6575 JA Persingen<br />
                <a href="tel:+31652668449" style="color:${SAND};text-decoration:none;">06 52 66 84 49</a>
              </p>
              <p style="color:${SAND};font-size:12px;line-height:1.6;margin:0;">
                Je ontvangt deze mail omdat je je hebt aangemeld als vriend van het kerkje.<br />
                <a href="${escape(uitschrijfUrl)}" style="color:${SAND};">Uitschrijven</a>
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
