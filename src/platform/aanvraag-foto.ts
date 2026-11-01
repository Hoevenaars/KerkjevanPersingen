/**
 * Foto's van werk bij een expositie-aanvraag.
 * Alleen gangbare afbeeldingen, met een gegenereerde naam in een privé-pad.
 */

export const AANVRAAG_FOTO_BUCKET = 'aanvraag-fotos';
export const AANVRAAG_FOTO_MAX_BYTES = 8_000_000;
export const AANVRAAG_FOTO_MAX_AANTAL = 8;

const EXTENSIE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export type AanvraagFotoMime = keyof typeof EXTENSIE;

export function mimeUitBytes(bytes: Uint8Array): AanvraagFotoMime | null {
  if (magicKlopt(bytes, 'image/jpeg')) return 'image/jpeg';
  if (magicKlopt(bytes, 'image/png')) return 'image/png';
  if (magicKlopt(bytes, 'image/webp')) return 'image/webp';
  return null;
}

export function valideerAanvraagFoto(bestand: { type: string; size: number; bytes?: Uint8Array }): { ok: true; mime: AanvraagFotoMime } | { ok: false; reden: string } {
  if (bestand.size <= 0) return { ok: false, reden: 'Het bestand is leeg.' };
  if (bestand.size > AANVRAAG_FOTO_MAX_BYTES) return { ok: false, reden: 'Een foto mag maximaal 8 MB zijn.' };
  if (bestand.bytes) {
    const mime = mimeUitBytes(bestand.bytes);
    if (!mime) return { ok: false, reden: 'Dit bestand is geen geldige afbeelding. Gebruik een JPG, PNG of WebP.' };
    return { ok: true, mime };
  }
  const mime = bestand.type.trim().toLowerCase();
  if (!(mime in EXTENSIE)) return { ok: false, reden: 'Gebruik een JPG, PNG of WebP.' };
  return { ok: true, mime: mime as AanvraagFotoMime };
}

export function aanvraagFotoPad(aanvraagId: number, token: string, id: string, mime: AanvraagFotoMime): string {
  if (!Number.isInteger(aanvraagId) || aanvraagId <= 0) return '';
  if (!/^[0-9a-f-]{36}$/i.test(token) || !/^[0-9a-f-]{36}$/i.test(id)) return '';
  return `aanvragen/${aanvraagId}/${token.toLowerCase()}/${id.toLowerCase()}.${EXTENSIE[mime]}`;
}

export function schoneBestandsnaam(naam: string): string {
  const basis = naam.split(/[/\\]/).pop() ?? 'foto';
  const schoon = basis.replace(/[^\w.\- ()]/g, '').trim().slice(0, 120);
  return schoon || 'foto';
}

function magicKlopt(bytes: Uint8Array, mime: AanvraagFotoMime): boolean {
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png') {
    return bytes.length >= 8
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (bytes.length < 12) return false;
  const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  return riff === 'RIFF' && webp === 'WEBP';
}
