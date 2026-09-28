export type MailCategorie =
  | 'Aanvraag'
  | 'Betaling'
  | 'Boeking'
  | 'Content'
  | 'Planning'
  | 'Gastheer'
  | 'Nazorg'
  | 'Intern';

export type MailVerzendwijze = 'automatisch' | 'besluit' | 'escalatie' | 'handmatig';

export type MailTriggerSoort =
  | 'nieuwe_aanvraag'
  | 'aanvraag_compleet'
  | 'besluit_meer_info'
  | 'aanvulling_ontvangen'
  | 'besluit_afwijzing'
  | 'besluit_goedkeuring'
  | 'betaling_open_dagen'
  | 'voor_betaaldeadline'
  | 'betaaldeadline_verstreken'
  | 'betaling_ontvangen'
  | 'weken_voor_activiteit'
  | 'dagen_voor_activiteit'
  | 'dagen_na_activiteit'
  | 'content_compleet'
  | 'besluit_content'
  | 'geen_gastheer'
  | 'handmatig_gestart'
  | 'gastheer_accepteert'
  | 'boeking_geannuleerd'
  | 'expositie_vrijgegeven';

export interface MailTriggerConfig {
  soort: MailTriggerSoort;
  beschrijving: string;
  offsetWaarde?: number;
  offsetEenheid?: 'dagen' | 'weken';
  offsetRichting?: 'voor' | 'na';
  automatischVersturen: boolean;
  conceptKlaarzetten: boolean;
}

export interface MailKnop {
  label: string;
  actie: 'link' | 'goedkeuren' | 'meer_info' | 'afwijzen' | 'content_goedkeuren' | 'content_aanpassen' | 'gastheer_ja' | 'gastheer_nee' | 'post_ok' | 'post_melding';
}

export interface MailTemplateInhoud {
  onderwerp: string;
  aanhef: string;
  introductie: string;
  hoofdtekst: string;
  callToActionTekst: string;
  secundaireTekst: string;
  slottekst: string;
  ondertekening: string;
  knoppen: MailKnop[];
}

export interface MailTemplateDef extends MailTemplateInhoud {
  id: string;
  naam: string;
  categorie: MailCategorie;
  actief: boolean;
  ontvanger: string;
  cc: string;
  bcc: string;
  trigger: MailTriggerConfig;
  verzendwijze: MailVerzendwijze;
}

export interface MailTemplateVersie {
  templateId: string;
  versie: number;
  opgeslagenOp: string;
  gebruiker: string;
  inhoud: MailTemplateInhoud;
  meta: Pick<MailTemplateDef, 'naam' | 'categorie' | 'actief' | 'ontvanger' | 'cc' | 'bcc' | 'trigger' | 'verzendwijze'>;
}

export type MailCommunicatieStatus =
  | 'gepland'
  | 'concept'
  | 'wachtrij'
  | 'verzonden'
  | 'fout'
  | 'geannuleerd'
  | 'overgeslagen';

export interface MailCommunicatieRegel {
  id: string;
  boekingId: string;
  templateId: string;
  templateNaam: string;
  ontvanger: string;
  onderwerp: string;
  status: MailCommunicatieStatus;
  geplandOp?: string;
  verzondenOp?: string;
  automatisch: boolean;
  door: 'systeem' | 'gebruiker';
  test: boolean;
  handmatigOpnieuw?: boolean;
}

export interface MailAuditRegel {
  id: string;
  op: string;
  gebruiker: string;
  boekingId?: string;
  actie: string;
  metadata?: Record<string, string>;
}

export const MAIL_VARIABELEN = [
  'voornaam',
  'naam',
  'activiteitstype',
  'activiteitnaam',
  'datum',
  'tijd',
  'toegang_vanaf',
  'aantal_personen',
  'bedrag',
  'betaaldeadline',
  'contentdeadline',
  'gastheer_naam',
  'gastheer_telefoon',
  'klantnaam',
  'klanttelefoon',
  'bijzonderheden',
  'feedback',
  'reden_afwijzing',
  'vraag',
  'omschrijving',
  'controle_overzicht',
  'ontbrekende_content',
  'praktische_kerninformatie',
  'laatste_bijzonderheden',
  'content_lijst',
  'annulering_toelichting',
  'datum_of_weekend',
  'aanvullende_informatie',
] as const;

export type MailVariabele = (typeof MAIL_VARIABELEN)[number];

export type MailVariabelenMap = Partial<Record<MailVariabele, string>>;
