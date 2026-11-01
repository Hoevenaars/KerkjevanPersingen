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

/** Zelfde bron als de kalender. Bij een fout: niet beschikbaar. */
export async function periodeBeschikbaar(start: string, eind: string): Promise<boolean> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(eind) || eind < start) return false;
  const supabase = client();
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('is_periode_beschikbaar', { p_start: start, p_eind: eind });
  if (error || data !== true) return false;
  return true;
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

export async function bewaarTestAanvraag(a: Aanvraag, mailjob = false): Promise<{ ok: boolean; id?: number; fotoToken?: string; fouten?: Fouten }> {
  const supabase = client();
  if (!supabase) {
    return { ok: false, fouten: { algemeen: 'Supabase is niet geconfigureerd. De aanvraag is niet naar Sanity geschreven.' } };
  }
  const basis = {
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
    p_akkoord: a.soort === 'expositie' ? a.akkoordVoorwaarden === 'ja' : null,
    p_mailjob: mailjob,
  };
  let antwoord = await supabase.rpc('bewaar_test_aanvraag', {
    ...basis,
    p_straat: a.straat,
    p_huisnummer: a.huisnummer,
    p_toevoeging: a.toevoeging,
    p_postcode: a.postcode,
    p_woonplaats: a.woonplaats,
  });
  if (antwoord.error && /could not find the function|PGRST202/i.test(antwoord.error.message)) {
    antwoord = await supabase.rpc('bewaar_test_aanvraag', basis);
  }
  if (antwoord.error) {
    return { ok: false, fouten: { algemeen: antwoord.error.message } };
  }
  const uit = antwoord.data as { ok?: boolean; fout?: string; id?: number; foto_token?: string } | null;
  if (!uit?.ok) {
    return { ok: false, fouten: { algemeen: uit?.fout || 'Aanvraag niet opgeslagen.' } };
  }
  return { ok: true, id: uit.id, fotoToken: uit.foto_token || undefined };
}
