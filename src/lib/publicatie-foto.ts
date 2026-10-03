/**
 * Eigen publicatiefoto's gaan naar de publieke bucket public-media.
 * Een leeg veld blijft de standaardafbeelding; upload wijzigt geen zichtbaarheid.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { STANDAARD_SUPABASE_URL } from './supabase-project.ts';

export const PUBLICATIE_FOTO_MAX = 10 * 1024 * 1024;
const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

export function mimeVanPublicatieFoto(bestand: { type: string; name: string }): string | null {
  const type = bestand.type.trim().toLowerCase();
  if (Object.values(MIME).includes(type)) return type;
  const ext = bestand.name.split('.').pop()?.toLowerCase() ?? '';
  return MIME[ext] ?? null;
}

export function publicatieFotoGeldig(bestand: { type: string; name: string; size: number }): { ok: true; mime: string } | { ok: false; melding: string } {
  if (bestand.size <= 0) return { ok: false, melding: 'Het gekozen bestand is leeg.' };
  if (bestand.size > PUBLICATIE_FOTO_MAX) return { ok: false, melding: 'De afbeelding is groter dan 10 MB.' };
  const mime = mimeVanPublicatieFoto(bestand);
  if (!mime) return { ok: false, melding: 'Gebruik een JPEG, PNG, WebP of GIF vanaf je computer.' };
  return { ok: true, mime };
}

export function publicatieFotoPad(id: string, naam: string, nu = Date.now()): string {
  const ext = naam.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const veilig = id.replace(/[^a-zA-Z0-9-]/g, '') || 'activiteit';
  return `publicaties/${veilig}-${nu}.${MIME[ext] ? ext : 'jpg'}`;
}

export function publiekeMediaUrl(pad: string, basis = STANDAARD_SUPABASE_URL): string {
  const schoon = pad.replace(/^\/+/, '');
  return `${basis.replace(/\/$/, '')}/storage/v1/object/public/public-media/${schoon}`;
}

export function leesbarePublicatieFout(tekst: string): string {
  if (/invalid api key|unauthorized_invalid_api_key|PGRST301/i.test(tekst)) {
    return 'Publiceren lukt niet: Supabase weigert de beheersleutel. Er is niets opgeslagen en er is geen mail verstuurd.';
  }
  if (/permission denied|42501/i.test(tekst)) {
    return 'Geen recht om deze publicatie op te slaan. Er is geen mail verstuurd.';
  }
  const melding = tekst.trim();
  return melding || 'Publiceren mislukt.';
}

export async function uploadPublicatieFoto(
  client: SupabaseClient,
  bestand: { type: string; name: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> },
  id: string,
  basisUrl = STANDAARD_SUPABASE_URL,
): Promise<{ ok: boolean; fotoPad: string; melding: string }> {
  const check = publicatieFotoGeldig(bestand);
  if (!check.ok) return { ok: false, fotoPad: '', melding: check.melding };
  const pad = publicatieFotoPad(id, bestand.name);
  const bytes = new Uint8Array(await bestand.arrayBuffer());
  const { error } = await client.storage.from('public-media').upload(pad, bytes, {
    contentType: check.mime,
    upsert: false,
  });
  if (error) {
    return { ok: false, fotoPad: '', melding: `De afbeelding is niet opgeslagen. ${leesbarePublicatieFout(error.message)}` };
  }
  return { ok: true, fotoPad: publiekeMediaUrl(pad, basisUrl), melding: 'Afbeelding opgeslagen.' };
}
