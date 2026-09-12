/**
 * Alleen-lezen Sanity-dump voor /beheer en de migratiecontrole.
 * Roept geen writes aan. De publieke website gebruikt deze module niet.
 */

import { createClient, type SanityClient } from '@sanity/client';
import type { SanityDump } from '../platform/migratie-transform.ts';

const DUMP_QUERY = `{
  "aanvragen": *[_type == "aanvraag" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]
    | order(binnengekomenOp desc) {
      _id, binnengekomenOp, status, afwijsreden, naam, email, telefoon, adres,
      soort, datum, datumTot, personen, toelichting, website, eerderGeexposeerd,
      medeExposanten, boeking
    },
  "activiteiten": *[_type == "activiteit" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]
    | order(start asc) {
      _id, interneTitel, huurderNaam, huurderEmail, huurderTelefoon, huurderAdres,
      aantalPersonen, toelichtingAanvrager, website, eerderGeexposeerd, medeExposanten,
      akkoordVoorwaarden, start, eind, soort, zichtbaarheid, publiekeTitel,
      "slug": slug.current, omschrijving, fotoAlt, toonVanafMaanden, boekingStatus,
      tariefBedrag, aanbetalingBinnen, contentStatus,
      "aanvraagId": aanvraag._ref,
      "huurderId": huurder._ref,
      "gastheerId": gastheer._ref
    },
  "personen": *[_type == "persoon" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]
    | order(naam asc) { _id, naam, email, telefoon, rollen, opReservelijst, notities },
  "vrienden": *[_type == "vriend" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]
    | order(email asc) { _id, naam, email, actief, frequentie, uitschrijfToken, aangemeldOp },
  "nieuwsbrieven": *[_type == "nieuwsbrief" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]
    | order(week desc) { _id, week, kortNieuws, donatieUpdate, geannuleerd, verstuurd },
  "instellingen": *[_type == "instellingen"][0]
}`;

function leesEnv(env: Record<string, unknown> = {}): {
  projectId: string;
  dataset: string;
  token: string;
} {
  const runtime = typeof process !== 'undefined' ? process.env : {};
  const projectId = String(env.SANITY_PROJECT_ID ?? runtime.SANITY_PROJECT_ID ?? '').trim();
  const dataset = String(env.SANITY_DATASET ?? runtime.SANITY_DATASET ?? 'production').trim() || 'production';
  const token = String(env.SANITY_API_TOKEN ?? runtime.SANITY_API_TOKEN ?? '').trim();
  return { projectId, dataset, token };
}

export function sanityBeheerGeconfigureerd(env: Record<string, unknown> = {}): boolean {
  return Boolean(leesEnv(env).projectId);
}

function clientVoor(env: Record<string, unknown> = {}): SanityClient | null {
  const { projectId, dataset, token } = leesEnv(env);
  if (!projectId) return null;
  return createClient({
    projectId,
    dataset,
    apiVersion: '2024-10-01',
    useCdn: false,
    token: token || undefined,
    perspective: 'published',
  });
}

export async function haalSanityDump(env: Record<string, unknown> = {}): Promise<SanityDump> {
  const client = clientVoor(env);
  if (!client) {
    throw new Error('Sanity is niet geconfigureerd.');
  }
  const dump = await client.fetch<SanityDump>(DUMP_QUERY);
  return {
    aanvragen: dump.aanvragen ?? [],
    activiteiten: dump.activiteiten ?? [],
    personen: dump.personen ?? [],
    vrienden: dump.vrienden ?? [],
    nieuwsbrieven: dump.nieuwsbrieven ?? [],
    instellingen: dump.instellingen ?? null,
  };
}
