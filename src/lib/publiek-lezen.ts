/**
 * Publieke agenda en verhuurkalender op Supabase.
 * CONTENT_BRON blijft sanity; deze leespaden vallen niet terug op Sanity.
 */

import { createClient } from '@supabase/supabase-js';
import type { Activiteit } from './sanity';
import { supabaseLoginUitOmgeving } from './supabase-project.ts';
import { contentStatusVanInhoud, maandenVanTrigger } from './agenda-zichtbaarheid.ts';
import { eerstvolgendeVrijeWeekenden, type VrijWeekend } from './week.ts';
import { bezetteKalenderDagen } from './datum.ts';

export interface AgendaRij {
  id: number | string;
  slug: string | null;
  titel: string | null;
  start_datum: string;
  eind_datum: string;
  omschrijving: string | null;
  foto_pad: string | null;
  foto_alt: string | null;
  publicatie_trigger: string | null;
  zichtbaarheid: string | null;
  inhoud_status: string | null;
  soort: string | null;
}

export interface BezetRij {
  start_datum: string;
  eind_datum: string;
  soort: string | null;
}

function dag(iso: string): string {
  return `${iso.slice(0, 10)}T12:00:00+02:00`;
}

export function magAlGetoondWorden(activiteit: Activiteit, nu = new Date()): boolean {
  if (!activiteit.toonVanafMaanden) return true;
  const maanden = Number(activiteit.toonVanafMaanden);
  if (!maanden) return true;
  const start = new Date(activiteit.start);
  const drempel = new Date(start);
  drempel.setUTCMonth(drempel.getUTCMonth() - maanden);
  return nu >= drempel;
}

export function activiteitVanAgendaRij(rij: AgendaRij): Activiteit {
  const trigger = rij.publicatie_trigger ?? '';
  const inhoud = (rij.inhoud_status ?? 'niet_gestart') as 'niet_gestart' | 'gevraagd' | 'ingediend' | 'wijziging_gevraagd' | 'goedgekeurd' | 'niet_vereist';
  return {
    _id: `publiek-${rij.id}`,
    slug: rij.slug ?? '',
    interneTitel: rij.titel ?? '',
    publiekeTitel: rij.titel ?? '',
    start: dag(rij.start_datum),
    eind: dag(rij.eind_datum),
    soort: rij.soort || 'expositie',
    zichtbaarheid: 'publiek',
    omschrijving: rij.omschrijving ?? undefined,
    foto: rij.foto_pad ?? undefined,
    fotoAlt: rij.foto_alt ?? rij.titel ?? undefined,
    toonVanafMaanden: maandenVanTrigger(trigger),
    contentStatus: contentStatusVanInhoud(inhoud),
  };
}

export function activiteitVanBezetRij(rij: BezetRij, index: number): Activiteit {
  return {
    _id: `bezet-${index}-${rij.start_datum}`,
    slug: '',
    interneTitel: 'Bezet',
    start: dag(rij.start_datum),
    eind: dag(rij.eind_datum),
    soort: rij.soort || 'diverse',
    zichtbaarheid: 'bezet',
  };
}

export function stelPubliekeAgenda(rijen: AgendaRij[], nu = new Date(), limit = 30): Activiteit[] {
  const lijst = rijen.map(activiteitVanAgendaRij).filter((item) => magAlGetoondWorden(item, nu));
  return lijst.slice(0, limit);
}

function leesClient() {
  const login = supabaseLoginUitOmgeving(process.env, true);
  if (!login) return null;
  return createClient(login.url, login.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function leesAgendaRijen(): Promise<AgendaRij[]> {
  const supabase = leesClient();
  if (!supabase) throw new Error('Supabase is niet geconfigureerd. De agenda leest Sanity niet.');
  const { data, error } = await supabase.rpc('publieke_agenda');
  if (error) throw new Error(error.message);
  return (data ?? []) as AgendaRij[];
}

export async function leesBezetRijen(): Promise<BezetRij[]> {
  const supabase = leesClient();
  if (!supabase) throw new Error('Supabase is niet geconfigureerd. De kalender leest Sanity niet.');
  const { data, error } = await supabase.rpc('publieke_bezetting');
  if (error) throw new Error(error.message);
  return (data ?? []) as BezetRij[];
}

export async function leesPubliekeAgenda(limit = 30, nu = new Date()): Promise<Activiteit[]> {
  const rijen = await leesAgendaRijen();
  const lijst = stelPubliekeAgenda(rijen, nu, limit);
  const { SECOND_NATURE } = await import('./second-nature.ts');
  const cutoff = nu.toISOString().slice(0, 10);
  const eind = (SECOND_NATURE.eind ?? SECOND_NATURE.start).slice(0, 10);
  const relevant = eind >= cutoff;
  if (relevant && magAlGetoondWorden(SECOND_NATURE, nu) && !lijst.some((item) => item.slug === SECOND_NATURE.slug)) {
    lijst.push(SECOND_NATURE);
    lijst.sort((a, b) => a.start.localeCompare(b.start));
  }
  return lijst.slice(0, limit);
}

export async function leesBezetteData(): Promise<Activiteit[]> {
  const rijen = await leesBezetRijen();
  return rijen.map(activiteitVanBezetRij);
}

export async function leesActiviteitOpSlug(slug: string, nu = new Date()): Promise<Activiteit | null> {
  const lijst = await leesPubliekeAgenda(100, nu);
  const gevonden = lijst.find((item) => item.slug === slug) ?? null;
  if (gevonden) return gevonden;
  const { secondNatureFallback } = await import('./second-nature.ts');
  return secondNatureFallback(slug);
}

export async function leesEerstvolgendeVrijeWeekenden(aantal = 3): Promise<VrijWeekend[]> {
  const bezet = await leesBezetteData();
  return eerstvolgendeVrijeWeekenden(bezetteKalenderDagen(bezet), aantal);
}
