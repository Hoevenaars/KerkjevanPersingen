export type ContentStatus = 'ontbreekt' | 'gevraagd' | 'ontvangen' | 'goedgekeurd' | 'afgewezen';

export interface ActiviteitContentBron {
  omschrijving?: string;
  contentStatus?: ContentStatus;
  aangeleverdeTekst?: string;
  foto?: unknown;
  aangeleverdeFoto?: unknown;
}

/** Tekst mag op de detailpagina zodra het bestuur de aangeleverde content goedkeurt. */
export function contentIsGoedgekeurd(status?: ContentStatus | null): boolean {
  return status === 'goedgekeurd';
}

/**
 * Volledige tekst op de detailpagina: goedgekeurde aangeleverde tekst wint van
 * omschrijving. Lijstweergaves blijven omschrijving gebruiken.
 */
export function detailTekst(activiteit: ActiviteitContentBron): string | undefined {
  if (contentIsGoedgekeurd(activiteit.contentStatus) && activiteit.aangeleverdeTekst?.trim()) {
    return activiteit.aangeleverdeTekst.trim();
  }
  return activiteit.omschrijving?.trim() || undefined;
}

/** Knip platte tekst op lege regels tot losse alinea's voor inline weergave. */
export function tekstNaarParagrafen(tekst: string): string[] {
  return tekst
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Foto op de website: bij goedgekeurde content telt de aangeleverde foto,
 * anders de handmatig gekozen publieke foto.
 */
export function publiekeFotoBron(activiteit: ActiviteitContentBron): unknown {
  if (contentIsGoedgekeurd(activiteit.contentStatus) && activiteit.aangeleverdeFoto) {
    return activiteit.aangeleverdeFoto;
  }
  return activiteit.foto;
}
