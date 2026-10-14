/**
 * Tokenportaal voor één dossier. De exposant publiceert niet en ziet geen andere dossiers.
 */

export interface PortaalToken {
  hash: string;
  doel: string;
  boekingId: string | null;
  verlooptOp: string;
  ingetrokkenOp: string | null;
}

export type PortaalWeigering = 'ontbreekt' | 'ongeldig' | 'verlopen' | 'ingetrokken' | 'verkeerd_dossier' | 'te_vaak';

export function beoordeelPortaalToken(
  token: PortaalToken | null,
  nu: Date,
): { ok: true; boekingId: string } | { ok: false; reden: PortaalWeigering } {
  if (!token) return { ok: false, reden: 'ongeldig' };
  if (token.ingetrokkenOp) return { ok: false, reden: 'ingetrokken' };
  if (token.doel !== 'content' || !token.boekingId) return { ok: false, reden: 'verkeerd_dossier' };
  if (new Date(token.verlooptOp).getTime() <= nu.getTime()) return { ok: false, reden: 'verlopen' };
  return { ok: true, boekingId: token.boekingId };
}

export interface Aanlevering {
  titel: string;
  korteTekst: string;
  langeTekst: string;
  praktisch: string;
  hoofdafbeelding: boolean;
  extraFotos: number;
}

const BEELD = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function valideerAanlevering(input: Aanlevering): { ok: true } | { ok: false; reden: string } {
  if (!input.titel.trim()) return { ok: false, reden: 'Titel is verplicht.' };
  if (input.titel.trim().length > 180) return { ok: false, reden: 'Titel is te lang.' };
  if (!input.korteTekst.trim() && !input.langeTekst.trim()) return { ok: false, reden: 'Korte of lange tekst is verplicht.' };
  if (input.korteTekst.length > 400) return { ok: false, reden: 'Korte tekst is te lang.' };
  if (input.langeTekst.length > 8000) return { ok: false, reden: 'Lange tekst is te lang.' };
  if (input.extraFotos < 0 || input.extraFotos > 12) return { ok: false, reden: 'Te veel extra foto’s.' };
  return { ok: true };
}

export function uploadToegestaan(mime: string, bytes: number): boolean {
  return BEELD.has(mime) && bytes > 0 && bytes <= 8_000_000;
}

export function portaalMagPubliceren(): false {
  return false;
}

const treffers = new Map<string, number[]>();

export function portaalTeVaak(sleutel: string, nu = Date.now(), max = 8, vensterMs = 15 * 60 * 1000): boolean {
  const eerder = (treffers.get(sleutel) ?? []).filter((moment) => nu - moment < vensterMs);
  eerder.push(nu);
  treffers.set(sleutel, eerder);
  return eerder.length > max;
}

export function resetPortaalLimiet(): void {
  treffers.clear();
}
