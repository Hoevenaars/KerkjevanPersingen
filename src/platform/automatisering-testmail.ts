/**
 * Eén proefmail per automatisering die op Test staat.
 * De ontvanger is altijd het centrale testmailadres. Aan en Uit doen niet mee.
 */

import { kerkjeMail } from '../lib/kerkje-mail.ts';
import { magAutomatiseringUitvoeren, type Automatisering } from './automatisering.ts';
import { onderwerpUitTemplate, renderMailBericht } from './mailtemplates/render.ts';
import type { MailTemplateDef } from './mailtemplates/types.ts';
import { VOORBEELD_VARIABELEN } from './mailtemplates/voorbeeld.ts';
import { planSocialMediaVerzending } from './social-media-content.ts';
import { GEEN_TESTMAILADRES, normaliseerTestmailadres } from './testmail.ts';

/** Representatieve catalogustemplate. Automatiseringen zonder template krijgen een korte proeftekst. */
export const TESTMAIL_TEMPLATE: Record<string, string> = {
  aanvraag_bestuur: 'internal_booking_review_required',
  aanvraag_bevestiging: 'booking_request_received',
  betaalherinnering: 'booking_payment_reminder',
  statusmail_huurder: 'booking_confirmed',
  content_herinnering: 'booking_content_request',
  herinnering: 'booking_practical_information',
  gastheer_mail: 'host_practical_information',
  nazorg: 'booking_review_request',
  reservelijst_mail: 'exhibition_weekend_available',
};

export interface GeplandeTestmail {
  sleutel: string;
  naam: string;
  versturen: boolean;
  overgeslagen: boolean;
  reden: string;
  templateId?: string;
  bericht?: {
    sleutel: string;
    naar: string;
    onderwerp: string;
    tekst: string;
    html: string;
    replyTo?: string;
    aanvragerEmail?: string;
    templateId?: string;
    richting: 'intern' | 'aanvrager';
    bedoeldeOntvanger: string;
  };
}

export interface TestmailBronnen {
  templates: readonly MailTemplateDef[];
  testadres: string | null;
  nieuwsbrief?: { subject: string; html: string; text: string; replyTo: string } | null;
}

export interface TestmailResultaat {
  sleutel: string;
  naam: string;
  verzonden: boolean;
  overgeslagen: boolean;
  reden: string;
}

function pak(
  item: Automatisering,
  adres: string,
  onderwerp: string,
  tekst: string,
  html: string,
  extra: { templateId?: string; replyTo?: string; richting: 'intern' | 'aanvrager' },
): NonNullable<GeplandeTestmail['bericht']> {
  return {
    sleutel: item.sleutel,
    naar: adres,
    onderwerp: `${item.naam}: ${onderwerp}`,
    tekst,
    html,
    replyTo: extra.replyTo,
    aanvragerEmail: extra.richting === 'intern' ? adres : undefined,
    templateId: extra.templateId,
    richting: extra.richting,
    bedoeldeOntvanger: adres,
  };
}

function proeftekst(item: Automatisering, adres: string): NonNullable<GeplandeTestmail['bericht']> {
  const mail = kerkjeMail({
    titel: item.naam,
    aanhef: 'Beste beheerder,',
    hoofdtekst: `Dit is een testmail van de automatisering ${item.naam}. De schakelaar staat op Test. De oorspronkelijke ontvanger krijgt deze mail niet.`,
    ondertekening: 'Stichting Het Kerkje van Persingen',
  });
  const richting = item.sleutel === 'contact_bestuur' ? 'intern' : 'aanvrager';
  return pak(item, adres, item.naam, mail.text, mail.html, { richting });
}

function berichtVoor(item: Automatisering, adres: string, bronnen: TestmailBronnen): NonNullable<GeplandeTestmail['bericht']> {
  if (item.sleutel === 'nieuwsbrief' && bronnen.nieuwsbrief) {
    return pak(item, adres, bronnen.nieuwsbrief.subject, bronnen.nieuwsbrief.text, bronnen.nieuwsbrief.html, {
      replyTo: bronnen.nieuwsbrief.replyTo,
      richting: 'aanvrager',
    });
  }
  if (item.sleutel === 'social_media_content') {
    const plan = planSocialMediaVerzending(
      {
        boekingId: 'testmail',
        versie: 1,
        goedgekeurd: true,
        soort: 'expositie',
        titel: 'Voorbeeld expositie',
        start: '2027-06-14',
        eind: '2027-06-15',
        exposanten: 'Jan Jansen',
        korteTekst: 'Korte voorbeeldtekst voor de testmail.',
        langeTekst: 'Langere voorbeeldtekst. Dit is geen echte publicatie.',
        fotos: [],
        ontvanger: adres,
        alVerstuurd: false,
        beheerUrl: 'https://kerkjepersingen.nl/beheer/',
      },
      { uitvoeren: true, provider: true, reden: 'testmodus, alleen testmailadres', status: 'test', modus: 'test' },
    );
    if (plan.bericht?.html) {
      return pak(item, adres, plan.bericht.onderwerp, plan.bericht.tekst, plan.bericht.html, { richting: 'aanvrager' });
    }
  }
  const templateId = TESTMAIL_TEMPLATE[item.sleutel];
  const template = templateId ? bronnen.templates.find((kandidaat) => kandidaat.id === templateId) : undefined;
  if (template) {
    const brief = renderMailBericht(template, VOORBEELD_VARIABELEN, {
      voorbeeldUrl: 'https://kerkjepersingen.nl/',
      templateId: template.id,
    });
    return pak(item, adres, onderwerpUitTemplate(template, VOORBEELD_VARIABELEN), brief.text, brief.html, {
      templateId: template.id,
      richting: item.sleutel === 'aanvraag_bestuur' ? 'intern' : 'aanvrager',
    });
  }
  return proeftekst(item, adres);
}

export function planAutomatiseringTestmails(
  register: readonly Automatisering[],
  bronnen: TestmailBronnen,
): GeplandeTestmail[] {
  const adres = normaliseerTestmailadres(bronnen.testadres);
  return register
    .filter((item) => item.status === 'test')
    .map((item) => {
      const basis = { sleutel: item.sleutel, naam: item.naam };
      const besluit = magAutomatiseringUitvoeren(item.sleutel, register);
      if (!besluit.provider || besluit.modus !== 'test') {
        return { ...basis, versturen: false, overgeslagen: true, reden: besluit.reden };
      }
      if (!adres.ok) {
        return { ...basis, versturen: false, overgeslagen: false, reden: GEEN_TESTMAILADRES };
      }
      const bericht = berichtVoor(item, adres.adres, bronnen);
      if (bericht.naar !== adres.adres) {
        return { ...basis, versturen: false, overgeslagen: false, reden: GEEN_TESTMAILADRES };
      }
      return {
        ...basis,
        versturen: true,
        overgeslagen: false,
        reden: 'testmodus, alleen testmailadres',
        templateId: bericht.templateId,
        bericht,
      };
    });
}

export function vatTestmailsSamen(
  resultaten: readonly TestmailResultaat[],
  adres: string,
): { melding: string; fout: string } {
  if (resultaten.length === 0) {
    return { melding: 'Geen automatisering staat op Test. Er is niets verstuurd.', fout: '' };
  }
  const verstuurd = resultaten.filter((item) => item.verzonden);
  const overgeslagen = resultaten.filter((item) => item.overgeslagen);
  const mislukt = resultaten.filter((item) => !item.verzonden && !item.overgeslagen);
  const delen: string[] = [];
  if (verstuurd.length === 1) delen.push(`1 testmail verstuurd naar ${adres}: ${verstuurd[0].naam}.`);
  else if (verstuurd.length > 1) {
    delen.push(`${verstuurd.length} testmails verstuurd naar ${adres}: ${verstuurd.map((item) => item.naam).join(', ')}.`);
  }
  if (overgeslagen.length > 0) {
    delen.push(`Overgeslagen: ${overgeslagen.map((item) => `${item.naam} (${item.reden})`).join('; ')}.`);
  }
  const fout = mislukt.length
    ? `Niet verstuurd: ${mislukt.map((item) => `${item.naam} (${item.reden})`).join('; ')}.`
    : '';
  return { melding: delen.join(' '), fout };
}
