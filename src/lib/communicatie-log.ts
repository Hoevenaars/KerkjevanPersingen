/**
 * Schrijft een verzendregel ná een provider-call.
 * Een loggingfout start nooit een tweede verzending.
 */

import { loggingNaProvider } from '../platform/communicatie-tijdlijn.ts';
import { maakBeheerAdminClient } from './supabase.ts';

export interface Verzendregel {
  aanvraagId?: string | null;
  boekingId?: string | null;
  relatieId?: string | null;
  templateSleutel: string;
  onderwerp: string;
  bedoeldeOntvanger: string;
  werkelijkeOntvanger: string;
  afzender: string;
  replyTo: string;
  richting: 'inkomend' | 'uitgaand' | 'systeem';
  status: 'verzonden' | 'fout' | 'geblokkeerd' | 'concept';
  providerBerichtId?: string | null;
  foutmelding?: string | null;
  test: boolean;
  dedupSleutel: string;
  handmatig?: boolean;
}

type LosClient = {
  from: (tabel: string) => {
    insert: (rij: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };
};

function nummer(waarde: string | null | undefined): number | null {
  if (!waarde || !/^\d+$/.test(waarde)) return null;
  return Number(waarde);
}

export async function legVerzendingVast(
  regel: Verzendregel,
  env: Record<string, unknown> = process.env,
  client?: LosClient | null,
): Promise<{ gelogd: boolean; opnieuwVerstuurd: false }> {
  const db = client ?? (maakBeheerAdminClient(env) as unknown as LosClient | null);
  if (!db) {
    await schrijfLoggingFout(null, regel, 'Geen databaseclient voor de verzendregel.');
    return { gelogd: false, opnieuwVerstuurd: false };
  }
  const { error } = await db.from('communicatie_verzendingen').insert({
    aanvraag_id: nummer(regel.aanvraagId),
    boeking_id: nummer(regel.boekingId),
    relatie_id: nummer(regel.relatieId),
    template_sleutel: regel.templateSleutel,
    onderwerp: regel.onderwerp,
    bedoelde_ontvanger: regel.bedoeldeOntvanger,
    werkelijke_ontvanger: regel.werkelijkeOntvanger,
    email_op_verzendmoment: regel.bedoeldeOntvanger,
    afzender: regel.afzender,
    reply_to: regel.replyTo,
    richting: regel.richting,
    status: regel.status,
    provider_bericht_id: regel.providerBerichtId ?? null,
    foutmelding: regel.foutmelding ?? null,
    test: regel.test,
    dedup_sleutel: regel.dedupSleutel,
    handmatig: regel.handmatig ?? false,
    verzonden_op: regel.status === 'verzonden' ? new Date().toISOString() : null,
  });
  const gevolg = loggingNaProvider({ gelukt: !error, fout: error?.message });
  if (gevolg.audit) await schrijfLoggingFout(db, regel, error?.message ?? 'loggen mislukt');
  return { gelogd: gevolg.status === 'gelogd', opnieuwVerstuurd: false };
}

export async function laadTijdlijn(
  client: {
    from: (tabel: string) => {
      select: (kolommen: string) => {
        eq: (kolom: string, waarde: unknown) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
      };
    };
  },
  filter: { aanvraagId?: string; boekingId?: string; relatieId?: string },
): Promise<import('../platform/communicatie-tijdlijn.ts').TijdlijnItem[]> {
  const { tijdlijnVoor } = await import('../platform/communicatie-tijdlijn.ts');
  const kolommenJob = 'id,boeking_id,aanvraag_id,relatie_id,template_sleutel,status,gepland_op,ontvanger_email,onderwerp,foutmelding,provider_bericht_id,werkelijke_ontvanger,afzender,reply_to';
  const kolommenVerzending = 'id,boeking_id,aanvraag_id,relatie_id,template_sleutel,onderwerp,bedoelde_ontvanger,werkelijke_ontvanger,email_op_verzendmoment,afzender,reply_to,richting,status,provider_bericht_id,foutmelding,verzonden_op,gepland_op';
  const kolom = filter.aanvraagId ? 'aanvraag_id' : filter.boekingId ? 'boeking_id' : 'relatie_id';
  const waarde = filter.aanvraagId || filter.boekingId || filter.relatieId;
  if (!waarde) return [];
  try {
    const [jobs, verzendingen] = await Promise.all([
      client.from('communicatie_jobs').select(kolommenJob).eq(kolom, Number(waarde) || waarde),
      client.from('communicatie_verzendingen').select(kolommenVerzending).eq(kolom, Number(waarde) || waarde),
    ]);
    if (jobs.error || verzendingen.error) return [];
    return tijdlijnVoor({ jobs: jobs.data ?? [], verzendingen: verzendingen.data ?? [] }, filter);
  } catch {
    return [];
  }
}

async function schrijfLoggingFout(db: LosClient | null, regel: Verzendregel, fout: string): Promise<void> {
  if (!db) return;
  try {
    await db.from('auditlog').insert({
      actor_naam: 'mail',
      actor_type: 'systeem',
      onderwerp_type: 'communicatie',
      onderwerp_id: regel.dedupSleutel,
      actie: 'logging_mislukt',
      reden: fout.slice(0, 500),
      dedup_sleutel: `logging:${regel.dedupSleutel}:${regel.status}`,
    });
  } catch {
    // De mail is al weg. Een mislukte audit mag die niet opnieuw starten.
  }
}
