import type { Activiteit } from './sanity';

/** Vaste content tot de boeking in Sanity staat — zelfde tekst als scripts/seed-second-nature.ts */
export const SECOND_NATURE: Activiteit = {
  _id: 'fallback-second-nature',
  slug: 'second-nature',
  interneTitel: 'Expositie: Second Nature',
  publiekeTitel: 'Second Nature',
  start: '2026-10-03T09:00:00.000Z',
  eind: '2026-10-04T16:00:00.000Z',
  soort: 'expositie',
  zichtbaarheid: 'publiek',
  kunstenaars: 'Judith Aardse, Gea van Eck, Monika Loster, Judith Schepers',
  omschrijving:
    'In de tentoonstelling Second Nature onderzoeken Judith Aardse, Gea van Eck, Monika Loster en Judith Schepers de grens tussen natuur en menselijk ingrijpen.',
  contentStatus: 'goedgekeurd',
  aangeleverdeTekst: `In de tentoonstelling Second Nature onderzoeken Judith Aardse, Gea van Eck, Monika Loster en Judith Schepers de grens tussen natuur en menselijk ingrijpen.

Met tekeningen, textielkunst, sculptuur en fotografie brengen de kunstenaars ieder vanuit hun eigen praktijk een andere benadering van het thema samen. Organische vormen, lichamelijkheid, groei, landschap, structuur en transformatie keren op verschillende manieren terug in de werken.

Second Nature gaat niet alleen over natuur als onderwerp, maar ook over de manier waarop wij haar ervaren, nabootsen, veranderen en opnieuw vormgeven. De tentoonstelling nodigt daarmee uit om opnieuw te kijken naar wat wij als natuurlijk beschouwen en naar onze eigen rol daarin.`,
  fotoAlt: 'Expositieposter Second Nature met werk van vier kunstenaars',
};

/** Poster in /public; geen Sanity-asset nodig voor de fallback. */
export const SECOND_NATURE_POSTER = '/foto/exposities/second-nature.jpg';

export function secondNatureFallback(slug: string): Activiteit | null {
  return slug === 'second-nature' ? SECOND_NATURE : null;
}
