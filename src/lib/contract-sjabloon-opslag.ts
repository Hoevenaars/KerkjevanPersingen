/**
 * Het contractsjabloon staat in de documentenbucket.
 * Zonder bestand blijft de platte contract-PDF de uitvoer.
 */

import { maakBeheerAdminClient } from './supabase.ts';
import { leesSjabloonVelden } from '../platform/documenten/pdf-sjabloon.ts';

export const CONTRACT_SJABLOON_BUCKET = 'booking-documents';
export const CONTRACT_SJABLOON_PAD = 'sjablonen/huurovereenkomst.pdf';

const MAX_BYTES = 5_000_000;

type Opslag = {
  storage: {
    from(bucket: string): {
      download(pad: string): Promise<{ data: Blob | null; error: { message: string } | null }>;
      upload(pad: string, body: Uint8Array, opties: { contentType: string; upsert: boolean }): Promise<{ error: { message: string } | null }>;
      remove(paden: string[]): Promise<{ error: { message: string } | null }>;
    };
  };
};

export interface SjabloonStand {
  bytes: Uint8Array | null;
  fout: string | null;
}

function clientUit(env?: Record<string, unknown>): Opslag | null {
  return maakBeheerAdminClient(env) as unknown as Opslag | null;
}

function ontbreekt(bericht: string): boolean {
  return /not found|404|nosuch|does not exist/i.test(bericht);
}

export async function leesContractSjabloon(env: Record<string, unknown> = process.env): Promise<SjabloonStand> {
  const client = clientUit(env);
  if (!client?.storage?.from) return { bytes: null, fout: null };
  const { data, error } = await client.storage.from(CONTRACT_SJABLOON_BUCKET).download(CONTRACT_SJABLOON_PAD);
  if (error) {
    if (ontbreekt(error.message)) return { bytes: null, fout: null };
    return { bytes: null, fout: 'Het contractsjabloon is niet gelezen. Er is geen PDF gemaakt.' };
  }
  if (!data) return { bytes: null, fout: null };
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.byteLength < 800 || String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') {
    return { bytes: null, fout: 'Het opgeslagen contractsjabloon is geen geldige PDF. Er is geen PDF gemaakt.' };
  }
  return { bytes, fout: null };
}

export function controleerContractSjabloon(bytes: Uint8Array): string | null {
  if (bytes.byteLength < 800) return 'Het bestand is te klein voor een PDF-sjabloon.';
  if (bytes.byteLength > MAX_BYTES) return 'Het sjabloon is groter dan 5 MB.';
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') return 'Het bestand is geen PDF.';
  const staart = Buffer.from(bytes.subarray(Math.max(0, bytes.byteLength - 1024))).toString('latin1');
  if (!staart.includes('%%EOF')) return 'Het bestand is geen volledige PDF.';
  return null;
}

export async function bewaarContractSjabloon(
  bytes: Uint8Array,
  env: Record<string, unknown> = process.env,
): Promise<{ ok: true; bekende: string[]; onbekend: string[] } | { ok: false; melding: string }> {
  const vorm = controleerContractSjabloon(bytes);
  if (vorm) return { ok: false, melding: vorm };
  const gelezen = await leesSjabloonVelden(bytes);
  if (gelezen.fout) return { ok: false, melding: gelezen.fout };
  const client = clientUit(env);
  if (!client?.storage?.from) return { ok: false, melding: 'Geen databaseclient. Er is niets opgeslagen.' };
  const upload = await client.storage.from(CONTRACT_SJABLOON_BUCKET).upload(CONTRACT_SJABLOON_PAD, bytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (upload.error) return { ok: false, melding: 'Het sjabloon is niet opgeslagen.' };
  return { ok: true, bekende: gelezen.bekende, onbekend: gelezen.onbekend };
}

export async function verwijderContractSjabloon(
  env: Record<string, unknown> = process.env,
): Promise<{ ok: true } | { ok: false; melding: string }> {
  const client = clientUit(env);
  if (!client?.storage?.from) return { ok: false, melding: 'Geen databaseclient. Er is niets verwijderd.' };
  const weg = await client.storage.from(CONTRACT_SJABLOON_BUCKET).remove([CONTRACT_SJABLOON_PAD]);
  if (weg.error) return { ok: false, melding: 'Het sjabloon is niet verwijderd.' };
  return { ok: true };
}
