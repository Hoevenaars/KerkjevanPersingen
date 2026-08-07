import { Resend } from 'resend';
import { getOntvangstAdres, getExtraOntvangstAdres } from './sanity';
import { SOORTEN, type Aanvraag, type Fouten } from './validatie';

/**
 * Verzending van een verhuuraanvraag.
 *
 * Validatie staat in `validatie.ts` en is daar zonder afhankelijkheden te testen.
 * Deze module doet alleen het werk dat de buitenwereld raakt: ontvangstadres ophalen
 * en twee mails versturen.
 */

const VAN = 'Het Kerkje van Persingen <noreply@send.kerkjepersingen.nl>';
const TELEFOON = '06 52 66 84 49';

// E-mail kan geen relatieve paden tonen — het logo moet een volledige,
// publieke URL zijn. Zelfde bestand als het zegel op de site (Footer.astro).
const LOGO_URL = 'https://kerkjepersingen.nl/logo-klein.png';

const PINE = '#4A5235';
const BRICK = '#9C4A2F';
const CREAM = '#FAF8F3';
const CREAM_DEEP = '#F1EBDD';
const INK = '#1A1A1A';
const INK_SOFT = '#4A4A44';

export * from './validatie';

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function langeDatum(iso: string): string {
  return new Date(iso).toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Amsterdam',
  });
}

function datumBereik(a: Aanvraag): string {
  if (!a.datumTot || a.datumTot === a.datum) return langeDatum(a.datum);
  return `${langeDatum(a.datum)} t/m ${langeDatum(a.datumTot)}`;
}

/** Gedeelde omlijsting. `metLogo` toont het zegel gecentreerd boven de inhoud —
 *  alleen voor de bevestigingsmail aan de aanvrager, niet voor de zakelijke
 *  bestuursmail. */
function mailOmlijsting(titel: string, inhoud: string, metLogo = false): string {
  return `
    <div style="background:${CREAM};padding:32px 16px;font-family:Georgia,'Times New Roman',serif;">
      <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;border-collapse:collapse;background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background:${PINE};padding:28px 32px;text-align:${metLogo ? 'center' : 'left'};">
            ${metLogo ? `<img src="${LOGO_URL}" width="64" height="65" alt="" style="display:block;margin:0 auto 14px;border-radius:50%;" />` : ''}
            <div style="color:${CREAM};font-size:13px;letter-spacing:0.08em;text-transform:uppercase;font-family:Arial,sans-serif;">
              Kerkje van Persingen
            </div>
            <div style="color:#ffffff;font-size:22px;font-weight:normal;margin-top:6px;">
              ${titel}
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;font-family:Arial,sans-serif;color:${INK};font-size:15px;line-height:1.6;">
            ${inhoud}
          </td>
        </tr>
        <tr>
          <td style="background:${CREAM_DEEP};padding:20px 32px;font-family:Arial,sans-serif;color:${INK_SOFT};font-size:13px;line-height:1.5;">
            Stichting Het Kerkje van Persingen<br>
            Persingensestraat 7, 6575 JA Persingen<br>
            ${TELEFOON}
          </td>
        </tr>
      </table>
    </div>`;
}

function bestuurMail(a: Aanvraag): string {
  const soort = SOORTEN.find((s) => s.waarde === a.soort)?.label ?? a.soort;
  const isExpositie = a.soort === 'expositie';

  const rij = (label: string, waarde: string) =>
    `<tr><td style="padding:6px 16px 6px 0;color:${INK_SOFT};white-space:nowrap;"><strong>${label}</strong></td><td style="padding:6px 0;">${waarde}</td></tr>`;

  const expositieRegels = isExpositie
    ? `
        ${a.website ? rij('Website', escape(a.website)) : ''}
        ${a.eerderGeexposeerd ? rij('Eerder geëxposeerd', a.eerderGeexposeerd === 'ja' ? 'Ja' : 'Nee') : ''}
        ${a.medeExposanten ? rij('Mede-exposanten', escape(a.medeExposanten)) : ''}
        ${rij('Akkoord voorwaarden', a.akkoordVoorwaarden === 'ja' ? 'Ja' : 'Nee')}
      `
    : '';

 const inhoud = `
    <table role="presentation" style="border-collapse:collapse;width:100%;">
      ${rij('Soort', escape(soort))}
      ${rij('Datum', escape(datumBereik(a)))}
      ${a.personen ? rij('Personen', escape(a.personen)) : ''}
      ${rij('Naam', escape(a.naam))}
      ${rij('Adres', escape(a.adres))}
      ${rij('Telefoon', escape(a.telefoon) || '—')}
      ${rij('E-mail', escape(a.email))}
      ${expositieRegels}
    </table>
    ${a.toelichting ? `<p style="margin-top:20px;"><strong>Opmerkingen</strong><br>${escape(a.toelichting).replace(/\n/g, '<br>')}</p>` : ''}
    <p style="margin-top:24px;color:${INK_SOFT};font-size:13px;">Beantwoorden gaat rechtstreeks naar de aanvrager.</p>
  `;

  return mailOmlijsting('Huuraanvraag', inhoud);
}

function bevestigingMail(a: Aanvraag): string {
  const soort = SOORTEN.find((s) => s.waarde === a.soort)?.label ?? a.soort;

  const inhoud = `
    <p>Beste ${escape(a.naam)},</p>
    <p>We hebben uw aanvraag ontvangen voor de ${escape(soort.toLowerCase())} op
    <strong>${escape(datumBereik(a))}</strong>.</p>
    <p>We nemen uw aanvraag in behandeling.</p>
    <p style="margin-top:28px;">
      Met vriendelijke groet,<br>
      <span style="color:${BRICK};font-weight:bold;">Bestuur "Het Kerkje van Persingen"</span>
    </p>
  `;

  return mailOmlijsting('Aanvraag ontvangen', inhoud, true);
}

export interface Uitkomst {
  ok: boolean;
  fouten?: Fouten;
}

export async function verstuurAanvraag(a: Aanvraag): Promise<Uitkomst> {
  const storing = {
    ok: false,
    fouten: {
      algemeen: `Verzenden lukt nu niet. Bel ${TELEFOON}, dan pakken we het direct op.`,
    },
  };

  const apiKey = process.env.RESEND_API_KEY ?? import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[aanvraag] RESEND_API_KEY ontbreekt — aanvraag niet verstuurd', {
      naam: a.naam,
      datum: a.datum,
    });
    return storing;
  }

  const naar = await getOntvangstAdres();
  if (!naar) {
    console.error('[aanvraag] geen ontvangstadres beschikbaar, ook geen fallback');
    return storing;
  }

  const resend = new Resend(apiKey);
  const bcc = process.env.CONTACT_BCC_EMAIL ?? import.meta.env.CONTACT_BCC_EMAIL;
  const extra = await getExtraOntvangstAdres();
  const soort = SOORTEN.find((s) => s.waarde === a.soort)?.label ?? a.soort;

  try {
    const { error } = await resend.emails.send({
      from: VAN,
      to: extra ? [naar, extra] : [naar],
      bcc: bcc ? [bcc] : undefined,
      replyTo: a.email,
      subject: `Huuraanvraag ${soort} — ${datumBereik(a)}`,
      html: bestuurMail(a),
    });

    if (error) {
      console.error('[aanvraag] Resend gaf een fout', error);
      return storing;
    }
  } catch (e) {
    console.error('[aanvraag] verzenden naar bestuur mislukt', e);
    return storing;
  }

  try {
    await resend.emails.send({
      from: VAN,
      to: [a.email],
      subject: 'Je aanvraag voor het Kerkje van Persingen',
      html: bevestigingMail(a),
    });
  } catch (e) {
    console.error('[aanvraag] bevestigingsmail mislukt, aanvraag zelf is wel verstuurd', e);
  }

  return { ok: true };
}
