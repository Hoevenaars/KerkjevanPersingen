/**
 * Server-side lezer van het centrale testmailadres.
 * Mislukt of ongeldig: null. Nooit een fallback naar de echte ontvanger.
 */

import { maakBeheerAdminClient } from './supabase.ts';
import { TESTMAIL_SLEUTEL, normaliseerTestmailadres, tekstUitInstelling } from '../platform/testmail.ts';

export async function getTestMailRecipient(
  env: Record<string, unknown> = process.env,
  lezer?: () => Promise<unknown>,
): Promise<string | null> {
  try {
    const ruw = lezer ? await lezer() : await leesUitInstellingen(env);
    const check = normaliseerTestmailadres(tekstUitInstelling(ruw));
    return check.ok ? check.adres : null;
  } catch {
    return null;
  }
}

async function leesUitInstellingen(env: Record<string, unknown>): Promise<unknown> {
  const client = maakBeheerAdminClient(env);
  if (!client) return null;
  const db = client as unknown as {
    from: (tabel: string) => {
      select: (kolommen: string) => {
        eq: (kolom: string, waarde: string) => {
          maybeSingle: () => Promise<{ data: { waarde: unknown } | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const { data, error } = await db.from('instellingen').select('waarde').eq('sleutel', TESTMAIL_SLEUTEL).maybeSingle();
  if (error || !data) return null;
  return data.waarde;
}
