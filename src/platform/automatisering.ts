/**
 * Centrale schakelaar voor mail en automatiseringen.
 * Onbekend, uit of een onbekende mailcategorie is fail-closed: geen provider.
 */

export type AutomatiseringStatus = 'actief' | 'test' | 'uit';
export type AutomatiseringCategorie = 'transactioneel' | 'automatisering' | 'handmatig';

export const MAILCATEGORIEEN = ['transactioneel', 'automatisering', 'handmatig'] as const;
export type Mailcategorie = (typeof MAILCATEGORIEEN)[number];

export interface Automatisering {
  sleutel: string;
  naam: string;
  omschrijving: string;
  categorie: AutomatiseringCategorie;
  status: AutomatiseringStatus;
  mailcategorie: string;
  trigger: string;
  /** False als er geen route is die deze mail nu kan starten. */
  actieveTrigger: boolean;
  ontvangerstype: string;
  risicovol: boolean;
  laatsteRun: string | null;
  laatsteResultaat: string | null;
  gewijzigdDoor: string | null;
  gewijzigdOp: string | null;
}

export interface Verzendbesluit {
  uitvoeren: boolean;
  provider: boolean;
  reden: string;
  status: AutomatiseringStatus | 'onbekend';
}

export class MailGeblokkeerd extends Error {
  constructor(reden: string) {
    super(reden);
    this.name = 'MailGeblokkeerd';
  }
}

export const STANDAARD_AUTOMATISERINGEN: Automatisering[] = [
  {
    sleutel: 'contact_bestuur',
    naam: 'Contact naar bestuur',
    omschrijving: 'Notificatie naar het bestuur bij een contactbericht. De contactpagina heeft geen formulier, dus er ontstaat nu geen mail.',
    categorie: 'transactioneel',
    status: 'actief',
    mailcategorie: 'transactioneel',
    trigger: 'Contactbericht',
    actieveTrigger: false,
    ontvangerstype: 'Bestuur',
    risicovol: false,
    laatsteRun: null,
    laatsteResultaat: null,
    gewijzigdDoor: null,
    gewijzigdOp: null,
  },
  {
    sleutel: 'aanvraag_bestuur',
    naam: 'Nieuwe verhuuraanvraag naar bestuur',
    omschrijving: 'Notificatie naar het bestuur zodra een verhuuraanvraag is opgeslagen. De bevestiging aan de huurder hoort hier niet bij.',
    categorie: 'transactioneel',
    status: 'actief',
    mailcategorie: 'transactioneel',
    trigger: 'Verhuuraanvraag opgeslagen',
    actieveTrigger: true,
    ontvangerstype: 'Bestuur',
    risicovol: false,
    laatsteRun: null,
    laatsteResultaat: null,
    gewijzigdDoor: null,
    gewijzigdOp: null,
  },
  {
    sleutel: 'aanvraag_bevestiging',
    naam: 'Bevestiging aan de aanvrager',
    omschrijving: 'Template booking_request_received. Gaat niet mee met de bestuursnotificatie.',
    categorie: 'automatisering',
    status: 'uit',
    mailcategorie: 'automatisering',
    trigger: 'Nieuwe aanvraag',
    actieveTrigger: false,
    ontvangerstype: 'Huurder',
    risicovol: true,
    laatsteRun: null,
    laatsteResultaat: null,
    gewijzigdDoor: null,
    gewijzigdOp: null,
  },
  {
    sleutel: 'workflow',
    naam: 'Workflowcron',
    omschrijving: 'Dagelijkse planner op /api/cron/workflow. Historische boekingen kunnen anders alsnog mail starten.',
    categorie: 'automatisering',
    status: 'uit',
    mailcategorie: 'automatisering',
    trigger: 'Cron 06:00',
    actieveTrigger: true,
    ontvangerstype: 'Huurder, gastheer, bestuur',
    risicovol: true,
    laatsteRun: null,
    laatsteResultaat: null,
    gewijzigdDoor: null,
    gewijzigdOp: null,
  },
  {
    sleutel: 'nieuwsbrief',
    naam: 'Nieuwsbrief',
    omschrijving: 'Wekelijkse vriendenmail en de previewcron.',
    categorie: 'automatisering',
    status: 'uit',
    mailcategorie: 'automatisering',
    trigger: 'Cron vrijdag / donderdag-preview',
    actieveTrigger: true,
    ontvangerstype: 'Vrienden',
    risicovol: true,
    laatsteRun: null,
    laatsteResultaat: null,
    gewijzigdDoor: null,
    gewijzigdOp: null,
  },
  {
    sleutel: 'betaalherinnering',
    naam: 'Betaalherinneringen',
    omschrijving: 'Betalingsherinnering, laatste herinnering en interne escalatie bij een open betaling.',
    categorie: 'automatisering',
    status: 'uit',
    mailcategorie: 'automatisering',
    trigger: 'Workflow bij open betaling',
    actieveTrigger: true,
    ontvangerstype: 'Huurder en finance',
    risicovol: true,
    laatsteRun: null,
    laatsteResultaat: null,
    gewijzigdDoor: null,
    gewijzigdOp: null,
  },
  {
    sleutel: 'statusmail_huurder',
    naam: 'Statusmail naar huurder',
    omschrijving: 'Goedkeuring, afwijzing, meer informatie, definitief en annulering.',
    categorie: 'automatisering',
    status: 'uit',
    mailcategorie: 'automatisering',
    trigger: 'Boekings- of aanvraagstatus',
    actieveTrigger: true,
    ontvangerstype: 'Huurder',
    risicovol: true,
    laatsteRun: null,
    laatsteResultaat: null,
    gewijzigdDoor: null,
    gewijzigdOp: null,
  },
  {
    sleutel: 'content_herinnering',
    naam: 'Content en opvolging',
    omschrijving: 'Verzoek om tekst of foto, reminders en interne escalatie als content ontbreekt.',
    categorie: 'automatisering',
    status: 'uit',
    mailcategorie: 'automatisering',
    trigger: 'Weken voor de activiteit',
    actieveTrigger: true,
    ontvangerstype: 'Huurder en bestuur',
    risicovol: true,
    laatsteRun: null,
    laatsteResultaat: null,
    gewijzigdDoor: null,
    gewijzigdOp: null,
  },
  {
    sleutel: 'herinnering',
    naam: 'Praktische en dagherinnering',
    omschrijving: 'Praktische informatie en de mail kort voor de activiteit.',
    categorie: 'automatisering',
    status: 'uit',
    mailcategorie: 'automatisering',
    trigger: 'Dagen of weken voor de activiteit',
    actieveTrigger: true,
    ontvangerstype: 'Huurder',
    risicovol: true,
    laatsteRun: null,
    laatsteResultaat: null,
    gewijzigdDoor: null,
    gewijzigdOp: null,
  },
  {
    sleutel: 'gastheer_mail',
    naam: 'Gastheercommunicatie',
    omschrijving: 'Beschikbaarheid, bevestiging, praktische informatie en afloopcheck.',
    categorie: 'automatisering',
    status: 'uit',
    mailcategorie: 'automatisering',
    trigger: 'Planning of workflow',
    actieveTrigger: true,
    ontvangerstype: 'Gastheer en planning',
    risicovol: true,
    laatsteRun: null,
    laatsteResultaat: null,
    gewijzigdDoor: null,
    gewijzigdOp: null,
  },
  {
    sleutel: 'nazorg',
    naam: 'Nazorg en review',
    omschrijving: 'Bedank- en reviewmail na afloop.',
    categorie: 'automatisering',
    status: 'uit',
    mailcategorie: 'automatisering',
    trigger: 'Na de activiteit',
    actieveTrigger: true,
    ontvangerstype: 'Huurder',
    risicovol: true,
    laatsteRun: null,
    laatsteResultaat: null,
    gewijzigdDoor: null,
    gewijzigdOp: null,
  },
  {
    sleutel: 'reservelijst_mail',
    naam: 'Reservelijst',
    omschrijving: 'Bericht bij een vrijgekomen expositieweekend. Blijft handmatig en staat uit.',
    categorie: 'handmatig',
    status: 'uit',
    mailcategorie: 'handmatig',
    trigger: 'Weekend vrijgegeven',
    actieveTrigger: false,
    ontvangerstype: 'Reservelijst',
    risicovol: true,
    laatsteRun: null,
    laatsteResultaat: null,
    gewijzigdDoor: null,
    gewijzigdOp: null,
  },
  {
    sleutel: 'handmatige_template',
    naam: 'Losse template uit beheer',
    omschrijving: 'Contractbegeleiding en andere templates zonder automatische caller.',
    categorie: 'handmatig',
    status: 'uit',
    mailcategorie: 'handmatig',
    trigger: 'Handmatige beheeractie',
    actieveTrigger: false,
    ontvangerstype: 'Huurder',
    risicovol: true,
    laatsteRun: null,
    laatsteResultaat: null,
    gewijzigdDoor: null,
    gewijzigdOp: null,
  },
  {
    sleutel: 'mailtemplate_test',
    naam: 'Testmail van een template',
    omschrijving: 'De testknop bij een mailtemplate. Testmodus doet geen provider-call.',
    categorie: 'handmatig',
    status: 'test',
    mailcategorie: 'handmatig',
    trigger: 'Knop Testmail',
    actieveTrigger: true,
    ontvangerstype: 'Ingevoerd adres',
    risicovol: true,
    laatsteRun: null,
    laatsteResultaat: null,
    gewijzigdDoor: null,
    gewijzigdOp: null,
  },
  {
    sleutel: 'gebruiker_uitnodiging',
    naam: 'Uitnodiging beheeraccount',
    omschrijving: 'Supabase Auth-mail bij uitnodigen of opnieuw versturen. Geen Resend-template.',
    categorie: 'handmatig',
    status: 'uit',
    mailcategorie: 'handmatig',
    trigger: 'Knop Uitnodigen of Opnieuw',
    actieveTrigger: true,
    ontvangerstype: 'Beheerder',
    risicovol: true,
    laatsteRun: null,
    laatsteResultaat: null,
    gewijzigdDoor: null,
    gewijzigdOp: null,
  },
];

export const TEMPLATE_AUTOMATISERING: Record<string, string> = {
  booking_request_received: 'aanvraag_bevestiging',
  internal_booking_review_required: 'aanvraag_bestuur',
  booking_more_information_requested: 'statusmail_huurder',
  internal_booking_information_received: 'statusmail_huurder',
  booking_request_rejected: 'statusmail_huurder',
  afwijzing: 'statusmail_huurder',
  booking_approved_payment_required: 'statusmail_huurder',
  booking_confirmed: 'statusmail_huurder',
  volgende_stappen: 'statusmail_huurder',
  booking_cancelled: 'statusmail_huurder',
  booking_payment_reminder: 'betaalherinnering',
  booking_payment_final_reminder: 'betaalherinnering',
  internal_payment_overdue: 'betaalherinnering',
  aanbetaling_check_paul: 'betaalherinnering',
  booking_content_request: 'content_herinnering',
  booking_content_reminder: 'content_herinnering',
  content_verzoek: 'content_herinnering',
  internal_content_overdue: 'content_herinnering',
  internal_content_review_required: 'content_herinnering',
  content_ter_beoordeling: 'content_herinnering',
  booking_content_changes_requested: 'content_herinnering',
  booking_content_approved: 'content_herinnering',
  booking_practical_information: 'herinnering',
  praktisch_4w: 'herinnering',
  booking_final_instructions: 'herinnering',
  herinnering_1d: 'herinnering',
  host_practical_information: 'gastheer_mail',
  praktisch_gastheer: 'gastheer_mail',
  host_final_instructions: 'gastheer_mail',
  herinnering_gastheer: 'gastheer_mail',
  host_assignment_confirmed: 'gastheer_mail',
  host_availability_request: 'gastheer_mail',
  host_post_event_check: 'gastheer_mail',
  internal_host_required: 'gastheer_mail',
  booking_review_request: 'nazorg',
  review_verzoek: 'nazorg',
  exhibition_weekend_available: 'reservelijst_mail',
  reservelijst: 'reservelijst_mail',
  contract_begeleiding: 'handmatige_template',
  optie_verlopen_contractbeheerder: 'workflow',
};

export function automatiseringVoorTemplate(templateSleutel: string): string | null {
  return TEMPLATE_AUTOMATISERING[templateSleutel] ?? null;
}

export function magAutomatiseringUitvoeren(
  sleutel: string,
  register: readonly Automatisering[] = STANDAARD_AUTOMATISERINGEN,
): Verzendbesluit {
  const item = register.find((rij) => rij.sleutel === sleutel);
  if (!item) {
    return { uitvoeren: false, provider: false, reden: 'onbekende automatisering', status: 'onbekend' };
  }
  if (!(MAILCATEGORIEEN as readonly string[]).includes(item.mailcategorie)) {
    return { uitvoeren: false, provider: false, reden: 'onbekende mailcategorie', status: item.status };
  }
  if (item.status === 'uit') {
    return { uitvoeren: false, provider: false, reden: 'automatisering uit', status: 'uit' };
  }
  if (item.status === 'test') {
    return { uitvoeren: true, provider: false, reden: 'testmodus, geen provider', status: 'test' };
  }
  if (item.status === 'actief') {
    return { uitvoeren: true, provider: true, reden: 'actief', status: 'actief' };
  }
  return { uitvoeren: false, provider: false, reden: 'onbekende status', status: 'onbekend' };
}

export function statusLabel(status: AutomatiseringStatus): string {
  if (status === 'actief') return 'Aan';
  if (status === 'test') return 'Test';
  return 'Uit';
}

export function isStatus(waarde: string): waarde is AutomatiseringStatus {
  return waarde === 'actief' || waarde === 'test' || waarde === 'uit';
}

export interface Statusplan {
  soort: 'ongewijzigd' | 'bevestiging' | 'wijziging' | 'weigering';
  reden?: string;
}

export function planStatuswijziging(
  item: Automatisering,
  nieuwe: string,
  bevestigd: boolean,
): Statusplan {
  if (!isStatus(nieuwe)) return { soort: 'weigering', reden: 'Onbekende status.' };
  if (nieuwe === item.status) return { soort: 'ongewijzigd' };
  if (item.risicovol && nieuwe === 'actief' && !bevestigd) return { soort: 'bevestiging' };
  return { soort: 'wijziging' };
}

export interface Auditregel {
  automatisering: string;
  oudeStatus: AutomatiseringStatus;
  nieuweStatus: AutomatiseringStatus;
  gebruiker: string;
  tijdstip: string;
}

export function auditregel(
  item: Automatisering,
  nieuwe: AutomatiseringStatus,
  gebruiker: string,
  tijdstip = new Date().toISOString(),
): Auditregel {
  return {
    automatisering: item.sleutel,
    oudeStatus: item.status,
    nieuweStatus: nieuwe,
    gebruiker,
    tijdstip,
  };
}
