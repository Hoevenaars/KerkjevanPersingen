import type { SupabaseClient } from '@supabase/supabase-js';
import {
  effectieveRechten,
  type BeheerProfiel,
  type BeheerSessie,
} from '../platform/beheer-sessie.ts';
import type { GebruikerRechten } from '../platform/types.ts';
import { laadProfiel, markeerGebruikerActief, waarborgSuperAdmin, werkLastActiveBij } from './beheer-gebruikers.ts';
import { maakBeheerAdminClient } from './supabase.ts';

export function basisSessie(): BeheerSessie {
  const gebruiker: BeheerProfiel = {
    id: 'shared',
    email: '',
    naam: 'Beheerder',
    functie: null,
    status: 'active',
    isSuperAdmin: true,
    actief: true,
    lastActiveAt: null,
  };
  const rechten: GebruikerRechten = { isSuperAdmin: true, perModule: {} };
  return {
    gebruiker,
    rechten,
    effectieveRechten: rechten,
    viewAs: null,
    bron: 'basic',
  };
}

export async function bouwSessie(opties: {
  client: SupabaseClient;
  userId: string;
  viewAsId?: string | null;
  env?: Record<string, unknown>;
}): Promise<BeheerSessie | { fout: 'disabled' | 'ontbreekt' }> {
  const geladen = await laadProfiel(opties.client, opties.userId);
  if (!geladen) return { fout: 'ontbreekt' };

  const admin = maakBeheerAdminClient(opties.env);
  let gebruiker = geladen.profiel;
  let rechten = geladen.rechten;
  if (admin) {
    const superEmail = String(opties.env?.SUPER_ADMIN_EMAIL ?? '').trim();
    gebruiker = await waarborgSuperAdmin(admin, gebruiker, superEmail);
    rechten = { ...rechten, isSuperAdmin: gebruiker.isSuperAdmin };
    if (gebruiker.status === 'invited') {
      await markeerGebruikerActief(admin, gebruiker.id);
      gebruiker = { ...gebruiker, status: 'active', actief: true };
    }
  }

  if (gebruiker.status === 'disabled') return { fout: 'disabled' };

  await werkLastActiveBij(opties.client, gebruiker);

  let viewAs: BeheerProfiel | null = null;
  let viewAsRechten: GebruikerRechten | null = null;
  if (opties.viewAsId && rechten.isSuperAdmin && opties.viewAsId !== gebruiker.id) {
    const doel = await laadProfiel(opties.client, opties.viewAsId);
    if (doel) {
      viewAs = doel.profiel;
      viewAsRechten = doel.rechten;
    }
  }

  return {
    gebruiker,
    rechten,
    effectieveRechten: effectieveRechten(rechten, viewAsRechten),
    viewAs,
    bron: 'supabase',
  };
}

export function loginFoutmelding(code: string | null): string {
  if (code === 'disabled') return 'Dit account is gedeactiveerd.';
  if (code === 'ongeldig') return 'E-mailadres of wachtwoord klopt niet.';
  if (code === 'ontbreekt') return 'Er is nog geen beheerprofiel voor dit account.';
  if (code === 'preview') return 'Wijzigingen zijn uitgeschakeld in preview.';
  if (code === 'alleen_lezen') return 'Je hebt geen schrijfrecht voor deze module.';
  if (code === 'geen_recht') return 'Je hebt geen toegang tot deze pagina.';
  return 'Inloggen is mislukt.';
}
