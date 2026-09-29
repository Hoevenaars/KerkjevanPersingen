/**
 * Idempotente Sanity → Supabase payload.
 * Dry-run gebruikt alleen deze functie. Schrijven gebeurt via importeer_sanity_batch.
 * Productie weigert schrijven. Vastgelegde Sanity-status blijft migratie_vastgelegd.
 */

import { huidigeContentBron } from './bron.ts';
import { contentVereist, publicatieTriggerVoor, type InhoudStatus } from './continuiteit.ts';
import { sanityAanvraagStatus, sanityBoekingStatus } from './migratie.ts';
import type { PublicatieTrigger } from './types.ts';
import type {
  SanityAanvraagDoc,
  SanityActiviteitDoc,
  SanityDump,
  SanityVriendDoc,
} from './migratie-transform.ts';

const VERHUUR = new Set(['expositie', 'bruiloft', 'concert', 'diverse']);
const FREQUENTIE = new Set(['wekelijks', 'tweewekelijks', 'maandelijks']);

export interface ImportIssue {
  ernst: 'fout' | 'letop';
  legacyId: string;
  detail: string;
}

export interface SanityImportBatch {
  relaties: Record<string, unknown>[];
  aanvragen: Record<string, unknown>[];
  boekingen: Record<string, unknown>[];
  publiek: Record<string, unknown>[];
  intern: Record<string, unknown>[];
  vrienden: Record<string, unknown>[];
  nieuwsbrieven: Record<string, unknown>[];
}

export interface SanityImportPlan {
  batch: SanityImportBatch;
  issues: ImportIssue[];
  telling: {
    relaties: number;
    aanvragen: number;
    boekingen: number;
    publiek: number;
    intern: number;
    vrienden: number;
    nieuwsbrieven: number;
    overgeslagen: number;
    fouten: number;
  };
}

export function stagingSchrijvenToegestaan(env: Record<string, unknown>): { ok: true } | { ok: false; reden: string } {
  if (env.VERCEL_ENV === 'production') {
    return { ok: false, reden: 'Productie weigert een Sanity-import.' };
  }
  if (huidigeContentBron(env) !== 'supabase') {
    return { ok: false, reden: 'Schrijven mag alleen als Supabase-staging bewust aan staat.' };
  }
  return { ok: true };
}

function ymd(waarde: string | undefined): string {
  if (!waarde) return '';
  return waarde.slice(0, 10);
}

function slugVan(titel: string, id: string, gegeven?: string): string {
  if (gegeven?.trim()) return gegeven.trim();
  const basis = titel
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${basis || 'activiteit'}-${id.replace(/[^a-z0-9]+/gi, '').slice(-8)}`.slice(0, 80);
}

function fotoPad(foto: unknown): { pad: string; open: boolean } {
  if (typeof foto === 'string' && /^https?:\/\//.test(foto)) return { pad: foto, open: false };
  if (foto && typeof foto === 'object') return { pad: '', open: true };
  return { pad: '', open: false };
}

function refId(waarde: { _ref?: string } | string | undefined): string {
  if (!waarde) return '';
  if (typeof waarde === 'string') return waarde;
  return waarde._ref ?? '';
}

export function bouwSanityImport(dump: SanityDump): SanityImportPlan {
  const issues: ImportIssue[] = [];
  let overgeslagen = 0;
  const relaties: Record<string, unknown>[] = [];
  const emailNaarLegacy = new Map<string, string>();

  function relatie(input: {
    legacyId: string;
    naam: string;
    email: string;
    telefoon?: string;
    adres?: string;
    rollen?: string[];
  }): string {
    const email = input.email.trim().toLowerCase();
    if (email && emailNaarLegacy.has(email)) return emailNaarLegacy.get(email)!;
    relaties.push({
      legacy_id: input.legacyId,
      naam: input.naam || email || 'Naamloos',
      email,
      telefoon: input.telefoon ?? '',
      adres: input.adres ?? '',
      rollen: input.rollen ?? [],
    });
    if (email) emailNaarLegacy.set(email, input.legacyId);
    return input.legacyId;
  }

  for (const persoon of dump.personen) {
    if (!persoon._id) continue;
    if (!persoon.email) {
      issues.push({ ernst: 'letop', legacyId: persoon._id, detail: 'Persoon zonder e-mailadres.' });
    }
    relatie({
      legacyId: persoon._id,
      naam: persoon.naam || '',
      email: persoon.email || '',
      telefoon: persoon.telefoon,
      rollen: persoon.rollen,
    });
  }

  const aanvragen: Record<string, unknown>[] = [];
  for (const aanvraag of dump.aanvragen) {
    const gebouwd = aanvraagRij(aanvraag, issues);
    if (!gebouwd) {
      overgeslagen += 1;
      continue;
    }
    const relatieId = relatie({
      legacyId: `aanvraag-${aanvraag._id}`,
      naam: aanvraag.naam || '',
      email: aanvraag.email || '',
      telefoon: aanvraag.telefoon,
      adres: aanvraag.adres,
      rollen: ['aanvrager'],
    });
    aanvragen.push({ ...gebouwd, relatie_legacy_id: relatieId });
  }

  const boekingen: Record<string, unknown>[] = [];
  const publiek: Record<string, unknown>[] = [];
  const intern: Record<string, unknown>[] = [];

  for (const activiteit of dump.activiteiten) {
    const start = ymd(activiteit.start);
    const eind = ymd(activiteit.eind) || start;
    if (!activiteit._id || !start) {
      overgeslagen += 1;
      issues.push({
        ernst: 'fout',
        legacyId: activiteit._id || '',
        detail: 'Activiteit zonder startdatum wordt niet geïmporteerd.',
      });
      continue;
    }
    if (activiteit.soort === 'blokkade') {
      intern.push({
        legacy_id: activiteit._id,
        titel: activiteit.interneTitel || activiteit.publiekeTitel || 'Blokkade',
        start_datum: start,
        eind_datum: eind,
        blokkeert: activiteit.zichtbaarheid !== 'verborgen',
      });
      continue;
    }
    const verhuur = VERHUUR.has(activiteit.soort || '') ? activiteit.soort : '';
    if (!verhuur) {
      issues.push({
        ernst: 'letop',
        legacyId: activiteit._id,
        detail: `Onbekend verhuurtype “${activiteit.soort ?? ''}” blijft leeg.`,
      });
    }
    const email = activiteit.huurderEmail || '';
    const relatieId = email
      ? relatie({
          legacyId: refId(activiteit.huurder) || `huurder-${activiteit._id}`,
          naam: activiteit.huurderNaam || email,
          email,
          telefoon: activiteit.huurderTelefoon,
          adres: activiteit.huurderAdres,
          rollen: ['huurder'],
        })
      : '';
    if (!email) {
      issues.push({ ernst: 'letop', legacyId: activiteit._id, detail: 'Boeking zonder e-mailadres van de huurder.' });
    }
    const status = sanityBoekingStatus(activiteit.boekingStatus);
    boekingen.push({
      legacy_id: activiteit._id,
      nummer: `S-${start.replace(/-/g, '')}-${activiteit._id.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase()}`,
      status,
      verhuurtype_sleutel: verhuur,
      interne_titel: activiteit.interneTitel || activiteit.publiekeTitel || 'Activiteit',
      start_datum: start,
      eind_datum: eind,
      relatie_legacy_id: relatieId,
      gastheer_legacy_id: refId(activiteit.gastheer) || activiteit.gastheerId || '',
      aanvraag_legacy_id: refId(activiteit.aanvraag) || activiteit.aanvraagId || '',
      huurder_naam_snapshot: activiteit.huurderNaam || '',
      huurder_email_snapshot: email,
      huurder_telefoon_snapshot: activiteit.huurderTelefoon || '',
      huurder_adres_snapshot: activiteit.huurderAdres || '',
      aantal_personen: activiteit.aantalPersonen || '',
      toelichting: activiteit.toelichtingAanvrager || '',
      website: activiteit.website || '',
      tarief_bedrag: activiteit.tariefBedrag ?? '',
      aanbetaling_ontvangen: Boolean(activiteit.aanbetalingBinnen),
    });

    const trigger = triggerVoor(activiteit);
    const zichtbaar = activiteit.zichtbaarheid === 'publiek';
    if (zichtbaar || contentVereist(trigger)) {
      const foto = fotoPad(activiteit.foto);
      if (foto.open) {
        issues.push({
          ernst: 'letop',
          legacyId: activiteit._id,
          detail: 'Sanity-afbeelding is geen publieke URL. Asset moet apart gecontroleerd worden.',
        });
      }
      publiek.push({
        boeking_legacy_id: activiteit._id,
        titel: activiteit.publiekeTitel || activiteit.interneTitel || 'Activiteit',
        slug: slugVan(activiteit.publiekeTitel || activiteit.interneTitel || 'activiteit', activiteit._id, activiteit.slug),
        omschrijving: activiteit.omschrijving || '',
        start_datum: start,
        eind_datum: eind,
        publicatie_trigger: trigger,
        gepubliceerd: zichtbaar,
        inhoud_status: inhoudVoor(activiteit, trigger, zichtbaar),
        foto_pad: foto.pad,
        foto_alt: activiteit.fotoAlt || activiteit.publiekeTitel || '',
      });
    }
  }

  const vrienden = dump.vrienden.flatMap((vriend) => {
    const rij = vriendRij(vriend, issues);
    if (!rij) {
      overgeslagen += 1;
      return [];
    }
    return [rij];
  });

  const nieuwsbrieven = dump.nieuwsbrieven.flatMap((brief) => {
    const week = ymd(brief.week);
    if (!brief._id || !week) {
      overgeslagen += 1;
      issues.push({ ernst: 'fout', legacyId: brief._id || '', detail: 'Nieuwsbrief zonder week wordt niet geïmporteerd.' });
      return [];
    }
    return [
      {
        legacy_id: brief._id,
        week_maandag: week,
        kort_nieuws: brief.kortNieuws || '',
        donatie_update: brief.donatieUpdate || '',
        overgeslagen: Boolean(brief.geannuleerd),
        verstuurd: Boolean(brief.verstuurd),
      },
    ];
  });

  const batch: SanityImportBatch = { relaties, aanvragen, boekingen, publiek, intern, vrienden, nieuwsbrieven };
  return {
    batch,
    issues,
    telling: {
      relaties: relaties.length,
      aanvragen: aanvragen.length,
      boekingen: boekingen.length,
      publiek: publiek.length,
      intern: intern.length,
      vrienden: vrienden.length,
      nieuwsbrieven: nieuwsbrieven.length,
      overgeslagen,
      fouten: issues.filter((item) => item.ernst === 'fout').length,
    },
  };
}

function aanvraagRij(aanvraag: SanityAanvraagDoc, issues: ImportIssue[]): Record<string, unknown> | null {
  if (!aanvraag._id || !aanvraag.email?.trim()) {
    issues.push({
      ernst: 'fout',
      legacyId: aanvraag._id || '',
      detail: 'Aanvraag zonder e-mailadres wordt niet geïmporteerd.',
    });
    return null;
  }
  const start = ymd(aanvraag.datum);
  if (!start) {
    issues.push({ ernst: 'letop', legacyId: aanvraag._id, detail: 'Aanvraag zonder datum.' });
  }
  const soort = VERHUUR.has(aanvraag.soort || '') ? aanvraag.soort : '';
  return {
    legacy_id: aanvraag._id,
    status: sanityAanvraagStatus(aanvraag.status || ''),
    naam: aanvraag.naam || aanvraag.email,
    email: aanvraag.email.trim(),
    telefoon: aanvraag.telefoon || '',
    adres: aanvraag.adres || '',
    verhuurtype_sleutel: soort,
    start_datum: start,
    eind_datum: ymd(aanvraag.datumTot) || start,
    aantal_personen: aanvraag.personen || '',
    toelichting: aanvraag.toelichting || '',
    website: aanvraag.website || '',
    afwijsreden: aanvraag.afwijsreden || '',
    boeking_legacy_id: refId(aanvraag.boeking),
  };
}

function triggerVoor(activiteit: SanityActiviteitDoc): PublicatieTrigger {
  const gekozen = activiteit.toonVanafMaanden;
  if (
    gekozen === 'zodra_content_compleet' ||
    gekozen === 'uiterlijk_1_maand' ||
    gekozen === 'uiterlijk_2_maanden' ||
    gekozen === 'uiterlijk_3_maanden' ||
    gekozen === 'niet_publiceren'
  ) {
    return gekozen;
  }
  if (activiteit.zichtbaarheid === 'publiek') return 'zodra_content_compleet';
  return publicatieTriggerVoor(activiteit.soort || '');
}

function inhoudVoor(activiteit: SanityActiviteitDoc, trigger: PublicatieTrigger, zichtbaar: boolean): InhoudStatus {
  if (!contentVereist(trigger)) return 'niet_vereist';
  if (zichtbaar || activiteit.contentStatus === 'goedgekeurd') return 'goedgekeurd';
  if (activiteit.contentStatus === 'ontvangen') return 'ingediend';
  if (activiteit.omschrijving) return 'ingediend';
  return 'niet_gestart';
}

function vriendRij(vriend: SanityVriendDoc, issues: ImportIssue[]): Record<string, unknown> | null {
  if (!vriend._id || !vriend.email?.trim()) {
    issues.push({ ernst: 'fout', legacyId: vriend._id || '', detail: 'Vriend zonder e-mailadres wordt niet geïmporteerd.' });
    return null;
  }
  const frequentie = FREQUENTIE.has(vriend.frequentie || '') ? vriend.frequentie : 'wekelijks';
  if (vriend.frequentie && frequentie !== vriend.frequentie) {
    issues.push({ ernst: 'letop', legacyId: vriend._id, detail: 'Onbekende frequentie wordt wekelijks.' });
  }
  return {
    legacy_id: vriend._id,
    naam: vriend.naam || '',
    email: vriend.email.trim(),
    actief: vriend.actief !== false,
    frequentie,
    uitschrijf_token: vriend.uitschrijfToken || `import-${vriend._id}`,
  };
}
