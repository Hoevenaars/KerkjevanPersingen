/** Flyer van de expositie, in de site. Geldt alleen zolang de activiteit zelf nog geen foto heeft. */
export const NATUURLIJK_SLUG = 'petra-crielaard-en-marjon-meulenbrugge';
export const NATUURLIJK_FLYER = '/foto/exposities/natuurlijk-in-het-kwadraat-flyer.jpg';
export const NATUURLIJK_FLYER_ABSOLUUT = `https://kerkjepersingen.nl${NATUURLIJK_FLYER}`;

export function natuurlijkFlyer(
  activiteit: { slug?: string | null; foto?: unknown } | null | undefined,
  opties: { absoluut?: boolean } = {},
): string | null {
  if (activiteit?.slug !== NATUURLIJK_SLUG) return null;
  if (typeof activiteit.foto === 'string' && activiteit.foto.trim()) return null;
  return opties.absoluut ? NATUURLIJK_FLYER_ABSOLUUT : NATUURLIJK_FLYER;
}
