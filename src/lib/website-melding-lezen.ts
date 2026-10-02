/**
 * Publieke lezing van de homepage-melding.
 * Alleen de security-definer-functie, nooit de rest van instellingen.
 */

import { createClient } from '@supabase/supabase-js';
import { supabaseLoginUitOmgeving } from './supabase-project.ts';
import {
  meldingUitRpc,
  type WebsiteMeldingWeergave,
} from './website-melding.ts';

export async function leesPubliekeWebsiteMelding(nu = new Date()): Promise<WebsiteMeldingWeergave | null> {
  try {
    const login = supabaseLoginUitOmgeving(process.env, true);
    if (!login) return meldingUitRpc(null, { message: 'niet geconfigureerd' }, nu);
    const supabase = createClient(login.url, login.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.rpc('publieke_website_melding');
    return meldingUitRpc(data, error, nu);
  } catch {
    return meldingUitRpc(null, { message: 'lezen mislukt' }, nu);
  }
}
