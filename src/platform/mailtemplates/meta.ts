import type { MailCategorie, MailTriggerConfig, MailVerzendwijze } from './types.ts';

export interface MailTemplateMeta {
  naam: string;
  categorie: MailCategorie;
  ontvanger: string;
  verzendwijze: MailVerzendwijze;
  trigger: MailTriggerConfig;
}

function rel(
  soort: MailTriggerConfig['soort'],
  beschrijving: string,
  opts: Partial<Omit<MailTriggerConfig, 'soort' | 'beschrijving'>> = {},
): MailTriggerConfig {
  return {
    soort,
    beschrijving,
    automatischVersturen: opts.automatischVersturen ?? true,
    conceptKlaarzetten: opts.conceptKlaarzetten ?? false,
    offsetWaarde: opts.offsetWaarde,
    offsetEenheid: opts.offsetEenheid,
    offsetRichting: opts.offsetRichting,
  };
}

/** Standaardconfiguratie uit MAILTEMPLATE_CONFIG_3_0.md */
export const MAILTEMPLATE_META: Record<string, MailTemplateMeta> = {
  booking_request_received: {
    naam: 'Aanvraag ontvangen',
    categorie: 'Aanvraag',
    ontvanger: 'Aanvrager',
    verzendwijze: 'automatisch',
    trigger: rel('nieuwe_aanvraag', 'Nieuwe aanvraag ingediend'),
  },
  internal_booking_review_required: {
    naam: 'Nieuwe aanvraag (intern)',
    categorie: 'Intern',
    ontvanger: 'Bestuur',
    verzendwijze: 'automatisch',
    trigger: rel('aanvraag_compleet', 'Nieuwe aanvraag compleet'),
  },
  booking_more_information_requested: {
    naam: 'Meer informatie nodig',
    categorie: 'Aanvraag',
    ontvanger: 'Aanvrager',
    verzendwijze: 'besluit',
    trigger: rel('besluit_meer_info', 'Bestuur kiest Meer informatie', { automatischVersturen: false, conceptKlaarzetten: true }),
  },
  internal_booking_information_received: {
    naam: 'Aanvulling ontvangen (intern)',
    categorie: 'Intern',
    ontvanger: 'Bestuur',
    verzendwijze: 'automatisch',
    trigger: rel('aanvulling_ontvangen', 'Aanvulling ontvangen'),
  },
  booking_request_rejected: {
    naam: 'Aanvraag afgewezen',
    categorie: 'Aanvraag',
    ontvanger: 'Aanvrager',
    verzendwijze: 'besluit',
    trigger: rel('besluit_afwijzing', 'Bestuur bevestigt afwijzing', { automatischVersturen: false }),
  },
  booking_approved_payment_required: {
    naam: 'Aanvraag goedgekeurd',
    categorie: 'Aanvraag',
    ontvanger: 'Aanvrager',
    verzendwijze: 'besluit',
    trigger: rel('besluit_goedkeuring', 'Bestuur bevestigt goedkeuring', { automatischVersturen: false }),
  },
  booking_payment_reminder: {
    naam: 'Betalingsherinnering',
    categorie: 'Betaling',
    ontvanger: 'Aanvrager',
    verzendwijze: 'automatisch',
    trigger: rel('betaling_open_dagen', 'Betaling na 7 dagen open', { offsetWaarde: 7, offsetEenheid: 'dagen', offsetRichting: 'na' }),
  },
  booking_payment_final_reminder: {
    naam: 'Laatste betalingsherinnering',
    categorie: 'Betaling',
    ontvanger: 'Aanvrager',
    verzendwijze: 'automatisch',
    trigger: rel('voor_betaaldeadline', '2 dagen voor betaaldeadline', { offsetWaarde: 2, offsetEenheid: 'dagen', offsetRichting: 'voor' }),
  },
  internal_payment_overdue: {
    naam: 'Betaling te laat (intern)',
    categorie: 'Intern',
    ontvanger: 'Finance / bestuur',
    verzendwijze: 'escalatie',
    trigger: rel('betaaldeadline_verstreken', 'Betaaldeadline verstreken'),
  },
  booking_confirmed: {
    naam: 'Reservering definitief',
    categorie: 'Boeking',
    ontvanger: 'Aanvrager',
    verzendwijze: 'automatisch',
    trigger: rel('betaling_ontvangen', 'Betaling ontvangen'),
  },
  booking_content_request: {
    naam: 'Informatie aanleveren',
    categorie: 'Content',
    ontvanger: 'Aanvrager',
    verzendwijze: 'automatisch',
    trigger: rel('weken_voor_activiteit', '12 weken vooraf', { offsetWaarde: 12, offsetEenheid: 'weken', offsetRichting: 'voor' }),
  },
  booking_content_reminder: {
    naam: 'Reminder informatie',
    categorie: 'Content',
    ontvanger: 'Aanvrager',
    verzendwijze: 'automatisch',
    trigger: rel('weken_voor_activiteit', '10 weken vooraf indien incompleet', { offsetWaarde: 10, offsetEenheid: 'weken', offsetRichting: 'voor' }),
  },
  internal_content_overdue: {
    naam: 'Content blijft ontbreken (intern)',
    categorie: 'Intern',
    ontvanger: 'Bestuur',
    verzendwijze: 'escalatie',
    trigger: rel('weken_voor_activiteit', '8 weken vooraf indien incompleet', { offsetWaarde: 8, offsetEenheid: 'weken', offsetRichting: 'voor' }),
  },
  internal_content_review_required: {
    naam: 'Content beoordelen (intern)',
    categorie: 'Intern',
    ontvanger: 'Bestuur',
    verzendwijze: 'automatisch',
    trigger: rel('content_compleet', 'Content compleet'),
  },
  booking_content_changes_requested: {
    naam: 'Aanpassing gevraagd',
    categorie: 'Content',
    ontvanger: 'Aanvrager',
    verzendwijze: 'besluit',
    trigger: rel('besluit_content', 'Bestuur vraagt aanpassing', { automatischVersturen: false }),
  },
  booking_content_approved: {
    naam: 'Content akkoord',
    categorie: 'Content',
    ontvanger: 'Aanvrager',
    verzendwijze: 'besluit',
    trigger: rel('besluit_content', 'Bestuur keurt content goed', { automatischVersturen: false }),
  },
  internal_host_required: {
    naam: 'Gastheer ontbreekt (intern)',
    categorie: 'Planning',
    ontvanger: 'Planning',
    verzendwijze: 'escalatie',
    trigger: rel('geen_gastheer', '4 weken vooraf en geen gastheer', { offsetWaarde: 4, offsetEenheid: 'weken', offsetRichting: 'voor' }),
  },
  host_availability_request: {
    naam: 'Beschikbaarheid gastheer',
    categorie: 'Gastheer',
    ontvanger: 'Gastheer',
    verzendwijze: 'handmatig',
    trigger: rel('handmatig_gestart', 'Medewerker nodigt gastheer uit', { automatischVersturen: false }),
  },
  host_assignment_confirmed: {
    naam: 'Gastheer bevestigd',
    categorie: 'Gastheer',
    ontvanger: 'Gastheer',
    verzendwijze: 'automatisch',
    trigger: rel('gastheer_accepteert', 'Gastheer accepteert'),
  },
  booking_practical_information: {
    naam: 'Praktische informatie',
    categorie: 'Boeking',
    ontvanger: 'Aanvrager',
    verzendwijze: 'automatisch',
    trigger: rel('weken_voor_activiteit', '4 weken vooraf', { offsetWaarde: 4, offsetEenheid: 'weken', offsetRichting: 'voor' }),
  },
  host_practical_information: {
    naam: 'Praktische informatie gastheer',
    categorie: 'Gastheer',
    ontvanger: 'Gastheer',
    verzendwijze: 'automatisch',
    trigger: rel('weken_voor_activiteit', '4 weken vooraf', { offsetWaarde: 4, offsetEenheid: 'weken', offsetRichting: 'voor' }),
  },
  booking_final_instructions: {
    naam: 'Laatste daginformatie',
    categorie: 'Boeking',
    ontvanger: 'Aanvrager',
    verzendwijze: 'automatisch',
    trigger: rel('dagen_voor_activiteit', '2 dagen vooraf', { offsetWaarde: 2, offsetEenheid: 'dagen', offsetRichting: 'voor' }),
  },
  host_final_instructions: {
    naam: 'Daginformatie gastheer',
    categorie: 'Gastheer',
    ontvanger: 'Gastheer',
    verzendwijze: 'automatisch',
    trigger: rel('dagen_voor_activiteit', '1 dag vooraf', { offsetWaarde: 1, offsetEenheid: 'dagen', offsetRichting: 'voor' }),
  },
  booking_review_request: {
    naam: 'Bedankt en review',
    categorie: 'Nazorg',
    ontvanger: 'Aanvrager',
    verzendwijze: 'automatisch',
    trigger: rel('dagen_na_activiteit', '1 dag na activiteit', { offsetWaarde: 1, offsetEenheid: 'dagen', offsetRichting: 'na' }),
  },
  host_post_event_check: {
    naam: 'Controle na afloop',
    categorie: 'Nazorg',
    ontvanger: 'Gastheer',
    verzendwijze: 'automatisch',
    trigger: rel('dagen_na_activiteit', '1 dag na activiteit', { offsetWaarde: 1, offsetEenheid: 'dagen', offsetRichting: 'na' }),
  },
  booking_cancelled: {
    naam: 'Annulering',
    categorie: 'Boeking',
    ontvanger: 'Aanvrager',
    verzendwijze: 'automatisch',
    trigger: rel('boeking_geannuleerd', 'Boeking geannuleerd na bevestiging'),
  },
  exhibition_weekend_available: {
    naam: 'Vrijgekomen expositieweekend',
    categorie: 'Boeking',
    ontvanger: 'Reservelijst',
    verzendwijze: 'handmatig',
    trigger: rel('expositie_vrijgegeven', 'Expositieweekend vrijgegeven', { automatischVersturen: false }),
  },
};

export function mapKnopActies(id: string, knoppen: { label: string; actie: string }[]) {
  const internReview = id === 'internal_booking_review_required';
  const internContent = id === 'internal_content_review_required';
  const hostAvail = id === 'host_availability_request';
  const postCheck = id === 'host_post_event_check';

  return knoppen.map((k) => {
    let actie = k.actie;
    if (internReview) {
      if (k.label === 'Goedkeuren') actie = 'goedkeuren';
      else if (k.label === 'Meer informatie vragen') actie = 'meer_info';
      else if (k.label === 'Afwijzen') actie = 'afwijzen';
    } else if (internContent) {
      if (k.label === 'Goedkeuren') actie = 'content_goedkeuren';
      else if (k.label === 'Aanpassing vragen') actie = 'content_aanpassen';
    } else if (hostAvail) {
      if (k.label.startsWith('Ja')) actie = 'gastheer_ja';
      else if (k.label.startsWith('Nee')) actie = 'gastheer_nee';
    } else if (postCheck) {
      if (k.label.startsWith('Alles')) actie = 'post_ok';
      else actie = 'post_melding';
    }
    return { label: k.label, actie: actie as import('./types.ts').MailKnop['actie'] };
  });
}
