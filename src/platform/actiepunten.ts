/**
 * Operationele aandachtspunten voor de komende weken.
 * Finance is geen blokkade en levert geen mail of communicatiejob.
 */

import { voegDagenToe } from './datum.ts';

export type ActieCode =
  | 'content_ontbreekt'
  | 'content_beoordeling'
  | 'gastheer_ontbreekt'
  | 'niet_gepubliceerd'
  | 'optie_aandacht'
  | 'incident'
  | 'proces';

export interface ActiePunt {
  code: ActieCode;
  titel: string;
  wanneer: string;
  href: string;
  toelichting: string;
}

export interface ActieBoeking {
  id: string;
  titel: string;
  start: string;
  eind: string;
  status: string;
  soort?: string;
  gastheerId?: string;
  optieEind?: string;
}

export interface ActieActiviteit {
  boekingId?: string;
  titel: string;
  start: string;
  eind: string;
  gepubliceerd?: boolean;
  contentstatus?: string | null;
  inhoudStatus?: string | null;
  levenscyclus?: string;
  trigger?: string | null;
}

export interface ActieIncident {
  id: string;
  boekingId: string;
  status: string;
  omschrijving: string;
}

const CONTENT_WACHT = new Set(['ingediend', 'wacht_op_beoordeling', 'ter_beoordeling']);
const CONTENT_KLAAR = new Set(['goedgekeurd', 'niet_vereist', 'compleet']);

function binnenVenster(start: string, eind: string, vandaag: string, tot: string): boolean {
  if (!start) return false;
  return eind >= vandaag && start <= tot;
}

export function actiepuntenKomendeWeken(input: {
  vandaag: string;
  weken?: number;
  boekingen: readonly ActieBoeking[];
  activiteiten: readonly ActieActiviteit[];
  incidenten?: readonly ActieIncident[];
}): ActiePunt[] {
  const tot = voegDagenToe(input.vandaag, (input.weken ?? 8) * 7);
  const punten: ActiePunt[] = [];
  const activiteiten = new Map<string, ActieActiviteit>();
  for (const activiteit of input.activiteiten) {
    if (activiteit.boekingId) activiteiten.set(activiteit.boekingId, activiteit);
  }

  for (const boeking of input.boekingen) {
    if (boeking.status === 'geannuleerd' || boeking.status === 'afgewezen' || boeking.status === 'gearchiveerd') continue;
    if (!binnenVenster(boeking.start, boeking.eind || boeking.start, input.vandaag, tot)) continue;
    const href = `/beheer/boekingen/${encodeURIComponent(boeking.id)}/`;
    if (boeking.status === 'optie' || boeking.status === 'optie_verlopen') {
      const letOp = !boeking.optieEind || boeking.optieEind <= tot;
      if (letOp) {
        punten.push({
          code: 'optie_aandacht',
          titel: boeking.titel,
          wanneer: boeking.optieEind || boeking.start,
          href,
          toelichting: boeking.status === 'optie_verlopen' ? 'Optie is verlopen.' : 'Optie vraagt aandacht.',
        });
      }
    }
    if (boeking.status !== 'definitief' && boeking.status !== 'optie' && boeking.status !== 'optie_verlopen') continue;
    const activiteit = activiteiten.get(boeking.id);
    const content = activiteit?.contentstatus || activiteit?.inhoudStatus || '';
    const publiekNodig = activiteit?.trigger !== 'niet_publiceren' && boeking.soort !== 'bruiloft';
    if (activiteit && activiteit.levenscyclus === 'geannuleerd') continue;
    if (publiekNodig && activiteit && CONTENT_WACHT.has(content)) {
      punten.push({
        code: 'content_beoordeling',
        titel: activiteit.titel || boeking.titel,
        wanneer: boeking.start,
        href: `/beheer/agenda/${encodeURIComponent(activiteit.boekingId || boeking.id)}/`,
        toelichting: 'Content wacht op goedkeuring.',
      });
    } else if (publiekNodig && boeking.status === 'definitief' && !CONTENT_KLAAR.has(content)) {
      punten.push({
        code: 'content_ontbreekt',
        titel: boeking.titel,
        wanneer: boeking.start,
        href,
        toelichting: 'Content ontbreekt.',
      });
    }
    if (publiekNodig && activiteit && CONTENT_KLAAR.has(content) && activiteit.gepubliceerd === false) {
      punten.push({
        code: 'niet_gepubliceerd',
        titel: activiteit.titel || boeking.titel,
        wanneer: boeking.start,
        href: `/beheer/publiceren/`,
        toelichting: 'Activiteit is nog niet gepubliceerd.',
      });
    }
    if ((boeking.soort === 'expositie' || !boeking.soort) && boeking.status === 'definitief' && !boeking.gastheerId) {
      punten.push({
        code: 'gastheer_ontbreekt',
        titel: boeking.titel,
        wanneer: boeking.start,
        href: '/beheer/planning/',
        toelichting: 'Gastheer ontbreekt.',
      });
    }
  }

  for (const incident of input.incidenten ?? []) {
    if (incident.status !== 'open') continue;
    const boeking = input.boekingen.find((item) => item.id === incident.boekingId);
    if (boeking && !binnenVenster(boeking.start, boeking.eind || boeking.start, input.vandaag, tot)) continue;
    punten.push({
      code: 'incident',
      titel: boeking?.titel || incident.omschrijving,
      wanneer: boeking?.start || input.vandaag,
      href: boeking ? `/beheer/boekingen/${encodeURIComponent(boeking.id)}/` : '/beheer/',
      toelichting: 'Open incident.',
    });
  }

  return punten
    .filter((punt) => punt.code !== ('betaling' as ActieCode))
    .sort((a, b) => a.wanneer.localeCompare(b.wanneer) || a.titel.localeCompare(b.titel));
}
