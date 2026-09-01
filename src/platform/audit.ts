/**
 * Auditlog (FO §66). Gewone gebruikers mogen auditregels niet aanpassen.
 */

export interface AuditGebeurtenis {
  actorNaam: string;
  actorId?: string;
  onderwerp: string;
  actie: string;
  van?: string;
  naar?: string;
  reden?: string;
  op: string;
}

export function auditRegel(gebeurtenis: AuditGebeurtenis): string {
  const wijziging =
    gebeurtenis.van && gebeurtenis.naar ? `${gebeurtenis.van} → ${gebeurtenis.naar}` : gebeurtenis.actie;
  const reden = gebeurtenis.reden ? ` Reden: ${gebeurtenis.reden}` : '';
  return `${gebeurtenis.actorNaam} · ${gebeurtenis.onderwerp} · ${wijziging} · ${gebeurtenis.op}${reden}`;
}

export function magAuditWijzigen(isSuperAdmin: boolean): boolean {
  return isSuperAdmin;
}
