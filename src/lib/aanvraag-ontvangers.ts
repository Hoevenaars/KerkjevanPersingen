/**
 * Ontvangers van de interne aanvraagmail.
 * Het extra adres komt uit instellingen (extra_ontvangst_adres).
 * Is dat leeg, dan valt de server terug op de relatie met rol voorzitter.
 * Het adres van de aanvrager en interne adressen gaan niet naar de browser.
 */

import { maakBeheerAdminClient } from './supabase.ts';
import { menselijkAdres } from './mail-adressen.ts';

export function uniekeOntvangers(adressen: Array<string | null | undefined>): string[] {
  const gezien = new Set<string>();
  const uit: string[] = [];
  for (const kandidaat of adressen) {
    const adres = menselijkAdres(kandidaat);
    if (!adres || gezien.has(adres)) continue;
    gezien.add(adres);
    uit.push(adres);
  }
  return uit;
}

function jsonEmail(waarde: unknown): string {
  if (typeof waarde === 'string') return waarde.trim();
  if (waarde == null) return '';
  return String(waarde).trim();
}

interface LeesRij {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
}

interface OntvangerDb {
  from(tabel: string): {
    select(kolommen: string): {
      in(kolom: string, waarden: readonly (string | number)[]): Promise<LeesRij>;
      eq(kolom: string, waarde: string): Promise<LeesRij>;
    };
  };
}

export async function leesExtraAanvraagOntvanger(
  env: Record<string, unknown> = process.env,
): Promise<string> {
  const admin = maakBeheerAdminClient(env) as unknown as OntvangerDb | null;
  if (!admin) return '';
  const instellingen = await admin.from('instellingen').select('sleutel,waarde').in('sleutel', ['extra_ontvangst_adres']);
  if (!instellingen.error) {
    const rij = (instellingen.data ?? []).find((item) => item.sleutel === 'extra_ontvangst_adres');
    const uitInstelling = menselijkAdres(jsonEmail(rij?.waarde));
    if (uitInstelling) return uitInstelling;
  }
  const rollen = await admin.from('relatie_rollen').select('relatie_id,actief').eq('rol', 'voorzitter');
  if (rollen.error) return '';
  const ids = (rollen.data ?? [])
    .filter((rij) => rij.actief !== false)
    .map((rij) => Number(rij.relatie_id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return '';
  const relaties = await admin.from('relaties').select('id,email').in('id', ids);
  if (relaties.error) return '';
  for (const relatie of relaties.data ?? []) {
    const adres = menselijkAdres(jsonEmail(relatie.email));
    if (adres) return adres;
  }
  return '';
}
