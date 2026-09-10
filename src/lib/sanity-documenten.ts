/**
 * Sanity met een API-token levert concepten (`drafts.x`) én gepubliceerde
 * documenten. Zonder deze keuze blokkeert een ongepubliceerde datumwijziging
 * de live kalender, terwijl Studio de gepubliceerde datum toont.
 *
 * Alleen-concept (nog nooit gepubliceerd) blijft staan — anders verdwijnen
 * exposities die het bestuur wel in de agenda ziet maar nog niet op Publish
 * heeft gedrukt.
 */
export function kiesGepubliceerdeActiviteit<T extends { _id: string }>(docs: readonly T[]): T[] {
  const gekozen = new Map<string, T>();
  for (const doc of docs) {
    const isDraft = doc._id.startsWith('drafts.');
    const publishedId = isDraft ? doc._id.slice('drafts.'.length) : doc._id;
    const bestaande = gekozen.get(publishedId);
    if (!bestaande) {
      gekozen.set(publishedId, doc);
      continue;
    }
    const bestaandeIsDraft = bestaande._id.startsWith('drafts.');
    if (bestaandeIsDraft && !isDraft) gekozen.set(publishedId, doc);
  }
  return [...gekozen.values()];
}

/**
 * Wat de publieke verhuurkalender mag blokkeren.
 *
 * - Publiek: altijd, ook als het nog een concept is (staat al in de agenda).
 * - Alleen bezet: alleen ná Publish. Een concept "alleen bezet" is intern werk;
 *   in Studio lijkt het weekend vrij, op de site stond het alsnog grijs.
 */
export function teltVoorPubliekeKalender(item: {
  _id: string;
  zichtbaarheid?: string;
}): boolean {
  if (item.zichtbaarheid === 'publiek') return true;
  if (item.zichtbaarheid === 'bezet' && !item._id.startsWith('drafts.')) return true;
  return false;
}

export function activiteitenVoorKalender<T extends { _id: string; zichtbaarheid?: string }>(
  docs: readonly T[],
): T[] {
  return kiesGepubliceerdeActiviteit(docs).filter(teltVoorPubliekeKalender);
}
