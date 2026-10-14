/**
 * Handmatig mailconcept vanuit een dossier.
 * Verzenden volgt de schakelaar handmatige_template.
 */

import { kerkjeMail } from '../lib/kerkje-mail.ts';
import { CONTRACTBEHEER_EMAIL, VAN_ADRES } from '../lib/mail-adressen.ts';
import { renderMailBericht, onderwerpUitTemplate } from './mailtemplates/render.ts';
import type { MailTemplateDef } from './mailtemplates/types.ts';
import type { Mailmodus } from './testmail.ts';

export interface Mailconcept {
  onderwerp: string;
  html: string;
  text: string;
  replyTo: string;
  afzender: string;
  ontvanger: string;
  openVariabelen: boolean;
}

function openVariabelen(tekst: string): boolean {
  return /\{\{[^}]+\}\}/.test(tekst);
}

export function stelMailconceptSamen(input: {
  ontvanger: string;
  naam: string;
  template: MailTemplateDef | null;
  onderwerp: string;
  inhoud: string;
  vars?: Record<string, string>;
}): Mailconcept | { fout: string } {
  const ontvanger = input.ontvanger.trim();
  if (!ontvanger) return { fout: 'Dit dossier heeft geen ontvanger.' };
  const vars = {
    voornaam: input.naam.split(' ')[0] || input.naam,
    naam: input.naam,
    ...(input.vars ?? {}),
  };
  if (input.template) {
    const inhoud = input.inhoud.trim()
      ? { ...input.template, hoofdtekst: input.inhoud.trim() }
      : input.template;
    const brief = renderMailBericht(inhoud, vars, { voorbeeldUrl: 'https://kerkjepersingen.nl/', templateId: input.template.id });
    const onderwerp = input.onderwerp.trim() || onderwerpUitTemplate(inhoud, vars);
    const open = openVariabelen(`${onderwerp}\n${brief.text}`);
    return {
      onderwerp,
      html: brief.html,
      text: brief.text,
      replyTo: CONTRACTBEHEER_EMAIL,
      afzender: VAN_ADRES,
      ontvanger,
      openVariabelen: open,
    };
  }
  const onderwerp = input.onderwerp.trim();
  const lichaam = input.inhoud.trim();
  if (!onderwerp || !lichaam) return { fout: 'Kies een template of schrijf een onderwerp en een tekst.' };
  const brief = kerkjeMail({
    titel: onderwerp,
    aanhef: `Beste ${vars.voornaam},`,
    hoofdtekst: lichaam,
    ondertekening: 'Stichting Het Kerkje van Persingen',
  });
  return {
    onderwerp,
    html: brief.html,
    text: brief.text,
    replyTo: CONTRACTBEHEER_EMAIL,
    afzender: VAN_ADRES,
    ontvanger,
    openVariabelen: openVariabelen(`${onderwerp}\n${brief.text}`),
  };
}

export function mailconceptMelding(modus: Mailmodus, testadres: string | null, verstuurd: boolean): string {
  if (modus === 'uit') return 'De schakelaar staat uit. Het concept is niet naar een provider gestuurd.';
  if (modus === 'dry-run') return 'Dry-run. Er is geen provider-call gedaan.';
  if (!verstuurd) return 'Verzenden is geblokkeerd. Er is geen provider-call gedaan.';
  if (modus === 'test') return `Testmail verstuurd naar ${testadres ?? 'het testmailadres'}.`;
  return 'Mail verstuurd naar de dossierontvanger.';
}
