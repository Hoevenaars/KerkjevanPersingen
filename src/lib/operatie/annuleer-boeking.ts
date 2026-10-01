/**
 * Boeking annuleren met de ingelogde beheer-sessie.
 * De service-roleketen blijft voor de overige dossieracties.
 * Deze weg maakt geen mailjob en verwijdert de boeking niet.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AnnuleerActor {
  id?: string;
  naam: string;
  type: string;
}

export interface AnnuleerAudit {
  actor_id: string | null;
  actor_naam: string;
  actor_type: string;
  onderwerp_type: 'boeking';
  onderwerp_id: string;
  actie: 'geannuleerd';
  van: string;
  naar: 'geannuleerd';
  reden: string | null;
  dedup_sleutel: string;
}

export interface AnnuleerDb {
  leesStatus(id: number): Promise<{ status: string } | { fout: string }>;
  zetGeannuleerd(id: number): Promise<{ status: string } | { fout: string } | { leeg: true }>;
  annuleerOpenJobs(id: number): Promise<{ fout?: string }>;
  aantalJobs(id: number): Promise<number | { fout: string }>;
  schrijfAudit(rij: AnnuleerAudit): Promise<{ fout?: string; code?: string }>;
}

export interface AnnuleerResultaat {
  ok: boolean;
  melding: string;
}

export async function annuleerBoeking(
  db: AnnuleerDb,
  id: number,
  reden: string,
  actor: AnnuleerActor,
): Promise<AnnuleerResultaat> {
  if (!Number.isInteger(id) || id <= 0) return { ok: false, melding: 'Boeking niet gevonden.' };
  const jobsVoor = await db.aantalJobs(id);
  if (typeof jobsVoor !== 'number') return { ok: false, melding: jobsVoor.fout };
  const huidig = await db.leesStatus(id);
  if ('fout' in huidig) return { ok: false, melding: huidig.fout };
  if (huidig.status === 'geannuleerd') return { ok: true, melding: 'Boeking was al geannuleerd.' };

  const gezet = await db.zetGeannuleerd(id);
  if ('fout' in gezet) return { ok: false, melding: gezet.fout };
  if ('leeg' in gezet || gezet.status !== 'geannuleerd') {
    return { ok: false, melding: 'Annuleren is niet gelukt.' };
  }

  const jobs = await db.annuleerOpenJobs(id);
  if (jobs.fout) return { ok: false, melding: jobs.fout };
  const jobsNa = await db.aantalJobs(id);
  if (typeof jobsNa !== 'number') return { ok: false, melding: jobsNa.fout };
  if (jobsNa !== jobsVoor) {
    return { ok: false, melding: 'Annuleren heeft een mail of workflow aangemaakt. Dat hoort niet.' };
  }

  const rij: AnnuleerAudit = {
    actor_id: actor.id && UUID.test(actor.id) ? actor.id : null,
    actor_naam: actor.naam,
    actor_type: actor.type,
    onderwerp_type: 'boeking',
    onderwerp_id: String(id),
    actie: 'geannuleerd',
    van: huidig.status,
    naar: 'geannuleerd',
    reden: reden.trim() || null,
    dedup_sleutel: `boeking:${id}:geannuleerd`,
  };
  let audit = await db.schrijfAudit(rij);
  if (audit.code === '23503' && rij.actor_id) {
    audit = await db.schrijfAudit({ ...rij, actor_id: null });
  }
  if (audit.fout && audit.code !== '23505') {
    return { ok: true, melding: 'Boeking geannuleerd. De periode blokkeert de verhuurkalender niet meer.' };
  }
  return { ok: true, melding: 'Boeking geannuleerd. De periode blokkeert de verhuurkalender niet meer.' };
}

type PostgrestFout = { message: string; code?: string } | null;

interface SessieQuery extends PromiseLike<{ data: { status?: string } | null; error: PostgrestFout; count: number | null }> {
  select: (kolommen: string, opties?: { count?: 'exact'; head?: boolean }) => SessieQuery;
  update: (waarden: Record<string, unknown>) => SessieQuery;
  insert: (rij: AnnuleerAudit) => PromiseLike<{ error: PostgrestFout }>;
  eq: (kolom: string, waarde: unknown) => SessieQuery;
  neq: (kolom: string, waarde: unknown) => SessieQuery;
  maybeSingle: () => PromiseLike<{ data: { status?: string } | null; error: PostgrestFout }>;
}

export interface AnnuleerSessie {
  from: (tabel: 'boekingen' | 'communicatie_jobs' | 'auditlog') => SessieQuery;
}

export function annuleerDbVanSessie(client: AnnuleerSessie): AnnuleerDb {
  return {
    async leesStatus(id) {
      const { data, error } = await client.from('boekingen').select('status').eq('id', id).maybeSingle();
      if (error) return { fout: error.message };
      if (!data?.status) return { fout: 'Boeking niet gevonden.' };
      return { status: String(data.status) };
    },
    async zetGeannuleerd(id) {
      const { data, error } = await client
        .from('boekingen')
        .update({ status: 'geannuleerd', bijgewerkt_op: new Date().toISOString() })
        .eq('id', id)
        .select('status')
        .maybeSingle();
      if (error) return { fout: error.message };
      if (!data?.status) return { leeg: true };
      return { status: String(data.status) };
    },
    async annuleerOpenJobs(id) {
      const { error } = await client
        .from('communicatie_jobs')
        .update({ status: 'geannuleerd' })
        .eq('boeking_id', id)
        .neq('status', 'verzonden');
      return error ? { fout: error.message } : {};
    },
    async aantalJobs(id) {
      const { count, error } = await client
        .from('communicatie_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('boeking_id', id);
      if (error) return { fout: error.message };
      return count ?? 0;
    },
    async schrijfAudit(rij) {
      const { error } = await client.from('auditlog').insert(rij);
      if (!error) return {};
      return { fout: error.message, code: error.code };
    },
  };
}

export function annuleerBoekingViaSessie(
  client: AnnuleerSessie,
  id: number,
  reden: string,
  actor: AnnuleerActor,
): Promise<AnnuleerResultaat> {
  return annuleerBoeking(annuleerDbVanSessie(client), id, reden, actor);
}
