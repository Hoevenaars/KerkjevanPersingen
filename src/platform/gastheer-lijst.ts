/**
 * Zichtbaarheid van gastheren. De status blijft relatie_rollen.actief.
 */

export type GastheerFilter = 'actief' | 'inactief' | 'alles';

export function leesGastheerFilter(waarde: string | null | undefined): GastheerFilter {
  if (waarde === 'inactief' || waarde === 'niet-actief' || waarde === 'alles') {
    return waarde === 'niet-actief' ? 'inactief' : waarde;
  }
  return 'actief';
}

export function filterGastheren<T extends { actief: boolean }>(lijst: readonly T[], filter: GastheerFilter): T[] {
  if (filter === 'alles') return [...lijst];
  if (filter === 'inactief') return lijst.filter((gastheer) => !gastheer.actief);
  return lijst.filter((gastheer) => gastheer.actief);
}

/**
 * Nieuwe koppelingen bieden alleen actieve gastheren.
 * De al gekoppelde gastheer blijft in de lijst, ook als die niet actief is.
 */
export function gastherenVoorKoppeling<T extends { id: string; actief: boolean }>(
  lijst: readonly T[],
  huidigeId?: string | null,
): T[] {
  return lijst.filter((gastheer) => gastheer.actief || (huidigeId != null && gastheer.id === huidigeId));
}

export const GASTHEER_VERWIJDER_GEKOPPELD =
  'Deze gastheer is gekoppeld aan bestaande of historische boekingen en kan daarom niet worden verwijderd. Zet de gastheer op Niet actief om deze niet meer te gebruiken.';

export const GASTHEER_VERWIJDER_BEVESTIG =
  'Deze gastheer heeft geen boekingen of historische koppelingen. Weet je zeker dat je deze gastheer definitief wilt verwijderen?';

export interface GastheerKoppelingen {
  boekingenAlsGastheer: number;
  toewijzingen: number;
  overige: number;
}

export function beoordeelGastheerVerwijdering(
  koppelingen: GastheerKoppelingen,
): { mag: true } | { mag: false; melding: string } {
  if (koppelingen.boekingenAlsGastheer > 0 || koppelingen.toewijzingen > 0) {
    return { mag: false, melding: GASTHEER_VERWIJDER_GEKOPPELD };
  }
  if (koppelingen.overige > 0) {
    return {
      mag: false,
      melding: 'Deze gastheer heeft nog andere koppelingen en kan daarom niet worden verwijderd. Zet de gastheer op Niet actief om deze niet meer te gebruiken.',
    };
  }
  return { mag: true };
}
