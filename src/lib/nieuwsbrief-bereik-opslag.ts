/**
 * Lezen en bijwerken van nieuwsbriefopeningen.
 * De webhook gebruikt de service role. Beheer leest met de ingelogde sessie.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types.ts';
import { bereikPatch, type BereikRij, type ResendMailGebeurtenis } from './nieuwsbrief-bereik.ts';

type Client = SupabaseClient<Database>;

interface VerzendingRij {
  id: number;
  nieuwsbrief_id: number;
  vriend_id: number | null;
  email_op_verzendmoment: string | null;
  test: boolean;
  status: string;
  geopend_op: string | null;
  activiteit_geklikt_op: string | null;
  provider_id: string | null;
}

export async function leesNieuwsbriefBereik(client: Client): Promise<BereikRij[]> {
  const { data, error } = await client
    .from('nieuwsbrief_verzendingen')
    .select('nieuwsbrief_id,vriend_id,email_op_verzendmoment,test,status,geopend_op,activiteit_geklikt_op')
    .eq('test', false)
    .eq('status', 'verzonden');
  if (error) throw new Error(error.message);
  const rijen = data ?? [];
  const ids = [...new Set(rijen.map((rij) => rij.vriend_id).filter((id): id is number => typeof id === 'number'))];
  const namen = new Map<number, string>();
  if (ids.length > 0) {
    const namenRij = await client.from('vrienden').select('id,naam').in('id', ids);
    if (!namenRij.error) {
      for (const vriend of namenRij.data ?? []) namen.set(vriend.id, vriend.naam?.trim() ?? '');
    }
  }
  return rijen.map((rij) => ({
    nieuwsbriefId: String(rij.nieuwsbrief_id),
    naam: (rij.vriend_id != null ? namen.get(rij.vriend_id) : '') ?? '',
    email: rij.email_op_verzendmoment ?? '',
    test: rij.test,
    status: rij.status,
    geopendOp: rij.geopend_op,
    activiteitOp: rij.activiteit_geklikt_op,
  }));
}

export async function bereikVoorBeheer(client: Client | null): Promise<{ rijen: BereikRij[]; fout: boolean }> {
  if (!client) return { rijen: [], fout: false };
  try {
    return { rijen: await leesNieuwsbriefBereik(client), fout: false };
  } catch {
    console.error('[nieuwsbrief] bereik niet gelezen');
    return { rijen: [], fout: true };
  }
}

export type GebeurtenisUitkomst = 'bijgewerkt' | 'onbekend' | 'genegeerd';

export async function noteerNieuwsbriefGebeurtenis(
  client: Client,
  gebeurtenis: ResendMailGebeurtenis,
  op: Date,
): Promise<GebeurtenisUitkomst> {
  if (gebeurtenis.soort === 'geklikt' && !gebeurtenis.activiteit) return 'genegeerd';

  const { data, error } = await client
    .from('nieuwsbrief_verzendingen')
    .select('id,geopend_op,activiteit_geklikt_op,provider_id')
    .eq('provider_id', gebeurtenis.emailId)
    .limit(1);
  if (error) throw new Error(error.message);
  let rijen = data ?? [];

  if (rijen.length === 0 && gebeurtenis.editieId && gebeurtenis.vriendId) {
    const viaTag = await client
      .from('nieuwsbrief_verzendingen')
      .select('id,geopend_op,activiteit_geklikt_op,provider_id')
      .eq('nieuwsbrief_id', Number(gebeurtenis.editieId))
      .eq('vriend_id', Number(gebeurtenis.vriendId))
      .eq('test', false)
      .order('verzonden_op', { ascending: false })
      .limit(1);
    if (viaTag.error) throw new Error(viaTag.error.message);
    rijen = viaTag.data ?? [];
  }

  const rij = rijen[0];
  if (!rij) return 'onbekend';

  const patch = bereikPatch(
    { geopendOp: rij.geopend_op, activiteitOp: rij.activiteit_geklikt_op },
    gebeurtenis,
    op.toISOString(),
  );
  if (rij.geopend_op === patch.geopendOp && rij.activiteit_geklikt_op === patch.activiteitOp && rij.provider_id) {
    return 'bijgewerkt';
  }

  const { error: schrijfFout } = await client
    .from('nieuwsbrief_verzendingen')
    .update({
      geopend_op: patch.geopendOp,
      activiteit_geklikt_op: patch.activiteitOp,
      provider_id: rij.provider_id ?? gebeurtenis.emailId,
    })
    .eq('id', rij.id);
  if (schrijfFout) throw new Error(schrijfFout.message);
  return 'bijgewerkt';
}
