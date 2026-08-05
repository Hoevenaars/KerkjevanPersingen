import { Resend } from 'resend';
import { getOntvangstAdres } from './sanity';
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

function bestuurMail(a: Aanvraag): string {
  const soort = SOORTEN.find((s) => s.waarde === a.soort)?.label ?? a.soort;
  const isExpositie = a.soort === 'expositie';

  const expositieRegels = isExpositie
    ? `
        ${a.website ? `<tr><td style="padding:4px 16px 4px 0"><strong>Website</strong></td><td>${escape(a.website)}</td></tr>` : ''}
        ${a.eerderGeexposeerd ? `<tr><td style="padding:4px 16px 4px 0"><strong>Eerder geëxposeerd</strong></td><td>${a.eerderGeexposeerd === 'ja' ? 'Ja' : 'Nee'}</td></tr>` : ''}
        ${a.medeExposanten ? `<tr><td style="padding:4px 16px 4px 0"><strong>Mede-exposanten</strong></td><td>${escape(a.medeExposanten)}</td></tr>` : ''}
        <tr><td style="padding:4px 16px 4px 0"><strong>Akkoord voorwaarden</strong></td><td>${a.akkoordVoorwaarden === 'ja' ? 'Ja' : 'Nee'}</td></tr>
      `
    : '';

  return `
    <div style="font-family:system-ui,sans-serif;color:#1a1a1a;line-height:1.6">
      <h2 style="font-family:Georgia,serif;margin:0 0 16px">Nieuwe verhuuraanvraag</h2>
      <table style="border-collapse:collapse">
        <tr><td style="padding:4px 16px 4px 0"><strong>Datum</strong></td><td>${escape(datumBereik(a))}</td></tr>
        <tr><td style="padding:4px 16px 4px 0"><strong>Soort</strong></td><td>${escape(soort)}</td></tr>
        ${a.personen ? `<tr><td style="padding:4px 16px 4px 0"><strong>Personen</strong></td><td>${escape(a.personen)}</td></tr>` : ''}
        <tr><td style="padding:4px 16px 4px 0"><strong>Naam</strong></td><td>${escape(a.naam)}</td></tr>
        <tr><td style="padding:4px 16px 4px 0"><strong>E-mail</strong></td><td>${escape(a.email)}</td></tr>
        <tr><td style="padding:4px 16px 4px 0"><strong>Adres</strong></td><td>${escape(a.adres)}</td></tr>
        <tr><td style="padding:4px 16px 4px 0"><strong>Telefoon</strong></td><td>${escape(a.telefoon) || '—'}</td></tr>
        ${expositieRegels}
      </table>
      ${a.toelichting ? `<p style="margin-top:16px"><strong>Toelichting</strong><br>${escape(a.toelichting).replace(/\n/g, '<br>')}</p>` : ''}
      <p style="margin-top:24px;color:#6b6b63;font-size:14px">Beantwoorden gaat rechtstreeks naar de aanvrager.</p>
    </div>`;
}

function bevestigingMail(a: Aanvraag): string {
  return `
    <div style="font-family:system-ui,sans-serif;color:#1a1a1a;line-height:1.6">
      <h2 style="font-family:Georgia,serif;margin:0 0 16px">We hebben je aanvraag ontvangen</h2>
      <p>Beste ${escape(a.naam)},</p>
      <p>Je aanvraag voor ${escape(datumBereik(a))} staat bij ons. Iemand van het bestuur
      kijkt ernaar en neemt contact met je op over wat er mogelijk is en wat het kost.</p>
      <p>Elke bijeenkomst is anders, dus we maken een voorstel op maat in plaats van een
      standaardtarief te sturen.</p>
      <p style="margin-top:24px">Met vriendelijke groet,<br>Stichting Het Kerkje van Persingen</p>
    </div>`;
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
  const soort = SOORTEN.find((s) => s.waarde === a.soort)?.label ?? a.soort;

  try {
    const { error } = await resend.emails.send({
      from: VAN,
      to: [naar],
      bcc: bcc ? [bcc] : undefined,
      replyTo: a.email,
      subject: `Verhuuraanvraag ${soort} — ${datumBereik(a)}`,
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
