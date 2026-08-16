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

/**
 * Datum waarop de nieuwsbrief-preview de inhoud zoekt.
 * Zonder `week` is dat nu. Met `week=YYYY-MM-DD` kun je een andere week
 * bekijken — nodig op zondag, als de cron anders de vorige maandag pakt.
 */
export function datumVoorPreview(weekParam: string | null, nu = new Date()): Date {
  if (!weekParam) return nu;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
    throw new Error('week moet YYYY-MM-DD zijn, bijvoorbeeld 2026-08-17');
  }
  return new Date(`${weekParam}T12:00:00Z`);
}
