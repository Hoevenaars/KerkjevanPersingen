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
  /** uit en dry-run: geen provider. test: provider alleen naar het testmailadres. aan: echte ontvanger. */
  modus: 'uit' | 'dry-run' | 'test' | 'aan';
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
    omschrijving: 'Template booking_request_received. Gaat niet mee met de bestuursnotificatie. De schakelaar blijft uit.',
    categorie: 'automatisering',
    status: 'uit',
    mailcategorie: 'automatisering',
    trigger: 'Nieuwe aanvraag',
    actieveTrigger: true,
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
    omschrijving: 'Bericht bij een vrijgekomen expositieweekend. Alleen na handmatige selectie of een begrensde batch. Staat uit.',
    categorie: 'handmatig',
    status: 'uit',
    mailcategorie: 'handmatig',
    trigger: 'Weekend vrijgegeven',
    actieveTrigger: true,
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
    omschrijving: 'Handmatig mailconcept vanuit een dossier. Concept en preview werken altijd. Verzenden volgt deze schakelaar en staat uit.',
    categorie: 'handmatig',
    status: 'uit',
    mailcategorie: 'handmatig',
    trigger: 'Handmatige beheeractie',
    actieveTrigger: true,
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
    omschrijving: 'De testknop bij een mailtemplate. Een echte provider-call gaat alleen naar het centrale testmailadres.',
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
  {
    sleutel: 'social_media_content',
    naam: 'Social media content',
    omschrijving: 'Goedgekeurde expositiecontent naar het ingestelde social-media-adres. Geen Facebook-koppeling. De schakelaar start uit.',
    categorie: 'automatisering',
    status: 'uit',
    mailcategorie: 'automatisering',
    trigger: 'Content goedgekeurd',
    actieveTrigger: true,
    ontvangerstype: 'Social media ontvanger',
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

/**
 * Verdeling van de 40 communicatie_templates:
 * 19 met een echte caller, 8 alleen in de catalogus, 13 legacy of duplicaat.
 */
export const TEMPLATES_MET_CALLER = [
  'booking_request_received',
  'internal_booking_review_required',
  'booking_request_rejected',
  'booking_more_information_requested',
  'booking_approved_payment_required',
  'booking_confirmed',
  'booking_payment_reminder',
  'booking_payment_final_reminder',
  'internal_payment_overdue',
  'booking_content_request',
  'booking_content_reminder',
  'internal_content_overdue',
  'booking_practical_information',
  'booking_final_instructions',
  'booking_review_request',
  'internal_host_required',
  'host_practical_information',
  'host_final_instructions',
  'host_post_event_check',
] as const;

export const TEMPLATES_ALLEEN_CATALOGUS = [
  'booking_cancelled',
  'host_availability_request',
  'host_assignment_confirmed',
  'internal_booking_information_received',
  'internal_content_review_required',
  'booking_content_changes_requested',
  'booking_content_approved',
  'exhibition_weekend_available',
] as const;

export const TEMPLATES_LEGACY = [
  'afwijzing',
  'content_verzoek',
  'content_ter_beoordeling',
  'praktisch_4w',
  'praktisch_gastheer',
  'herinnering_1d',
  'herinnering_gastheer',
  'review_verzoek',
  'reservelijst',
  'aanbetaling_check_paul',
  'contract_begeleiding',
  'volgende_stappen',
  'optie_verlopen_contractbeheerder',
] as const;

const GEKOPPELDE_FLOW: Record<string, string> = {
  contact_bestuur: 'Geen formulier',
  aanvraag_bestuur: 'Verhuurformulier',
  aanvraag_bevestiging: 'Verhuurformulier',
  workflow: 'Cron /api/cron/workflow',
  nieuwsbrief: 'Nieuwsbriefcron',
  betaalherinnering: 'Planner',
  statusmail_huurder: 'Dossieractie',
  content_herinnering: 'Planner',
  herinnering: 'Planner',
  gastheer_mail: 'Planner',
  nazorg: 'Planner',
  reservelijst_mail: 'Handmatige selectie',
  handmatige_template: 'Dossieractie',
  mailtemplate_test: 'Knop Testmail',
  gebruiker_uitnodiging: 'Uitnodigen of opnieuw',
  social_media_content: 'Na goedkeuring van content',
};

export function gekoppeldeFlow(sleutel: string): string {
  return GEKOPPELDE_FLOW[sleutel] ?? 'Onbekend';
}

export function kanExternVersturen(item: Automatisering, register: readonly Automatisering[] = STANDAARD_AUTOMATISERINGEN): boolean {
  return item.actieveTrigger && magAutomatiseringUitvoeren(item.sleutel, register).provider;
}

export function automatiseringVoorTemplate(templateSleutel: string): string | null {
  return TEMPLATE_AUTOMATISERING[templateSleutel] ?? null;
}

export function magAutomatiseringUitvoeren(
  sleutel: string,
  register: readonly Automatisering[] = STANDAARD_AUTOMATISERINGEN,
): Verzendbesluit {
  const item = register.find((rij) => rij.sleutel === sleutel);
  if (!item) {
    return { uitvoeren: false, provider: false, reden: 'onbekende automatisering', status: 'onbekend', modus: 'uit' };
  }
  if (!(MAILCATEGORIEEN as readonly string[]).includes(item.mailcategorie)) {
    return { uitvoeren: false, provider: false, reden: 'onbekende mailcategorie', status: item.status, modus: 'uit' };
  }
  if (item.status === 'uit') {
    return { uitvoeren: false, provider: false, reden: 'automatisering uit', status: 'uit', modus: 'uit' };
  }
  if (item.status === 'test') {
    if (item.sleutel === 'gebruiker_uitnodiging') {
      return { uitvoeren: true, provider: false, reden: 'testmodus, geen auth-uitnodiging', status: 'test', modus: 'test' };
    }
    return { uitvoeren: true, provider: true, reden: 'testmodus, alleen testmailadres', status: 'test', modus: 'test' };
  }
  if (item.status === 'actief') {
    return { uitvoeren: true, provider: true, reden: 'actief', status: 'actief', modus: 'aan' };
  }
  return { uitvoeren: false, provider: false, reden: 'onbekende status', status: 'onbekend', modus: 'uit' };
}

export function statusLabel(status: AutomatiseringStatus): string {
  if (status === 'actief') return 'Aan';
  if (status === 'test') return 'Test';
  return 'Uit';
}

export type FunctioneleStatus = 'actief' | 'klaar' | 'test' | 'dry-run' | 'niet-aangesloten';

export interface FunctioneelOordeel {
  status: FunctioneleStatus;
  label: string;
  toelichting: string;
}

/**
 * Functionele stand, los van de opgeslagen schakelaar Aan/Test/Uit.
 * Een schakelaar op Aan zonder caller is niet actief.
 * DRY-RUN is een expliciete runmodus zonder provider, geen vaste schakelaarstand.
 */
export function functioneleStatus(item: Automatisering): FunctioneelOordeel {
  if (!item.actieveTrigger) {
    return {
      status: 'niet-aangesloten',
      label: 'NIET AANGESLOTEN',
      toelichting:
        item.sleutel === 'contact_bestuur'
          ? 'De schakelaar kan op Aan staan, maar de contactpagina heeft geen formulier.'
          : 'Er is geen actieve caller. De schakelaar start geen mail.',
    };
  }
  if (item.status === 'test') {
    return {
      status: 'test',
      label: 'TEST',
      toelichting: 'Echte provider-call, uitsluitend naar het centrale testmailadres. Productie-CC en BCC gaan niet mee.',
    };
  }
  if (item.status === 'actief') {
    return {
      status: 'actief',
      label: 'ACTIEF',
      toelichting:
        item.sleutel === 'aanvraag_bestuur'
          ? 'Een nieuwe verhuuraanvraag kan mail naar het bestuur sturen. De verzending wordt gelogd.'
          : 'Caller en schakelaar staan aan. Ontvangers volgen de echte flow.',
    };
  }
  return {
    status: 'klaar',
    label: 'KLAAR MAAR UIT',
    toelichting: 'Technisch gereed, maar nog niet geactiveerd.',
  };
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
