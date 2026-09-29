/**
 * Rollen staan in Supabase zodra de admin-client er is,
 * anders in data/beheer-rollen.json zodat lokaal Beheer zonder keys ook kan opslaan.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MODULES } from '../platform/modules.ts';
import {
  isRolSlug,
  rolOpSlug,
  standaardRollen,
  voerRolActieUit,
  vulMatrix,
  type BeheerRol,
  type RolActie,
} from '../platform/rollen.ts';
import type { Rechtniveau } from '../platform/types.ts';
import type { RechtenMatrix } from '../platform/rollen.ts';
import { maakBeheerAdminClient } from './supabase.ts';

const BESTAND = path.join(process.cwd(), 'data', 'beheer-rollen.json');

interface BestandVorm {
  rollen: Array<{ slug?: unknown; naam?: unknown; rechten?: unknown }>;
}

function isNiveau(waarde: unknown): waarde is Rechtniveau {
  return waarde === 'verborgen' || waarde === 'lezen' || waarde === 'schrijven';
}

export function rollenUitRuweLijst(ruw: unknown): BeheerRol[] | null {
  if (!ruw || typeof ruw !== 'object' || !Array.isArray((ruw as BestandVorm).rollen)) return null;
  const rollen: BeheerRol[] = [];
  for (const rij of (ruw as BestandVorm).rollen) {
    if (!rij || typeof rij.slug !== 'string' || typeof rij.naam !== 'string') continue;
    if (!isRolSlug(rij.slug)) continue;
    const naam = rij.naam.trim().replace(/\s+/g, ' ');
    if (!naam || naam.length > 40) continue;
    const rechten: RechtenMatrix = {};
    if (rij.rechten && typeof rij.rechten === 'object') {
      for (const module of MODULES) {
        const niveau = (rij.rechten as Record<string, unknown>)[module];
        if (isNiveau(niveau)) rechten[module] = niveau;
      }
    }
    rollen.push({ slug: rij.slug, naam, rechten: vulMatrix(rechten) });
  }
  return rollen;
}

async function leesBestand(): Promise<BeheerRol[] | null> {
  try {
    const raw = await fs.readFile(BESTAND, 'utf8');
    return rollenUitRuweLijst(JSON.parse(raw));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    throw error;
  }
}

async function schrijfBestand(rollen: BeheerRol[]): Promise<void> {
  await fs.mkdir(path.dirname(BESTAND), { recursive: true });
  const body = {
    rollen: rollen.map((rol) => ({ slug: rol.slug, naam: rol.naam, rechten: vulMatrix(rol.rechten) })),
  };
  await fs.writeFile(BESTAND, JSON.stringify(body, null, 2), 'utf8');
}

function los(admin: SupabaseClient): SupabaseClient {
  return admin as unknown as SupabaseClient;
}

async function leesSupabase(admin: SupabaseClient): Promise<BeheerRol[]> {
  const db = los(admin);
  const rollenRes = await db.from('beheer_rollen').select('slug, naam');
  if (rollenRes.error) throw new Error(rollenRes.error.message);
  const rechtenRes = await db.from('beheer_rol_rechten').select('rol_slug, module_sleutel, niveau');
  if (rechtenRes.error) throw new Error(rechtenRes.error.message);

  const perRol = new Map<string, RechtenMatrix>();
  for (const rij of (rechtenRes.data ?? []) as Array<{ rol_slug: string; module_sleutel: string; niveau: string }>) {
    if (!isNiveau(rij.niveau)) continue;
    const matrix = perRol.get(rij.rol_slug) ?? {};
    if (MODULES.includes(rij.module_sleutel as (typeof MODULES)[number])) {
      matrix[rij.module_sleutel as keyof RechtenMatrix] = rij.niveau;
    }
    perRol.set(rij.rol_slug, matrix);
  }

  const rollen: BeheerRol[] = [];
  for (const rij of (rollenRes.data ?? []) as Array<{ slug: string; naam: string }>) {
    if (!isRolSlug(rij.slug)) continue;
    rollen.push({ slug: rij.slug, naam: rij.naam, rechten: vulMatrix(perRol.get(rij.slug)) });
  }
  rollen.sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
  return rollen;
}

async function schrijfSupabase(admin: SupabaseClient, rollen: BeheerRol[]): Promise<void> {
  const db = los(admin);
  const bestaand = await db.from('beheer_rollen').select('slug');
  if (bestaand.error) throw new Error(bestaand.error.message);
  const houden = new Set(rollen.map((rol) => rol.slug));
  for (const rij of (bestaand.data ?? []) as Array<{ slug: string }>) {
    if (houden.has(rij.slug)) continue;
    const weg = await db.from('beheer_rollen').delete().eq('slug', rij.slug);
    if (weg.error) throw new Error(weg.error.message);
  }

  for (const rol of rollen) {
    const opgeslagen = await db.from('beheer_rollen').upsert({ slug: rol.slug, naam: rol.naam });
    if (opgeslagen.error) throw new Error(opgeslagen.error.message);
    const gewist = await db.from('beheer_rol_rechten').delete().eq('rol_slug', rol.slug);
    if (gewist.error) throw new Error(gewist.error.message);
    const rijen = MODULES.map((module) => ({
      rol_slug: rol.slug,
      module_sleutel: module,
      niveau: rol.rechten[module] ?? 'verborgen',
    }));
    const gezet = await db.from('beheer_rol_rechten').insert(rijen);
    if (gezet.error) throw new Error(gezet.error.message);
  }
}

export async function laadRollen(admin: SupabaseClient | null = maakBeheerAdminClient()): Promise<BeheerRol[]> {
  if (admin) return leesSupabase(admin);
  return (await leesBestand()) ?? standaardRollen();
}

export async function bewaarRollen(rollen: BeheerRol[], admin: SupabaseClient | null = maakBeheerAdminClient()): Promise<void> {
  if (admin) {
    await schrijfSupabase(admin, rollen);
    return;
  }
  await schrijfBestand(rollen);
}

export async function pasRollenAan(
  actie: RolActie,
  admin: SupabaseClient | null = maakBeheerAdminClient(),
): Promise<{ rollen: BeheerRol[]; slug?: string } | { fout: string }> {
  const huidig = await laadRollen(admin);
  const resultaat = voerRolActieUit(huidig, actie);
  if ('fout' in resultaat) return resultaat;
  await bewaarRollen(resultaat.rollen, admin);
  return resultaat;
}

export function vindRol(rollen: readonly BeheerRol[], slug: string | null | undefined): BeheerRol | null {
  if (!slug) return null;
  return rolOpSlug(rollen, slug);
}
