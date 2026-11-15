/**
 * Eén fase terug in het aanvraagproces.
 * De knop blijft beschikbaar zolang de vorige stap geen ontvangen aanbetaling
 * en geen definitieve boeking ongedaan hoeft te maken.
 */

import type { AanvraagBeeld } from './aanvraag-fase.ts';

export type FaseTerugEffect =
  | 'status_nieuw'
  | 'status_in_behandeling'
  | 'optie_ongedaan'
  | 'contract_intrekken'
  | 'handtekening_intrekken';

export type FaseTerugPlan =
  | { kan: false }
  | {
      kan: true;
      effect: FaseTerugEffect;
      uitleg: string;
      volgende: string;
    };

const GEEN_MAIL = 'Er gaat geen mail uit.';

export function planFaseTerug(status: string, beeld: AanvraagBeeld): FaseTerugPlan {
  if (beeld.fase === 'afgewezen' || beeld.fase === 'gesloten') return { kan: false };
  if (beeld.boeking && ['definitief', 'afgerond', 'gearchiveerd', 'migratie_vastgelegd'].includes(beeld.boeking.status)) {
    return { kan: false };
  }
  if (beeld.checklist.aanbetaling) return { kan: false };

  if (beeld.checklist.ondertekend) {
    return {
      kan: true,
      effect: 'handtekening_intrekken',
      uitleg: `De vastgelegde handtekening telt niet meer. Het contract blijft verstuurd. ${GEEN_MAIL}`,
      volgende: 'Wachten op ondertekening',
    };
  }
  if (beeld.checklist.verzonden) {
    return {
      kan: true,
      effect: 'contract_intrekken',
      uitleg: `Het verstuurde contract telt niet meer en de ondertekenlink stopt. Daarna kun je het contract verbeteren en opnieuw laten goedkeuren. ${GEEN_MAIL}`,
      volgende: 'Contract verzenden',
    };
  }
  if (status === 'wacht_op_aanvrager') {
    return {
      kan: true,
      effect: 'status_in_behandeling',
      uitleg: `De aanvraag wacht niet meer op de aanvrager. ${GEEN_MAIL}`,
      volgende: beeld.boeking ? 'Contract verzenden' : 'Goedkeuren en in behandeling nemen',
    };
  }
  const optie = beeld.boeking?.status === 'optie' || beeld.boeking?.status === 'optie_verlopen';
  if (optie) {
    return {
      kan: true,
      effect: 'optie_ongedaan',
      uitleg: `De optie wordt geannuleerd. De aanvraag staat weer klaar om goed te keuren. ${GEEN_MAIL}`,
      volgende: 'Goedkeuren en in behandeling nemen',
    };
  }
  if (status === 'in_behandeling' && !beeld.boeking) {
    return {
      kan: true,
      effect: 'status_nieuw',
      uitleg: `De geschiktheid wordt opnieuw beoordeeld. ${GEEN_MAIL}`,
      volgende: 'Geschiktheid beoordelen',
    };
  }
  return { kan: false };
}
