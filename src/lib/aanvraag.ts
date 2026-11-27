import { SOORTEN, type Aanvraag, type Fouten } from './validatie.ts';
import { kerkjeMail } from './kerkje-mail.ts';
import { toonMedeExposanten } from '../platform/mede-exposanten.ts';
import type { VerhuurBeoordeling } from '../platform/verhuur-beoordeling.ts';

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

export interface BestuursMailOpties {
  beoordeling?: VerhuurBeoordeling;
  jaUrl?: string;
  neeUrl?: string;
}

function beslisUrl(waarde: string | undefined): string | null {
  if (!waarde) return null;
  try {
    const url = new URL(waarde);
    const lokaal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && lokaal)) || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function beoordelingsBlokken(beoordeling?: VerhuurBeoordeling): { html: string; text: string } {
  if (!beoordeling) return { html: '', text: '' };
  const stukken: { titel: string; tekst: string; waarschuwing?: boolean }[] = [];
  const bedrag = (cent: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cent / 100);
  const prijs = beoordeling.prijs;
  if (prijs.vastgesteld && prijs.bedragCent != null) {
    stukken.push({ titel: 'Huurprijs', tekst: `${bedrag(prijs.bedragCent)}. ${prijs.reden}` });
  } else {
    const indicatie = prijs.indicatieCent != null
      ? `Indicatie${prijs.prijstype === 'vanaf' ? ' vanaf' : ''}: ${bedrag(prijs.indicatieCent)}. Dit is geen definitieve huurprijs.\n`
      : '';
    stukken.push({ titel: 'Let op: huurprijs nog vaststellen', tekst: `${indicatie}${prijs.reden}\nBij Ja moet de definitieve huurprijs op de bevestigingspagina worden vastgelegd voordat de contractmachine kan starten.`, waarschuwing: true });
  }
  if (beoordeling.conflicts.length === 0 && beoordeling.beschikbaarheid === 'beschikbaar') {
    stukken.push({ titel: 'Beschikbaarheid', tekst: 'Bij deze controle is geen overlappende aanvraag, boeking of blokkade gevonden. Bij het bevestigen wordt dit opnieuw gecontroleerd.' });
  }
  for (const conflict of beoordeling.conflicts) {
    stukken.push({
      titel: conflict.type === 'aanvraag' ? 'Let op: er loopt al een aanvraag voor deze periode' : 'Let op: de periode is al gereserveerd of geblokkeerd',
      tekst: [
        `${conflict.type === 'aanvraag' ? 'Aanvraag' : 'Dossier'} ${conflict.id}: ${conflict.naam}`,
        `Periode: ${conflict.start} tot ${conflict.eind}. Status: ${conflict.status}.`,
        conflict.binnengekomenOp ? `Ontvangen: ${conflict.binnengekomenOp}.` : '',
        conflict.melding,
        'Een Ja legt het inhoudelijke akkoord vast. De periode wordt pas toegewezen nadat het conflict is opgelost; een bestaande reservering wordt niet overschreven.',
      ].filter(Boolean).join('\n'), waarschuwing: true,
    });
  }
  for (const waarschuwing of beoordeling.historieWaarschuwingen) {
    stukken.push({
      titel: `Let op: ${beoordeling.beleid.maanden}-maandenregeling voor exposanten`,
      tekst: [
        waarschuwing.melding,
        waarschuwing.regulierVanaf ? `Volgens deze termijn regulier weer mogelijk vanaf ${waarschuwing.regulierVanaf}.` : '',
        `Bron: ${waarschuwing.bron}, referentie ${waarschuwing.referentie}.`,
        'Bij Ja bevestigt het bestuur de getoonde beleidswaarschuwing en eventuele afwijking. Dit geeft geen voorrang op een andere reservering.',
      ].filter(Boolean).join('\n'), waarschuwing: true,
    });
  }
  for (const melding of beoordeling.meldingen) {
    stukken.push({ titel: melding.ernst === 'blokkade' ? 'Controle vereist' : 'Let op: controle niet volledig', tekst: melding.tekst, waarschuwing: true });
  }
  return {
    html: stukken.map((stuk) => `<div style="margin:18px 0;padding:14px 16px;border-left:3px solid ${stuk.waarschuwing ? '#A87924' : '#4A5235'};background:${stuk.waarschuwing ? '#FBF4E6' : '#F5F6F0'};"><p style="margin:0 0 7px;"><strong>${escape(stuk.titel)}</strong></p><p style="margin:0;line-height:1.55;">${escape(stuk.tekst).replace(/\n/g, '<br />')}</p></div>`).join('\n'),
    text: stukken.map((stuk) => `${stuk.titel}\n${stuk.tekst}`).join('\n\n'),
  };
}

export function bestuurMail(a: Aanvraag, opties: BestuursMailOpties = {}): { html: string; text: string } {
  const soort = SOORTEN.find((s) => s.waarde === a.soort)?.label ?? a.soort;
  const isExpositie = a.soort === 'expositie';
  const mede = toonMedeExposanten(a.medeExposanten);
  const fotos = (a.fotoNamen ?? []).filter(Boolean);
  const beoordeling = beoordelingsBlokken(opties.beoordeling);
  const jaUrl = beslisUrl(opties.jaUrl);
  const neeUrl = beslisUrl(opties.neeUrl);
  if ((opties.jaUrl || opties.neeUrl) && (!jaUrl || !neeUrl)) {
    throw new Error('De bestuursmail vereist twee geldige beslislinks. Er is geen beslismail opgebouwd.');
  }
  const metBesluit = Boolean(jaUrl && neeUrl);

  const rij = (label: string, waarde: string) =>
    `<tr><td style="padding:6px 16px 6px 0;color:${INK_SOFT};white-space:nowrap;"><strong>${label}</strong></td><td style="padding:6px 0;">${waarde}</td></tr>`;

  const expositieRegels = isExpositie
    ? `
        ${a.website ? rij('Website', escape(a.website)) : ''}
        ${a.eerderGeexposeerd ? rij('Eerder geëxposeerd', a.eerderGeexposeerd === 'ja' ? 'Ja' : 'Nee') : ''}
        ${mede ? rij('Mede-exposanten', escape(mede)) : ''}
        ${fotos.length ? rij('Foto’s van het werk', escape(`${fotos.length} bij de aanvraag in beheer`)) : ''}
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
    ${beoordeling.html}
    ${metBesluit ? '<p style="margin-top:24px;"><strong>Gaan jullie akkoord met deze aanvraag?</strong></p><p>De knop opent een korte bevestigingspagina met de actuele controle. Alleen bevestigen legt het besluit vast.</p>' : ''}
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
    mede ? `Mede-exposanten: ${mede}` : '',
    fotos.length ? `Foto’s van het werk: ${fotos.length} bij de aanvraag in beheer` : '',
    isExpositie ? `Akkoord voorwaarden: ${a.akkoordVoorwaarden === 'ja' ? 'Ja' : 'Nee'}` : '',
    a.toelichting ? `Opmerkingen: ${a.toelichting}` : '',
    beoordeling.text,
    metBesluit ? 'Gaan jullie akkoord met deze aanvraag?\nDe knop opent een korte bevestigingspagina met de actuele controle. Alleen bevestigen legt het besluit vast.' : '',
    'Beantwoorden gaat rechtstreeks naar de aanvrager.',
  ].filter(Boolean).join('\n');

  return kerkjeMail({
    titel: 'Huuraanvraag',
    hoofdtekst: tekst,
    extraBlok: tabel,
    ...(metBesluit ? {
      cta: [
        { label: 'Ja, akkoord', href: jaUrl! },
        { label: 'Nee, afwijzen', href: neeUrl!, secundair: true },
      ],
      secundair: 'Een inhoudelijk akkoord start de verwerking zodra de periode is toegewezen en de afspraken compleet zijn. Bij een conflict blijft de aanvraag in behandeling.',
    } : {}),
  });
}

export function bestuurMailTekst(a: Aanvraag, opties: BestuursMailOpties = {}): string {
  return bestuurMail(a, opties).html;
}

export interface Uitkomst {
  ok: boolean;
  fouten?: Fouten;
}

export async function verstuurAanvraag(a: Aanvraag): Promise<Uitkomst> {
  const { bewaarTestAanvraag } = await import('./aanvraag-test.ts');
  return bewaarTestAanvraag(a, false);
}
