/**
 * Het voorbeeld van één nieuwsbriefweek.
 * Zelfde brief als de vriendenmail, voor die week, zonder verzending.
 */

import type { Activiteit } from './content.ts';
import { blokkenVoorWeek } from './nieuwsbrief-agenda.ts';
import { mailMeta } from './nieuwsbrief-frequentie.ts';
import { bouwNieuwsbriefHtml, type NieuwsbriefInhoud } from './nieuwsbrief-html.ts';

export interface VoorbeeldBron {
  titel: string;
  slug?: string;
  start: string;
  eind?: string;
  soort?: string;
  tekst?: string;
  korteTekst?: string;
  foto?: string;
  publiek: boolean;
  geannuleerd?: boolean;
}

export function activiteitenUitVoorbeeld(bronnen: readonly VoorbeeldBron[]): Activiteit[] {
  return bronnen
    .filter((bron) => bron.publiek && !bron.geannuleerd && bron.start)
    .map((bron) => ({
      _id: bron.slug || bron.titel,
      slug: bron.slug ?? '',
      interneTitel: bron.titel,
      publiekeTitel: bron.titel,
      start: bron.start,
      eind: bron.eind,
      soort: bron.soort || 'expositie',
      zichtbaarheid: 'publiek' as const,
      omschrijving: bron.tekst,
      korteOmschrijving: bron.korteTekst || bron.tekst,
      foto: bron.foto || undefined,
      fotoAlt: bron.titel,
    }));
}

export function bronnenVoorWeek(input: {
  agenda: readonly {
    titel: string;
    slug: string;
    start: string;
    eind: string;
    soort?: string;
    omschrijving: string;
    korteOmschrijving?: string;
    volledigeOmschrijving?: string;
    fotoPad?: string;
    publicatiestatus?: string | null;
    status: string;
    levenscyclus?: string;
  }[];
  intern: readonly { titel: string; start: string; eind: string }[];
}): VoorbeeldBron[] {
  const agenda: VoorbeeldBron[] = input.agenda
    .filter((item) => item.levenscyclus !== 'geannuleerd')
    .filter((item) => item.publicatiestatus === 'publiek' || (!item.publicatiestatus && item.status === 'online'))
    .map((item) => ({
      titel: item.titel,
      slug: item.slug,
      start: item.start,
      eind: item.eind,
      soort: item.soort,
      tekst: item.volledigeOmschrijving || item.omschrijving,
      korteTekst: item.korteOmschrijving || item.omschrijving,
      foto: item.fotoPad,
      publiek: true,
    }));
  const winter: VoorbeeldBron[] = input.intern
    .filter((item) => item.titel.trim().toLowerCase() === 'winterstop')
    .map((item) => ({
      titel: 'Winterstop',
      start: item.start,
      eind: item.eind,
      soort: 'winterstop',
      publiek: true,
    }));
  return [...agenda, ...winter];
}

export function nieuwsbriefVoorbeeldHtml(input: {
  weekMaandag: string;
  inhoud: NieuwsbriefInhoud | null;
  bronnen: readonly VoorbeeldBron[];
}): { html: string; onderwerp: string } {
  const vrijdag = new Date(`${input.weekMaandag}T12:00:00Z`);
  vrijdag.setUTCDate(vrijdag.getUTCDate() + 4);
  const meta = mailMeta('wekelijks', vrijdag);
  const blokken = blokkenVoorWeek(activiteitenUitVoorbeeld(input.bronnen), input.weekMaandag);
  return {
    onderwerp: meta.onderwerp,
    html: bouwNieuwsbriefHtml(
      input.inhoud,
      blokken,
      'https://kerkjepersingen.nl/vrienden/afmelden?token=preview',
      meta,
    ),
  };
}
