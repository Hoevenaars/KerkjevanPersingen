/**
 * Verzendbesluit voor één nieuwsbriefeditie.
 * UIT en DRY-RUN doen geen provider-call.
 * TEST stuurt precies één bericht naar het testmailadres, niet naar vrienden.
 */

import type { Mailmodus } from './testmail.ts';
import { GEEN_TESTMAILADRES, pasTestmodusToe } from './testmail.ts';

export interface NieuwsbriefOntvanger {
  id: string;
  email: string;
  actief: boolean;
}

export function dedupNieuwsbrief(editieId: string, email: string): string {
  return `nieuwsbrief:${editieId}:${email.trim().toLowerCase()}`;
}

export interface NieuwsbriefPlan {
  modus: Mailmodus;
  bedoeldeAantal: number;
  providerAanroepen: number;
  geblokkeerd: boolean;
  reden: string;
  werkelijkeOntvangers: string[];
  dedupSleutels: string[];
  resterend: number;
}

export function planNieuwsbrief(input: {
  modus: Mailmodus;
  editieId: string;
  ontvangers: readonly NieuwsbriefOntvanger[];
  alVerzonden: ReadonlySet<string>;
  testadres: string | null;
  batchMax?: number;
  uitgeschreven?: ReadonlySet<string>;
}): NieuwsbriefPlan {
  const batchMax = input.batchMax ?? 50;
  const uit = input.uitgeschreven ?? new Set<string>();
  const actief = input.ontvangers.filter((item) => item.actief && item.email && !uit.has(item.email.trim().toLowerCase()));
  const open = actief.filter((item) => !input.alVerzonden.has(dedupNieuwsbrief(input.editieId, item.email)));
  const batch = open.slice(0, batchMax);
  const basis = {
    modus: input.modus,
    bedoeldeAantal: actief.length,
    dedupSleutels: batch.map((item) => dedupNieuwsbrief(input.editieId, item.email)),
    resterend: Math.max(0, open.length - batch.length),
  };
  if (input.modus === 'uit' || input.modus === 'dry-run') {
    return { ...basis, providerAanroepen: 0, geblokkeerd: false, reden: input.modus, werkelijkeOntvangers: [], dedupSleutels: [] };
  }
  if (actief.length === 0) {
    return { ...basis, providerAanroepen: 0, geblokkeerd: false, reden: 'geen ontvangers', werkelijkeOntvangers: [], dedupSleutels: [] };
  }
  if (input.modus === 'test') {
    const voorbeeld = actief[0]?.email ?? 'vriend@example.test';
    const veilig = pasTestmodusToe(
      { to: [voorbeeld], cc: actief.map((item) => item.email), bcc: ['bcc@example.test'], subject: 'Nieuwsbrief', bedoeldeOntvanger: voorbeeld },
      input.testadres,
    );
    if (!veilig.ok) {
      return { ...basis, providerAanroepen: 0, geblokkeerd: true, reden: GEEN_TESTMAILADRES, werkelijkeOntvangers: [], dedupSleutels: [] };
    }
    return {
      ...basis,
      providerAanroepen: 1,
      geblokkeerd: false,
      reden: 'test',
      werkelijkeOntvangers: [veilig.werkelijkeOntvanger],
      dedupSleutels: [`nieuwsbrief:${input.editieId}:test`],
      resterend: 0,
    };
  }
  return {
    ...basis,
    providerAanroepen: batch.length,
    geblokkeerd: false,
    reden: 'aan',
    werkelijkeOntvangers: batch.map((item) => item.email),
  };
}
