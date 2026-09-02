/**
 * Domeinmodel voor het beheerplatform.
 *
 * Dit is de technische vertaling van Functioneel Ontwerp v1.0.
 * Nog niet gekoppeld aan de publieke website: Sanity blijft de schrijvende
 * en lezende bron tot de gecontroleerde omschakeling.
 */

export const TIJDZONE = 'Europe/Amsterdam';

export const MODULES = [
  'dashboard',
  'aanvragen',
  'boekingen',
  'kalender',
  'agenda',
  'planning',
  'relaties',
  'finance',
  'vrienden',
  'nieuwsbrief',
  'templates',
  'gebruikers',
  'instellingen',
] as const;

export type ModuleSleutel = (typeof MODULES)[number];

export const RECHTNIVEAUS = ['verborgen', 'lezen', 'schrijven'] as const;
export type Rechtniveau = (typeof RECHTNIVEAUS)[number];

export const AANVRAAG_STATUSSEN = [
  'nieuw',
  'in_behandeling',
  'goedgekeurd',
  'afgewezen',
  'gesloten',
] as const;
export type AanvraagStatus = (typeof AANVRAAG_STATUSSEN)[number];

export const BOEKING_STATUSSEN = [
  'optie',
  'optie_verlopen',
  'definitief',
  'afgewezen',
  'geannuleerd',
  'afgerond',
  'gearchiveerd',
] as const;
export type BoekingStatus = (typeof BOEKING_STATUSSEN)[number];

export const ACTIVITEIT_CATEGORIEEN = ['prive', 'publiek', 'intern'] as const;
export type ActiviteitCategorie = (typeof ACTIVITEIT_CATEGORIEEN)[number];

export const DAGREGELS = ['expositie_weekend', 'doordeweeks', 'elke_dag'] as const;
export type Dagregel = (typeof DAGREGELS)[number];

export const PRIJSTYPEN = ['vast', 'vanaf', 'op_aanvraag'] as const;
export type Prijstype = (typeof PRIJSTYPEN)[number];

export const PUBLICATIE_TRIGGERS = [
  'zodra_content_compleet',
  'uiterlijk_1_maand',
  'uiterlijk_2_maanden',
  'uiterlijk_3_maanden',
  'niet_publiceren',
] as const;
export type PublicatieTrigger = (typeof PUBLICATIE_TRIGGERS)[number];

export const VERZENDWIJZEN = ['automatisch', 'concept', 'handmatig'] as const;
export type Verzendwijze = (typeof VERZENDWIJZEN)[number];

export const NIEUWE_ONTVANGER_ACTIES = [
  'direct_alsnog',
  'als_concept',
  'niet_meer',
] as const;
export type NieuweOntvangerActie = (typeof NIEUWE_ONTVANGER_ACTIES)[number];

export const COMMUNICATIE_STATUSSEN = [
  'gepland',
  'concept',
  'wachtrij',
  'verzonden',
  'fout',
  'geannuleerd',
] as const;
export type CommunicatieStatus = (typeof COMMUNICATIE_STATUSSEN)[number];

export const VRIEND_FREQUENTIES = ['wekelijks', 'tweewekelijks', 'maandelijks'] as const;
export type VriendFrequentie = (typeof VRIEND_FREQUENTIES)[number];

export const DATATYPEN = [
  'aanvragen',
  'boekingen',
  'publieke_activiteiten',
  'interne_activiteiten',
  'relaties',
  'vrienden',
  'nieuwsbrieven',
  'instellingen',
  'templates',
] as const;
export type Datatype = (typeof DATATYPEN)[number];

export type SchrijvendeBron = 'sanity' | 'beheer';
export type ContentBron = 'sanity' | 'supabase';

export interface Verhuurtype {
  sleutel: string;
  naam: string;
  dagregel: Dagregel;
  actief: boolean;
  volgorde: number;
}

export interface Periode {
  start: string;
  eind: string;
}

export interface GebruikerRechten {
  isSuperAdmin: boolean;
  perModule: Partial<Record<ModuleSleutel, Rechtniveau>>;
}

export const STANDAARD_VERHUURTYPEN: readonly Verhuurtype[] = [
  { sleutel: 'expositie', naam: 'Expositie', dagregel: 'expositie_weekend', actief: true, volgorde: 1 },
  { sleutel: 'bruiloft', naam: 'Bruiloft', dagregel: 'doordeweeks', actief: true, volgorde: 2 },
  { sleutel: 'concert', naam: 'Concert', dagregel: 'doordeweeks', actief: true, volgorde: 3 },
  { sleutel: 'diverse', naam: 'Diverse bijeenkomst', dagregel: 'doordeweeks', actief: true, volgorde: 4 },
];
