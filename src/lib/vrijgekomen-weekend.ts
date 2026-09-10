/**
 * Tijdelijke homepage-banner voor het onverwacht vrije expositieweekend
 * van 7 en 8 november 2026. De knop vult het aanvraagformulier al in
 * (expositie, zaterdag t/m zondag), zodat iemand niet zelf hoeft te zoeken.
 *
 * Na afloop van dat weekend verdwijnt de banner vanzelf — Nederlandse tijd,
 * dezelfde regel als de rest van de kalender.
 */

export const VRIJGEKOMEN_EXPOSITIE_WEEKEND = {
  zaterdag: '2026-11-07',
  zondag: '2026-11-08',
  titel: 'Een uniek expositieweekend is vrijgekomen',
  tekst:
    'Op 7 en 8 november 2026 is het Kerkje van Persingen onverwacht beschikbaar. Maak van deze kans gebruik en presenteer jouw werk op deze bijzondere locatie.',
  knop: 'Bekijk deze mogelijkheid',
} as const;

export function aanvraagPadVrijgekomenWeekend(): string {
  const { zaterdag, zondag } = VRIJGEKOMEN_EXPOSITIE_WEEKEND;
  return `/verhuur/aanvragen/?datum=${zaterdag}&datumTot=${zondag}&soort=expositie`;
}

export function toonVrijgekomenWeekendBanner(nu = new Date()): boolean {
  const vandaag = nu.toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
  return vandaag <= VRIJGEKOMEN_EXPOSITIE_WEEKEND.zondag;
}
