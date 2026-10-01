/**
 * Bestuurshandelingen op een activiteit.
 * Geen mail, geen workflow en geen verwijdering.
 */

import type { ContentstatusBeheer, Publicatiestatus } from '../lib/agenda-zichtbaarheid.ts';
import { blokkeertBeschikbaarheid, magOpWebsiteZonderTiming } from '../lib/agenda-zichtbaarheid.ts';

export interface ActiviteitRecord {
  id: string;
  titel: string;
  soort: string;
  publicatiestatus: Publicatiestatus;
  contentstatus: ContentstatusBeheer | null;
  levenscyclus: 'actief' | 'geannuleerd';
  geannuleerdOp: string | null;
  geannuleerdDoor: string | null;
  annuleringsreden: string | null;
  lokaleOverride: Record<string, unknown>;
  gepubliceerd: boolean;
  korteOmschrijving?: string;
  volledigeOmschrijving?: string;
  hoofdafbeelding?: string;
}

export interface ActiviteitAudit {
  actie: string;
  id: string;
  van: string;
  naar: string;
  actor: string;
  op: string;
  reden: string;
}

export interface ActiviteitMutatie {
  record: ActiviteitRecord;
  audit: ActiviteitAudit[];
  mail: false;
  workflow: false;
  jobs: 0;
  verwijderd: false;
}

function basis(record: ActiviteitRecord, audit: ActiviteitAudit[]): ActiviteitMutatie {
  return { record, audit, mail: false, workflow: false, jobs: 0, verwijderd: false };
}

export function annuleerActiviteit(
  record: ActiviteitRecord,
  input: { actor: string; reden?: string; op: string },
): ActiviteitMutatie {
  if (record.levenscyclus === 'geannuleerd') return basis(record, []);
  const volgende: ActiviteitRecord = {
    ...record,
    levenscyclus: 'geannuleerd',
    geannuleerdOp: input.op,
    geannuleerdDoor: input.actor,
    annuleringsreden: input.reden?.trim() || null,
    gepubliceerd: false,
    lokaleOverride: { ...record.lokaleOverride, annulering: true },
  };
  return basis(volgende, [{
    actie: 'activiteit_annuleren',
    id: record.id,
    van: record.levenscyclus,
    naar: 'geannuleerd',
    actor: input.actor,
    op: input.op,
    reden: input.reden?.trim() || '',
  }]);
}

export function wijzigPublicatiestatus(
  record: ActiviteitRecord,
  input: { status: Publicatiestatus; actor: string; op: string },
): ActiviteitMutatie {
  if (record.levenscyclus === 'geannuleerd') return basis(record, []);
  if (record.publicatiestatus === input.status) return basis(record, []);
  const volgende: ActiviteitRecord = {
    ...record,
    publicatiestatus: input.status,
    lokaleOverride: { ...record.lokaleOverride, publicatiestatus: input.status },
  };
  return basis(volgende, [{
    actie: 'publicatiestatus',
    id: record.id,
    van: record.publicatiestatus,
    naar: input.status,
    actor: input.actor,
    op: input.op,
    reden: '',
  }]);
}

export function wijzigContentstatus(
  record: ActiviteitRecord,
  input: { status: ContentstatusBeheer; actor: string; op: string },
): ActiviteitMutatie {
  if (record.contentstatus === input.status) return basis(record, []);
  const volgende: ActiviteitRecord = {
    ...record,
    contentstatus: input.status,
    lokaleOverride: { ...record.lokaleOverride, contentstatus: input.status },
  };
  return basis(volgende, [{
    actie: 'contentstatus',
    id: record.id,
    van: record.contentstatus ?? '',
    naar: input.status,
    actor: input.actor,
    op: input.op,
    reden: '',
  }]);
}

export function zichtbaarEnBezet(record: ActiviteitRecord, momentBereikt: boolean): {
  zichtbaar: boolean;
  blokkeert: boolean;
} {
  const zichtbaar = momentBereikt && magOpWebsiteZonderTiming({
    zichtbaarheid: record.publicatiestatus,
    geannuleerd: record.levenscyclus === 'geannuleerd',
    contentstatus: record.contentstatus,
    soort: record.soort,
    titel: record.titel,
    korteOmschrijving: record.korteOmschrijving,
    volledigeOmschrijving: record.volledigeOmschrijving,
    hoofdafbeelding: record.hoofdafbeelding,
  });
  return {
    zichtbaar,
    blokkeert: blokkeertBeschikbaarheid({
      zichtbaarheid: record.publicatiestatus,
      geannuleerd: record.levenscyclus === 'geannuleerd',
    }),
  };
}
