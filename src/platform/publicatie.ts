/**
 * Publicatie van publieke activiteiten (FO §3, §35–§38).
 *
 * Boeking en publieke activiteit zijn gescheiden objecten.
 * Een activiteit mag nooit online zolang de gekoppelde boeking niet definitief is.
 * Minimale content: publieke titel + datum. Ontbrekende foto blokkeert niet.
 */

import type { BoekingStatus, PublicatieTrigger } from './types.ts';

export interface PublicatieInput {
  gekoppeldeBoekingStatus?: BoekingStatus | null;
  publiekeTitel?: string;
  datum?: string;
  omschrijving?: string;
  foto?: boolean;
  fotoAlt?: string;
  trigger: PublicatieTrigger;
  startYmd: string;
  nuYmd: string;
}

export interface PublicatieUitkomst {
  magOnline: boolean;
  reden: string;
  minimaleContent: boolean;
  ontbrekendeAanvulling: string[];
  dashboardActie: boolean;
}

const MAANDEN_VOORAF: Partial<Record<PublicatieTrigger, number>> = {
  uiterlijk_1_maand: 1,
  uiterlijk_2_maanden: 2,
  uiterlijk_3_maanden: 3,
};

export function publicatieDrempelYmd(startYmd: string, maandenVooraf: number): string {
  const [jaar, maand, dag] = startYmd.split('-').map(Number);
  const d = new Date(Date.UTC(jaar, maand - 1, dag, 12, 0, 0));
  d.setUTCMonth(d.getUTCMonth() - maandenVooraf);
  return d.toISOString().slice(0, 10);
}

export function beoordeelPublicatie(input: PublicatieInput): PublicatieUitkomst {
  const ontbrekend: string[] = [];
  if (!input.omschrijving) ontbrekend.push('omschrijving');
  if (!input.foto) ontbrekend.push('foto');
  else if (!input.fotoAlt) ontbrekend.push('fotoAlt');

  const minimaleContent = Boolean(input.publiekeTitel && input.datum);
  const contentCompleet = minimaleContent && ontbrekend.length === 0;

  if (input.gekoppeldeBoekingStatus && input.gekoppeldeBoekingStatus !== 'definitief') {
    return {
      magOnline: false,
      reden: 'Gekoppelde boeking is nog niet definitief.',
      minimaleContent,
      ontbrekendeAanvulling: ontbrekend,
      dashboardActie: false,
    };
  }

  if (input.trigger === 'niet_publiceren') {
    return {
      magOnline: false,
      reden: 'Publicatie staat uit.',
      minimaleContent,
      ontbrekendeAanvulling: ontbrekend,
      dashboardActie: false,
    };
  }

  if (!minimaleContent) {
    return {
      magOnline: false,
      reden: 'Minimale content ontbreekt (publieke titel en datum).',
      minimaleContent: false,
      ontbrekendeAanvulling: [
        ...(!input.publiekeTitel ? ['publiekeTitel'] : []),
        ...(!input.datum ? ['datum'] : []),
        ...ontbrekend,
      ],
      dashboardActie: true,
    };
  }

  if (input.trigger === 'zodra_content_compleet') {
    return {
      magOnline: contentCompleet,
      reden: contentCompleet ? 'Content compleet.' : 'Aanvullende content ontbreekt nog.',
      minimaleContent,
      ontbrekendeAanvulling: ontbrekend,
      dashboardActie: !contentCompleet,
    };
  }

  const maanden = MAANDEN_VOORAF[input.trigger] ?? 0;
  const drempel = publicatieDrempelYmd(input.startYmd, maanden);
  const momentBereikt = input.nuYmd >= drempel;

  if (!momentBereikt) {
    return {
      magOnline: false,
      reden: 'Publicatiemoment is nog niet bereikt.',
      minimaleContent,
      ontbrekendeAanvulling: ontbrekend,
      dashboardActie: false,
    };
  }

  return {
    magOnline: true,
    reden: ontbrekend.length
      ? 'Publicatiemoment bereikt; gepubliceerd op minimale content.'
      : 'Publicatiemoment bereikt; content compleet.',
    minimaleContent,
    ontbrekendeAanvulling: ontbrekend,
    dashboardActie: ontbrekend.length > 0,
  };
}
