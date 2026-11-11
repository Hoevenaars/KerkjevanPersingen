/**
 * Zichtbare akkoordstatus. Een ontbrekende waarde blijft onbekend.
 * Niet-exposities die vroeger `false` kregen, tonen geen expliciet nee.
 */

export function labelGastheer(soort: string | null | undefined): 'Expositiebegeleider' | 'Gastheer' {
  return (soort ?? '').trim().toLowerCase() === 'expositie' ? 'Expositiebegeleider' : 'Gastheer';
}

export function labelAkkoordVoorwaarden(soort: string, waarde: boolean | null | undefined): 'Ja' | 'Nee' | '-' {
  if (waarde === true) return 'Ja';
  if (waarde === false && soort === 'expositie') return 'Nee';
  return '-';
}

export const AANVRAAG_SORTERING = ['naam', 'soort', 'datum', 'binnen', 'voorwaarden', 'status'] as const;

export type AanvraagSortering = (typeof AANVRAAG_SORTERING)[number];

const STATUS_RANG: Record<string, number> = {
  nieuw: 0,
  in_behandeling: 1,
  wacht_op_aanvrager: 2,
  goedgekeurd: 3,
  afgewezen: 4,
  gesloten: 5,
};

export interface SorteerbareAanvraag {
  naam: string;
  soort: string;
  start: string;
  eind: string;
  binnengekomen: string;
  akkoordVoorwaarden?: boolean | null;
  status: string;
}

export function leesAanvraagSortering(waarde: string | null): AanvraagSortering | null {
  if (waarde && (AANVRAAG_SORTERING as readonly string[]).includes(waarde)) return waarde as AanvraagSortering;
  return null;
}

export function sorteerAanvragen<T extends SorteerbareAanvraag>(
  lijst: readonly T[],
  sort: AanvraagSortering | null,
  dir: 'asc' | 'desc',
  soortLabel: (soort: string) => string = (soort) => soort,
): T[] {
  if (!sort) return [...lijst];
  const factor = dir === 'desc' ? -1 : 1;
  return lijst
    .map((aanvraag, index) => ({ aanvraag, index }))
    .sort((a, b) => {
      const uit = vergelijkAanvraag(a.aanvraag, b.aanvraag, sort, soortLabel);
      if (uit !== 0) return uit * factor;
      return a.index - b.index;
    })
    .map((item) => item.aanvraag);
}

function vergelijkAanvraag(
  a: SorteerbareAanvraag,
  b: SorteerbareAanvraag,
  sort: AanvraagSortering,
  soortLabel: (soort: string) => string,
): number {
  if (sort === 'naam') return a.naam.localeCompare(b.naam, 'nl', { sensitivity: 'base' });
  if (sort === 'soort') return soortLabel(a.soort).localeCompare(soortLabel(b.soort), 'nl', { sensitivity: 'base' });
  if (sort === 'datum') return a.start.localeCompare(b.start) || a.eind.localeCompare(b.eind);
  if (sort === 'binnen') return (a.binnengekomen || '').localeCompare(b.binnengekomen || '');
  if (sort === 'voorwaarden') {
    return labelAkkoordVoorwaarden(a.soort, a.akkoordVoorwaarden).localeCompare(
      labelAkkoordVoorwaarden(b.soort, b.akkoordVoorwaarden),
      'nl',
    );
  }
  return (STATUS_RANG[a.status] ?? 9) - (STATUS_RANG[b.status] ?? 9);
}
