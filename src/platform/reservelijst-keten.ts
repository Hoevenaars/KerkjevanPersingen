/**
 * Reservelijst blijft handmatig of een expliciet begrensde batch.
 * Eén annulering mailt niet automatisch iedereen.
 */

import type { Mailmodus } from './testmail.ts';
import { GEEN_TESTMAILADRES, pasTestmodusToe } from './testmail.ts';

export interface Reservekandidaat {
  relatieId: string;
  email: string;
  actief: boolean;
  opReservelijst: boolean;
}

export interface ReservePlan {
  modus: Mailmodus;
  gekozen: Reservekandidaat[];
  overgeslagen: number;
  dedupSleutels: string[];
  providerAanroepen: number;
  geblokkeerd: boolean;
  reden: string;
  werkelijkeOntvangers: string[];
}

export function dedupReservelijst(periode: string, relatieId: string): string {
  return `reservelijst:${periode}:${relatieId}`;
}

export function planReservelijst(input: {
  modus: Mailmodus;
  periode: string;
  kandidaten: readonly Reservekandidaat[];
  gekozenIds: readonly string[];
  alVerzonden: ReadonlySet<string>;
  testadres: string | null;
  max?: number;
}): ReservePlan {
  const max = input.max ?? 25;
  const geschikt = input.kandidaten.filter((item) => item.actief && item.opReservelijst && item.email);
  const gekozen = geschikt.filter((item) => input.gekozenIds.includes(item.relatieId)).slice(0, max);
  const vers = gekozen.filter((item) => !input.alVerzonden.has(dedupReservelijst(input.periode, item.relatieId)));
  const basis = {
    modus: input.modus,
    gekozen: vers,
    overgeslagen: gekozen.length - vers.length,
    dedupSleutels: vers.map((item) => dedupReservelijst(input.periode, item.relatieId)),
  };
  if (input.modus === 'uit' || input.modus === 'dry-run') {
    return { ...basis, providerAanroepen: 0, geblokkeerd: false, reden: input.modus, werkelijkeOntvangers: [] };
  }
  if (vers.length === 0) {
    return { ...basis, providerAanroepen: 0, geblokkeerd: false, reden: 'geen nieuwe ontvangers', werkelijkeOntvangers: [] };
  }
  if (input.modus === 'test') {
    const veilig = pasTestmodusToe(
      { to: vers.map((item) => item.email), subject: 'Vrijgekomen periode', bedoeldeOntvanger: vers[0]?.email ?? '' },
      input.testadres,
    );
    if (!veilig.ok) {
      return { ...basis, providerAanroepen: 0, geblokkeerd: true, reden: GEEN_TESTMAILADRES, werkelijkeOntvangers: [] };
    }
    return {
      ...basis,
      providerAanroepen: 1,
      geblokkeerd: false,
      reden: 'test',
      werkelijkeOntvangers: [veilig.werkelijkeOntvanger],
    };
  }
  return {
    ...basis,
    providerAanroepen: vers.length,
    geblokkeerd: false,
    reden: 'aan',
    werkelijkeOntvangers: vers.map((item) => item.email),
  };
}
