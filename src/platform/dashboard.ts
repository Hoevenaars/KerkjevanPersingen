/**
 * Dashboard (FO §9, §69).
 * Alleen aandachtspunten waarvoor de gebruiker rechten heeft.
 */

import type { GebruikerRechten, ModuleSleutel } from './types.ts';
import { magZien } from './rechten.ts';

export type DashboardSleutel =
  | 'nieuwe_aanvragen'
  | 'opties_bijna_verlopen'
  | 'opties_verlopen'
  | 'aanbetalingen_controleren'
  | 'activiteit_mist_content'
  | 'communicatie_klaar'
  | 'nieuwsbrief_voorbereiden'
  | 'activiteiten_7_dagen'
  | 'gastheren_toewijzen'
  | 'mail_fout';

export interface DashboardBron {
  nieuweAanvragen: number;
  optiesBijnaVerlopen: number;
  optiesVerlopen: number;
  aanbetalingenControleren: number;
  activiteitMistContent: number;
  communicatieKlaar: number;
  nieuwsbriefVoorbereiden: number;
  activiteiten7Dagen: number;
  gastherenToewijzen: number;
  mailFout: number;
}

export interface DashboardItem {
  sleutel: DashboardSleutel;
  label: string;
  aantal: number;
  module: ModuleSleutel;
}

const DEFINITIE: {
  sleutel: DashboardSleutel;
  label: string;
  module: ModuleSleutel;
  veld: keyof DashboardBron;
}[] = [
  { sleutel: 'nieuwe_aanvragen', label: 'Nieuwe aanvragen', module: 'aanvragen', veld: 'nieuweAanvragen' },
  { sleutel: 'opties_bijna_verlopen', label: 'Opties bijna verlopen', module: 'boekingen', veld: 'optiesBijnaVerlopen' },
  { sleutel: 'opties_verlopen', label: 'Opties verlopen', module: 'boekingen', veld: 'optiesVerlopen' },
  { sleutel: 'aanbetalingen_controleren', label: 'Aanbetaling check', module: 'finance', veld: 'aanbetalingenControleren' },
  { sleutel: 'activiteit_mist_content', label: 'Mist content', module: 'agenda', veld: 'activiteitMistContent' },
  { sleutel: 'communicatie_klaar', label: 'Mail klaar', module: 'templates', veld: 'communicatieKlaar' },
  { sleutel: 'nieuwsbrief_voorbereiden', label: 'Nieuwsbrief voorbereiden', module: 'nieuwsbrief', veld: 'nieuwsbriefVoorbereiden' },
  { sleutel: 'activiteiten_7_dagen', label: 'Komende 7 dagen', module: 'kalender', veld: 'activiteiten7Dagen' },
  { sleutel: 'gastheren_toewijzen', label: 'Gastheer toewijzen', module: 'planning', veld: 'gastherenToewijzen' },
  { sleutel: 'mail_fout', label: 'Technische verzending mislukt', module: 'templates', veld: 'mailFout' },
];

export function dashboardVoor(rechten: GebruikerRechten, bron: DashboardBron): DashboardItem[] {
  return DEFINITIE.filter((item) => magZien(rechten, item.module) && bron[item.veld] > 0).map((item) => ({
    sleutel: item.sleutel,
    label: item.label,
    aantal: bron[item.veld],
    module: item.module,
  }));
}
