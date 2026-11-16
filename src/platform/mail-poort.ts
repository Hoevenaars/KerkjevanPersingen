/**
 * Centrale controle voor automatische mail.
 * Een preview of een ontbrekende gegeven vult geen verzendstatus.
 */

import { automatiseringVoorTemplate, magAutomatiseringUitvoeren, type Automatisering } from './automatisering.ts';
import { communicatieStappen, type CommunicatieContext, type InhoudStatus } from './continuiteit.ts';
import { voegDagenToe } from './datum.ts';
import { onderwerpUitTemplate, plainTekstUitTemplate, renderMailBericht } from './mailtemplates/render.ts';
import type { MailTemplateDef, MailVariabele, MailVariabelenMap } from './mailtemplates/types.ts';
import type { PublicatieTrigger } from './types.ts';

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

const LABEL: Record<string, string> = {
  voornaam: 'Voornaam',
  datum: 'Datum',
  tijd: 'Aanvangstijd',
  toegang_vanaf: 'Toegang vanaf',
  content_lijst: 'Lijst met gevraagde informatie',
  contentdeadline: 'Deadline voor de informatie',
  gastheer_naam: 'Naam van de gastbegeleider',
  klantnaam: 'Naam van de organisator',
  klanttelefoon: 'Telefoon van de organisator',
  activiteitnaam: 'Activiteit',
  activiteitstype: 'Soort activiteit',
  bedrag: 'Bedrag',
  betaaldeadline: 'Betaaldeadline',
  ontbrekende_content: 'Ontbrekende informatie',
};

const OPTIONEEL = new Set<MailVariabele>([
  'tijd',
  'tijd_van',
  'tijd_tot',
  'toegang_vanaf',
  'gastheer_naam',
  'gastheer_telefoon',
  'praktische_kerninformatie',
  'laatste_bijzonderheden',
  'bijzonderheden',
  'aantal_personen',
  'klanttelefoon',
  'feedback',
  'reden_afwijzing',
  'vraag',
  'annulering_toelichting',
]);

const VERPLICHT: Record<string, readonly MailVariabele[]> = {
  booking_content_request: ['voornaam', 'content_lijst', 'contentdeadline'],
  booking_content_reminder: ['voornaam', 'datum', 'contentdeadline'],
  internal_content_overdue: ['activiteitnaam', 'datum', 'ontbrekende_content'],
  booking_practical_information: ['voornaam', 'datum', 'tijd', 'toegang_vanaf'],
  booking_final_instructions: ['datum', 'activiteitstype', 'tijd', 'toegang_vanaf'],
  host_practical_information: ['activiteitnaam', 'datum', 'tijd', 'klantnaam', 'klanttelefoon'],
  host_final_instructions: ['activiteitnaam', 'datum', 'tijd', 'klantnaam'],
  host_post_event_check: ['voornaam', 'datum'],
  booking_review_request: ['voornaam', 'datum'],
  booking_request_received: ['voornaam', 'datum', 'activiteitstype'],
  internal_host_required: ['activiteitnaam', 'datum'],
  booking_payment_reminder: ['voornaam', 'datum', 'bedrag', 'betaaldeadline'],
  booking_payment_final_reminder: ['voornaam', 'datum', 'bedrag', 'betaaldeadline'],
  internal_payment_overdue: ['activiteitnaam', 'datum', 'bedrag'],
};

export const CONTENT_LIJST = [
  'Titel van de activiteit',
  'Korte tekst voor de website',
  'Een foto (jpg)',
  'Link naar uw website, als u die hebt',
].map((regel) => `• ${regel}`).join('\n');

export interface MailBron {
  naam: string;
  email?: string;
  telefoon?: string;
  titel?: string;
  soort?: string;
  start: string;
  eind?: string;
  datumLabel?: string;
  gastheerNaam?: string;
  gastheerTelefoon?: string;
  tijdVan?: string;
  tijdTot?: string;
  toegangVanaf?: string;
  praktisch?: string;
  personen?: string;
  bedrag?: string;
  betaaldeadline?: string;
  vraag?: string;
  reden?: string;
  ontbrekendeContent?: string;
}

export function emailGeldig(adres: string | null | undefined): boolean {
  return EMAIL.test((adres ?? '').trim());
}

export function leesbareDatum(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd.trim());
  if (!match) return ymd.trim();
  const datum = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return datum.toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Amsterdam',
  });
}

export function variabelenUitBron(bron: MailBron): MailVariabelenMap {
  const naam = bron.naam.trim();
  const titel = (bron.titel || '').trim();
  const soort = (bron.soort || '').trim();
  const van = (bron.tijdVan || '').trim();
  const tot = (bron.tijdTot || '').trim();
  const tijd = van && tot ? `${van}–${tot}` : van || tot;
  const start = bron.start.trim();
  const deadline = /^\d{4}-\d{2}-\d{2}/.test(start) ? leesbareDatum(voegDagenToe(start.slice(0, 10), -70)) : '';
  const praktisch = (bron.praktisch || '').trim();
  return {
    voornaam: naam.split(' ')[0] || naam,
    naam,
    activiteitstype: soort,
    activiteitnaam: titel || soort,
    activiteit: titel || soort,
    datum: bron.datumLabel?.trim() || (start ? leesbareDatum(start) : ''),
    datum_van: start ? leesbareDatum(start) : '',
    datum_tot: bron.eind ? leesbareDatum(bron.eind) : '',
    tijd,
    tijd_van: van,
    tijd_tot: tot,
    toegang_vanaf: (bron.toegangVanaf || '').trim(),
    aantal_personen: (bron.personen || '').trim(),
    bedrag: (bron.bedrag || '').trim(),
    betaaldeadline: bron.betaaldeadline ? leesbareDatum(bron.betaaldeadline) : '',
    contentdeadline: deadline,
    gastheer_naam: (bron.gastheerNaam || '').trim(),
    gastheer_telefoon: (bron.gastheerTelefoon || '').trim(),
    klantnaam: naam,
    klanttelefoon: (bron.telefoon || '').trim(),
    bijzonderheden: praktisch,
    praktische_kerninformatie: praktisch,
    laatste_bijzonderheden: praktisch,
    content_lijst: CONTENT_LIJST,
    ontbrekende_content: (bron.ontbrekendeContent || '').trim() || 'Tekst of foto voor de website',
    vraag: (bron.vraag || '').trim(),
    reden_afwijzing: (bron.reden || '').trim(),
  };
}

function laatWeg(tekst: string, sleutel: string): string {
  const token = `{{${sleutel}}}`;
  const regels = tekst.split('\n');
  const uit: string[] = [];
  for (const regel of regels) {
    if (!regel.includes(token)) {
      uit.push(regel);
      continue;
    }
    const vorige = uit.at(-1) ?? '';
    if (/^\*\*[^*]+\*\*\s*$/.test(vorige.trim())) uit.pop();
  }
  return uit.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function zonderLegeOptionele(tekst: string, vars: MailVariabelenMap, verplicht: ReadonlySet<string>): string {
  let resultaat = tekst;
  for (const sleutel of OPTIONEEL) {
    if (verplicht.has(sleutel)) continue;
    if ((vars[sleutel] || '').trim()) continue;
    resultaat = laatWeg(resultaat, sleutel);
  }
  return resultaat;
}

export interface SamengesteldeMail {
  ok: true;
  onderwerp: string;
  tekst: string;
  html: string;
}

export interface GeblokkeerdeMail {
  ok: false;
  ontbreekt: string[];
  toelichting: string;
}

export function samenstellenWorkflowmail(
  template: MailTemplateDef,
  bron: MailBron,
  opties: { voorbeeldUrl?: string; templateId?: string } = {},
): SamengesteldeMail | GeblokkeerdeMail {
  const vars = variabelenUitBron(bron);
  const verplicht = new Set(VERPLICHT[template.id] ?? []);
  const ontbreekt = [...verplicht].filter((sleutel) => !(vars[sleutel] || '').trim()).map((sleutel) => LABEL[sleutel] ?? sleutel);
  if (ontbreekt.length > 0) {
    return { ok: false, ontbreekt, toelichting: `Niet verzonden. Ontbrekende gegevens: ${ontbreekt.join(', ')}.` };
  }
  const inhoud = {
    ...template,
    aanhef: zonderLegeOptionele(template.aanhef, vars, verplicht),
    introductie: zonderLegeOptionele(template.introductie, vars, verplicht),
    hoofdtekst: zonderLegeOptionele(template.hoofdtekst, vars, verplicht),
    slottekst: zonderLegeOptionele(template.slottekst, vars, verplicht),
    secundaireTekst: zonderLegeOptionele(template.secundaireTekst, vars, verplicht),
    onderwerp: zonderLegeOptionele(template.onderwerp, vars, verplicht),
  };
  const onderwerp = onderwerpUitTemplate(inhoud, vars);
  const gerenderd = renderMailBericht(inhoud, vars, { voorbeeldUrl: opties.voorbeeldUrl, templateId: opties.templateId ?? template.id });
  const tekst = plainTekstUitTemplate(inhoud, vars);
  if (onderwerp.includes('{{') || tekst.includes('{{') || gerenderd.html.includes('{{')) {
    const open = [...`${onderwerp}\n${tekst}`.matchAll(/\{\{(\w+)\}\}/g)].map((match) => LABEL[match[1]] ?? match[1]);
    const uniek = [...new Set(open)];
    return {
      ok: false,
      ontbreekt: uniek,
      toelichting: `Niet verzonden. Ontbrekende gegevens: ${uniek.join(', ') || 'onbekende variabele'}.`,
    };
  }
  return { ok: true, onderwerp, tekst, html: gerenderd.html };
}

export interface Verzendcontrole {
  ok: boolean;
  reden: string;
}

/** Eén poort vóór een provider-call. Dry-run en test horen hier niet als productie. */
export function controleerAutomatischeMail(input: {
  ingeschakeld: boolean;
  aanleidingGeldig: boolean;
  ontvangerToegestaan: boolean;
  email: string;
  mailCompleet: boolean;
  ontbreekt?: readonly string[];
  alVerzonden: boolean;
  bezig: boolean;
}): Verzendcontrole {
  if (!input.ingeschakeld) return { ok: false, reden: 'De automatisering staat uit.' };
  if (!input.aanleidingGeldig) return { ok: false, reden: 'De aanleiding is niet geldig.' };
  if (!input.ontvangerToegestaan) return { ok: false, reden: 'Deze ontvanger mag niet worden benaderd.' };
  if (!emailGeldig(input.email)) return { ok: false, reden: 'Het e-mailadres is ongeldig.' };
  if (!input.mailCompleet) {
    const velden = input.ontbreekt?.length ? input.ontbreekt.join(', ') : 'onbekend';
    return { ok: false, reden: `Niet verzonden. Ontbrekende gegevens: ${velden}.` };
  }
  if (input.alVerzonden) return { ok: false, reden: 'Deze e-mail is al verzonden.' };
  if (input.bezig) return { ok: false, reden: 'Deze e-mail wordt al verwerkt.' };
  return { ok: true, reden: 'Geaccepteerd door de controle. Aflevering is daarmee nog niet bevestigd.' };
}

export function redenBuitenWorkflow(status: string): string | null {
  if (status === 'migratie_aanvraag' || status === 'migratie_vastgelegd') {
    return 'Historische migratieboeking. De planner neemt deze status niet op, zodat er geen mail achteraf vertrekt.';
  }
  return null;
}

export function openstaandeAanbetaling(input: {
  status: string;
  ontvangen: boolean;
  bedrag: number;
  optieAangemaaktOp: string | null;
  deadline: string | null;
}): { herkend: boolean; inplanbaar: boolean; reden: string } {
  if (redenBuitenWorkflow(input.status)) {
    return { herkend: false, inplanbaar: false, reden: 'Migratieboeking valt buiten de betaalherinnering.' };
  }
  const loopt = input.status === 'optie' || input.status === 'optie_verlopen' || input.status === 'definitief';
  if (!loopt || input.ontvangen || input.bedrag <= 0) {
    return { herkend: false, inplanbaar: false, reden: 'Geen openstaande aanbetaling.' };
  }
  const inplanbaar = Boolean(input.optieAangemaaktOp || input.deadline);
  return {
    herkend: true,
    inplanbaar,
    reden: inplanbaar
      ? 'Openstaande aanbetaling herkend. Er gaat niets uit zolang betaalherinneringen uit staan.'
      : 'Openstaande aanbetaling herkend, maar zonder optiedatum of betaaldeadline is er geen verzendmoment.',
  };
}

export interface GeplandBericht {
  wanneer: string;
  wanneerLabel: string;
  automatisering: string;
  sleutel: string;
  templateId: string;
  ontvanger: string;
  email: string;
  status: 'Gereed' | 'Geblokkeerd' | 'Uit';
  reden: string;
  boekingId: string;
  onderwerp: string;
  tekst: string;
  html: string;
}

export interface KomendeBoeking {
  boekingId: string;
  status: string;
  naam: string;
  email: string;
  telefoon: string;
  titel: string;
  soort: string;
  start: string;
  eind: string;
  gastheerNaam: string;
  gastheerTelefoon: string;
  gastheerEmail: string;
  tijdVan: string;
  tijdTot: string;
  toegangVanaf: string;
  praktisch: string;
  personen: string;
  bedrag: number;
  aanbetalingOntvangen: boolean;
  optieAangemaaktOp: string | null;
  optieEind: string | null;
  inhoudStatus: InhoudStatus;
  publicatieTrigger: PublicatieTrigger;
  gastheerAanwezig: boolean;
  verzonden: readonly string[];
  geannuleerd: boolean;
}

const NAAM: Record<string, string> = {
  content_herinnering: 'Contentverzoek',
  herinnering: 'Praktische informatie',
  gastheer_mail: 'Gastbegeleider',
  nazorg: 'Reviewmail',
  betaalherinnering: 'Betaalherinnering',
  workflow: 'Workflow',
};

export function komendeBerichten(input: {
  boekingen: readonly KomendeBoeking[];
  register: readonly Automatisering[];
  templates: readonly MailTemplateDef[];
  vandaag: string;
  limiet?: number;
}): GeplandBericht[] {
  const limiet = input.limiet ?? 12;
  const horizon = voegDagenToe(input.vandaag, 120);
  const rijen: GeplandBericht[] = [];
  for (const boeking of input.boekingen) {
    if (redenBuitenWorkflow(boeking.status)) continue;
    const ctx: CommunicatieContext = {
      status: boeking.status as CommunicatieContext['status'],
      start: boeking.start,
      eind: boeking.eind,
      verhuurtype: boeking.soort,
      publicatieTrigger: boeking.publicatieTrigger,
      inhoudStatus: boeking.inhoudStatus,
      aanbetalingOntvangen: boeking.aanbetalingOntvangen,
      aanbetalingVerplicht: boeking.bedrag > 0,
      optieAangemaaktOp: boeking.optieAangemaaktOp,
      betaaldeadline: boeking.optieEind,
      gastheerAanwezig: boeking.gastheerAanwezig,
      verzonden: new Set(boeking.verzonden),
      vandaag: input.vandaag,
      geannuleerd: boeking.geannuleerd,
    };
    const verzonden = new Set(boeking.verzonden);
    for (const stap of communicatieStappen(ctx)) {
      if (verzonden.has(stap.templateId)) continue;
      if (stap.geplandOp < input.vandaag || stap.geplandOp > horizon) continue;
      const sleutel = automatiseringVoorTemplate(stap.templateId) ?? '';
      const besluit = sleutel ? magAutomatiseringUitvoeren(sleutel, input.register) : null;
      const template = input.templates.find((item) => item.id === stap.templateId);
      const email = stap.ontvangerRol === 'gastheer'
        ? boeking.gastheerEmail
        : stap.ontvangerRol === 'huurder'
          ? boeking.email
          : '';
      const ontvanger = stap.ontvangerRol === 'gastheer'
        ? boeking.gastheerNaam || 'Gastbegeleider'
        : stap.ontvangerRol === 'huurder'
          ? boeking.naam || 'Huurder'
          : stap.ontvangerRol === 'finance'
            ? 'Financiën'
            : 'Bestuur';
      const bron: MailBron = {
        naam: stap.ontvangerRol === 'gastheer' ? boeking.gastheerNaam : boeking.naam,
        email,
        telefoon: boeking.telefoon,
        titel: boeking.titel,
        soort: boeking.soort,
        start: boeking.start,
        eind: boeking.eind,
        gastheerNaam: boeking.gastheerNaam,
        gastheerTelefoon: boeking.gastheerTelefoon,
        tijdVan: boeking.tijdVan,
        tijdTot: boeking.tijdTot,
        toegangVanaf: boeking.toegangVanaf,
        praktisch: boeking.praktisch,
        personen: boeking.personen,
        bedrag: boeking.bedrag > 0 ? String(boeking.bedrag) : '',
        betaaldeadline: boeking.optieEind ?? '',
      };
      const mail = template ? samenstellenWorkflowmail(template, bron, { templateId: template.id }) : null;
      const uit = !besluit || besluit.modus !== 'aan';
      const status: GeplandBericht['status'] = uit ? 'Uit' : mail?.ok ? 'Gereed' : 'Geblokkeerd';
      rijen.push({
        wanneer: stap.geplandOp,
        wanneerLabel: `${leesbareDatum(stap.geplandOp)} om 07:00`,
        automatisering: NAAM[sleutel] ?? sleutel,
        sleutel,
        templateId: stap.templateId,
        ontvanger,
        email,
        status,
        reden: uit
          ? besluit?.modus === 'test'
            ? 'Staat op Test. De planner verstuurt niets.'
            : 'Deze automatisering staat uit. Er wordt niets verstuurd.'
          : mail?.ok
            ? 'Klaar om te verzenden zodra de planner aan staat.'
            : mail?.toelichting ?? 'De mail is niet compleet.',
        boekingId: boeking.boekingId,
        onderwerp: mail?.ok ? mail.onderwerp : template?.onderwerp ?? stap.templateId,
        tekst: mail?.ok ? mail.tekst : mail?.toelichting ?? '',
        html: mail?.ok ? mail.html : '',
      });
    }
  }
  return rijen.sort((a, b) => a.wanneer.localeCompare(b.wanneer) || a.automatisering.localeCompare(b.automatisering)).slice(0, limiet);
}
