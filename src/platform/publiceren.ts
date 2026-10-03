/**
 * Werklijst voor het publiceren van activiteiten.
 * Compleetheid adviseert. Publiceren beslist het bestuur.
 * Geen mail, geen workflow.
 */

import { voegDagenToe } from './datum.ts';

export const PUBLICATIE_DAGEN = 56;
export const STANDAARD_AFBEELDING = '/foto/kerkje-standaard.svg';
export const WEBSITE_BASIS = 'https://kerkjepersingen.nl';

export const WERKSTATUS = {
  geannuleerd: 'Geannuleerd',
  verborgen: 'Verborgen',
  gepubliceerd: 'Gepubliceerd',
  klaar: 'Klaar om te publiceren',
  mist_content: 'Mist content',
} as const;

export type Werkstatus = keyof typeof WERKSTATUS;

export interface PublicatieBron {
  id: string;
  start: string;
  eind: string;
  titel: string;
  exposanten?: string;
  organisatie?: string;
  korteOmschrijving?: string;
  volledigeOmschrijving?: string;
  omschrijving?: string;
  praktisch?: string;
  fotoPad?: string;
  slug?: string;
  soort?: string | null;
  publicatiestatus?: 'publiek' | 'bezet' | 'verborgen' | null;
  geannuleerd?: boolean;
  tabel?: 'publieke_activiteiten' | 'activiteit_bron' | 'boekingen';
  legacyId?: string;
  boekingId?: string;
  trigger?: string | null;
}

export interface PublicatieCheck {
  sleutel: 'titel' | 'datum' | 'kort' | 'volledig' | 'praktisch' | 'afbeelding' | 'url';
  label: string;
  ok: boolean;
  /** Content waarschuwt. Automatisch is opgelost door een fallback en telt niet als ontbrekend. */
  rol: 'content' | 'automatisch';
}

/** Handmatig publiceren: nu online, later niet alsnog tegenhouden op content. */
export const HANDMATIGE_PUBLICATIE_TRIGGER = 'direct' as const;

/** Nieuw concept zonder bestaand publicatierecord. Nooit bezet. */
export const CONCEPT_ZICHTBAARHEID = 'verborgen' as const;

export interface PublicatieVenster {
  van: string;
  tot: string;
  stap: number;
}

export function publicatieVenster(vandaag: string, stap = 0): PublicatieVenster {
  const van = voegDagenToe(vandaag, stap * PUBLICATIE_DAGEN);
  const tot = voegDagenToe(van, PUBLICATIE_DAGEN);
  return { van, tot, stap };
}

export function leesVensterStap(waarde: string | null): number {
  const stap = Number(waarde ?? '0');
  if (!Number.isInteger(stap) || stap < -12 || stap > 12) return 0;
  return stap;
}

function overlapt(item: { start: string; eind: string }, venster: PublicatieVenster): boolean {
  return item.start <= venster.tot && item.eind >= venster.van;
}

export function ontdubbelPublicatie<T extends PublicatieBron>(items: readonly T[]): T[] {
  const gekozen = new Map<string, T>();
  const los: T[] = [];
  for (const item of items) {
    const sleutel = item.legacyId?.trim();
    if (!sleutel) {
      los.push(item);
      continue;
    }
    const bestaand = gekozen.get(sleutel);
    if (!bestaand || item.tabel === 'publieke_activiteiten') gekozen.set(sleutel, item);
  }
  return [...los, ...gekozen.values()];
}

export function inPublicatieVenster<T extends PublicatieBron>(items: readonly T[], venster: PublicatieVenster): T[] {
  return items.filter((item) => overlapt(item, venster));
}

export function sorteerPublicatie<T extends PublicatieBron>(items: readonly T[], vandaag: string): T[] {
  return [...items].sort((a, b) => {
    const aLoopt = a.start <= vandaag && a.eind >= vandaag;
    const bLoopt = b.start <= vandaag && b.eind >= vandaag;
    if (aLoopt !== bLoopt) return aLoopt ? -1 : 1;
    return a.start.localeCompare(b.start) || a.titel.localeCompare(b.titel, 'nl');
  });
}

const BOEKING_ZICHTBAAR = new Set(['optie', 'definitief', 'migratie_vastgelegd', 'afgerond']);

export interface PublicatieBoeking {
  id: string;
  start: string;
  eind: string;
  titel: string;
  huurder: string;
  status: string;
  soort?: string;
}

function dektBoeking(boeking: PublicatieBoeking, activiteit: PublicatieBron): boolean {
  if (activiteit.boekingId && activiteit.boekingId === boeking.id) return true;
  const naam = boeking.huurder.trim().toLowerCase();
  if (naam.length < 3) return false;
  if (activiteit.start.slice(0, 10) !== boeking.start.slice(0, 10)) return false;
  if (activiteit.eind.slice(0, 10) !== boeking.eind.slice(0, 10)) return false;
  return `${activiteit.titel} ${activiteit.exposanten ?? ''}`.toLowerCase().includes(naam);
}

/** Verhuur uit het huuroverzicht, behalve wat al als website-activiteit op dezelfde dagen staat. */
export function publicatieUitBoekingen(boekingen: readonly PublicatieBoeking[], activiteiten: readonly PublicatieBron[]): PublicatieBron[] {
  return boekingen
    .filter((boeking) => BOEKING_ZICHTBAAR.has(boeking.status) && Boolean(boeking.start) && Boolean(boeking.eind))
    .filter((boeking) => !activiteiten.some((activiteit) => dektBoeking(boeking, activiteit)))
    .map((boeking) => ({
      id: boeking.id,
      start: boeking.start,
      eind: boeking.eind,
      titel: boeking.titel.trim() || boeking.huurder.trim() || 'Verhuur',
      exposanten: boeking.huurder.trim(),
      organisatie: boeking.huurder.trim(),
      soort: boeking.soort,
      publicatiestatus: null,
      tabel: 'boekingen' as const,
      boekingId: boeking.id,
    }));
}

export function publicatieDossierHref(item: Pick<PublicatieBron, 'id' | 'tabel'>): string {
  const pad = item.tabel === 'boekingen' ? 'boekingen' : 'agenda';
  return `/beheer/${pad}/${encodeURIComponent(item.id)}/`;
}

export function publicatieWerklijst<T extends PublicatieBron>(
  items: readonly T[],
  vandaag: string,
  stap = 0,
): { venster: PublicatieVenster; items: T[] } {
  const venster = publicatieVenster(vandaag, stap);
  return {
    venster,
    items: sorteerPublicatie(inPublicatieVenster(ontdubbelPublicatie(items), venster), vandaag),
  };
}

/** Praktische informatie hoort bij een expositie. Andere verhuurtypes hebben die tekst niet nodig. */
export function praktischeInfoRelevant(soort?: string | null): boolean {
  return (soort ?? '').trim().toLowerCase() === 'expositie';
}

export function publicatieChecks(item: PublicatieBron): PublicatieCheck[] {
  const checks: PublicatieCheck[] = [
    { sleutel: 'titel', label: 'Titel aanwezig', ok: Boolean(item.titel.trim()), rol: 'content' },
    { sleutel: 'datum', label: 'Datum aanwezig', ok: Boolean(item.start) && Boolean(item.eind), rol: 'content' },
    { sleutel: 'kort', label: 'Korte omschrijving aanwezig', ok: Boolean(item.korteOmschrijving?.trim()), rol: 'content' },
    { sleutel: 'volledig', label: 'Volledige tekst aanwezig', ok: Boolean(item.volledigeOmschrijving?.trim()), rol: 'content' },
  ];
  if (praktischeInfoRelevant(item.soort)) {
    checks.push({
      sleutel: 'praktisch',
      label: 'Praktische informatie aanwezig',
      ok: Boolean(item.praktisch?.trim()),
      rol: 'content',
    });
  }
  checks.push(
    {
      sleutel: 'afbeelding',
      label: item.fotoPad?.trim() ? 'Eigen afbeelding aanwezig' : 'Standaardafbeelding wordt gebruikt',
      ok: true,
      rol: 'automatisch',
    },
    {
      sleutel: 'url',
      label: item.slug?.trim() ? 'URL beschikbaar' : 'URL wordt bij publiceren automatisch gemaakt',
      ok: true,
      rol: 'automatisch',
    },
  );
  return checks;
}

export function contentCompleet(checks: readonly PublicatieCheck[]): boolean {
  return checks.filter((check) => check.rol === 'content').every((check) => check.ok);
}

export function ontbrekendeVelden(checks: readonly PublicatieCheck[]): string[] {
  return checks
    .filter((check) => check.rol === 'content' && !check.ok)
    .map((check) => check.label.replace(' aanwezig', '').replace(' beschikbaar', ''));
}

/**
 * Opslaan behoudt een bestaande zichtbaarheid.
 * Zonder publicatierecord wordt het een verborgen concept, nooit bezet.
 */
export function zichtbaarheidNaBewaren(
  huidig: 'publiek' | 'bezet' | 'verborgen' | null | undefined,
): 'publiek' | 'bezet' | 'verborgen' {
  if (huidig === 'publiek' || huidig === 'bezet' || huidig === 'verborgen') return huidig;
  return CONCEPT_ZICHTBAARHEID;
}

export function werkstatus(item: PublicatieBron, checks = publicatieChecks(item)): Werkstatus {
  if (item.geannuleerd) return 'geannuleerd';
  if (item.publicatiestatus === 'verborgen') return 'verborgen';
  if (item.publicatiestatus === 'publiek') return 'gepubliceerd';
  if (contentCompleet(checks)) return 'klaar';
  return 'mist_content';
}

export function afbeeldingVoorWebsite(foto?: string | null): { src: string; eigen: boolean } {
  const pad = foto?.trim();
  if (pad) return { src: pad, eigen: true };
  return { src: STANDAARD_AFBEELDING, eigen: false };
}

export function kaartVoorWebsite(item: Pick<PublicatieBron, 'korteOmschrijving' | 'volledigeOmschrijving' | 'omschrijving'>): string {
  if (item.korteOmschrijving?.trim()) return item.korteOmschrijving.trim();
  const lang = item.volledigeOmschrijving?.trim() || item.omschrijving?.trim();
  if (!lang) return 'Binnenkort meer informatie over deze activiteit.';
  const zinnen = lang.match(/[^.!?]+[.!?]+(?:\s|$)/g);
  if (!zinnen) return lang;
  return zinnen.slice(0, 3).join('').trim();
}

export function detailVoorWebsite(item: Pick<PublicatieBron, 'korteOmschrijving' | 'volledigeOmschrijving' | 'omschrijving'>): string {
  if (item.volledigeOmschrijving?.trim()) return item.volledigeOmschrijving.trim();
  if (item.korteOmschrijving?.trim()) return item.korteOmschrijving.trim();
  if (item.omschrijving?.trim()) return item.omschrijving.trim();
  return 'Meer informatie volgt.';
}

export function slugVanTekst(bron: string): string {
  return bron
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' en ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function slugUitActiviteit(exposanten: string, titel: string): string {
  return slugVanTekst(exposanten.trim() || titel.trim());
}

export function slugBijPublicatie(input: {
  exposanten?: string;
  titel: string;
  slug?: string;
  start: string;
  bezet: ReadonlySet<string>;
  opnieuw?: boolean;
}): string {
  const huidig = input.slug?.trim() ?? '';
  if (huidig && !input.opnieuw) return huidig;
  const basis = slugUitActiviteit(input.exposanten ?? '', input.titel) || 'activiteit';
  return uniekeSlug(basis, input.bezet, input.start.slice(0, 4), huidig);
}

/** URL-voorstel in hetzelfde formulier. Alle overige contentvelden blijven staan. */
export function urlVoorstelZonderContentverlies(
  item: PublicatieBron,
  bezet: ReadonlySet<string>,
  bewust = false,
): { item: PublicatieBron; waarschuwing: string } {
  const voorgesteld = slugBijPublicatie({
    exposanten: item.exposanten,
    titel: item.titel,
    slug: item.slug,
    start: item.start,
    bezet,
    opnieuw: true,
  });
  const besluit = slugNaPublicatie(item, voorgesteld, bewust);
  return {
    item: { ...item, slug: besluit.slug || item.slug || voorgesteld },
    waarschuwing: besluit.waarschuwing,
  };
}

export function uniekeSlug(basis: string, bezet: ReadonlySet<string>, jaar: string, huidige = ''): string {
  const vrij = (slug: string) => slug.length > 0 && (!bezet.has(slug) || slug === huidige);
  if (vrij(basis)) return basis;
  const metJaar = `${basis}-${jaar}`;
  if (vrij(metJaar)) return metJaar;
  let nummer = 2;
  while (nummer < 50 && !vrij(`${metJaar}-${nummer}`)) nummer += 1;
  return `${metJaar}-${nummer}`;
}

export function slugIsVast(item: Pick<PublicatieBron, 'slug' | 'publicatiestatus'>): boolean {
  return item.publicatiestatus === 'publiek' && Boolean(item.slug?.trim());
}

export function slugNaPublicatie(item: Pick<PublicatieBron, 'slug' | 'publicatiestatus'>, voorgesteld: string, bewust = false): {
  slug: string;
  waarschuwing: string;
} {
  const huidig = item.slug?.trim() ?? '';
  if (!slugIsVast(item) || bewust || !voorgesteld || voorgesteld === huidig) {
    return { slug: voorgesteld || huidig, waarschuwing: '' };
  }
  return {
    slug: huidig,
    waarschuwing: `De website-URL blijft /agenda/${huidig}. Pas een gepubliceerde URL alleen bewust aan, anders breken bestaande links.`,
  };
}

export function publicatieBesluit(checks: readonly PublicatieCheck[], bevestigd: boolean): {
  mag: boolean;
  force: boolean;
  ontbrekend: string[];
  melding: string;
  mail: false;
  workflow: false;
  jobs: 0;
} {
  const ontbrekend = ontbrekendeVelden(checks);
  const basis = { ontbrekend, mail: false as const, workflow: false as const, jobs: 0 as const };
  if (ontbrekend.length === 0) {
    return { ...basis, mag: true, force: false, melding: 'Gepubliceerd.' };
  }
  if (bevestigd) {
    return {
      ...basis,
      mag: true,
      force: true,
      melding: 'Gepubliceerd. Ontbrekende content blijft zichtbaar als waarschuwing.',
    };
  }
  return {
    ...basis,
    mag: false,
    force: false,
    melding: 'Deze activiteit is nog niet volledig. Je kunt hem wel publiceren.',
  };
}

export function websiteUrl(slug: string): string {
  return `${WEBSITE_BASIS}/agenda/${slug}`;
}
