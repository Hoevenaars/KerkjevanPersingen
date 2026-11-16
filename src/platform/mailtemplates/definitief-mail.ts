/**
 * Opmaak van alleen de mail "reservering definitief".
 * Andere templates blijven de gewone Kerkje-kaart gebruiken.
 */

import { KERKJE_LOGO_URL } from '../../lib/kerkje-mail.ts';
import type { MailTemplateInhoud, MailVariabelenMap } from './types.ts';

const SITE = 'https://kerkjepersingen.nl';
const PINE = '#4A5235';
const CREAM = '#FAF8F3';
const BLOK = '#F4F0E6';
const INK = '#1A1A1A';
const SOFT = '#4A4A44';

const DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'] as const;
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'] as const;

const INTRO = 'Wat fijn dat we u binnenkort mogen verwelkomen in het Kerkje van Persingen!\n\nUw reservering is inmiddels definitief. Daarmee staat alles vast voor uw activiteit.';
const VERVOLG = 'Voorlopig hoeft u vanuit ons niets te regelen. Naarmate uw activiteit dichterbij komt, nemen wij vanzelf contact met u op.\n\nWe bespreken dan de praktische zaken en vragen, indien nodig, informatie op voor onze website en communicatie. Kort voor uw komst stemmen we de laatste details met u af.\n\nHeeft u in de tussentijd vragen of wilt u iets met ons bespreken? Neem dan gerust contact met ons op.';
const SLOT = 'Wij wensen u alvast veel plezier met de voorbereidingen en kijken uit naar uw komst!';

export interface Kalenderdag {
  ymd: string;
  weekdag: string;
  dag: number;
  maand: string;
  jaar: number;
}

export function kalenderdag(waarde: string): Kalenderdag | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(waarde.trim());
  if (!match) return null;
  const jaar = Number(match[1]);
  const maand = Number(match[2]);
  const dag = Number(match[3]);
  if (maand < 1 || maand > 12 || dag < 1 || dag > 31) return null;
  const utc = new Date(Date.UTC(jaar, maand - 1, dag, 12));
  if (utc.getUTCFullYear() !== jaar || utc.getUTCMonth() !== maand - 1 || utc.getUTCDate() !== dag) return null;
  return { ymd: waarde.trim(), weekdag: DAGEN[utc.getUTCDay()], dag, maand: MAANDEN[maand - 1], jaar };
}

/** Eén Nederlandse datum, of een periode met t/m. Gelijke dagen blijven één datum. */
export function datumzin(van: string, tot = ''): string {
  const start = kalenderdag(van);
  const eind = kalenderdag(tot || van);
  if (!start) return van.trim();
  if (!eind || start.ymd === eind.ymd) return `${start.weekdag} ${start.dag} ${start.maand} ${start.jaar}`;
  if (start.maand === eind.maand && start.jaar === eind.jaar) {
    return `${start.weekdag} ${start.dag} t/m ${eind.weekdag} ${eind.dag} ${start.maand} ${start.jaar}`;
  }
  return `${start.weekdag} ${start.dag} ${start.maand} ${start.jaar} t/m ${eind.weekdag} ${eind.dag} ${eind.maand} ${eind.jaar}`;
}

function klok(waarde: string): string {
  const match = /^(\d{1,2})[:.](\d{2})$/.exec(waarde.trim());
  if (!match) return waarde.trim();
  return `${match[1].padStart(2, '0')}.${match[2]}`;
}

/** Begintijd en eindtijd, of één tijd als ze gelijk zijn. Leeg als er geen tijd is. */
export function tijdzin(tijd: string, van = '', tot = ''): string {
  const links = klok(van);
  const rechts = klok(tot);
  if (links && rechts && links !== rechts) return `${links} – ${rechts} uur`;
  if (links) return `${links} uur`;
  const bron = tijd.replace(/\s*uur\s*/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!bron || /gehele dag/i.test(bron)) return '';
  const delen = bron.split(/\s*(?:tot|–|—|-)\s*/).map((deel) => klok(deel)).filter(Boolean);
  if (delen.length >= 2 && delen[0] !== delen[1]) return `${delen[0]} – ${delen[1]} uur`;
  if (delen.length === 1) return `${delen[0]} uur`;
  return '';
}

/** Vult periode en activiteit aan vanuit de boeking. Lege tijden blijven leeg. */
export function metReservering(
  vars: MailVariabelenMap,
  bron: { start?: string; eind?: string; titel?: string; soort?: string; tijdVan?: string; tijdTot?: string; heleDag?: boolean },
): MailVariabelenMap {
  const start = bron.start || vars.datum || '';
  const eind = bron.eind || start;
  return {
    ...vars,
    activiteitstype: bron.soort || vars.activiteitstype,
    activiteitnaam: bron.titel || vars.activiteitnaam,
    activiteit: bron.titel || vars.activiteit,
    datum: vars.datum || start,
    datum_van: start,
    datum_tot: eind,
    tijd_van: bron.heleDag ? '' : (bron.tijdVan ?? vars.tijd_van ?? ''),
    tijd_tot: bron.heleDag ? '' : (bron.tijdTot ?? vars.tijd_tot ?? ''),
    tijd: bron.heleDag ? '' : (vars.tijd ?? ''),
  };
}

export function activiteitUit(vars: MailVariabelenMap): string {
  const titel = (vars.activiteit || vars.activiteitnaam || '').trim();
  const soort = (vars.activiteitstype || '').trim();
  if (titel && titel.toLowerCase() !== soort.toLowerCase()) return titel;
  if (!soort) return titel;
  return soort.charAt(0).toUpperCase() + soort.slice(1);
}

function alinea(tekst: string): string[] {
  return tekst.split(/\n{2,}/).map((deel) => deel.trim()).filter(Boolean);
}

function verouderdeBrief(tekst: string): boolean {
  return /Voorbereiding:|Bekijk uw reservering|U hoeft op dit moment niets te doen|Activiteit:\s*\{\{/.test(tekst);
}

function briefUitTemplate(inhoud: MailTemplateInhoud): { intro: string[]; vervolg: string[]; slot: string } {
  const introductie = inhoud.introductie.trim();
  const hoofd = inhoud.hoofdtekst.trim();
  const slot = inhoud.slottekst.trim();
  if (!introductie || verouderdeBrief(`${introductie}\n${hoofd}`)) {
    return { intro: alinea(INTRO), vervolg: alinea(VERVOLG), slot: SLOT };
  }
  return { intro: alinea(introductie), vervolg: alinea(hoofd || VERVOLG), slot: slot || SLOT };
}

function esc(waarde: string): string {
  return waarde.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function vervang(tekst: string, vars: MailVariabelenMap): string {
  return tekst.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key as keyof MailVariabelenMap] ?? '');
}

function veld(label: string, waarde: string, laatste: boolean): string {
  return `<p style="margin:0 0 ${laatste ? '0' : '10px'};font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.45;color:${INK};"><span style="color:${PINE};">${esc(label)}</span><br />${esc(waarde)}</p>`;
}

export function definitiefMail(
  inhoud: MailTemplateInhoud,
  vars: MailVariabelenMap,
): { html: string; text: string } {
  const voornaam = (vars.voornaam || '').trim();
  const activiteit = activiteitUit(vars);
  const datum = datumzin(vars.datum_van || vars.datum || '', vars.datum_tot || '');
  const tijd = tijdzin(vars.tijd || '', vars.tijd_van || '', vars.tijd_tot || '');
  const regels = [
    activiteit ? { label: 'Activiteit', waarde: activiteit } : null,
    datum ? { label: 'Datum', waarde: datum } : null,
    tijd ? { label: 'Tijd', waarde: tijd } : null,
  ].filter((regel): regel is { label: string; waarde: string } => Boolean(regel));
  const brief = briefUitTemplate(inhoud);
  const intro = brief.intro.map((deel) => vervang(deel, { ...vars, voornaam }));
  const vervolg = brief.vervolg.map((deel) => vervang(deel, vars));
  const slot = vervang(brief.slot, vars);
  const titel = 'Uw reservering is definitief';

  const tekst = [
    titel,
    '',
    voornaam ? `Beste ${voornaam},` : 'Beste,',
    '',
    ...intro.flatMap((deel) => [deel, '']),
    'Uw reservering',
    '',
    ...regels.map((regel) => `${regel.label}: ${regel.waarde}`),
    '',
    'En nu?',
    '',
    ...vervolg.flatMap((deel) => [deel, '']),
    slot,
    '',
    'Met vriendelijke groet,',
    'Stichting Het Kerkje van Persingen',
    '',
    'Persingensestraat 7, 6575 JA Persingen',
    '06 52 66 84 49',
    'www.kerkjepersingen.nl',
  ].join('\n').replace(/\n{3,}/g, '\n\n');

  const paragrafen = (delen: string[]) => delen
    .map((deel) => `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${SOFT};">${esc(deel)}</p>`)
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${esc(titel)}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
  <table role="presentation" data-kerkje-definitief="1" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:${CREAM};">
    <tr>
      <td align="center" style="padding:16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-collapse:collapse;">
          <tr>
            <td style="padding:4px 8px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                  <td width="36" valign="middle" style="width:36px;padding:0;line-height:0;">
                    <img src="${KERKJE_LOGO_URL}" width="36" height="37" alt="" style="display:block;border:0;width:36px;height:auto;" />
                  </td>
                  <td valign="middle" style="padding:0 0 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.3;color:${PINE};">
                    Kerkje van Persingen
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:4px 8px 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.3;color:${PINE};text-align:left;">
              ${esc(titel)}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${INK};text-align:left;">
              <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${INK};">Beste${voornaam ? ` ${esc(voornaam)}` : ''},</p>
              ${paragrafen(intro)}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BLOK}" style="width:100%;background:${BLOK};border-collapse:collapse;margin:0 0 8px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4;color:${PINE};">Uw reservering</p>
                    ${regels.map((regel, index) => veld(regel.label, regel.waarde, index === regels.length - 1)).join('\n')}
                  </td>
                </tr>
              </table>
              <p style="margin:20px 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.4;color:${PINE};">En nu?</p>
              ${paragrafen(vervolg)}
              <p style="margin:4px 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${SOFT};">${esc(slot)}</p>
              <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:${SOFT};">Met vriendelijke groet,<br /><span style="color:${INK};">Stichting Het Kerkje van Persingen</span></p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 8px 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${SOFT};text-align:left;">
              Persingensestraat 7, 6575 JA Persingen<br />
              06 52 66 84 49<br />
              <a href="${SITE}/" style="color:${PINE};text-decoration:none;">www.kerkjepersingen.nl</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { html, text: tekst };
}
