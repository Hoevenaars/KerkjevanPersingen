/**
 * Bewaart werkfoto's bij de aanvraag die zojuist is aangemaakt.
 * Het uploadtoken komt alleen uit die aanmaak en gaat niet naar de browser.
 * Beheer opent de bestanden via een kort geldige signed URL.
 */

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  AANVRAAG_FOTO_BUCKET,
  AANVRAAG_FOTO_MAX_AANTAL,
  aanvraagFotoPad,
  fotoRetryToken,
  schoneBestandsnaam,
  valideerAanvraagFoto,
} from '../platform/aanvraag-foto.ts';
import { supabaseLoginUitOmgeving } from './supabase-project.ts';

export interface FotoInvoer {
  naam: string;
  type: string;
  bytes: Uint8Array;
}

export interface AanvraagFoto {
  id: string;
  naam: string;
  pad: string;
  url: string;
}

function anonClient() {
  const login = supabaseLoginUitOmgeving(process.env, true);
  if (!login) return null;
  return createClient(login.url, login.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function bewaarAanvraagFotos(
  aanvraagId: number,
  token: string,
  bestanden: readonly FotoInvoer[],
): Promise<{ ok: true; namen: string[] } | { ok: false; reden: string }> {
  if (bestanden.length === 0) {
    await sluitAanvraagFotoUpload(aanvraagId, token);
    return { ok: true, namen: [] };
  }
  if (bestanden.length > AANVRAAG_FOTO_MAX_AANTAL) {
    return { ok: false, reden: `Je kunt maximaal ${AANVRAAG_FOTO_MAX_AANTAL} foto's toevoegen.` };
  }
  const supabase = anonClient();
  if (!supabase) return { ok: false, reden: 'De foto’s konden niet worden opgeslagen.' };
  const namen: string[] = [];
  let reden = '';
  for (const bestand of bestanden) {
    const check = valideerAanvraagFoto({ type: bestand.type, size: bestand.bytes.byteLength, bytes: bestand.bytes });
    if (!check.ok) {
      reden = check.reden;
      break;
    }
    const pad = aanvraagFotoPad(aanvraagId, token, randomUUID(), check.mime);
    if (!pad) {
      reden = 'De foto kon niet aan deze aanvraag worden gekoppeld.';
      break;
    }
    const upload = await supabase.storage.from(AANVRAAG_FOTO_BUCKET).upload(pad, bestand.bytes, {
      contentType: check.mime,
      upsert: false,
    });
    if (upload.error) {
      reden = 'De foto kon niet worden opgeslagen.';
      break;
    }
    const registratie = await supabase.rpc('registreer_aanvraag_foto', {
      p_aanvraag_id: aanvraagId,
      p_token: token,
      p_pad: pad,
      p_naam: schoneBestandsnaam(bestand.naam),
      p_mime: check.mime,
      p_bytes: bestand.bytes.byteLength,
    });
    const uit = registratie.data as { ok?: boolean; fout?: string } | null;
    if (registratie.error || !uit?.ok) {
      reden = uit?.fout || 'De foto is niet aan de aanvraag gekoppeld.';
      break;
    }
    namen.push(schoneBestandsnaam(bestand.naam));
  }
  if (reden) {
    return { ok: false, reden: namen.length > 0 ? 'Niet alle foto’s konden worden opgeslagen.' : reden };
  }
  await sluitAanvraagFotoUpload(aanvraagId, token);
  return { ok: true, namen };
}

export interface OpenFotoUpload {
  aanvraagId: number;
  aantal: number;
  resterend: number;
}

export async function leesOpenFotoUpload(token: string): Promise<OpenFotoUpload | null> {
  const supabase = anonClient();
  if (!supabase || !token) return null;
  const antwoord = await supabase.rpc('lees_aanvraag_foto_upload', { p_token: token });
  const uit = jsonObject(antwoord.data);
  const aanvraagId = Number(uit?.aanvraag_id);
  const aantal = Number(uit?.aantal);
  const resterend = Number(uit?.resterend);
  if (antwoord.error || !uit?.ok || !Number.isInteger(aanvraagId) || aanvraagId <= 0) return null;
  if (!Number.isInteger(aantal) || aantal < 0 || !Number.isInteger(resterend) || resterend < 0) return null;
  return { aanvraagId, aantal, resterend };
}

export async function vernieuwAanvraagFotoUpload(
  aanvraagId: number,
  token: string,
): Promise<{ token: string; aantal: number; resterend: number } | null> {
  const supabase = anonClient();
  if (!supabase || !token) return null;
  const antwoord = await supabase.rpc('vernieuw_aanvraag_foto_upload', {
    p_aanvraag_id: aanvraagId,
    p_token: token,
  });
  const uit = jsonObject(antwoord.data);
  const nieuw = fotoRetryToken(typeof uit?.token === 'string' ? uit.token : '');
  const aantal = Number(uit?.aantal);
  const resterend = Number(uit?.resterend);
  if (antwoord.error || !uit?.ok || !nieuw) return null;
  if (!Number.isInteger(aantal) || !Number.isInteger(resterend)) return null;
  return { token: nieuw, aantal, resterend };
}

function jsonObject(waarde: unknown): { ok?: boolean; aanvraag_id?: unknown; aantal?: unknown; resterend?: unknown; token?: unknown } | null {
  if (!waarde || typeof waarde !== 'object' || Array.isArray(waarde)) return null;
  return waarde as { ok?: boolean; aanvraag_id?: unknown; aantal?: unknown; resterend?: unknown; token?: unknown };
}

export async function sluitAanvraagFotoUpload(aanvraagId: number, token: string): Promise<void> {
  const supabase = anonClient();
  if (!supabase || !token) return;
  await supabase.rpc('sluit_aanvraag_foto_upload', { p_aanvraag_id: aanvraagId, p_token: token });
}

interface FotoLezer {
  from(tabel: string): {
    select(kolommen: string): {
      eq(kolom: string, waarde: number): Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
    };
  };
  storage: {
    from(bucket: string): {
      createSignedUrl(pad: string, seconden: number): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
    };
  };
}

export async function lijstAanvraagFotos(client: FotoLezer, aanvraagId: string, seconden = 600): Promise<AanvraagFoto[]> {
  const id = Number(aanvraagId);
  if (!Number.isInteger(id) || id <= 0) return [];
  try {
    const huidig = await client.from('aanvraag_fotos').select('id,bestandsnaam,storage_pad').eq('aanvraag_id', id);
    if (huidig.error || !huidig.data) return [];
    const fotos: AanvraagFoto[] = [];
    for (const rij of huidig.data) {
      const pad = String(rij.storage_pad ?? '');
      const getekend = await client.storage.from(AANVRAAG_FOTO_BUCKET).createSignedUrl(pad, seconden);
      fotos.push({
        id: String(rij.id ?? pad),
        naam: String(rij.bestandsnaam ?? 'foto'),
        pad,
        url: getekend.data?.signedUrl ?? '',
      });
    }
    return fotos;
  } catch {
    return [];
  }
}
