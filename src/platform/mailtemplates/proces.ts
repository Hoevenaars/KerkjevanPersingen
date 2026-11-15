/**
 * Volgorde van mailtemplates langs het verhuurproces.
 * Binnen een stap staat de huidige mail eerst, de oudere variant direct erna.
 */

export interface MailProcesfase {
  sleutel: string;
  titel: string;
  templateIds: readonly string[];
}

export const MAIL_PROCESFASEN: readonly MailProcesfase[] = [
  {
    sleutel: 'aanvraag',
    titel: 'Aanvraag',
    templateIds: [
      'booking_request_received',
      'internal_booking_review_required',
      'booking_more_information_requested',
      'internal_booking_information_received',
      'booking_request_rejected',
      'afwijzing',
    ],
  },
  {
    sleutel: 'betaling',
    titel: 'Goedkeuring en betaling',
    templateIds: [
      'booking_approved_payment_required',
      'contract_begeleiding',
      'booking_payment_reminder',
      'booking_payment_final_reminder',
      'internal_payment_overdue',
      'aanbetaling_check_paul',
      'optie_verlopen_contractbeheerder',
      'booking_confirmed',
      'volgende_stappen',
    ],
  },
  {
    sleutel: 'content',
    titel: 'Informatie voor de website',
    templateIds: [
      'booking_content_request',
      'content_verzoek',
      'booking_content_reminder',
      'internal_content_overdue',
      'internal_content_review_required',
      'content_ter_beoordeling',
      'booking_content_changes_requested',
      'booking_content_approved',
    ],
  },
  {
    sleutel: 'begeleider',
    titel: 'Expositiebegeleider',
    templateIds: [
      'host_availability_request',
      'host_assignment_confirmed',
      'internal_host_required',
      'host_practical_information',
      'praktisch_gastheer',
      'host_final_instructions',
      'herinnering_gastheer',
    ],
  },
  {
    sleutel: 'praktisch',
    titel: 'Praktische informatie en de dag',
    templateIds: [
      'booking_practical_information',
      'praktisch_4w',
      'booking_final_instructions',
      'herinnering_1d',
    ],
  },
  {
    sleutel: 'nazorg',
    titel: 'Na afloop',
    templateIds: ['booking_review_request', 'review_verzoek', 'host_post_event_check'],
  },
  {
    sleutel: 'zijpad',
    titel: 'Annulering en reservelijst',
    templateIds: ['booking_cancelled', 'exhibition_weekend_available', 'reservelijst'],
  },
];

export interface MailProcesgroep<T> {
  titel: string;
  templates: T[];
}

export function groepeerOpProces<T extends { id: string; naam: string }>(templates: readonly T[]): MailProcesgroep<T>[] {
  const perId = new Map(templates.map((item) => [item.id, item]));
  const geplaatst = new Set<string>();
  const groepen: MailProcesgroep<T>[] = [];

  for (const fase of MAIL_PROCESFASEN) {
    const lijst: T[] = [];
    for (const id of fase.templateIds) {
      const item = perId.get(id);
      if (!item || geplaatst.has(id)) continue;
      geplaatst.add(id);
      lijst.push(item);
    }
    if (lijst.length > 0) groepen.push({ titel: fase.titel, templates: lijst });
  }

  const rest = templates
    .filter((item) => !geplaatst.has(item.id))
    .sort((a, b) => a.naam.localeCompare(b.naam, 'nl') || a.id.localeCompare(b.id, 'nl'));
  if (rest.length > 0) groepen.push({ titel: 'Overig', templates: rest });
  return groepen;
}

export function sorteerOpProces<T extends { id: string; naam: string }>(templates: readonly T[]): T[] {
  return groepeerOpProces(templates).flatMap((groep) => groep.templates);
}
