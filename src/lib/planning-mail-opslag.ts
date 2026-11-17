/**
 * Verzendhistorie van de planningmail.
 * Schrijft alleen via de service-role. Een fout hier start geen tweede mail.
 */

import { maakBeheerAdminClient } from './supabase.ts';
import type {
  PlanningMailClaim,
  PlanningMailClaimUitkomst,
  PlanningMailHistorie,
  PlanningMailOntvangerRegel,
  PlanningMailOntvangerStatus,
  PlanningMailOpslag,
  PlanningMailSnapshot,
  PlanningMailStatus,
} from '../platform/planning-mail.ts';

type Fout = { message: string; code?: string } | null;

interface Filter extends PromiseLike<{ data: unknown; error: Fout }> {
  select: (kolommen: string) => Filter;
  eq: (kolom: string, waarde: unknown) => Filter;
  in: (kolom: string, waarden: readonly unknown[]) => Filter;
  lt: (kolom: string, waarde: string) => Filter;
  order: (kolom: string, opties?: { ascending?: boolean }) => Filter;
  limit: (n: number) => Filter;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: Fout }>;
  single: () => Promise<{ data: Record<string, unknown> | null; error: Fout }>;
}

interface Db {
  from: (tabel: string) => {
    select: (kolommen: string) => Filter;
    insert: (rij: Record<string, unknown> | Record<string, unknown>[]) => Filter;
    update: (rij: Record<string, unknown>) => Filter;
  };
}

const ONTVANGER_KOLOMMEN = 'verzending_id,naam,email,status,foutmelding,provider_bericht_id';
const VERZENDING_KOLOMMEN = 'id,token,periode_van,periode_tot,created_at,verzonden_op,gestart_door_naam,status,planning_hash,snapshot,gelukt_aantal,ontvangers_aantal,toelichting';

export function supabasePlanningMailOpslag(env: Record<string, unknown> = process.env): PlanningMailOpslag | null {
  const client = maakBeheerAdminClient(env);
  if (!client) return null;
  return opslagVan(client as unknown as Db);
}

export function opslagVan(db: Db): PlanningMailOpslag {
  return {
    async laatsteAfgerond(hash) {
      const { data, error } = await db
        .from('planning_mail_verzendingen')
        .select('id,status,verzonden_op')
        .eq('planning_hash', hash)
        .in('status', ['verzonden', 'deels'])
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return null;
      const status = tekst(data.status) as PlanningMailStatus;
      if (status !== 'verzonden' && status !== 'deels' && status !== 'mislukt') return null;
      return { id: tekst(data.id), status, verzondenOp: data.verzonden_op ? tekst(data.verzonden_op) : null };
    },
    async sluitVerlopenBezig(ouderDanIso) {
      await db
        .from('planning_mail_verzendingen')
        .update({
          status: 'mislukt',
          toelichting: 'De verzending is niet afgemaakt. Er is vanuit die poging geen tweede mail gestart.',
        })
        .eq('status', 'bezig')
        .lt('created_at', ouderDanIso);
    },
    async claim(invoer) {
      const ingevoegd = await db
        .from('planning_mail_verzendingen')
        .insert({
          token: invoer.token,
          periode_van: invoer.van,
          periode_tot: invoer.tot,
          gestart_door_id: invoer.gestartDoorId,
          gestart_door_naam: invoer.gestartDoorNaam,
          status: 'bezig',
          planning_hash: invoer.hash,
          snapshot: invoer.snapshot,
          ontvangers_aantal: invoer.ontvangers.length,
          gelukt_aantal: 0,
          toelichting: '',
        })
        .select('id')
        .single();
      if (ingevoegd.error || !ingevoegd.data) {
        const soort = conflictSoort(ingevoegd.error);
        if (soort === 'token') {
          const bestaand = await leesOpToken(db, invoer.token);
          return { soort: 'al-gestart', id: bestaand?.id ?? '' };
        }
        if (soort === 'bezig') return { soort: 'loopt-al' };
        return { soort: 'niet-beschikbaar', melding: 'De verzendhistorie is niet beschikbaar. Er is geen e-mail verstuurd.' };
      }
      const id = tekst(ingevoegd.data.id);
      if (invoer.ontvangers.length) {
        const regels = invoer.ontvangers.map((ontvanger) => ({
          verzending_id: Number(id),
          relatie_id: relatieNummer(ontvanger.relatieIds[0]),
          naam: ontvanger.naam,
          email: ontvanger.email,
          status: 'wacht',
          foutmelding: '',
          provider_bericht_id: '',
          persoonlijke_dienst_ids: [],
        }));
        const ontvangers = await db.from('planning_mail_ontvangers').insert(regels);
        const fout = await eersteFout(ontvangers);
        if (fout) {
          await db.from('planning_mail_verzendingen').update({
            status: 'mislukt',
            toelichting: 'De ontvangers zijn niet vastgelegd. Er is geen e-mail verstuurd.',
          }).eq('id', Number(id));
          return { soort: 'niet-beschikbaar', melding: 'De ontvangers zijn niet vastgelegd. Er is geen e-mail verstuurd.' };
        }
      }
      return { soort: 'nieuw', id };
    },
    async zetOntvanger(verzendingId, email, patch) {
      await db
        .from('planning_mail_ontvangers')
        .update({
          status: patch.status,
          foutmelding: patch.foutmelding.slice(0, 500),
          provider_bericht_id: patch.providerBerichtId,
        })
        .eq('verzending_id', Number(verzendingId))
        .eq('email', email);
    },
    async rondAf(verzendingId, patch) {
      await db
        .from('planning_mail_verzendingen')
        .update({
          status: patch.status,
          gelukt_aantal: patch.gelukt,
          toelichting: patch.toelichting.slice(0, 500),
          verzonden_op: patch.verzondenOp,
        })
        .eq('id', Number(verzendingId));
    },
    async lees(id) {
      if (!/^\d+$/.test(id)) return null;
      const { data, error } = await db
        .from('planning_mail_verzendingen')
        .select(VERZENDING_KOLOMMEN)
        .eq('id', Number(id))
        .maybeSingle();
      if (error || !data) return null;
      const ontvangers = await laadOntvangers(db, [Number(id)]);
      return mapHistorie(data, ontvangers.get(id) ?? []);
    },
    async recent(limiet) {
      const antwoord = await db
        .from('planning_mail_verzendingen')
        .select(VERZENDING_KOLOMMEN)
        .order('created_at', { ascending: false })
        .limit(limiet);
      const data = await rijenVan(antwoord);
      if (!data) return [];
      const ids = data.map((rij) => Number(tekst(rij.id))).filter((id) => Number.isInteger(id));
      const ontvangers = ids.length ? await laadOntvangers(db, ids) : new Map<string, PlanningMailOntvangerRegel[]>();
      return data.map((rij) => mapHistorie(rij, ontvangers.get(tekst(rij.id)) ?? []));
    },
  };
}

async function leesOpToken(db: Db, token: string): Promise<PlanningMailHistorie | null> {
  const { data, error } = await db
    .from('planning_mail_verzendingen')
    .select(VERZENDING_KOLOMMEN)
    .eq('token', token)
    .maybeSingle();
  if (error || !data) return null;
  return mapHistorie(data, []);
}

async function laadOntvangers(db: Db, ids: number[]): Promise<Map<string, PlanningMailOntvangerRegel[]>> {
  const antwoord = await db
    .from('planning_mail_ontvangers')
    .select(ONTVANGER_KOLOMMEN)
    .in('verzending_id', ids);
  const rijen = await rijenVan(antwoord);
  const map = new Map<string, PlanningMailOntvangerRegel[]>();
  for (const rij of rijen ?? []) {
    const id = tekst(rij.verzending_id);
    const lijst = map.get(id) ?? [];
    const status = tekst(rij.status);
    lijst.push({
      naam: tekst(rij.naam),
      email: tekst(rij.email),
      status: status === 'verzonden' || status === 'fout' ? status : 'wacht',
      foutmelding: tekst(rij.foutmelding),
      providerBerichtId: tekst(rij.provider_bericht_id),
    });
    map.set(id, lijst);
  }
  return map;
}

function mapHistorie(rij: Record<string, unknown>, ontvangers: PlanningMailOntvangerRegel[]): PlanningMailHistorie {
  const status = tekst(rij.status);
  return {
    id: tekst(rij.id),
    token: tekst(rij.token),
    van: tekst(rij.periode_van).slice(0, 10),
    tot: tekst(rij.periode_tot).slice(0, 10),
    aangemaaktOp: tekst(rij.created_at),
    verzondenOp: rij.verzonden_op ? tekst(rij.verzonden_op) : null,
    gestartDoorNaam: tekst(rij.gestart_door_naam),
    status: status === 'verzonden' || status === 'deels' || status === 'mislukt' || status === 'bezig' ? status : 'mislukt',
    hash: tekst(rij.planning_hash),
    snapshot: snapshotUit(rij.snapshot),
    gelukt: Number(rij.gelukt_aantal ?? 0) || 0,
    aantal: Number(rij.ontvangers_aantal ?? 0) || 0,
    toelichting: tekst(rij.toelichting),
    ontvangers,
  };
}

function snapshotUit(waarde: unknown): PlanningMailSnapshot {
  const leeg: PlanningMailSnapshot = {
    versie: 1,
    van: '',
    tot: '',
    tijd: '',
    onderwerp: '',
    periodeTekst: '',
    diensten: [],
    ontvangers: [],
  };
  if (!waarde || typeof waarde !== 'object') return leeg;
  const rij = waarde as Partial<PlanningMailSnapshot>;
  return {
    versie: 1,
    van: typeof rij.van === 'string' ? rij.van : '',
    tot: typeof rij.tot === 'string' ? rij.tot : '',
    tijd: typeof rij.tijd === 'string' ? rij.tijd : '',
    onderwerp: typeof rij.onderwerp === 'string' ? rij.onderwerp : '',
    periodeTekst: typeof rij.periodeTekst === 'string' ? rij.periodeTekst : '',
    diensten: Array.isArray(rij.diensten) ? rij.diensten : [],
    ontvangers: Array.isArray(rij.ontvangers) ? rij.ontvangers : [],
  };
}

function conflictSoort(error: Fout): 'token' | 'bezig' | 'anders' {
  const tekstFout = `${error?.code ?? ''} ${error?.message ?? ''}`;
  if (tekstFout.includes('planning_mail_token')) return 'token';
  if (tekstFout.includes('planning_mail_een_bezig')) return 'bezig';
  if (error?.code === '23505') return 'token';
  return 'anders';
}

function tekst(waarde: unknown): string {
  return waarde == null ? '' : String(waarde);
}

function relatieNummer(id: string | undefined): number | null {
  if (!id || !/^\d+$/.test(id)) return null;
  return Number(id);
}

async function rijenVan(filter: Filter): Promise<Record<string, unknown>[] | null> {
  const antwoord = await filter;
  if (antwoord.error || !Array.isArray(antwoord.data)) return null;
  return antwoord.data as Record<string, unknown>[];
}

async function eersteFout(filter: Filter): Promise<Fout> {
  const antwoord = await filter;
  return antwoord.error;
}

export type { PlanningMailClaimUitkomst };
