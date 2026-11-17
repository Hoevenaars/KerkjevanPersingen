/**
 * De rechteneditor volgt de hoofdnavigatie.
 * Een sectie met onderdelen heeft een kop: lezen of schrijven zet elk onderdeel
 * op dat niveau. Verborgen laat de onderdelen los van elkaar.
 * Overzicht en Financiën hebben geen onderdelen; daar is de kop het recht zelf.
 */

import { MODULES } from './modules.ts';
import type { ModuleSleutel, Rechtniveau } from './types.ts';
import type { RechtenMatrix } from './rollen.ts';

export interface RechtenOnderdeel {
  id: string;
  label: string;
  module: ModuleSleutel;
}

export interface RechtenSectie {
  id: string;
  label: string;
  toelichting?: string;
  /** Gezet als de sectie zelf het recht is. */
  module?: ModuleSleutel;
  onderdelen: readonly RechtenOnderdeel[];
}

export const RECHTEN_SECTIES: readonly RechtenSectie[] = [
  {
    id: 'overzicht',
    label: 'Overzicht',
    toelichting: 'Het overzicht past zich aan deze rol aan. Alleen onderdelen met lezen of schrijven komen daarop terug.',
    module: 'dashboard',
    onderdelen: [],
  },
  {
    id: 'verhuur',
    label: 'Verhuur',
    onderdelen: [
      { id: 'verhuuragenda', label: 'Verhuuragenda', module: 'boekingen' },
      { id: 'aanvragen', label: 'Aanvragen', module: 'aanvragen' },
      { id: 'handmatige-boeking', label: 'Handmatige boeking', module: 'handmatige_boeking' },
      { id: 'gastbegeleiders', label: 'Gastbegeleiders', module: 'planning' },
      { id: 'kalender', label: 'Kalender', module: 'kalender' },
    ],
  },
  {
    id: 'website',
    label: 'Website',
    onderdelen: [
      { id: 'website-agenda', label: 'Website Agenda', module: 'agenda' },
      { id: 'banner', label: 'Banner', module: 'website_banner' },
      { id: 'extra-balk', label: 'Extra balk', module: 'website_extra_balk' },
      { id: 'analytics', label: 'Analytics', module: 'analytics' },
    ],
  },
  {
    id: 'contacten',
    label: 'Contacten',
    onderdelen: [
      { id: 'relaties', label: 'Relaties', module: 'relaties' },
      { id: 'vrienden', label: 'Vrienden', module: 'vrienden' },
      { id: 'nieuwsbrief', label: 'Nieuwsbrief', module: 'nieuwsbrief' },
      { id: 'reservelijst', label: 'Reserve lijst', module: 'reservelijst' },
    ],
  },
  {
    id: 'financien',
    label: 'Financiën',
    module: 'finance',
    onderdelen: [],
  },
  {
    id: 'instellingen',
    label: 'Instellingen',
    onderdelen: [
      { id: 'algemeen', label: 'Algemeen', module: 'instellingen' },
      { id: 'verhuurinstellingen', label: 'Verhuur', module: 'verhuur_instellingen' },
      { id: 'contractsjabloon', label: 'Contractsjabloon', module: 'contractsjabloon' },
      { id: 'finance-instellingen', label: 'Financiële instellingen', module: 'finance_instellingen' },
      { id: 'gastheren', label: 'Expositiebegeleiders', module: 'gastheerbeheer' },
      { id: 'gebruikers', label: 'Gebruikers en rechten', module: 'gebruikers' },
      { id: 'automatiseringen', label: 'Automatiseringen', module: 'automatiseringen' },
      { id: 'mailtemplates', label: 'Mailtemplates', module: 'templates' },
      { id: 'systeem', label: 'Systeem', module: 'systeembeheer' },
      { id: 'migratie', label: 'Migratie', module: 'migratie' },
    ],
  },
];

/** Deze modules staan niet apart in de editor. Ze volgen Algemeen. */
export const MEELOPENDE_MODULES: Partial<Record<ModuleSleutel, ModuleSleutel>> = {
  algemene_instellingen: 'instellingen',
  bridge: 'instellingen',
};

export function sectieOpId(id: string): RechtenSectie | null {
  return RECHTEN_SECTIES.find((sectie) => sectie.id === id) ?? null;
}

export function modulesVanSectie(sectie: RechtenSectie): ModuleSleutel[] {
  if (sectie.onderdelen.length === 0 && sectie.module) return [sectie.module];
  return sectie.onderdelen.map((onderdeel) => onderdeel.module);
}

/** Eén niveau als elk onderdeel gelijk is. Anders null: de kop is niet gekozen. */
export function niveauVanKop(niveaus: readonly Rechtniveau[]): Rechtniveau | null {
  const eerste = niveaus[0];
  if (!eerste) return 'verborgen';
  return niveaus.every((niveau) => niveau === eerste) ? eerste : null;
}

function isNiveau(waarde: unknown): waarde is Rechtniveau {
  return waarde === 'verborgen' || waarde === 'lezen' || waarde === 'schrijven';
}

export function matrixVanFormulier(data: Iterable<[string, FormDataEntryValue]>): RechtenMatrix {
  const matrix: RechtenMatrix = {};
  const koppen = new Map<string, Rechtniveau>();
  for (const [naam, waarde] of data) {
    if (!isNiveau(waarde)) continue;
    if (naam.startsWith('kop_')) {
      koppen.set(naam.slice('kop_'.length), waarde);
      continue;
    }
    if (!naam.startsWith('recht_')) continue;
    const module = naam.slice('recht_'.length);
    if (!MODULES.includes(module as (typeof MODULES)[number])) continue;
    matrix[module] = waarde;
  }
  for (const [id, niveau] of koppen) {
    if (niveau === 'verborgen') continue;
    const sectie = sectieOpId(id);
    if (!sectie) continue;
    for (const module of modulesVanSectie(sectie)) matrix[module] = niveau;
  }
  for (const [doel, bron] of Object.entries(MEELOPENDE_MODULES) as Array<[ModuleSleutel, ModuleSleutel]>) {
    const niveau = matrix[bron];
    if (niveau) matrix[doel] = niveau;
  }
  return matrix;
}
