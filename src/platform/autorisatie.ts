/**
 * Route → module en toegang voor /beheer.
 * UI gebruikt dezelfde uitkomst als middleware en API-routes.
 */

import { BEHEER_MODULES, type ModuleSleutel } from './modules.ts';
import { magSchrijven, magZien } from './rechten.ts';
import type { GebruikerRechten } from './types.ts';

export type BeheerPadSoort = ModuleSleutel | 'auth' | 'onbekend';

export type BeheerToegang =
  | 'ok'
  | 'login'
  | 'verborgen'
  | 'alleen_lezen'
  | 'preview'
  | 'disabled';

const AUTH_PADEN = [
  '/beheer/login',
  '/beheer/wachtwoord',
  '/beheer/uitloggen',
  '/beheer/auth/callback',
  '/api/beheer/login',
  '/api/beheer/logout',
  '/api/beheer/wachtwoord',
];

function normaliseerPad(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

export function isBeheerAuthPad(pathname: string): boolean {
  const pad = normaliseerPad(pathname);
  return AUTH_PADEN.includes(pad) || pad.startsWith('/beheer/auth/');
}

export function isBeheerPad(pathname: string): boolean {
  return pathname.startsWith('/beheer') || pathname.startsWith('/api/beheer');
}

export function moduleVoorPad(pathname: string): BeheerPadSoort {
  const pad = normaliseerPad(pathname);
  if (isBeheerAuthPad(pad)) return 'auth';

  if (
    pad.startsWith('/beheer/instellingen/gebruikers') ||
    pad.startsWith('/api/beheer/gebruikers') ||
    pad.startsWith('/api/beheer/view-as')
  ) {
    return 'gebruikers';
  }
  if (pad.startsWith('/beheer/instellingen/templates')) return 'templates';
  if (pad.startsWith('/beheer/instellingen')) return 'instellingen';
  if (pad.startsWith('/beheer/aanvragen')) return 'aanvragen';
  if (pad.startsWith('/beheer/boekingen')) return 'boekingen';
  if (pad.startsWith('/beheer/kalender')) return 'kalender';
  if (pad.startsWith('/beheer/agenda')) return 'agenda';
  if (pad.startsWith('/beheer/planning')) return 'planning';
  if (pad.startsWith('/beheer/relaties')) return 'relaties';
  if (pad.startsWith('/beheer/finance')) return 'finance';
  if (pad.startsWith('/beheer/vrienden')) return 'vrienden';
  if (pad.startsWith('/beheer/nieuwsbrief')) return 'nieuwsbrief';
  if (pad === '/beheer' || pad === '/beheer/zoeken' || pad === '/beheer/migratie') {
    return 'dashboard';
  }
  if (pad.startsWith('/beheer')) return 'onbekend';
  return 'onbekend';
}

export function isMutatieMethode(methode: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(methode.toUpperCase());
}

export function beheerToegang(opties: {
  methode: string;
  module: BeheerPadSoort;
  ingelogd: boolean;
  actief: boolean;
  rechten: GebruikerRechten;
  viewAsActief: boolean;
}): BeheerToegang {
  if (opties.module === 'auth') return 'ok';
  if (!opties.ingelogd) return 'login';
  if (!opties.actief) return 'disabled';
  if (opties.module === 'onbekend') return 'verborgen';
  if (!magZien(opties.rechten, opties.module)) return 'verborgen';
  if (!isMutatieMethode(opties.methode)) return 'ok';
  if (opties.viewAsActief) return 'preview';
  if (!magSchrijven(opties.rechten, opties.module)) return 'alleen_lezen';
  return 'ok';
}

export function navigatieVoor(rechten: GebruikerRechten): {
  hoofd: { href: string; label: string }[];
  instellingen: { href: string; label: string }[];
} {
  const hoofd: { href: string; label: string }[] = (Object.keys(BEHEER_MODULES) as ModuleSleutel[])
    .filter((sleutel) => BEHEER_MODULES[sleutel].groep === 'hoofd' && magZien(rechten, sleutel))
    .map((sleutel) => ({
      href: BEHEER_MODULES[sleutel].href,
      label: BEHEER_MODULES[sleutel].label,
    }));

  if (magZien(rechten, 'instellingen')) {
    hoofd.push({ href: '/beheer/migratie/', label: 'Migratie' });
  }

  return { hoofd, instellingen: [] };
}
