/**
 * Tariefregels voor de publieke aanvraag.
 * Dezelfde vorm als finance.ts. Ontbreekt de databasefunctie, dan gelden de centrale beginregels.
 */

import { createClient } from '@supabase/supabase-js';
import { INITIELE_TARIEVEN, type Tariefregel } from '../platform/finance.ts';
import type { Prijstype } from '../platform/types.ts';
import { supabaseLoginUitOmgeving } from './supabase-project.ts';

const PRIJSTYPEN = new Set<Prijstype>(['vast', 'vanaf', 'op_aanvraag']);

export async function leesTariefregels(): Promise<Tariefregel[]> {
  const login = supabaseLoginUitOmgeving(process.env, true);
  if (!login) return [...INITIELE_TARIEVEN];
  try {
    const supabase = createClient(login.url, login.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.rpc('publieke_tariefregels');
    if (error || !Array.isArray(data) || data.length === 0) return [...INITIELE_TARIEVEN];
    const regels: Tariefregel[] = [];
    for (const rij of data as Record<string, unknown>[]) {
      const prijstype = String(rij.prijstype ?? '');
      if (!PRIJSTYPEN.has(prijstype as Prijstype)) continue;
      const bedrag = rij.bedrag == null || rij.bedrag === '' ? null : Number(rij.bedrag);
      regels.push({
        verhuurtype: String(rij.verhuurtype ?? ''),
        prijstype: prijstype as Prijstype,
        bedrag: bedrag != null && Number.isFinite(bedrag) ? bedrag : null,
        geldigVanaf: String(rij.geldig_vanaf ?? ''),
        geldigTot: rij.geldig_tot == null || rij.geldig_tot === '' ? null : String(rij.geldig_tot),
      });
    }
    return regels.length > 0 ? regels : [...INITIELE_TARIEVEN];
  } catch {
    return [...INITIELE_TARIEVEN];
  }
}
