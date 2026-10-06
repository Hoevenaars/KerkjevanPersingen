/**
 * Publieke lezing van de vrij-weekendbanner.
 * Alleen de security-definer-functie, nooit de rest van instellingen.
 */

import { createClient } from '@supabase/supabase-js';
import { supabaseLoginUitOmgeving } from './supabase-project.ts';
import { bezetteKalenderDagen } from './datum.ts';
import { leesBezetteData } from './publiek-lezen.ts';
import {
  bannerInhoud,
  bannerUitRpc,
  bannerZichtbaar,
  type VrijgekomenWeekendInhoud,
  type VrijgekomenWeekendInstelling,
} from './vrijgekomen-weekend.ts';

async function leesInstelling(nu: Date): Promise<VrijgekomenWeekendInstelling | null> {
  try {
    const login = supabaseLoginUitOmgeving(process.env, true);
    if (!login) return bannerUitRpc(null, { message: 'niet geconfigureerd' }, nu);
    const supabase = createClient(login.url, login.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.rpc('publieke_vrijgekomen_weekend_banner');
    return bannerUitRpc(data, error, nu);
  } catch {
    return bannerUitRpc(null, { message: 'lezen mislukt' }, nu);
  }
}

async function nogVrij(zaterdag: string, nu: Date): Promise<boolean> {
  try {
    const dagen = bezetteKalenderDagen(await leesBezetteData());
    return bannerZichtbaar({ actief: true, zaterdag }, nu, dagen);
  } catch {
    return true;
  }
}

export async function leesVrijgekomenWeekendBanner(
  pad: string,
  nu = new Date(),
): Promise<VrijgekomenWeekendInhoud | null> {
  if (pad.startsWith('/verhuur/aanvragen')) return null;
  const instelling = await leesInstelling(nu);
  if (!instelling || !bannerZichtbaar(instelling, nu)) return null;
  if (!(await nogVrij(instelling.zaterdag, nu))) return null;
  return bannerInhoud(instelling.zaterdag);
}
