/**
 * Tijdelijke toezichtkopie voor Nick.
 * Mail die via Resend naar iemand van het kerkje gaat, krijgt een BCC.
 * Mail naar een aanvrager of andere buitenstaander blijft zonder die kopie.
 * Zet TOEZICHT_BCC_EMAIL leeg om de kopie uit te zetten.
 */

export const STANDAARD_TOEZICHT_BCC = 'nhoevenaars@gmail.com';

/** Postbussen van het kerkje die niet als relatie met een rol zijn vastgelegd. */
const VASTE_INTERNE_ADRESSEN = ['contractbeheer.kvp@gmail.com'];

/** Bestuursnotificaties horen altijd bij het kerkje, ook als het ontvangstadres wijzigt. */
const INTERNE_SLEUTELS = new Set(['aanvraag_bestuur', 'contact_bestuur']);

export function normaliseerEmail(adres: string): string {
  return adres.trim().toLowerCase();
}

export function toezichtBccAdres(env: Record<string, unknown> = process.env): string {
  if (Object.prototype.hasOwnProperty.call(env, 'TOEZICHT_BCC_EMAIL')) {
    return String(env.TOEZICHT_BCC_EMAIL ?? '').trim();
  }
  return STANDAARD_TOEZICHT_BCC;
}

export function isInterneKerkjeSleutel(sleutel: string): boolean {
  return INTERNE_SLEUTELS.has(sleutel);
}

function extraAdressen(env: Record<string, unknown>): string[] {
  return String(env.CONTACT_BCC_EMAIL ?? '')
    .split(',')
    .map((deel) => deel.trim())
    .filter(Boolean);
}

export function bccVoorKerkjeOntvanger(
  naar: string,
  leden: Iterable<string>,
  env: Record<string, unknown> = process.env,
): string[] {
  const doel = normaliseerEmail(naar);
  if (!doel) return [];

  const bekend = new Set<string>();
  for (const adres of leden) {
    const norm = normaliseerEmail(adres);
    if (norm) bekend.add(norm);
  }
  for (const vast of VASTE_INTERNE_ADRESSEN) bekend.add(vast);
  const fallback = normaliseerEmail(String(env.CONTACT_FALLBACK_EMAIL ?? ''));
  if (fallback) bekend.add(fallback);
  if (!bekend.has(doel)) return [];

  const gekozen = new Map<string, string>();
  const voeg = (adres: string) => {
    const schoon = adres.trim();
    const norm = normaliseerEmail(schoon);
    if (!norm || norm === doel || gekozen.has(norm)) return;
    gekozen.set(norm, schoon);
  };
  voeg(toezichtBccAdres(env));
  for (const extra of extraAdressen(env)) voeg(extra);
  return [...gekozen.values()];
}

export async function laadKerkjeLeden(env: Record<string, unknown> = process.env): Promise<string[]> {
  const adressen = new Set<string>(VASTE_INTERNE_ADRESSEN);
  const fallback = String(env.CONTACT_FALLBACK_EMAIL ?? '').trim();
  if (fallback) adressen.add(fallback);
  try {
    const { maakBeheerAdminClient } = await import('./supabase.ts');
    const client = maakBeheerAdminClient(env);
    if (!client) return [...adressen];
    const rollen = await client.from('relatie_rollen').select('relatie_id');
    if (rollen.error || !rollen.data?.length) return [...adressen];
    const ids = [...new Set(rollen.data.map((rij) => rij.relatie_id))];
    const relaties = await client.from('relaties').select('email').in('id', ids);
    if (relaties.error) return [...adressen];
    for (const rij of relaties.data ?? []) {
      const email = String(rij.email ?? '').trim();
      if (email) adressen.add(email);
    }
  } catch {
    return [...adressen];
  }
  return [...adressen];
}

export async function toezichtBcc(
  naar: string,
  env: Record<string, unknown> = process.env,
  interneMail = false,
): Promise<string[]> {
  const leden = await laadKerkjeLeden(env);
  if (interneMail) leden.push(naar);
  return bccVoorKerkjeOntvanger(naar, leden, env);
}
