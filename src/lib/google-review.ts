/**
 * Eén plek voor de Google Review-link van het Kerkje.
 * Leeg zetten via GOOGLE_REVIEW_URL schakelt alleen de knop uit.
 */

export const GOOGLE_REVIEW_URL = 'https://g.page/r/CSLmnnQtTu-CEBM/review';

export function googleReviewUrl(env: Record<string, unknown> = process.env): string {
  if (Object.prototype.hasOwnProperty.call(env, 'GOOGLE_REVIEW_URL')) {
    return String(env.GOOGLE_REVIEW_URL ?? '').trim();
  }
  return GOOGLE_REVIEW_URL;
}
