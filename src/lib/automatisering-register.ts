/**
 * Leest de centrale schakelaar uit Supabase.
 * Zonder service-role of bij een lege tabel gelden de defaults:
 * alleen de twee bestuursnotificaties mogen een provider aanroepen.
 */

import {
  STANDAARD_AUTOMATISERINGEN,
  magAutomatiseringUitvoeren,
  type Automatisering,
  type Verzendbesluit,
} from '../platform/automatisering.ts';

type Rij = {
  sleutel: string;
  naam: string;
  omschrijving: string;
  categorie: Automatisering['categorie'];
  status: Automatisering['status'];
  mailcategorie: string;
  trigger_tekst: string;
  actieve_trigger: boolean;
  ontvangerstype: string;
  risicovol: boolean;
  laatste_run: string | null;
  laatste_resultaat: string | null;
  gewijzigd_door: string | null;
  gewijzigd_op: string | null;
};

function vanRij(rij: Rij): Automatisering {
  return {
    sleutel: rij.sleutel,
    naam: rij.naam,
    omschrijving: rij.omschrijving,
    categorie: rij.categorie,
    status: rij.status,
    mailcategorie: rij.mailcategorie,
    trigger: rij.trigger_tekst,
    actieveTrigger: rij.actieve_trigger,
    ontvangerstype: rij.ontvangerstype,
    risicovol: rij.risicovol,
    laatsteRun: rij.laatste_run,
    laatsteResultaat: rij.laatste_resultaat,
    gewijzigdDoor: rij.gewijzigd_door,
    gewijzigdOp: rij.gewijzigd_op,
  };
}

export async function laadAutomatiseringsregister(
  env: Record<string, unknown> = process.env,
): Promise<readonly Automatisering[]> {
  try {
    const { maakBeheerAdminClient } = await import('./supabase.ts');
    const client = maakBeheerAdminClient(env);
    if (!client) return STANDAARD_AUTOMATISERINGEN;
    const db = client as unknown as {
      from: (tabel: string) => {
        select: (kolommen: string) => Promise<{ data: Rij[] | null; error: { message: string } | null }>;
      };
    };
    const { data, error } = await db
      .from('automatiseringen')
      .select('sleutel,naam,omschrijving,categorie,status,mailcategorie,trigger_tekst,actieve_trigger,ontvangerstype,risicovol,laatste_run,laatste_resultaat,gewijzigd_door,gewijzigd_op');
    if (error || !Array.isArray(data) || data.length === 0) return STANDAARD_AUTOMATISERINGEN;
    return (data as unknown as Rij[]).map(vanRij);
  } catch {
    return STANDAARD_AUTOMATISERINGEN;
  }
}

export async function besluitVoor(
  sleutel: string,
  register?: readonly Automatisering[],
  env?: Record<string, unknown>,
): Promise<Verzendbesluit> {
  const bron = register ?? (await laadAutomatiseringsregister(env));
  return magAutomatiseringUitvoeren(sleutel, bron);
}
