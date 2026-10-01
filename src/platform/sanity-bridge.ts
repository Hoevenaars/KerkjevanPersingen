/**
 * Eenrichtingsbridge Sanity naar Supabase.
 * Geen mail, geen workflow, geen schrijven terug naar Sanity.
 *
 * Ondersteund: activiteit, aanvraag, vriend, nieuwsbrief, instellingen.
 * Instellingen worden alleen gelogd: de runtime-sleutels komen niet overeen
 * en een schrijfactie zou verhuurgedrag veranderen.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { contentstatusVanSanity, triggerVanToonVanaf, type Publicatiestatus } from '../lib/agenda-zichtbaarheid.ts';

export const BRIDGE_TYPEN = ['activiteit', 'aanvraag', 'vriend', 'nieuwsbrief', 'instellingen'] as const;
export type BridgeType = (typeof BRIDGE_TYPEN)[number];
export type BridgeLogStatus = 'success' | 'skipped' | 'review' | 'error';

export interface SanityDocument {
  _id?: string;
  _type?: string;
  _updatedAt?: string;
  [sleutel: string]: unknown;
}

export interface LokaleActiviteitOverride {
  geannuleerd: boolean;
  publicatiestatus: Publicatiestatus | null;
  contentstatus: string | null;
  publicatietiming: boolean;
  contentvelden: boolean;
}

export const LEGE_OVERRIDE: LokaleActiviteitOverride = {
  geannuleerd: false,
  publicatiestatus: null,
  contentstatus: null,
  publicatietiming: false,
  contentvelden: false,
};

export interface BridgeSnapshot {
  hash: string | null;
  heeftBron: boolean;
  heeftPubliek: boolean;
  heeftIntern: boolean;
  heeftBoeking: boolean;
  heeftVriend: boolean;
  heeftNieuwsbrief: boolean;
  heeftAanvraag: boolean;
  heeftShadow: boolean;
  lokaleOverride: LokaleActiviteitOverride;
}

export const LEGE_SNAPSHOT: BridgeSnapshot = {
  hash: null,
  heeftBron: false,
  heeftPubliek: false,
  heeftIntern: false,
  heeftBoeking: false,
  heeftVriend: false,
  heeftNieuwsbrief: false,
  heeftAanvraag: false,
  heeftShadow: false,
  lokaleOverride: LEGE_OVERRIDE,
};

export interface BridgeStap {
  soort: string;
  sanityId: string;
  velden: Record<string, unknown>;
}

export interface BridgePlan {
  status: BridgeLogStatus;
  action: 'create' | 'update' | 'delete';
  documentType: string;
  sanityId: string;
  targetTable: string | null;
  targetId: string | null;
  error: string | null;
  sourceHash: string;
  sourceUpdatedAt: string | null;
  domeinMutaties: number;
  mail: false;
  workflow: false;
  stappen: BridgeStap[];
}

export function legeSnapshot(): BridgeSnapshot {
  return { ...LEGE_SNAPSHOT, lokaleOverride: { ...LEGE_OVERRIDE } };
}

export function overrideVanRij(rij: Record<string, unknown> | null | undefined): LokaleActiviteitOverride {
  if (!rij) return { ...LEGE_OVERRIDE };
  const ruw = rij.lokale_override;
  const override = ruw && typeof ruw === 'object' ? ruw as Record<string, unknown> : {};
  const status = override.publicatiestatus;
  return {
    geannuleerd: rij.levenscyclus === 'geannuleerd' || override.annulering === true,
    publicatiestatus: status === 'publiek' || status === 'bezet' || status === 'verborgen' ? status : null,
    contentstatus: typeof override.contentstatus === 'string' ? override.contentstatus : null,
    publicatietiming: override.publicatietiming === true,
    contentvelden: override.contentvelden === true,
  };
}

function bewaakOverride(
  stappen: BridgeStap[],
  override: LokaleActiviteitOverride,
  document: SanityDocument,
  hash: string,
): { stappen: BridgeStap[]; conflicten: BridgeStap[] } {
  const conflicten: BridgeStap[] = [];
  const inkomendZicht = zichtbaarheidVan(document.zichtbaarheid);
  const inkomendContent = contentstatusVanSanity(document.contentStatus);
  const inkomendTrigger = triggerVanToonVanaf(document.toonVanafMaanden);
  const sanityId = String(document._id ?? '');
  const conflict = (veld: string, inkomend: string, lokaal: string) => {
    conflicten.push({
      soort: 'conflict',
      sanityId,
      velden: { veld, inkomend, lokaal, hash, status: 'review' },
    });
  };
  if (override.geannuleerd && inkomendZicht !== 'verborgen') {
    conflict('annulering', inkomendZicht, 'geannuleerd');
  }
  if (override.publicatiestatus && inkomendZicht !== override.publicatiestatus) {
    conflict('publicatiestatus', inkomendZicht, override.publicatiestatus);
  }
  if (override.contentstatus && inkomendContent && inkomendContent !== override.contentstatus) {
    conflict('contentstatus', inkomendContent, override.contentstatus);
  }
  if (override.publicatietiming && inkomendTrigger) {
    conflict('publicatietiming', inkomendTrigger, 'lokaal');
  }
  const veilig = stappen.map((stap) => {
    const velden = { ...stap.velden };
    if (override.geannuleerd) {
      if ('blokkeert' in velden) velden.blokkeert = false;
      if ('gepubliceerd' in velden) velden.gepubliceerd = false;
      delete velden.zichtbaarheid;
      velden.levenscyclus = 'geannuleerd';
    }
    if (override.publicatiestatus) delete velden.zichtbaarheid;
    if (override.contentstatus) delete velden.contentstatus;
    if (override.publicatietiming) delete velden.publicatieTrigger;
    if (override.contentvelden) delete velden.omschrijving;
    return { ...stap, velden };
  });
  return { stappen: veilig, conflicten };
}

export function bronHash(document: SanityDocument): string {
  const kopie = { ...document };
  delete kopie._rev;
  const tekst = JSON.stringify(kopie, Object.keys(kopie).sort());
  return createHash('sha256').update(tekst).digest('hex');
}

function ymd(waarde: unknown): string | null {
  const tekst = String(waarde ?? '');
  const match = tekst.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function zichtbaarheidVan(waarde: unknown): 'publiek' | 'bezet' | 'verborgen' {
  if (waarde === 'publiek' || waarde === 'bezet' || waarde === 'verborgen') return waarde;
  return 'bezet';
}

function slugVan(document: SanityDocument): string | null {
  const slug = document.slug;
  if (typeof slug === 'string' && slug) return slug;
  if (slug && typeof slug === 'object' && 'current' in slug) {
    const current = (slug as { current?: unknown }).current;
    return typeof current === 'string' && current ? current : null;
  }
  return null;
}

function planBasis(document: SanityDocument, action: BridgePlan['action'], type: string): BridgePlan {
  return {
    status: 'success',
    action,
    documentType: type,
    sanityId: String(document._id ?? ''),
    targetTable: null,
    targetId: null,
    error: null,
    sourceHash: bronHash(document),
    sourceUpdatedAt: typeof document._updatedAt === 'string' ? document._updatedAt : null,
    domeinMutaties: 0,
    mail: false,
    workflow: false,
    stappen: [],
  };
}

function overslaan(plan: BridgePlan, reden: string, status: BridgeLogStatus = 'skipped'): BridgePlan {
  return { ...plan, status, error: reden, stappen: [], domeinMutaties: 0, mail: false, workflow: false };
}

export function normaliseerEvent(
  body: unknown,
  operation?: string | null,
): { action: BridgePlan['action']; document: SanityDocument } | null {
  if (!body || typeof body !== 'object') return null;
  const ruw = body as Record<string, unknown>;
  const transition = String(ruw.transition ?? ruw.action ?? '');
  const operatie = String(operation ?? '').trim().toLowerCase();
  const genest = ruw.document && typeof ruw.document === 'object' ? (ruw.document as SanityDocument) : null;
  const document = (genest ?? ruw) as SanityDocument;
  if (!document._id || !document._type) return null;
  const action: BridgePlan['action'] =
    operatie === 'delete' || transition === 'delete' || ruw._deleted === true || document._deleted === true
      ? 'delete'
      : operatie === 'create' || transition === 'create' || transition === 'appear'
        ? 'create'
        : 'update';
  return { action, document };
}

export function planBridge(
  action: BridgePlan['action'],
  document: SanityDocument,
  snapshot: BridgeSnapshot = LEGE_SNAPSHOT,
): BridgePlan {
  const type = String(document._type ?? '');
  const plan = planBasis(document, action, type || 'onbekend');
  if (!document._id) return overslaan(plan, 'document zonder _id', 'error');
  if (document._id.startsWith('drafts.')) return overslaan(plan, 'concept wordt niet gesynchroniseerd');
  if (!(BRIDGE_TYPEN as readonly string[]).includes(type)) {
    return overslaan(plan, 'onbekend documenttype');
  }
  if (action !== 'delete' && snapshot.hash && snapshot.hash === plan.sourceHash) {
    return overslaan(plan, 'zelfde bronhash');
  }
  if (type === 'instellingen') {
    return overslaan(plan, 'instellingen blijven buiten de runtime-tabel', 'review');
  }
  if (type === 'activiteit') return planActiviteit(plan, document, snapshot, action);
  if (type === 'vriend') return planVriend(plan, document, snapshot, action);
  if (type === 'nieuwsbrief') return planNieuwsbrief(plan, document, snapshot, action);
  return planAanvraag(plan, document, snapshot, action);
}

function planActiviteit(
  plan: BridgePlan,
  document: SanityDocument,
  snapshot: BridgeSnapshot,
  action: BridgePlan['action'],
): BridgePlan {
  const start = ymd(document.start);
  const eind = ymd(document.eind) || start;
  const zichtbaarheid = zichtbaarheidVan(document.zichtbaarheid);
  const blokkeert = zichtbaarheid !== 'verborgen';
  if (action !== 'delete' && !start) {
    return overslaan(plan, 'activiteit zonder startdatum', 'error');
  }
  if (snapshot.heeftBoeking && !snapshot.heeftBron && !snapshot.heeftPubliek && !snapshot.heeftIntern) {
    return overslaan(plan, 'boeking bestaat en wordt niet herschreven', 'review');
  }
  const stappen: BridgeStap[] = [];
  if (snapshot.heeftBron) {
    stappen.push({
      soort: 'bron',
      sanityId: plan.sanityId,
      velden: {
        zichtbaarheid: action === 'delete' ? 'verborgen' : zichtbaarheid,
        soort: document.soort ?? null,
        titel: document.publiekeTitel ?? document.interneTitel ?? null,
        interneTitel: document.interneTitel ?? null,
        slug: slugVan(document),
        start,
        eind,
        hash: plan.sourceHash,
      },
    });
  }
  if (snapshot.heeftPubliek || (action !== 'delete' && zichtbaarheid === 'publiek' && !snapshot.heeftBoeking)) {
    stappen.push({
      soort: 'publiek',
      sanityId: plan.sanityId,
      velden: {
        zichtbaarheid: action === 'delete' ? 'verborgen' : zichtbaarheid,
        titel: document.publiekeTitel ?? document.interneTitel ?? 'Activiteit',
        slug: slugVan(document),
        start,
        eind,
        omschrijving: document.omschrijving ?? null,
        hash: plan.sourceHash,
        gepubliceerd: action !== 'delete' && zichtbaarheid === 'publiek',
        contentstatus: contentstatusVanSanity(document.contentStatus),
        publicatieTrigger: triggerVanToonVanaf(document.toonVanafMaanden),
      },
    });
  }
  if (snapshot.heeftIntern || document.soort === 'blokkade') {
    if (snapshot.heeftIntern) {
      stappen.push({
        soort: 'intern',
        sanityId: plan.sanityId,
        velden: {
          titel: document.interneTitel ?? 'Blokkade',
          start,
          eind,
          blokkeert: action !== 'delete' && blokkeert,
          hash: plan.sourceHash,
        },
      });
    }
  }
  const ongematchteBezetting = !snapshot.heeftBron && !snapshot.heeftBoeking && document.soort !== 'blokkade';
  const ongematchteBlokkade = document.soort === 'blokkade' && !snapshot.heeftIntern && !snapshot.heeftBron;
  const schaduwNodig = action !== 'delete' && (ongematchteBezetting || ongematchteBlokkade);
  if (schaduwNodig || snapshot.heeftShadow) {
    stappen.push({
      soort: 'shadow',
      sanityId: plan.sanityId,
      velden: {
        start,
        eind,
        zichtbaarheid,
        soort: document.soort ?? null,
        titel: document.interneTitel ?? null,
        hash: plan.sourceHash,
        updatedAt: plan.sourceUpdatedAt,
        actief: action !== 'delete',
        blokkeert: action !== 'delete' && blokkeert && !snapshot.heeftBron && !snapshot.heeftBoeking,
      },
    });
  }
  if (stappen.length === 0) return overslaan(plan, 'geen passende schrijfstap', 'review');
  const bewaakt = bewaakOverride(stappen, snapshot.lokaleOverride ?? LEGE_OVERRIDE, document, plan.sourceHash);
  const doel = bewaakt.stappen[0]?.soort === 'shadow'
    ? 'sanity_bridge_agenda'
    : bewaakt.stappen[0]?.soort === 'publiek'
      ? 'publieke_activiteiten'
      : bewaakt.stappen[0]?.soort === 'intern'
        ? 'interne_activiteiten'
        : 'activiteit_bron';
  return {
    ...plan,
    status: bewaakt.conflicten.length ? 'review' : 'success',
    error: bewaakt.conflicten.length ? 'lokale override behouden' : null,
    stappen: [...bewaakt.stappen, ...bewaakt.conflicten],
    domeinMutaties: bewaakt.stappen.length,
    targetTable: doel,
    targetId: plan.sanityId,
    mail: false,
    workflow: false,
  };
}

function planVriend(plan: BridgePlan, document: SanityDocument, snapshot: BridgeSnapshot, action: BridgePlan['action']): BridgePlan {
  const email = String(document.email ?? '').trim().toLowerCase();
  if (action !== 'delete' && !email) return overslaan(plan, 'vriend zonder e-mail', 'error');
  const frequentie = document.frequentie;
  if (action !== 'delete' && frequentie && !['wekelijks', 'tweewekelijks', 'maandelijks'].includes(String(frequentie))) {
    return overslaan(plan, 'onbekende frequentie', 'error');
  }
  return {
    ...plan,
    targetTable: 'vrienden',
    targetId: plan.sanityId,
    domeinMutaties: 1,
    stappen: [{
      soort: 'vriend',
      sanityId: plan.sanityId,
      velden: {
        naam: document.naam ?? null,
        email,
        actief: action === 'delete' ? false : document.actief !== false,
        frequentie: frequentie || 'wekelijks',
        bestaand: snapshot.heeftVriend,
        hash: plan.sourceHash,
      },
    }],
  };
}

function planNieuwsbrief(plan: BridgePlan, document: SanityDocument, snapshot: BridgeSnapshot, action: BridgePlan['action']): BridgePlan {
  const week = ymd(document.week);
  if (action !== 'delete' && !week) return overslaan(plan, 'nieuwsbrief zonder week', 'error');
  return {
    ...plan,
    targetTable: 'nieuwsbrieven',
    targetId: plan.sanityId,
    domeinMutaties: 1,
    stappen: [{
      soort: 'nieuwsbrief',
      sanityId: plan.sanityId,
      velden: {
        week,
        kortNieuws: document.kortNieuws ?? null,
        donatieUpdate: document.donatieUpdate ?? null,
        overgeslagen: action === 'delete' || document.geannuleerd === true,
        bestaand: snapshot.heeftNieuwsbrief,
        hash: plan.sourceHash,
        verstuurd: false,
      },
    }],
  };
}

function planAanvraag(plan: BridgePlan, document: SanityDocument, snapshot: BridgeSnapshot, action: BridgePlan['action']): BridgePlan {
  const email = String(document.email ?? '').trim().toLowerCase();
  if (action !== 'delete' && !email) return overslaan(plan, 'aanvraag zonder e-mail', 'error');
  const ruw = String(document.status ?? 'nieuw');
  const status = action === 'delete' ? 'gesloten' : ruw === 'ja' ? 'goedgekeurd' : ruw === 'nee' ? 'afgewezen' : ruw === 'gesloten' ? 'gesloten' : 'nieuw';
  return {
    ...plan,
    targetTable: 'aanvragen',
    targetId: plan.sanityId,
    domeinMutaties: 1,
    stappen: [{
      soort: 'aanvraag',
      sanityId: plan.sanityId,
      velden: {
        naam: document.naam ?? 'Naamloos',
        email,
        telefoon: document.telefoon ?? null,
        status,
        start: ymd(document.start),
        eind: ymd(document.eind),
        soort: document.soort ?? null,
        bestaand: snapshot.heeftAanvraag,
        hash: plan.sourceHash,
      },
    }],
  };
}

export type ReconciliatieOordeel = 'gelijk' | 'ontbrekend' | 'afwijkend' | 'review' | 'error' | 'overgeslagen';

function doelAanwezig(type: string, snapshot: BridgeSnapshot): boolean {
  if (type === 'activiteit') return snapshot.heeftBron || snapshot.heeftPubliek || snapshot.heeftIntern || snapshot.heeftShadow || snapshot.heeftBoeking;
  if (type === 'vriend') return snapshot.heeftVriend;
  if (type === 'nieuwsbrief') return snapshot.heeftNieuwsbrief;
  if (type === 'aanvraag') return snapshot.heeftAanvraag;
  return false;
}

/** Vergelijkt een Sanity-document met de Supabase-snapshot. Schrijft niets. */
export function beoordeelReconciliatie(document: SanityDocument, snapshot: BridgeSnapshot = LEGE_SNAPSHOT): {
  oordeel: ReconciliatieOordeel;
  plan: BridgePlan;
} {
  const plan = planBridge('update', document, snapshot);
  const type = String(document._type ?? '');
  const aanwezig = doelAanwezig(type, snapshot);
  if (plan.status === 'skipped' && plan.error === 'zelfde bronhash') return { oordeel: 'gelijk', plan };
  if (plan.status === 'error') return { oordeel: 'error', plan };
  if (plan.stappen.some((stap) => stap.soort === 'conflict')) return { oordeel: 'review', plan };
  if (plan.status === 'review' || plan.status === 'skipped') {
    return { oordeel: plan.status === 'review' ? 'review' : 'overgeslagen', plan };
  }
  if (aanwezig && !snapshot.hash) {
    return {
      oordeel: 'review',
      plan: { ...plan, status: 'review', error: 'legacy-record aanwezig, nog geen bronhash', stappen: [], domeinMutaties: 0 },
    };
  }
  return { oordeel: aanwezig ? 'afwijkend' : 'ontbrekend', plan };
}

export function webhookGeheimGeldig(header: string | null, rawBody: string, geheim: string, nu = Date.now()): boolean {
  if (!geheim || !header) return false;
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (bearer && veiligGelijk(bearer, geheim)) return true;
  const delen = Object.fromEntries(header.split(',').map((deel) => {
    const [sleutel, ...rest] = deel.trim().split('=');
    return [sleutel, rest.join('=')];
  }));
  const tijdstip = Number(delen.t);
  const handtekening = delen.v1;
  if (!tijdstip || !handtekening) return false;
  if (Math.abs(nu - tijdstip) > 5 * 60 * 1000) return false;
  const verwacht = createHmac('sha256', geheim).update(`${tijdstip}.${rawBody}`).digest('base64url');
  return veiligGelijk(naarBase64Url(handtekening), verwacht);
}

function naarBase64Url(waarde: string): string {
  return waarde.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function veiligGelijk(links: string, rechts: string): boolean {
  const a = Buffer.from(links);
  const b = Buffer.from(rechts);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface SchaduwRij {
  sanityId: string;
  start: string | null;
  eind: string | null;
  actief: boolean;
  blokkeert: boolean;
  zichtbaarheid: string;
}

export function bridgeBezetting(rijen: readonly SchaduwRij[]): SchaduwRij[] {
  return rijen.filter((rij) => rij.actief && rij.blokkeert && rij.start && rij.eind);
}
