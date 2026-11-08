/**
 * Alleen-lezen sporen voor één dossier.
 * Gebruikt de ingelogde sessie, nooit de service-role.
 */

import { auditVeld, type DossierSporen } from './verhuur-overzicht.ts';

interface Antwoord {
  data: unknown[] | null;
  error: { message: string } | null;
}

interface Query {
  eq(kolom: string, waarde: string): Query;
  order(kolom: string, opties: { ascending: boolean }): Query;
  limit(aantal: number): PromiseLike<Antwoord>;
}

export interface DossierLezer {
  from(tabel: string): { select(kolommen: string): Query };
}

function tekst(waarde: unknown): string {
  return waarde == null ? '' : String(waarde);
}

function rijen(data: unknown[] | null): Record<string, unknown>[] {
  return (data ?? []) as Record<string, unknown>[];
}

export async function leesDossierSporen(
  client: DossierLezer | null,
  boekingId: string,
  auditZichtbaar: boolean,
): Promise<DossierSporen> {
  const leeg: DossierSporen = {
    verzendingen: [],
    verzendingFout: null,
    audit: [],
    auditFout: null,
    auditZichtbaar,
  };
  if (!client) {
    return { ...leeg, verzendingFout: 'Geen sessie.', auditFout: auditZichtbaar ? 'Geen sessie.' : null };
  }

  const verzending = await client
    .from('communicatie_verzendingen')
    .select('status,verzonden_op,test,foutmelding')
    .eq('boeking_id', boekingId)
    .order('verzonden_op', { ascending: false })
    .limit(30);
  if (verzending.error) leeg.verzendingFout = 'lezen mislukt';
  else {
    leeg.verzendingen = rijen(verzending.data).map((rij) => ({
      status: tekst(rij.status),
      verzondenOp: tekst(rij.verzonden_op).slice(0, 10),
      test: rij.test === true,
      fout: tekst(rij.foutmelding),
    }));
  }

  if (!auditZichtbaar) return leeg;

  const audit = await client
    .from('auditlog')
    .select('actie,op,actor_type,van,naar')
    .eq('onderwerp_type', 'boeking')
    .eq('onderwerp_id', boekingId)
    .order('op', { ascending: false })
    .limit(40);
  if (audit.error) leeg.auditFout = 'lezen mislukt';
  else {
    leeg.audit = rijen(audit.data).map((rij) => ({
      actie: tekst(rij.actie),
      op: tekst(rij.op).slice(0, 16).replace('T', ' '),
      actorType: tekst(rij.actor_type),
      van: auditVeld(tekst(rij.van)),
      naar: auditVeld(tekst(rij.naar)),
    }));
  }
  return leeg;
}
