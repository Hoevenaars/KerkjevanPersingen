/**
 * Sanity met een API-token levert concepten (`drafts.x`) én gepubliceerde
 * documenten. Zonder deze keuze blokkeert een ongepubliceerde datumwijziging
 * de live kalender, terwijl Studio de gepubliceerde datum toont.
 *
 * Alleen-concept (nog nooit gepubliceerd) blijft staan — anders verdwijnen
 * exposities die het bestuur wel in de agenda ziet maar nog niet op Publish
 * heeft gedrukt.
 */
export function kiesGepubliceerdeActiviteit<T extends { _id: string; _originalId?: string }>(docs: readonly T[]): T[] {
  const gekozen = new Map<string, T>();
  for (const doc of docs) {
    const isDraft = isConceptDocument(doc);
    const publishedId = gepubliceerdId(conceptBronId(doc));
    const bestaande = gekozen.get(publishedId);
    if (!bestaande) {
      gekozen.set(publishedId, doc);
      continue;
    }
    const bestaandeIsDraft = isConceptDocument(bestaande);
    if (bestaandeIsDraft && !isDraft) gekozen.set(publishedId, doc);
  }
  return [...gekozen.values()];
}

export function isConceptId(id: string): boolean {
  return id.startsWith('drafts.') || id.startsWith('versions.');
}

export function gepubliceerdId(id: string): string {
  if (id.startsWith('drafts.')) return id.slice('drafts.'.length);
  if (id.startsWith('versions.')) {
    const delen = id.split('.');
    return delen.slice(2).join('.') || id;
  }
  return id;
}

function conceptBronId(item: { _id: string; _originalId?: string }): string {
  return item._originalId && isConceptId(item._originalId) ? item._originalId : item._id;
}

function isConceptDocument(item: { _id: string; _originalId?: string }): boolean {
  return isConceptId(item._id) || Boolean(item._originalId && isConceptId(item._originalId));
}

/**
 * Wat de publieke verhuurkalender mag blokkeren.
 *
 * - Publiek: altijd, ook als het nog een concept is (staat al in de agenda).
 * - Alleen bezet: alleen ná Publish. Een concept "alleen bezet" is intern werk.
 *
 * `_originalId` telt mee: bij perspective `drafts` / `previewDrafts` heeft het
 * document geen `drafts.`-voorvoegsel meer op `_id`.
 */
export function teltVoorPubliekeKalender(item: {
  _id: string;
  _originalId?: string;
  zichtbaarheid?: string;
}): boolean {
  if (item.zichtbaarheid === 'publiek') return true;
  if (item.zichtbaarheid === 'bezet' && !isConceptDocument(item)) return true;
  return false;
}

export function activiteitenVoorKalender<T extends { _id: string; _originalId?: string; zichtbaarheid?: string }>(
  docs: readonly T[],
): T[] {
  return kiesGepubliceerdeActiviteit(docs).filter(teltVoorPubliekeKalender);
}

/** Gepubliceerde bezetting + wat bezoekers in de agenda zien (publieke concepten). */
export function mergeKalenderBronnen<T extends { _id: string; slug?: string | null }>(
  gepubliceerd: readonly T[],
  agenda: readonly T[],
): T[] {
  const byKey = new Map<string, T>();
  const key = (item: T) => item.slug || gepubliceerdId(item._id);
  for (const item of gepubliceerd) byKey.set(key(item), item);
  for (const item of agenda) {
    const k = key(item);
    if (!byKey.has(k)) byKey.set(k, item);
  }
  return [...byKey.values()];
}
