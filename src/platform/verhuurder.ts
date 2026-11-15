/**
 * Gegevens die al op de site staan.
 * Ze vullen een leeg contractveld. Een opgeslagen waarde, ook een lege, blijft staan.
 * De gereed-regel hoort hier niet bij: die maakt een boeking niet vanzelf definitief.
 */

export const VERHUURDER = {
  ondertekenaarNaam: 'Nelleke van der Pol',
  ondertekenaarFunctie: 'Contractbeheer',
  tenaamstelling: 'Stichting Het Kerkje van Persingen',
  iban: 'NL21RABO0105101699',
  voorwaardenVastgesteldOp: '2026-11-15',
  huisregelsVastgesteldOp: '2026-11-15',
  coordinatorContact: 'contractbeheer.kvp@gmail.com',
  publicatieRoute: 'https://kerkjepersingen.nl/contact/',
} as const;

export function wizardAdres(input: { aanvraagId?: string | null; boekingId: string }): string {
  if (input.aanvraagId) {
    return `/beheer/aanvragen/${encodeURIComponent(input.aanvraagId)}/?contract=genereren`;
  }
  return `/beheer/boekingen/${encodeURIComponent(input.boekingId)}/?tab=documenten&contract=genereren`;
}
