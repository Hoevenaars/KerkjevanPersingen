/**
 * Documentenflow v1 staat uit tot DOCUMENTENFLOW=true.
 * Zonder die waarde blijven aanvragen, boekingen, betalingen en de
 * bestaande contractmail ongewijzigd. BEHEER_ENABLED zet hem niet aan.
 */

function leesOmgeving(): Record<string, unknown> {
  const runtime = typeof process !== 'undefined' ? process.env : undefined;
  const meta = import.meta.env as Record<string, unknown>;
  return {
    DOCUMENTENFLOW: runtime?.['DOCUMENTENFLOW'] ?? meta.DOCUMENTENFLOW,
  };
}

export function documentenflowAan(env: Record<string, unknown> = leesOmgeving()): boolean {
  const waarde = env.DOCUMENTENFLOW;
  return waarde === true || waarde === 'true';
}
