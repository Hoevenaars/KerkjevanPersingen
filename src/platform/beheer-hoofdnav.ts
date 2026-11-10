/**
 * Hoofdnavigatie van /beheer, achter BEHEER_HOOFDNAV.
 * Standaard uit. Zonder de vlag blijft het bestaande menu staan.
 * De vlag geeft geen extra schrijfrecht en verwijdert geen route.
 */

import { magZien } from './rechten.ts';
import type { GebruikerRechten } from './types.ts';

export type HoofdSleutel = 'overzicht' | 'verhuur' | 'website' | 'contacten' | 'financien' | 'instellingen';

export interface NavItem {
  sleutel: string;
  href: string;
  label: string;
  groep?: string;
  toelichting?: string;
}

export interface HoofdItem {
  sleutel: HoofdSleutel;
  href: string;
  label: string;
}

export interface HoofdOpties {
  /** True als VERHUUR_OVERZICHT de verhuuragenda en /beheer/website/ opent. */
  verhuurAgenda: boolean;
}

export interface Locatie {
  hoofd: string;
  sub: string | null;
}

const HOOFD_LABEL: Record<HoofdSleutel, string> = {
  overzicht: 'Overzicht',
  verhuur: 'Verhuur',
  website: 'Website',
  contacten: 'Contacten',
  financien: 'Financiën',
  instellingen: 'Instellingen',
};

function leesOmgeving(): Record<string, unknown> {
  const runtime = typeof process !== 'undefined' ? process.env : undefined;
  const meta = import.meta.env as Record<string, unknown>;
  return {
    BEHEER_HOOFDNAV: runtime?.['BEHEER_HOOFDNAV'] ?? meta.BEHEER_HOOFDNAV,
  };
}

export function hoofdnavAan(env: Record<string, unknown> = leesOmgeving()): boolean {
  const waarde = env.BEHEER_HOOFDNAV;
  return waarde === true || waarde === 'true';
}

export function normaliseerBeheerPad(pathname: string): string {
  const zonderQuery = pathname.split('?')[0] ?? pathname;
  if (zonderQuery.length > 1 && zonderQuery.endsWith('/')) return zonderQuery.slice(0, -1);
  return zonderQuery;
}

export function padActief(pathname: string, href: string): boolean {
  const pad = normaliseerBeheerPad(pathname);
  const doel = normaliseerBeheerPad(href);
  if (doel === '/beheer' || doel === '/beheer/instellingen') return pad === doel;
  return pad === doel || pad.startsWith(`${doel}/`);
}

export function sectieVoorPad(pathname: string): HoofdSleutel | null {
  const pad = normaliseerBeheerPad(pathname);
  if (pad === '/beheer' || pad === '/beheer/zoeken') return 'overzicht';
  if (
    pad.startsWith('/beheer/verhuur') ||
    pad.startsWith('/beheer/aanvragen') ||
    pad.startsWith('/beheer/boekingen') ||
    pad.startsWith('/beheer/kalender') ||
    pad.startsWith('/beheer/planning')
  ) {
    return 'verhuur';
  }
  if (pad.startsWith('/beheer/website') || pad.startsWith('/beheer/agenda') || pad.startsWith('/beheer/publiceren')) {
    return 'website';
  }
  if (
    pad.startsWith('/beheer/contacten') ||
    pad.startsWith('/beheer/relaties') ||
    pad.startsWith('/beheer/vrienden') ||
    pad.startsWith('/beheer/nieuwsbrief')
  ) {
    return 'contacten';
  }
  if (pad.startsWith('/beheer/finance')) return 'financien';
  if (
    pad.startsWith('/beheer/instellingen') ||
    pad.startsWith('/beheer/migratie') ||
    pad.startsWith('/beheer/analytics') ||
    pad.startsWith('/beheer/mail')
  ) {
    return 'instellingen';
  }
  return null;
}

function verhuurSub(rechten: GebruikerRechten, opties: HoofdOpties): NavItem[] {
  const items: NavItem[] = [];
  if (opties.verhuurAgenda && magZien(rechten, 'boekingen')) {
    items.push({ sleutel: 'verhuuragenda', href: '/beheer/verhuur/', label: 'Verhuuragenda' });
  }
  if (magZien(rechten, 'aanvragen')) {
    items.push({ sleutel: 'aanvragen', href: '/beheer/aanvragen/', label: 'Aanvragen' });
  }
  if (magZien(rechten, 'boekingen')) {
    items.push({ sleutel: 'boekingen', href: '/beheer/boekingen/', label: 'Boekingen' });
  }
  if (magZien(rechten, 'kalender')) {
    items.push({ sleutel: 'kalender', href: '/beheer/kalender/', label: 'Maandkalender' });
  }
  if (magZien(rechten, 'planning')) {
    items.push({ sleutel: 'planning', href: '/beheer/planning/', label: 'Planning' });
  }
  return items;
}

function websiteSub(rechten: GebruikerRechten, opties: HoofdOpties): NavItem[] {
  if (!magZien(rechten, 'agenda')) return [];
  const items: NavItem[] = [];
  if (opties.verhuurAgenda) {
    items.push({ sleutel: 'website', href: '/beheer/website/', label: 'Overzicht' });
  }
  items.push({ sleutel: 'activiteiten', href: '/beheer/agenda/', label: 'Activiteiten' });
  items.push({ sleutel: 'publiceren', href: '/beheer/publiceren/', label: 'Publiceren' });
  return items;
}

function contactenSub(rechten: GebruikerRechten): NavItem[] {
  const items: NavItem[] = [];
  if (magZien(rechten, 'relaties')) {
    items.push({ sleutel: 'relaties', href: '/beheer/relaties/', label: 'Relaties' });
  }
  if (magZien(rechten, 'vrienden')) {
    items.push({ sleutel: 'vrienden', href: '/beheer/vrienden/', label: 'Vrienden' });
  }
  if (magZien(rechten, 'nieuwsbrief')) {
    items.push({ sleutel: 'nieuwsbrief', href: '/beheer/nieuwsbrief/', label: 'Nieuwsbrief' });
  }
  return items;
}

function instellingenSub(rechten: GebruikerRechten): NavItem[] {
  const items: NavItem[] = [];
  const organisatie = 'Organisatie en verhuur';
  const personen = 'Personen en toegang';
  const communicatie = 'Communicatie';
  const technisch = 'Technisch';
  if (magZien(rechten, 'instellingen')) {
    items.push({ sleutel: 'algemeen', href: '/beheer/instellingen/', label: 'Algemeen', groep: organisatie });
    items.push({
      sleutel: 'verhuurinstellingen',
      href: '/beheer/instellingen/verhuur/',
      label: 'Verhuur',
      groep: organisatie,
      toelichting: 'nog niet op te slaan',
    });
  }
  if (magZien(rechten, 'finance_instellingen')) {
    items.push({
      sleutel: 'finance-instellingen',
      href: '/beheer/instellingen/finance/',
      label: 'Financiële instellingen',
      groep: organisatie,
      toelichting: 'nog niet op te slaan',
    });
  }
  if (magZien(rechten, 'gastheerbeheer')) {
    items.push({
      sleutel: 'gastheren',
      href: '/beheer/instellingen/gastheren/',
      label: 'Expositiebegeleiders',
      groep: personen,
    });
  }
  if (magZien(rechten, 'gebruikers')) {
    items.push({
      sleutel: 'gebruikers',
      href: '/beheer/instellingen/gebruikers/',
      label: 'Gebruikers en rechten',
      groep: personen,
    });
  }
  if (magZien(rechten, 'instellingen')) {
    items.push({ sleutel: 'meldingen', href: '/beheer/instellingen/meldingen/', label: 'Meldingen', groep: communicatie });
  }
  if (magZien(rechten, 'automatiseringen')) {
    items.push({
      sleutel: 'automatiseringen',
      href: '/beheer/instellingen/automatiseringen/',
      label: 'Automatiseringen',
      groep: communicatie,
    });
  }
  if (magZien(rechten, 'templates')) {
    items.push({
      sleutel: 'mailtemplates',
      href: '/beheer/instellingen/mailtemplates/',
      label: 'Mailtemplates',
      groep: communicatie,
    });
  }
  if (magZien(rechten, 'systeembeheer')) {
    items.push({
      sleutel: 'systeem',
      href: '/beheer/instellingen/systeem/',
      label: 'Systeem',
      groep: technisch,
      toelichting: 'alleen bekijken',
    });
  }
  if (magZien(rechten, 'analytics')) {
    items.push({
      sleutel: 'analytics',
      href: '/beheer/analytics/',
      label: 'Bezoekcijfers',
      groep: technisch,
      toelichting: 'zelden nodig',
    });
  }
  if (magZien(rechten, 'migratie')) {
    items.push({
      sleutel: 'migratie',
      href: '/beheer/migratie/',
      label: 'Migratie',
      groep: technisch,
      toelichting: 'alleen bekijken',
    });
  }
  return items;
}

export function subitems(sectie: HoofdSleutel, rechten: GebruikerRechten, opties: HoofdOpties): NavItem[] {
  if (sectie === 'verhuur') return verhuurSub(rechten, opties);
  if (sectie === 'website') return websiteSub(rechten, opties);
  if (sectie === 'contacten') return contactenSub(rechten);
  if (sectie === 'instellingen') return instellingenSub(rechten);
  return [];
}

export function groepeer(items: readonly NavItem[]): { titel: string; items: NavItem[] }[] {
  const volgorde: string[] = [];
  const groepen = new Map<string, NavItem[]>();
  for (const item of items) {
    const titel = item.groep ?? '';
    const lijst = groepen.get(titel);
    if (lijst) lijst.push(item);
    else {
      volgorde.push(titel);
      groepen.set(titel, [item]);
    }
  }
  return volgorde.map((titel) => ({ titel, items: groepen.get(titel) ?? [] }));
}

export function hoofditems(rechten: GebruikerRechten, opties: HoofdOpties): HoofdItem[] {
  const items: HoofdItem[] = [];
  if (magZien(rechten, 'dashboard')) {
    items.push({ sleutel: 'overzicht', href: '/beheer/', label: HOOFD_LABEL.overzicht });
  }
  const verhuur = verhuurSub(rechten, opties);
  const verhuurStart =
    verhuur.find((item) => item.sleutel === 'verhuuragenda') ??
    verhuur.find((item) => item.sleutel === 'boekingen') ??
    verhuur[0];
  if (verhuurStart) {
    items.push({
      sleutel: 'verhuur',
      href: verhuurStart.href,
      label: HOOFD_LABEL.verhuur,
    });
  }
  const website = websiteSub(rechten, opties);
  if (website.length > 0) {
    items.push({ sleutel: 'website', href: website[0].href, label: HOOFD_LABEL.website });
  }
  if (contactenSub(rechten).length > 0) {
    items.push({ sleutel: 'contacten', href: '/beheer/contacten/', label: HOOFD_LABEL.contacten });
  }
  if (magZien(rechten, 'finance')) {
    items.push({ sleutel: 'financien', href: '/beheer/finance/', label: HOOFD_LABEL.financien });
  }
  const instellingen = instellingenSub(rechten);
  if (instellingen.length > 0) {
    items.push({ sleutel: 'instellingen', href: instellingen[0].href, label: HOOFD_LABEL.instellingen });
  }
  return items;
}

export function locatieVoorPad(pathname: string, rechten: GebruikerRechten, opties: HoofdOpties): Locatie | null {
  const sectie = sectieVoorPad(pathname);
  if (!sectie) return null;
  const sub = subitems(sectie, rechten, opties)
    .filter((item) => padActief(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return { hoofd: HOOFD_LABEL[sectie], sub: sub?.label ?? null };
}

const HERKOMST = {
  overzicht: { href: '/beheer/', label: 'Overzicht' },
  financien: { href: '/beheer/finance/', label: 'Financiën' },
} as const;

export type Herkomst = keyof typeof HERKOMST;

export function herkomstUitQuery(waarde: string | null): { href: string; label: string } | null {
  if (waarde === 'overzicht' || waarde === 'financien') return HERKOMST[waarde];
  return null;
}

/** Alleen een bestaand beheerpad. Geen extern adres. */
export function metHerkomst(href: string, herkomst: Herkomst): string {
  let url: URL;
  try {
    url = new URL(href, 'https://beheer.lokaal');
  } catch {
    return href;
  }
  if (url.origin !== 'https://beheer.lokaal' || !url.pathname.startsWith('/beheer')) return href;
  url.searchParams.set('van', herkomst);
  const pad = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  const query = url.searchParams.toString();
  return query ? `${pad}?${query}` : pad;
}

export function dossierHref(id: string, verhuurAgenda: boolean): string {
  if (verhuurAgenda) return `/beheer/verhuur/?dossier=${encodeURIComponent(id)}`;
  return `/beheer/boekingen/${encodeURIComponent(id)}/`;
}
