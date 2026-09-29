/**
 * Een rol is een naam met een rechtenmatrix.
 * Die bestaat los van een account: je richt hem in en bekijkt hem
 * voordat er een persoon aan gekoppeld is.
 */

import { MODULES } from './modules.ts';
import type { ModuleSleutel, Rechtniveau } from './types.ts';

export type RechtenMatrix = Partial<Record<ModuleSleutel, Rechtniveau>>;

export interface BeheerRol {
  slug: string;
  naam: string;
  rechten: RechtenMatrix;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function legeMatrix(): RechtenMatrix {
  const matrix: RechtenMatrix = {};
  for (const module of MODULES) {
    matrix[module] = module === 'dashboard' ? 'lezen' : 'verborgen';
  }
  return matrix;
}

export function isRolSlug(waarde: string): boolean {
  return waarde.length > 0 && waarde.length <= 40 && SLUG.test(waarde);
}

export function slugVanNaam(naam: string): string {
  const basis = naam
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return basis;
}

export function vulMatrix(gedeeltelijk: RechtenMatrix | null | undefined): RechtenMatrix {
  const matrix = legeMatrix();
  if (!gedeeltelijk) return matrix;
  for (const module of MODULES) {
    const niveau = gedeeltelijk[module];
    if (niveau === 'verborgen' || niveau === 'lezen' || niveau === 'schrijven') {
      matrix[module] = niveau;
    }
  }
  return matrix;
}

export function standaardRollen(): BeheerRol[] {
  return [
    { slug: 'hans', naam: 'Hans', rechten: legeMatrix() },
    { slug: 'nelleke', naam: 'Nelleke', rechten: legeMatrix() },
    { slug: 'paul', naam: 'Paul', rechten: legeMatrix() },
  ];
}

export function rolWeergaveId(slug: string): string {
  return `rol:${slug}`;
}

export function rolUitWeergave(waarde: string | null | undefined): string | null {
  if (!waarde?.startsWith('rol:')) return null;
  const rol = waarde.slice('rol:'.length);
  return isRolSlug(rol) ? rol : null;
}

export function rolOpSlug(rollen: readonly BeheerRol[], slug: string): BeheerRol | null {
  return rollen.find((rol) => rol.slug === slug) ?? null;
}

function schoneNaam(naam: string): string {
  return naam.trim().replace(/\s+/g, ' ');
}

export function nieuweRol(naam: string, bestaande: readonly BeheerRol[]): { rol: BeheerRol } | { fout: string } {
  const schoon = schoneNaam(naam);
  if (schoon.length < 1 || schoon.length > 40) {
    return { fout: 'Geef de rol een naam van maximaal 40 tekens.' };
  }
  const slug = slugVanNaam(schoon);
  if (!isRolSlug(slug)) {
    return { fout: 'Die naam levert geen geldige rol op. Gebruik letters of cijfers.' };
  }
  if (bestaande.some((rol) => rol.slug === slug || rol.naam.toLowerCase() === schoon.toLowerCase())) {
    return { fout: 'Er is al een rol met die naam.' };
  }
  return { rol: { slug, naam: schoon, rechten: legeMatrix() } };
}

export type RolActie =
  | { soort: 'nieuw'; naam: string }
  | { soort: 'opslaan'; slug: string; naam: string; rechten: RechtenMatrix }
  | { soort: 'verwijder'; slug: string };

export function voerRolActieUit(
  rollen: readonly BeheerRol[],
  actie: RolActie,
): { rollen: BeheerRol[]; slug?: string } | { fout: string } {
  if (actie.soort === 'nieuw') {
    const aangemaakt = nieuweRol(actie.naam, rollen);
    if ('fout' in aangemaakt) return aangemaakt;
    return { rollen: [...rollen, aangemaakt.rol], slug: aangemaakt.rol.slug };
  }

  const huidig = rolOpSlug(rollen, actie.slug);
  if (!huidig) return { fout: 'Die rol bestaat niet.' };

  if (actie.soort === 'verwijder') {
    return { rollen: rollen.filter((rol) => rol.slug !== actie.slug) };
  }

  const schoon = schoneNaam(actie.naam);
  if (schoon.length < 1 || schoon.length > 40) {
    return { fout: 'Geef de rol een naam van maximaal 40 tekens.' };
  }
  if (rollen.some((rol) => rol.slug !== actie.slug && rol.naam.toLowerCase() === schoon.toLowerCase())) {
    return { fout: 'Er is al een rol met die naam.' };
  }
  const bijgewerkt: BeheerRol = { slug: huidig.slug, naam: schoon, rechten: vulMatrix(actie.rechten) };
  return {
    rollen: rollen.map((rol) => (rol.slug === actie.slug ? bijgewerkt : rol)),
    slug: bijgewerkt.slug,
  };
}

export function niveauVanRol(rol: BeheerRol, module: ModuleSleutel): Rechtniveau {
  return rol.rechten[module] ?? 'verborgen';
}
