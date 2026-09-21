/**
 * Server-side gebruikersbeheer. Alle privileged Auth-acties gaan via de admin-client.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { MODULES } from '../platform/modules.ts';
import {
  FUNCTIE_LABELS,
  isGebruikerFunctie,
  rechtenVoorFunctie,
  type AccountStatus,
  type AuditActie,
  type GebruikerFunctie,
  type RechtenMatrix,
} from '../platform/referentie-gebruikers.ts';
import {
  lastActiveMoetBijwerken,
  magAccountDeactiveren,
  magAccountActiveren,
  magSuperAdminVlagZetten,
  nieuweStatusNaDeactiveren,
  nieuweStatusNaReactiveren,
  rechtenVanRijen,
  type BeheerProfiel,
} from '../platform/beheer-sessie.ts';
import { magGebruikersBeheren, magRechtWijzigen } from '../platform/rechten.ts';
import type { GebruikerRechten, Rechtniveau } from '../platform/types.ts';

export interface BeheerGebruikerRij extends BeheerProfiel {
  rechten: RechtenMatrix;
  laatstActiefLabel: string | null;
}

export interface InviteInvoer {
  naam: string;
  email: string;
  functie?: string;
  rechten?: RechtenMatrix;
  redirectTo: string;
}

export type GebruikerFout =
  | 'geen_recht'
  | 'ongeldig'
  | 'bestaat'
  | 'niet_gevonden'
  | 'super_admin_beschermd'
  | 'preview'
  | 'niet_geconfigureerd';

export function normaliseerEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function valideerInvite(invoer: InviteInvoer): string | null {
  if (!invoer.naam.trim()) return 'Naam is verplicht.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normaliseerEmail(invoer.email))) {
    return 'E-mailadres is ongeldig.';
  }
  if (invoer.functie && invoer.functie !== '' && !isGebruikerFunctie(invoer.functie)) {
    return 'Onbekende functie.';
  }
  return null;
}

export function matrixVanFormulier(data: Iterable<[string, FormDataEntryValue]>): RechtenMatrix {
  const matrix: RechtenMatrix = {};
  for (const [naam, waarde] of data) {
    if (!naam.startsWith('recht_')) continue;
    const module = naam.slice('recht_'.length);
    if (!MODULES.includes(module as (typeof MODULES)[number])) continue;
    if (waarde !== 'verborgen' && waarde !== 'lezen' && waarde !== 'schrijven') continue;
    matrix[module as keyof RechtenMatrix] = waarde;
  }
  return matrix;
}

export function inviteRechten(invoer: InviteInvoer): RechtenMatrix {
  if (invoer.rechten && Object.keys(invoer.rechten).length > 0) return invoer.rechten;
  return rechtenVoorFunctie(invoer.functie);
}

export function profielUitRij(rij: {
  id: string;
  email: string;
  naam: string;
  functie?: string | null;
  status?: string | null;
  is_super_admin?: boolean;
  actief?: boolean;
  last_active_at?: string | null;
}): BeheerProfiel {
  const functie = rij.functie && isGebruikerFunctie(rij.functie) ? rij.functie : null;
  const status = (rij.status as AccountStatus | undefined) ?? (rij.actief ? 'active' : 'invited');
  return {
    id: rij.id,
    email: rij.email,
    naam: rij.naam,
    functie,
    status,
    isSuperAdmin: Boolean(rij.is_super_admin),
    actief: rij.actief !== false && status === 'active',
    lastActiveAt: rij.last_active_at ?? null,
  };
}

export function functieLabel(functie: GebruikerFunctie | null, isSuperAdmin: boolean): string {
  if (isSuperAdmin) return 'Super Admin';
  if (functie) return FUNCTIE_LABELS[functie];
  return 'Aangepast';
}

export function statusLabel(status: AccountStatus): string {
  if (status === 'invited') return 'Uitgenodigd';
  if (status === 'disabled') return 'Gedeactiveerd';
  return 'Actief';
}

async function schrijfAudit(
  admin: SupabaseClient,
  invoer: {
    actorId: string;
    actorNaam: string;
    targetId?: string;
    actie: AuditActie;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await admin.from('auditlog').insert({
    actor_id: invoer.actorId,
    actor_naam: invoer.actorNaam,
    onderwerp_type: 'gebruiker',
    onderwerp_id: invoer.targetId ?? invoer.actorId,
    actie: invoer.actie,
    details: invoer.details ?? {},
  });
}

async function schrijfRechten(
  admin: SupabaseClient,
  profielId: string,
  rechten: RechtenMatrix,
): Promise<void> {
  const rijen = MODULES.map((module) => ({
    profiel_id: profielId,
    module_sleutel: module,
    niveau: (rechten[module] ?? 'verborgen') as Rechtniveau,
  }));
  await admin.from('gebruikersrechten').delete().eq('profiel_id', profielId);
  if (rijen.length) {
    const { error } = await admin.from('gebruikersrechten').insert(rijen);
    if (error) throw error;
  }
}

export async function laadProfiel(
  client: SupabaseClient,
  userId: string,
): Promise<{ profiel: BeheerProfiel; rechten: GebruikerRechten } | null> {
  const { data: rij, error } = await client
    .from('profielen')
    .select('id, email, naam, functie, status, is_super_admin, actief, last_active_at')
    .eq('id', userId)
    .maybeSingle();
  if (error || !rij) return null;

  const { data: rechtenRijen } = await client
    .from('gebruikersrechten')
    .select('module_sleutel, niveau')
    .eq('profiel_id', userId);

  const profiel = profielUitRij(rij);
  return {
    profiel,
    rechten: rechtenVanRijen(
      profiel.isSuperAdmin,
      (rechtenRijen ?? []).map((item) => ({ module: item.module_sleutel, niveau: item.niveau })),
    ),
  };
}

export async function laadAlleGebruikers(admin: SupabaseClient): Promise<BeheerGebruikerRij[]> {
  const { data: profielen, error } = await admin
    .from('profielen')
    .select('id, email, naam, functie, status, is_super_admin, actief, last_active_at')
    .order('naam');
  if (error) throw error;

  const { data: rechtenRijen } = await admin.from('gebruikersrechten').select('profiel_id, module_sleutel, niveau');
  const perGebruiker = new Map<string, RechtenMatrix>();
  for (const rij of rechtenRijen ?? []) {
    const huidig = perGebruiker.get(rij.profiel_id) ?? {};
    huidig[rij.module_sleutel as keyof RechtenMatrix] = rij.niveau;
    perGebruiker.set(rij.profiel_id, huidig);
  }

  return (profielen ?? []).map((rij) => {
    const profiel = profielUitRij(rij);
    return {
      ...profiel,
      rechten: perGebruiker.get(rij.id) ?? {},
      laatstActiefLabel: profiel.lastActiveAt,
    };
  });
}

export async function nodigGebruikerUit(
  admin: SupabaseClient,
  actor: { id: string; naam: string; rechten: GebruikerRechten },
  invoer: InviteInvoer,
): Promise<{ id: string } | { fout: GebruikerFout; melding: string }> {
  if (!magGebruikersBeheren(actor.rechten)) {
    return { fout: 'geen_recht', melding: 'Alleen Super Admin mag gebruikers uitnodigen.' };
  }
  const validatie = valideerInvite(invoer);
  if (validatie) return { fout: 'ongeldig', melding: validatie };

  const email = normaliseerEmail(invoer.email);
  const functie = invoer.functie && isGebruikerFunctie(invoer.functie) ? invoer.functie : null;
  const rechten = inviteRechten({ ...invoer, email });

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { naam: invoer.naam.trim(), functie: functie ?? '' },
    redirectTo: invoer.redirectTo,
  });
  if (error || !data.user) {
    const tekst = error?.message ?? 'Uitnodigen mislukt.';
    if (/already|registered|exists/i.test(tekst)) {
      return { fout: 'bestaat', melding: 'Dit e-mailadres heeft al een account.' };
    }
    return { fout: 'ongeldig', melding: tekst };
  }

  const { error: profielFout } = await admin.from('profielen').upsert({
    id: data.user.id,
    email,
    naam: invoer.naam.trim(),
    functie,
    status: 'invited',
    actief: false,
    is_super_admin: false,
  });
  if (profielFout) return { fout: 'ongeldig', melding: profielFout.message };

  await schrijfRechten(admin, data.user.id, rechten);
  await schrijfAudit(admin, {
    actorId: actor.id,
    actorNaam: actor.naam,
    targetId: data.user.id,
    actie: 'USER_INVITED',
    details: { email, functie, rechten },
  });
  return { id: data.user.id };
}

export async function werkGebruikerBij(
  admin: SupabaseClient,
  actor: { id: string; naam: string; rechten: GebruikerRechten },
  doelId: string,
  wijziging: { naam?: string; functie?: string | null; rechten?: RechtenMatrix },
): Promise<{ ok: true } | { fout: GebruikerFout; melding: string }> {
  if (!magGebruikersBeheren(actor.rechten)) {
    return { fout: 'geen_recht', melding: 'Geen recht om gebruikers te bewerken.' };
  }
  const geladen = await laadProfiel(admin, doelId);
  if (!geladen) return { fout: 'niet_gevonden', melding: 'Gebruiker niet gevonden.' };
  if (!magRechtWijzigen(actor.rechten, geladen.rechten)) {
    return { fout: 'super_admin_beschermd', melding: 'Super Admin-rechten mogen niet door anderen worden gewijzigd.' };
  }

  const functie =
    wijziging.functie === undefined
      ? geladen.profiel.functie
      : wijziging.functie && isGebruikerFunctie(wijziging.functie)
        ? wijziging.functie
        : null;

  const { error } = await admin
    .from('profielen')
    .update({
      naam: wijziging.naam?.trim() || geladen.profiel.naam,
      functie,
    })
    .eq('id', doelId);
  if (error) return { fout: 'ongeldig', melding: error.message };

  if (wijziging.rechten) {
    await schrijfRechten(admin, doelId, wijziging.rechten);
    await schrijfAudit(admin, {
      actorId: actor.id,
      actorNaam: actor.naam,
      targetId: doelId,
      actie: 'PERMISSIONS_CHANGED',
      details: { rechten: wijziging.rechten, functie },
    });
  }
  return { ok: true };
}

export async function zetGebruikerStatus(
  admin: SupabaseClient,
  actor: { id: string; naam: string; rechten: GebruikerRechten },
  doelId: string,
  actie: 'disable' | 'reactivate',
): Promise<{ ok: true } | { fout: GebruikerFout; melding: string }> {
  if (!magGebruikersBeheren(actor.rechten)) {
    return { fout: 'geen_recht', melding: 'Geen recht om accounts te wijzigen.' };
  }
  if (doelId === actor.id) {
    return { fout: 'ongeldig', melding: 'Je kunt je eigen account niet deactiveren.' };
  }
  const geladen = await laadProfiel(admin, doelId);
  if (!geladen) return { fout: 'niet_gevonden', melding: 'Gebruiker niet gevonden.' };
  if (geladen.profiel.isSuperAdmin && !actor.rechten.isSuperAdmin) {
    return { fout: 'super_admin_beschermd', melding: 'Super Admin kan niet worden beperkt.' };
  }

  if (actie === 'disable') {
    if (!magAccountDeactiveren(geladen.profiel.status)) {
      return { fout: 'ongeldig', melding: 'Dit account is al gedeactiveerd.' };
    }
    const status = nieuweStatusNaDeactiveren();
    const { error } = await admin.from('profielen').update({ status, actief: false }).eq('id', doelId);
    if (error) return { fout: 'ongeldig', melding: error.message };
    await admin.auth.admin.signOut(doelId, 'global');
    await schrijfAudit(admin, {
      actorId: actor.id,
      actorNaam: actor.naam,
      targetId: doelId,
      actie: 'USER_DISABLED',
    });
    return { ok: true };
  }

  if (!magAccountActiveren(geladen.profiel.status)) {
    return { fout: 'ongeldig', melding: 'Dit account is al actief.' };
  }
  const status = nieuweStatusNaReactiveren(Boolean(geladen.profiel.lastActiveAt));
  const { error } = await admin
    .from('profielen')
    .update({ status, actief: status === 'active' })
    .eq('id', doelId);
  if (error) return { fout: 'ongeldig', melding: error.message };
  await schrijfAudit(admin, {
    actorId: actor.id,
    actorNaam: actor.naam,
    targetId: doelId,
    actie: 'USER_REACTIVATED',
    details: { status },
  });
  return { ok: true };
}

export async function verstuurUitnodigingOpnieuw(
  admin: SupabaseClient,
  actor: { id: string; naam: string; rechten: GebruikerRechten },
  doelId: string,
  redirectTo: string,
): Promise<{ ok: true } | { fout: GebruikerFout; melding: string }> {
  if (!magGebruikersBeheren(actor.rechten)) {
    return { fout: 'geen_recht', melding: 'Geen recht om uitnodigingen te versturen.' };
  }
  const geladen = await laadProfiel(admin, doelId);
  if (!geladen) return { fout: 'niet_gevonden', melding: 'Gebruiker niet gevonden.' };
  if (geladen.profiel.status === 'disabled') {
    return { fout: 'ongeldig', melding: 'Reactiveer het account eerst.' };
  }
  const { error } = await admin.auth.admin.inviteUserByEmail(geladen.profiel.email, {
    data: { naam: geladen.profiel.naam, functie: geladen.profiel.functie ?? '' },
    redirectTo,
  });
  if (error) return { fout: 'ongeldig', melding: error.message };
  await schrijfAudit(admin, {
    actorId: actor.id,
    actorNaam: actor.naam,
    targetId: doelId,
    actie: 'USER_INVITED',
    details: { opnieuw: true },
  });
  return { ok: true };
}

export async function markeerGebruikerActief(admin: SupabaseClient, userId: string): Promise<void> {
  const geladen = await laadProfiel(admin, userId);
  if (!geladen) return;
  if (geladen.profiel.status === 'disabled') return;
  if (geladen.profiel.status === 'active') return;
  await admin.from('profielen').update({ status: 'active', actief: true }).eq('id', userId);
  await schrijfAudit(admin, {
    actorId: userId,
    actorNaam: geladen.profiel.naam,
    targetId: userId,
    actie: 'USER_ACTIVATED',
  });
}

export async function werkLastActiveBij(client: SupabaseClient, profiel: BeheerProfiel): Promise<void> {
  if (!lastActiveMoetBijwerken(profiel.lastActiveAt)) return;
  await client.from('profielen').update({ last_active_at: new Date().toISOString() }).eq('id', profiel.id);
}

export async function schrijfViewAsAudit(
  admin: SupabaseClient,
  actor: { id: string; naam: string },
  targetId: string | null,
  actie: 'VIEW_AS_STARTED' | 'VIEW_AS_ENDED',
): Promise<void> {
  await schrijfAudit(admin, {
    actorId: actor.id,
    actorNaam: actor.naam,
    targetId: targetId ?? actor.id,
    actie,
  });
}

export async function waarborgSuperAdmin(
  admin: SupabaseClient,
  profiel: BeheerProfiel,
  superAdminEmail: string | undefined,
): Promise<BeheerProfiel> {
  const email = normaliseerEmail(superAdminEmail ?? '');
  if (!email || normaliseerEmail(profiel.email) !== email) return profiel;
  if (profiel.isSuperAdmin && profiel.status === 'active') return profiel;
  if (!magSuperAdminVlagZetten({ isSuperAdmin: true, perModule: {} }, true, profiel.isSuperAdmin)) {
    return profiel;
  }
  await admin
    .from('profielen')
    .update({ is_super_admin: true, status: 'active', actief: true })
    .eq('id', profiel.id);
  return { ...profiel, isSuperAdmin: true, status: 'active', actief: true };
}
