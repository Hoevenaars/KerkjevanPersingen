/**
 * Activiteiten die de publieke site nu toont.
 * Zelfde poort als de agenda: publiek, niet geannuleerd, binnen 8 weken.
 */

import { nuZichtbaarOpWebsite } from '../lib/agenda-zichtbaarheid.ts';

export interface WebsiteAgendaBron {
  titel: string;
  start: string;
  eind: string;
  tabel?: 'publieke_activiteiten' | 'activiteit_bron' | 'boekingen';
  publicatiestatus?: 'publiek' | 'bezet' | 'verborgen' | null;
  levenscyclus?: 'actief' | 'geannuleerd';
  trigger?: string | null;
}

export function activiteitenOpWebsite<T extends WebsiteAgendaBron>(
  lijst: readonly T[],
  vandaag: string,
  nu = new Date(),
): T[] {
  return lijst
    .filter((item) =>
      nuZichtbaarOpWebsite({
        zichtbaarheid: item.publicatiestatus,
        geannuleerd: item.levenscyclus === 'geannuleerd',
        start: item.start,
        eind: item.eind || item.start,
        trigger: item.trigger,
        vandaag,
        viaPubliekeAgenda: item.tabel === 'publieke_activiteiten',
        nu,
      }),
    )
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start) || a.titel.localeCompare(b.titel, 'nl'));
}
