/**
 * Ontvangers van de interne aanvraagmail.
 * Het extra adres komt alleen uit instellingen (extra_ontvangst_adres).
 * Leeg of onleesbaar blijft leeg: geen andere persoon als terugval.
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

/** De primaire ontvanger blijft. Een extra adres dat al BCC is, krijgt geen tweede mail. */
export function ontvangersZonderBcc(ontvangers: readonly string[], bcc: readonly string[]): string[] {
  const kopie = new Set(
    bcc.map((adres) => menselijkAdres(adres)).filter((adres): adres is string => Boolean(adres)),
  );
  return ontvangers.filter((adres, index) => index === 0 || !kopie.has(adres));
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
    };
  };
}

export async function leesExtraAanvraagOntvanger(
  env: Record<string, unknown> = process.env,
  bron?: OntvangerDb | null,
): Promise<string> {
  try {
    const admin = bron === undefined ? maakBeheerAdminClient(env) as unknown as OntvangerDb | null : bron;
    if (!admin) {
      console.warn('[aanvraag] extra ontvanger niet geconfigureerd: instelling niet leesbaar, alleen de primaire ontvanger');
      return '';
    }
    const instellingen = await admin.from('instellingen').select('sleutel,waarde').in('sleutel', ['extra_ontvangst_adres']);
    if (instellingen.error) {
      console.warn('[aanvraag] extra ontvanger niet geconfigureerd: instelling niet leesbaar, alleen de primaire ontvanger');
      return '';
    }
    const rij = (instellingen.data ?? []).find((item) => item.sleutel === 'extra_ontvangst_adres');
    const uitInstelling = menselijkAdres(jsonEmail(rij?.waarde));
    if (uitInstelling) return uitInstelling;
    console.warn('[aanvraag] extra ontvanger niet geconfigureerd');
    return '';
  } catch (error) {
    console.warn('[aanvraag] extra ontvanger niet geconfigureerd: instelling niet leesbaar, alleen de primaire ontvanger', error);
    return '';
  }
}
