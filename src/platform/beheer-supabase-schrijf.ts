/**
 * Schrijven in de expliciete testmodus (?bron=supabase).
 * Geen mail, geen Sanity-fallback, geen wijziging van CONTENT_BRON.
 */

import { websiteMeldingRij, type WebsiteMelding } from '../lib/website-melding.ts';
import { vrijgekomenWeekendRij, type VrijgekomenWeekendInstelling } from '../lib/vrijgekomen-weekend.ts';

export interface InstellingenInvoer {
  openingVan: string;
  openingTot: string;
  contractbeheerder: string;
  ontvangstAdres: string;
  extraOntvangstAdres: string;
  penningmeesterAdres: string;
}

export interface UpsertClient {
  from(tabel: string): {
    upsert(
      waarden: unknown,
      opties?: { onConflict?: string },
    ): PromiseLike<{ error: { message: string } | null }>;
  };
}

export function instellingRijen(invoer: InstellingenInvoer): { sleutel: string; groep: string; waarde: unknown; toelichting: string }[] {
  return [
    {
      sleutel: 'expositie_openingstijden',
      groep: 'verhuur',
      waarde: { van: invoer.openingVan.trim(), tot: invoer.openingTot.trim() },
      toelichting: 'Openingstijden expositie',
    },
    {
      sleutel: 'contractbeheerder',
      groep: 'verhuur',
      waarde: invoer.contractbeheerder.trim(),
      toelichting: 'Naam van de contractbeheerder',
    },
    {
      sleutel: 'ontvangst_adres',
      groep: 'mail',
      waarde: invoer.ontvangstAdres.trim(),
      toelichting: 'E-mailadres voor verhuuraanvragen',
    },
    {
      sleutel: 'extra_ontvangst_adres',
      groep: 'mail',
      waarde: invoer.extraOntvangstAdres.trim(),
      toelichting: 'Extra ontvangstadres',
    },
    {
      sleutel: 'penningmeester_adres',
      groep: 'mail',
      waarde: invoer.penningmeesterAdres.trim(),
      toelichting: 'E-mailadres penningmeester',
    },
  ];
}

export async function bewaarInstellingen(client: UpsertClient, invoer: InstellingenInvoer): Promise<void> {
  const antwoord = await client.from('instellingen').upsert(instellingRijen(invoer), { onConflict: 'sleutel' });
  if (antwoord.error) throw new Error(antwoord.error.message);
}

export async function bewaarWebsiteMelding(client: UpsertClient, melding: WebsiteMelding): Promise<void> {
  const antwoord = await client.from('instellingen').upsert(websiteMeldingRij(melding), { onConflict: 'sleutel' });
  if (antwoord.error) throw new Error(antwoord.error.message);
}

export async function bewaarVrijgekomenWeekendBanner(
  client: UpsertClient,
  instelling: VrijgekomenWeekendInstelling,
): Promise<void> {
  const antwoord = await client.from('instellingen').upsert(vrijgekomenWeekendRij(instelling), { onConflict: 'sleutel' });
  if (antwoord.error) throw new Error(antwoord.error.message);
}
