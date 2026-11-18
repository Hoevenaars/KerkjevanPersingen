/** Documenten met een uitgegeven factuurnummer of contractversie zijn onveranderlijk.
 * Herhaalde requests mogen bestaande bytes alleen hergebruiken, nooit overschrijven.
 */
import { createHash } from 'node:crypto';

type Fout = { message?: string; statusCode?: string | number; code?: string } | null;

export interface PdfBucket {
  upload(pad: string, inhoud: Uint8Array, opties: { contentType: string; upsert: boolean }): Promise<{ error: Fout }>;
  download?(pad: string): Promise<{ data: { arrayBuffer(): Promise<ArrayBuffer> } | null; error: Fout }>;
}

function hash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function bewaarOnveranderlijkePdf(
  bucket: PdfBucket,
  pad: string,
  inhoud: Uint8Array,
): Promise<{ ok: true; bestaand: boolean } | { ok: false; melding: string }> {
  if (!/^([a-z0-9_-]+\/)+[a-zA-Z0-9_-]+(?:-[a-zA-Z0-9_-]+)*\.pdf$/i.test(pad) ||
      inhoud.byteLength < 100 || inhoud.byteLength > 8_000_000 ||
      Buffer.from(inhoud.subarray(0, 5)).toString('ascii') !== '%PDF-') {
    return { ok: false, melding: 'PDF-naam of inhoud is ongeldig; niets opgeslagen.' };
  }
  try {
    const upload = await bucket.upload(pad, inhoud, { contentType: 'application/pdf', upsert: false });
    if (!upload.error) return { ok: true, bestaand: false };
    // Ook na een netwerkfout kan de opslag wél zijn gelukt. Vergelijk de bytes
    // voor we veilig verder mogen. Een verschil mag nooit worden overschreven.
    if (!bucket.download) return { ok: false, melding: 'Opslag kon niet bevestigd worden. Controleer het bestaande PDF-bestand.' };
    const controle = await bucket.download(pad);
    if (controle.error || !controle.data) return { ok: false, melding: 'Opslag niet aantoonbaar geslaagd; documenten blijven onveranderd.' };
    const bestaand = new Uint8Array(await controle.data.arrayBuffer());
    if (hash(bestaand) !== hash(inhoud)) {
      return { ok: false, melding: 'Er bestaat al een ANDERE PDF onder dezelfde contract- of factuuridentiteit. Niet overschrijven; controleer het dossier.' };
    }
    return { ok: true, bestaand: true };
  } catch {
    return { ok: false, melding: 'Opslagstatus onbekend; controleer het dossier voordat opnieuw wordt verzonden.' };
  }
}
