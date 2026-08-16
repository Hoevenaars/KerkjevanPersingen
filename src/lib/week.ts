/**
 * Maandag (YYYY-MM-DD) van de kalenderweek waarin `datum` valt, in Nederlandse tijd.
 * Zonder vaste tijdzone zou `toISOString()` op Vercel (UTC) of lokaal (Amsterdam)
 * een andere maandag kunnen geven rond middernacht.
 */
export function maandagVanWeekIso(datum: Date): string {
  const ymd = datum.toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
  const [jaar, maand, dag] = ymd.split('-').map(Number);
  const utcMiddag = new Date(Date.UTC(jaar, maand - 1, dag, 12, 0, 0));
  const weekdag = utcMiddag.getUTCDay();
  utcMiddag.setUTCDate(utcMiddag.getUTCDate() + (weekdag === 0 ? -6 : 1 - weekdag));
  return utcMiddag.toISOString().slice(0, 10);
}
