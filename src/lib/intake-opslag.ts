/**
 * Schrijft aanleverfoto's naar de private bucket content-intake.
 * Het token bepaalt het dossier. De exposant publiceert niets.
 */

import { randomUUID } from 'node:crypto';
import { hashToegangstoken, tokenIsVerlopen } from '../platform/magictoken.ts';
import { beoordeelPortaalToken } from '../platform/exposant-portaal.ts';
import { INTAKE_BUCKET, planIntake, valideerIntakeBestand, type IntakeBestand, type IntakeMime } from '../platform/intake-foto.ts';
import { maakBeheerAdminClient } from './supabase.ts';

export interface IntakeBron {
  bytes: Uint8Array;
  type: string;
  size: number;
  alsHoofd: boolean;
}

type Opslag = {
  from: (bucket: string) => {
    upload: (pad: string, bytes: Uint8Array, opties: { contentType: string; upsert: boolean }) => Promise<{ error: { message: string } | null }>;
    createSignedUrl: (pad: string, seconden: number) => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
  };
};

type Db = {
  from: (tabel: string) => {
    select: (kolommen: string) => {
      eq: (kolom: string, waarde: unknown) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      } & Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
    };
    insert: (rijen: Record<string, unknown> | Record<string, unknown>[]) => Promise<{ error: { message: string } | null }>;
  };
  storage: Opslag;
};

export async function dossierVanIntakeToken(
  plain: string,
  env: Record<string, unknown> = process.env,
  nu = new Date(),
): Promise<{ ok: true; boekingId: string } | { ok: false; reden: string }> {
  if (!plain.trim()) return { ok: false, reden: 'ontbreekt' };
  const client = maakBeheerAdminClient(env) as unknown as Db | null;
  if (!client) return { ok: false, reden: 'geen database' };
  const { data, error } = await client
    .from('toegangstokens')
    .select('boeking_id,doel,verloopt_op,ingetrokken_op')
    .eq('token_hash', hashToegangstoken(plain))
    .maybeSingle();
  if (error || !data) return { ok: false, reden: 'ongeldig' };
  const oordeel = beoordeelPortaalToken(
    {
      hash: hashToegangstoken(plain),
      doel: String(data.doel ?? ''),
      boekingId: data.boeking_id == null ? null : String(data.boeking_id),
      verlooptOp: String(data.verloopt_op ?? ''),
      ingetrokkenOp: data.ingetrokken_op == null ? null : String(data.ingetrokken_op),
    },
    nu,
  );
  if (!oordeel.ok) return oordeel;
  if (tokenIsVerlopen(String(data.verloopt_op ?? ''), nu)) return { ok: false, reden: 'verlopen' };
  return { ok: true, boekingId: oordeel.boekingId };
}

export async function bewaarIntakeFoto(
  boekingId: string,
  bestanden: readonly IntakeBron[],
  env: Record<string, unknown> = process.env,
): Promise<{ ok: true; hoofd: string; paden: string[] } | { ok: false; reden: string }> {
  const gecontroleerd: { mime: IntakeMime; bytes: number; id: string; alsHoofd: boolean; ruw: Uint8Array }[] = [];
  for (const bestand of bestanden) {
    const check = valideerIntakeBestand(bestand);
    if (!check.ok) return { ok: false, reden: check.reden };
    gecontroleerd.push({ mime: check.mime, bytes: bestand.size, id: randomUUID(), alsHoofd: bestand.alsHoofd, ruw: bestand.bytes });
  }
  const client = maakBeheerAdminClient(env) as unknown as Db | null;
  if (!client) return { ok: false, reden: 'geen database' };
  const huidig = await client.from('content_intake_bestanden').select('storage_pad,rol').eq('boeking_id', Number(boekingId));
  if (huidig.error) return { ok: false, reden: 'De bestaande aanlevering kon niet worden gelezen. Er is niets overschreven.' };
  const rijen = huidig.data ?? [];
  const plan = planIntake({
    boekingId,
    bestaandHoofd: String(rijen.find((rij) => rij.rol === 'hoofd')?.storage_pad ?? ''),
    bestaandPaden: rijen.map((rij) => String(rij.storage_pad ?? '')),
    bestanden: gecontroleerd.map((bestand) => ({ mime: bestand.mime, bytes: bestand.bytes, id: bestand.id, alsHoofd: bestand.alsHoofd })),
  });
  if (!plan.ok) return plan;
  const opgeslagen: IntakeBestand[] = [];
  for (const bestand of plan.bestanden) {
    const bron = gecontroleerd.find((item) => bestand.pad.endsWith(`${item.id}.`)) ?? gecontroleerd.find((item) => bestand.pad.includes(item.id));
    if (!bron) return { ok: false, reden: 'Bestand ontbreekt.' };
    const upload = await client.storage.from(INTAKE_BUCKET).upload(bestand.pad, bron.ruw, { contentType: bestand.mime, upsert: false });
    if (upload.error) return { ok: false, reden: 'Opslaan mislukt. Bestaande bestanden zijn niet overschreven.' };
    opgeslagen.push(bestand);
  }
  if (opgeslagen.length > 0) {
    const insert = await client.from('content_intake_bestanden').insert(opgeslagen.map((bestand) => ({
      boeking_id: Number(boekingId),
      rol: bestand.rol,
      storage_pad: bestand.pad,
      mime_type: bestand.mime,
      bytes: bestand.bytes,
    })));
    if (insert.error) return { ok: false, reden: 'De bestanden staan in opslag, maar de metadata kon niet worden weggeschreven. Er is niets overschreven.' };
  }
  return { ok: true, hoofd: plan.hoofd, paden: opgeslagen.map((bestand) => bestand.pad) };
}

export async function leesIntakeFormulier(
  plain: string,
  env: Record<string, unknown> = process.env,
  nu = new Date(),
): Promise<
  | { ok: true; boekingId: string; soort: string; titel: string; exposanten: string; korte: string; lange: string }
  | { ok: false; reden: string }
> {
  const dossier = await dossierVanIntakeToken(plain, env, nu);
  if (!dossier.ok) return dossier;
  const client = maakBeheerAdminClient(env) as unknown as Db | null;
  if (!client) return { ok: false, reden: 'geen database' };
  const boeking = await client.from('boekingen').select('verhuurtype_sleutel').eq('id', Number(dossier.boekingId)).maybeSingle();
  const publiek = await client
    .from('publieke_activiteiten')
    .select('titel,exposanten,korte_omschrijving,volledige_omschrijving')
    .eq('boeking_id', Number(dossier.boekingId))
    .maybeSingle();
  if (boeking.error || publiek.error) return { ok: false, reden: 'ongeldig' };
  return {
    ok: true,
    boekingId: dossier.boekingId,
    soort: String(boeking.data?.verhuurtype_sleutel ?? ''),
    titel: String(publiek.data?.titel ?? ''),
    exposanten: String(publiek.data?.exposanten ?? ''),
    korte: String(publiek.data?.korte_omschrijving ?? ''),
    lange: String(publiek.data?.volledige_omschrijving ?? ''),
  };
}

export async function lijstIntake(
  boekingId: string,
  env: Record<string, unknown> = process.env,
  seconden = 600,
): Promise<{ rol: string; pad: string; url: string }[]> {
  const client = maakBeheerAdminClient(env) as unknown as Db | null;
  if (!client) return [];
  try {
    const huidig = await client.from('content_intake_bestanden').select('storage_pad,rol').eq('boeking_id', Number(boekingId));
    if (huidig.error || !huidig.data) return [];
    const links = [];
    for (const rij of huidig.data) {
      const pad = String(rij.storage_pad ?? '');
      const getekend = await client.storage.from(INTAKE_BUCKET).createSignedUrl(pad, seconden);
      links.push({ rol: String(rij.rol ?? 'extra'), pad, url: getekend.data?.signedUrl ?? '' });
    }
    return links;
  } catch {
    return [];
  }
}
