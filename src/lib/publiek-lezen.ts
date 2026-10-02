/**
 * Publieke agenda en verhuurkalender op Supabase.
 * CONTENT_BRON blijft sanity; deze leespaden vallen niet terug op Sanity.
 */

import { createClient } from '@supabase/supabase-js';
import type { Activiteit } from './sanity';
import { supabaseLoginUitOmgeving } from './supabase-project.ts';
import { contentStatusVanInhoud, magOpWebsiteZonderTiming, maandenVanTrigger } from './agenda-zichtbaarheid.ts';
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
  contentstatus?: string | null;
  korte_omschrijving?: string | null;
  volledige_omschrijving?: string | null;
  exposanten?: string | null;
  praktische_informatie?: string | null;
  aanvullende_afbeeldingen?: unknown;
  levenscyclus?: string | null;
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
    omschrijving: rij.omschrijving ?? undefined,
    korteOmschrijving: rij.korte_omschrijving ?? undefined,
    volledigeOmschrijving: rij.volledige_omschrijving ?? undefined,
    praktischeInformatie: rij.praktische_informatie ?? undefined,
    kunstenaars: rij.exposanten ?? undefined,
    foto: rij.foto_pad ?? undefined,
    fotoAlt: rij.foto_alt ?? rij.titel ?? undefined,
    aanvullendeAfbeeldingen: Array.isArray(rij.aanvullende_afbeeldingen)
      ? rij.aanvullende_afbeeldingen.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : undefined,
    toonVanafMaanden: maandenVanTrigger(trigger),
    contentStatus: contentStatusVanInhoud(inhoud),
    contentstatus: rij.contentstatus ?? null,
    geannuleerd: rij.levenscyclus === 'geannuleerd',
    zichtbaarheid:
      rij.zichtbaarheid === 'bezet' || rij.zichtbaarheid === 'verborgen' || rij.zichtbaarheid === 'publiek'
        ? rij.zichtbaarheid
        : 'publiek',
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

function zichtbaarOpWebsite(item: Activiteit, nu: Date): boolean {
  return magAlGetoondWorden(item, nu) && magOpWebsiteZonderTiming({
    zichtbaarheid: item.zichtbaarheid,
    geannuleerd: item.geannuleerd,
    contentstatus: item.contentstatus,
    soort: item.soort,
    titel: item.publiekeTitel,
    korteOmschrijving: item.korteOmschrijving,
    volledigeOmschrijving: item.volledigeOmschrijving,
    hoofdafbeelding: typeof item.foto === 'string' ? item.foto : null,
  });
}

export function stelPubliekeAgenda(rijen: AgendaRij[], nu = new Date(), limit = 30): Activiteit[] {
  return rijen
    .map(activiteitVanAgendaRij)
    .filter((item) => zichtbaarOpWebsite(item, nu))
    .slice(0, limit);
}

/** Eén slug, dezelfde publicatiepoort als de agenda, zonder de lijst af te kappen. */
export function activiteitUitSlugRijen(slug: string, rijen: AgendaRij[], nu = new Date()): Activiteit | null {
  return rijen
    .map(activiteitVanAgendaRij)
    .find((item) => item.slug === slug && zichtbaarOpWebsite(item, nu)) ?? null;
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

async function leesAgendaRijOpSlug(slug: string): Promise<AgendaRij[]> {
  const supabase = leesClient();
  if (!supabase) throw new Error('Supabase is niet geconfigureerd. De agenda leest Sanity niet.');
  const { data, error } = await supabase.rpc('publieke_activiteit_op_slug', { p_slug: slug });
  if (error) throw new Error(error.message);
  return (data ?? []) as AgendaRij[];
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
  const gevonden = activiteitUitSlugRijen(slug, await leesAgendaRijOpSlug(slug), nu);
  if (gevonden) return gevonden;
  const { secondNatureFallback } = await import('./second-nature.ts');
  return secondNatureFallback(slug);
}

export function vrijeWeekendenVanBezetting(
  bezet: Parameters<typeof bezetteKalenderDagen>[0],
  aantal = 3,
  nu = new Date(),
): VrijWeekend[] {
  return eerstvolgendeVrijeWeekenden(bezetteKalenderDagen(bezet), aantal, nu);
}

export async function leesEerstvolgendeVrijeWeekenden(aantal = 3, nu = new Date()): Promise<VrijWeekend[]> {
  const bezet = await leesBezetteData();
  return vrijeWeekendenVanBezetting(bezet, aantal, nu);
}
