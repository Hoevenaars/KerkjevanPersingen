import { SOORTEN, type Aanvraag, type Fouten } from './validatie.ts';
import { kerkjeMail } from './kerkje-mail.ts';

/**
 * Verzending van een verhuuraanvraag.
 *
 * Validatie staat in `validatie.ts`. De visuele omlijsting staat in `kerkje-mail.ts`.
 */

const INK_SOFT = '#4A4A44';

export * from './validatie.ts';

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

export function bestuurMail(a: Aanvraag): { html: string; text: string } {
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

  const tabel = `
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
  const tekst = [
    `Soort: ${soort}`,
    `Datum: ${datumBereik(a)}`,
    a.personen ? `Personen: ${a.personen}` : '',
    `Naam: ${a.naam}`,
    `Adres: ${a.adres}`,
    `Telefoon: ${a.telefoon || '—'}`,
    `E-mail: ${a.email}`,
    a.website ? `Website: ${a.website}` : '',
    a.eerderGeexposeerd ? `Eerder geëxposeerd: ${a.eerderGeexposeerd === 'ja' ? 'Ja' : 'Nee'}` : '',
    a.medeExposanten ? `Mede-exposanten: ${a.medeExposanten}` : '',
    isExpositie ? `Akkoord voorwaarden: ${a.akkoordVoorwaarden === 'ja' ? 'Ja' : 'Nee'}` : '',
    a.toelichting ? `Opmerkingen: ${a.toelichting}` : '',
    'Beantwoorden gaat rechtstreeks naar de aanvrager.',
  ].filter(Boolean).join('\n');

  return kerkjeMail({
    titel: 'Huuraanvraag',
    hoofdtekst: tekst,
    extraBlok: tabel,
  });
}

export function bestuurMailTekst(a: Aanvraag): string {
  return bestuurMail(a).html;
}

export interface Uitkomst {
  ok: boolean;
  fouten?: Fouten;
}

export async function verstuurAanvraag(a: Aanvraag): Promise<Uitkomst> {
  const { bewaarTestAanvraag } = await import('./aanvraag-test.ts');
  return bewaarTestAanvraag(a, false);
}
