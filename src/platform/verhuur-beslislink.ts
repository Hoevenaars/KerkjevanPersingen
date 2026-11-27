/** Server-only capabilities. GET leest; uitsluitend een bevestigde POST beslist. */
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export interface VerhuurBeslislink {
  id: string;
  aanvraag_id: number;
  aanvraag_versie: string;
  ontvanger: string;
  geldig_tot: string;
  token_hash: string;
  verbruikt_op?: string | null;
  ingetrokken_op?: string | null;
  uitkomst?: 'ja' | 'nee' | null;
}

export function beslisGeheim(env: Record<string, unknown>): string {
  const secret = String(env.VERHUUR_BESLUIT_SECRET ?? '');
  if (Buffer.byteLength(secret) < 32) throw new Error('De beveiligde bestuurslink is nog niet ingericht.');
  return secret;
}

function veiligGelijk(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function payload(link: Omit<VerhuurBeslislink, 'token_hash'>): string {
  return JSON.stringify([link.id, link.aanvraag_id, link.aanvraag_versie, link.ontvanger.toLowerCase(), new Date(link.geldig_tot).toISOString()]);
}

export function beslisToken(link: Omit<VerhuurBeslislink, 'token_hash'>, secret: string): string {
  if (Buffer.byteLength(secret) < 32) throw new Error('Onvoldoende beveiligde beslissleutel.');
  const sig = createHmac('sha256', secret).update(payload(link)).digest('base64url');
  return `${link.id}.${sig}`;
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function nieuweBeslislink(input: { aanvraagId: number; versie: string; ontvanger: string; secret: string; nu?: Date; dagen?: number }): VerhuurBeslislink {
  const nu = input.nu ?? new Date();
  const link = {
    id: randomUUID(), aanvraag_id: input.aanvraagId, aanvraag_versie: input.versie,
    ontvanger: input.ontvanger.trim().toLowerCase(),
    geldig_tot: new Date(nu.getTime() + (input.dagen ?? 14) * 86400000).toISOString(),
  };
  return { ...link, token_hash: tokenHash(beslisToken(link, input.secret)) };
}

export function geldigeBeslislink(link: VerhuurBeslislink | null, token: string, secret: string, nu = new Date()): boolean {
  if (!link || token.length > 160 || !/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(token) || link.ingetrokken_op) return false;
  if (!Number.isFinite(new Date(link.geldig_tot).getTime()) || new Date(link.geldig_tot) <= nu) return false;
  try { return veiligGelijk(beslisToken(link, secret), token) && veiligGelijk(tokenHash(token), link.token_hash); }
  catch { return false; }
}

export function bevestigingsBewijs(secret: string, hash: string, aanvraagVersie: string, bronVersie: string): string {
  return createHmac('sha256', secret).update(JSON.stringify(['bevestiging-v1', hash, aanvraagVersie, bronVersie])).digest('base64url');
}

export function geldigBevestigingsBewijs(bewijs: string, secret: string, hash: string, aanvraagVersie: string, bronVersie: string): boolean {
  return veiligGelijk(bewijs, bevestigingsBewijs(secret, hash, aanvraagVersie, bronVersie));
}

/** Hele euro's, komma of punt als decimaal; geen exponent, afronding of impliciete nul. */
export function leesBestuursPrijs(waarde: unknown): number | null {
  const raw = String(waarde ?? '').trim().replace(/^€\s*/, '');
  const schoon = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(raw) ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(',', '.');
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(schoon)) return null;
  const [euro, decimalen = ''] = schoon.split('.');
  const cent = Number(euro) * 100 + Number(decimalen.padEnd(2, '0'));
  return Number.isSafeInteger(cent) && cent > 0 && cent <= 9999999999 ? cent : null;
}

export function verhuurMachineAan(env: Record<string, unknown>): boolean {
  return env.VERHUUR_MACHINE === 'true';
}

export function verhuurBasisUrl(env: Record<string, unknown>): string {
  const url = new URL(String(env.VERHUUR_BASIS_URL || 'https://kerkjepersingen.nl'));
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) {
    throw new Error('Een veilige basis-URL ontbreekt.');
  }
  if (url.username || url.password || url.search || url.hash) throw new Error('Ongeldige basis-URL.');
  return url.origin;
}
