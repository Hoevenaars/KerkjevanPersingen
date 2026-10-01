/**
 * Verhuuraanvraag op Supabase. Geen mail en geen Sanity-write.
 * Dedup zit in bewaar_test_aanvraag: hetzelfde e-mailadres en dezelfde startdatum
 * levert geen tweede rij op zolang de bestaande aanvraag niet is afgewezen.
 */

import { createClient } from '@supabase/supabase-js';
import type { Aanvraag, Fouten } from './validatie';
import { supabaseLoginUitOmgeving } from './supabase-project.ts';

function client() {
  const login = supabaseLoginUitOmgeving(process.env, true);
  if (!login) return null;
  return createClient(login.url, login.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function bezettingVoorTest(): Promise<{ start: string; eind?: string; soort: string; zichtbaarheid: 'bezet' }[]> {
  const supabase = client();
  if (!supabase) throw new Error('Supabase is niet geconfigureerd.');
  const { data, error } = await supabase.rpc('publieke_bezetting');
  if (error) throw new Error(error.message);
  return ((data ?? []) as { start_datum: string; eind_datum: string; soort: string }[]).map((rij) => ({
    start: `${rij.start_datum}T12:00:00+02:00`,
    eind: `${rij.eind_datum}T12:00:00+02:00`,
    soort: rij.soort || 'diverse',
    zichtbaarheid: 'bezet' as const,
  }));
}

export async function bewaarTestAanvraag(a: Aanvraag, mailjob = false): Promise<{ ok: boolean; fouten?: Fouten }> {
  const supabase = client();
  if (!supabase) {
    return { ok: false, fouten: { algemeen: 'Supabase is niet geconfigureerd. De aanvraag is niet naar Sanity geschreven.' } };
  }
  const { data, error } = await supabase.rpc('bewaar_test_aanvraag', {
    p_naam: a.naam,
    p_email: a.email,
    p_telefoon: a.telefoon,
    p_adres: a.adres,
    p_verhuurtype: a.soort,
    p_start: a.datum,
    p_eind: a.datumTot || a.datum,
    p_personen: a.personen,
    p_toelichting: a.toelichting,
    p_website: a.website ?? '',
    p_eerder: a.eerderGeexposeerd ?? '',
    p_mede: a.medeExposanten ?? '',
    p_akkoord: a.akkoordVoorwaarden === 'ja',
    p_mailjob: mailjob,
  });
  if (error) {
    return { ok: false, fouten: { algemeen: error.message } };
  }
  const uit = data as { ok?: boolean; fout?: string } | null;
  if (!uit?.ok) {
    return { ok: false, fouten: { algemeen: uit?.fout || 'Aanvraag niet opgeslagen.' } };
  }
  return { ok: true };
}
