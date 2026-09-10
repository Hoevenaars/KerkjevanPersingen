/**
 * Sanity-documenten → records voor /beheer en de migratiecontrole (FO §71–§74).
 *
 * Pure transformatie: geen netwerk, geen writes. De website blijft Sanity lezen.
 */

import { ymdInAmsterdam } from './datum.ts';
import { huidigeBezetteDagen, publiekeBezetteDagen, type BezettingsItem } from './kalender.ts';
import { sanityAanvraagStatus, sanityBoekingStatus } from './migratie.ts';
import type {
  DemoAanvraag,
  DemoActiviteit,
  DemoBoeking,
  DemoGastheer,
  DemoInstellingen,
  DemoIntern,
  DemoNieuwsbrief,
  DemoRelatie,
  DemoTemplate,
  DemoVriend,
} from './demo-data.ts';
import { DEMO_INSTELLINGEN } from './demo-data.ts';

export interface SanityAanvraagDoc {
  _id: string;
  _type?: string;
  binnengekomenOp?: string;
  status?: string;
  afwijsreden?: string;
  naam?: string;
  email?: string;
  telefoon?: string;
  adres?: string;
  soort?: string;
  datum?: string;
  datumTot?: string;
  personen?: string;
  toelichting?: string;
  website?: string;
  eerderGeexposeerd?: string;
  medeExposanten?: string;
  boeking?: { _ref?: string } | string;
}

export interface SanityActiviteitDoc {
  _id: string;
  _type?: string;
  interneTitel?: string;
  huurderNaam?: string;
  huurderEmail?: string;
  huurderTelefoon?: string;
  huurderAdres?: string;
  aantalPersonen?: string;
  toelichtingAanvrager?: string;
  website?: string;
  eerderGeexposeerd?: string;
  medeExposanten?: string;
  akkoordVoorwaarden?: boolean;
  start?: string;
  eind?: string;
  soort?: string;
  zichtbaarheid?: 'verborgen' | 'bezet' | 'publiek' | string;
  publiekeTitel?: string;
  slug?: string;
  omschrijving?: string;
  foto?: unknown;
  fotoAlt?: string;
  toonVanafMaanden?: string;
  boekingStatus?: string;
  tariefBedrag?: number;
  aanbetalingBinnen?: boolean;
  contentStatus?: string;
  aanvraagId?: string;
  huurderId?: string;
  gastheerId?: string;
  aanvraag?: { _ref?: string };
  huurder?: { _ref?: string };
  gastheer?: { _ref?: string };
}

export interface SanityPersoonDoc {
  _id: string;
  naam?: string;
  email?: string;
  telefoon?: string;
  rollen?: string[];
  opReservelijst?: boolean;
  notities?: string;
}

export interface SanityVriendDoc {
  _id: string;
  naam?: string;
  email?: string;
  actief?: boolean;
  frequentie?: 'wekelijks' | 'tweewekelijks' | 'maandelijks' | string;
  uitschrijfToken?: string;
  aangemeldOp?: string;
}

export interface SanityNieuwsbriefDoc {
  _id: string;
  week?: string;
  kortNieuws?: string;
  donatieUpdate?: string;
  geannuleerd?: boolean;
  verstuurd?: boolean;
}

export interface SanityInstellingenDoc {
  ontvangstAdres?: string;
  extraOntvangstAdres?: string;
  penningmeesterAdres?: string;
  aanbetalingTermijnDagen?: number;
  contentVerzoekMaandenVooraf?: number;
  googleReviewUrl?: string;
  tarieven?: { soort?: string; bedrag?: number; toelichting?: string }[];
  [veld: string]: unknown;
}

export interface SanityDump {
  aanvragen: SanityAanvraagDoc[];
  activiteiten: SanityActiviteitDoc[];
  personen: SanityPersoonDoc[];
  vrienden: SanityVriendDoc[];
  nieuwsbrieven: SanityNieuwsbriefDoc[];
  instellingen: SanityInstellingenDoc | null;
}

export interface MigratieIssue {
  ernst: 'fout' | 'letop';
  type: string;
  legacyId: string;
  titel: string;
  detail: string;
}

export interface MigratieControle {
  label: string;
  sanity: number;
  nieuw: number;
  toelichting?: string;
}

export interface MigratieResultaat {
  aanvragen: DemoAanvraag[];
  boekingen: DemoBoeking[];
  agenda: DemoActiviteit[];
  intern: DemoIntern[];
  relaties: DemoRelatie[];
  gastheren: DemoGastheer[];
  vrienden: DemoVriend[];
  nieuwsbrieven: DemoNieuwsbrief[];
  instellingen: DemoInstellingen;
  templates: DemoTemplate[];
  controles: MigratieControle[];
  issues: MigratieIssue[];
  bezetteDagenHuidig: number;
  bezetteDagenNieuw: number;
}

const MAIL_TEMPLATES: { veld: string; naam: string; trigger: string; verhuurtype: string }[] = [
  { veld: 'mailAfwijzing', naam: 'Aanvraag afgewezen', trigger: 'Afwijzing', verhuurtype: 'alle' },
  { veld: 'mailContractBegeleiding', naam: 'Contract meesturen', trigger: 'Na goedkeuring', verhuurtype: 'alle' },
  { veld: 'mailVolgendeStappen', naam: 'Volgende stappen', trigger: 'Definitief', verhuurtype: 'alle' },
  { veld: 'mailAanbetalingCheckPaul', naam: 'Aanbetaling-check Paul', trigger: 'Na goedkeuring', verhuurtype: 'intern' },
  { veld: 'mailContentVerzoek', naam: 'Tekst/foto aanleveren', trigger: 'Maanden vooraf', verhuurtype: 'expositie' },
  { veld: 'mailContentTerBeoordeling', naam: 'Content ter beoordeling', trigger: 'Content binnen', verhuurtype: 'intern' },
  { veld: 'mailPraktisch4w', naam: 'Praktische info (huurder)', trigger: '4 weken vooraf', verhuurtype: 'alle' },
  { veld: 'mailPraktischGastheer', naam: 'Praktische info (gastheer)', trigger: '4 weken vooraf', verhuurtype: 'expositie' },
  { veld: 'mailHerinnering1d', naam: 'Herinnering 1 dag (huurder)', trigger: '1 dag vooraf', verhuurtype: 'alle' },
  { veld: 'mailHerinneringGastheer', naam: 'Herinnering 1 dag (gastheer)', trigger: '1 dag vooraf', verhuurtype: 'expositie' },
  { veld: 'mailReviewVerzoek', naam: 'Google-review', trigger: 'Na afloop', verhuurtype: 'alle' },
  { veld: 'mailReservelijst', naam: 'Vrijgekomen weekend', trigger: 'Annulering', verhuurtype: 'expositie' },
];

export function isoNaarYmd(waarde: string | undefined): string {
  if (!waarde) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(waarde)) return waarde;
  const d = new Date(waarde);
  if (Number.isNaN(d.getTime())) return waarde.slice(0, 10);
  return ymdInAmsterdam(d);
}

function refId(waarde: { _ref?: string } | string | undefined): string | undefined {
  if (!waarde) return undefined;
  if (typeof waarde === 'string') return waarde;
  return waarde._ref;
}

function emailSleutel(email: string | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

function boekingNummer(id: string, start: string): string {
  const dag = start.replace(/-/g, '') || '00000000';
  const kort = id.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase() || 'XXXX';
  return `S-${dag}-${kort}`;
}

function agendaStatus(a: SanityActiviteitDoc): DemoActiviteit['status'] {
  if (a.zichtbaarheid !== 'publiek') return 'concept';
  if (a.contentStatus === 'ontvangen') return 'concept';
  if ((a.contentStatus === 'ontbreekt' || !a.contentStatus) && !a.omschrijving) return 'mist_content';
  return 'online';
}

function tariefTekst(bedrag: number | undefined): string {
  if (bedrag == null || Number.isNaN(bedrag)) return '—';
  return `€ ${bedrag}`;
}

export function transformSanityDump(dump: SanityDump, nu = new Date()): MigratieResultaat {
  const issues: MigratieIssue[] = [];
  const vandaag = ymdInAmsterdam(nu);

  const relaties: DemoRelatie[] = [];
  const emailNaarRelatie = new Map<string, string>();

  function voegRelatieToe(input: {
    id: string;
    naam: string;
    email: string;
    telefoon?: string;
    rollen?: string[];
    reservelijst?: boolean;
  }): string {
    const email = emailSleutel(input.email);
    if (email && emailNaarRelatie.has(email)) return emailNaarRelatie.get(email)!;
    relaties.push({
      id: input.id,
      naam: input.naam || email || 'Naamloos',
      email: input.email || '',
      telefoon: input.telefoon || '',
      rollen: input.rollen ?? [],
      reservelijst: Boolean(input.reservelijst),
    });
    if (email) emailNaarRelatie.set(email, input.id);
    return input.id;
  }

  for (const p of dump.personen) {
    if (!p._id) continue;
    if (!p.email) {
      issues.push({
        ernst: 'letop',
        type: 'persoon',
        legacyId: p._id,
        titel: p.naam || p._id,
        detail: 'Persoon zonder e-mailadres.',
      });
    }
    voegRelatieToe({
      id: p._id,
      naam: p.naam || '',
      email: p.email || '',
      telefoon: p.telefoon,
      rollen: p.rollen ?? [],
      reservelijst: p.opReservelijst,
    });
  }

  const aanvraagIdNaarBoeking = new Map<string, string>();
  const boekingIdNaarAanvraag = new Map<string, string>();

  const aanvragen: DemoAanvraag[] = dump.aanvragen.map((a) => {
    const start = isoNaarYmd(a.datum);
    const eind = isoNaarYmd(a.datumTot) || start;
    const boekingId = refId(a.boeking);
    if (boekingId && a._id) {
      aanvraagIdNaarBoeking.set(a._id, boekingId);
      boekingIdNaarAanvraag.set(boekingId, a._id);
    }
    if (!a.email) {
      issues.push({
        ernst: 'fout',
        type: 'aanvraag',
        legacyId: a._id,
        titel: a.naam || a._id,
        detail: 'Aanvraag zonder e-mailadres.',
      });
    }
    if (!start) {
      issues.push({
        ernst: 'letop',
        type: 'aanvraag',
        legacyId: a._id,
        titel: a.naam || a._id,
        detail: 'Aanvraag zonder datum.',
      });
    }
    const email = a.email || '';
    if (email) {
      voegRelatieToe({
        id: `aanvraag-${a._id}`,
        naam: a.naam || email,
        email,
        telefoon: a.telefoon,
        rollen: ['aanvrager'],
      });
    }
    return {
      id: a._id,
      status: sanityAanvraagStatus(a.status ?? 'nieuw'),
      naam: a.naam || 'Naamloos',
      email,
      telefoon: a.telefoon || '',
      adres: a.adres || '',
      soort: a.soort || '',
      start,
      eind: eind || start,
      personen: a.personen || '',
      toelichting: a.toelichting || '',
      binnengekomen: a.binnengekomenOp || '',
      website: a.website,
      boekingId,
    };
  });

  const boekingen: DemoBoeking[] = [];
  const agenda: DemoActiviteit[] = [];
  const intern: DemoIntern[] = [];
  const huidigeVoorBezet: { startYmd: string; eindYmd?: string; zichtbaarheid: 'verborgen' | 'bezet' | 'publiek' }[] =
    [];
  const nieuweBezetItems: BezettingsItem[] = [];

  for (const a of dump.activiteiten) {
    const start = isoNaarYmd(a.start);
    const eind = isoNaarYmd(a.eind) || start;
    const zichtbaarheid =
      a.zichtbaarheid === 'publiek' || a.zichtbaarheid === 'bezet' || a.zichtbaarheid === 'verborgen'
        ? a.zichtbaarheid
        : 'bezet';

    if (!start) {
      issues.push({
        ernst: 'fout',
        type: 'activiteit',
        legacyId: a._id,
        titel: a.interneTitel || a._id,
        detail: 'Activiteit zonder startdatum — overgeslagen voor kalender.',
      });
    } else {
      huidigeVoorBezet.push({ startYmd: start, eindYmd: eind, zichtbaarheid });
    }

    if (a.soort === 'blokkade') {
      const blokkeert = zichtbaarheid !== 'verborgen';
      intern.push({
        id: a._id,
        titel: a.interneTitel || 'Blokkade',
        start,
        eind: eind || start,
        blokkeert,
      });
      if (start) {
        nieuweBezetItems.push({
          periode: { start, eind: eind || start },
          status: 'interne_blokkade',
          blokkeertPubliek: blokkeert,
          zichtbaarheid,
        });
      }
      continue;
    }

    const status = sanityBoekingStatus(a.boekingStatus);
    if (!a.boekingStatus || a.boekingStatus === 'vastgelegd') {
      issues.push({
        ernst: 'letop',
        type: 'activiteit',
        legacyId: a._id,
        titel: a.interneTitel || a._id,
        detail: 'Handmatig vastgelegd — wordt migratie_vastgelegd (oude weekendregels niet afdwingen).',
      });
    }

    const huurderId = a.huurderId || refId(a.huurder);
    const gastheerId = a.gastheerId || refId(a.gastheer);
    const aanvraagId = a.aanvraagId || refId(a.aanvraag) || boekingIdNaarAanvraag.get(a._id);
    const email = a.huurderEmail || '';
    let relatieId = huurderId;
    if (!relatieId && email) relatieId = emailNaarRelatie.get(emailSleutel(email));
    if (!relatieId) {
      relatieId = voegRelatieToe({
        id: `huurder-${a._id}`,
        naam: a.huurderNaam || email || a.interneTitel || 'Huurder',
        email,
        telefoon: a.huurderTelefoon,
        rollen: ['huurder'],
      });
    }

    if (zichtbaarheid === 'publiek' && !a.publiekeTitel) {
      issues.push({
        ernst: 'letop',
        type: 'activiteit',
        legacyId: a._id,
        titel: a.interneTitel || a._id,
        detail: 'Publiek zonder publieke titel.',
      });
    }

    boekingen.push({
      id: a._id,
      nummer: boekingNummer(a._id, start),
      status: status as DemoBoeking['status'],
      interneTitel: a.interneTitel || 'Boeking',
      soort: a.soort || '',
      start,
      eind: eind || start,
      huurder: a.huurderNaam || email || 'Onbekend',
      email,
      tarief: tariefTekst(a.tariefBedrag),
      aanbetaling: a.tariefBedrag != null ? tariefTekst(Math.min(100, a.tariefBedrag)) : '€ 100',
      aanbetalingBinnen: Boolean(a.aanbetalingBinnen),
      publiek: zichtbaarheid === 'publiek',
      notities: a.toelichtingAanvrager || '',
      aanvraagId,
      relatieId,
      gastheerId,
      zichtbaarheid,
    });

    if (start) {
      const internStatus =
        status === 'migratie_aanvraag'
          ? 'aanvraag'
          : status === 'migratie_vastgelegd'
            ? 'migratie_vastgelegd'
            : status;
      nieuweBezetItems.push({
        periode: { start, eind: eind || start },
        status: internStatus,
        blokkeertPubliek: status === 'definitief',
        zichtbaarheid,
      });
    }

    if (zichtbaarheid === 'publiek') {
      agenda.push({
        id: a._id,
        boekingId: a._id,
        titel: a.publiekeTitel || a.interneTitel || 'Activiteit',
        slug: a.slug || a._id,
        start,
        eind: eind || start,
        status: agendaStatus(a),
        omschrijving: a.omschrijving || '',
      });
      if (!a.slug) {
        issues.push({
          ernst: 'letop',
          type: 'activiteit',
          legacyId: a._id,
          titel: a.publiekeTitel || a.interneTitel || a._id,
          detail: 'Publieke activiteit zonder slug.',
        });
      }
    }
  }

  for (const a of aanvragen) {
    if (a.boekingId) continue;
    const viaMap = aanvraagIdNaarBoeking.get(a.id);
    if (viaMap) a.boekingId = viaMap;
  }

  const gastheren: DemoGastheer[] = [];
  const gastheerIds = new Set<string>();
  for (const r of relaties) {
    if (r.rollen.includes('gastheer') && !gastheerIds.has(r.id)) {
      gastheerIds.add(r.id);
      gastheren.push({
        id: r.id,
        naam: r.naam,
        email: r.email,
        telefoon: r.telefoon,
        actief: true,
      });
    }
  }
  for (const b of boekingen) {
    if (!b.gastheerId || gastheerIds.has(b.gastheerId)) continue;
    const relatie = relaties.find((r) => r.id === b.gastheerId);
    gastheerIds.add(b.gastheerId);
    gastheren.push({
      id: b.gastheerId,
      naam: relatie?.naam || 'Gastheer',
      email: relatie?.email || '',
      telefoon: relatie?.telefoon || '',
      actief: true,
    });
  }

  const vrienden: DemoVriend[] = dump.vrienden.map((v) => {
    if (!v.uitschrijfToken) {
      issues.push({
        ernst: 'letop',
        type: 'vriend',
        legacyId: v._id,
        titel: v.email || v._id,
        detail: 'Vriend zonder uitschrijftoken — bij import opnieuw genereren.',
      });
    }
    const frequentie =
      v.frequentie === 'tweewekelijks' || v.frequentie === 'maandelijks' ? v.frequentie : 'wekelijks';
    return {
      id: v._id,
      naam: v.naam || v.email || 'Vriend',
      email: v.email || '',
      actief: v.actief !== false,
      frequentie,
    };
  });

  const nieuwsbrieven: DemoNieuwsbrief[] = dump.nieuwsbrieven.map((n) => ({
    id: n._id,
    week: n.week || '',
    kortNieuws: n.kortNieuws || '',
    donatieUpdate: n.donatieUpdate || '',
    overgeslagen: Boolean(n.geannuleerd),
    verstuurd: Boolean(n.verstuurd),
  }));

  const instellingen: DemoInstellingen = {
    ...DEMO_INSTELLINGEN,
    ontvangstAdres: dump.instellingen?.ontvangstAdres || '',
    extraOntvangstAdres: dump.instellingen?.extraOntvangstAdres || '',
    penningmeesterAdres: dump.instellingen?.penningmeesterAdres || '',
    aanbetaling: dump.instellingen?.aanbetalingTermijnDagen ?? DEMO_INSTELLINGEN.aanbetaling,
  };

  const templates: DemoTemplate[] = MAIL_TEMPLATES.map((t) => {
    const inhoud = dump.instellingen ? String(dump.instellingen[t.veld] ?? '') : '';
    return {
      id: t.veld,
      naam: t.naam,
      verhuurtype: t.verhuurtype,
      trigger: t.trigger,
      termijn: t.trigger,
      verzendwijze: 'concept' as const,
      ontvanger: t.verhuurtype === 'intern' ? 'bestuur' : 'huurder',
      onderwerp: t.naam,
      inhoud,
    };
  }).filter((t) => t.inhoud);

  const huidigeDagen = huidigeBezetteDagen(huidigeVoorBezet);
  const nieuweDagen = publiekeBezetteDagen(nieuweBezetItems);

  const toekomstigSanity = dump.activiteiten.filter((a) => isoNaarYmd(a.start) >= vandaag).length;
  const toekomstigNieuw =
    boekingen.filter((b) => b.start >= vandaag).length + intern.filter((i) => i.start >= vandaag).length;

  const controles: MigratieControle[] = [
    {
      label: 'Activiteiten',
      sanity: dump.activiteiten.length,
      nieuw: boekingen.length + intern.length,
      toelichting: 'Blokkades gaan naar interne activiteiten, de rest naar boekingen.',
    },
    {
      label: 'Toekomstige activiteiten',
      sanity: toekomstigSanity,
      nieuw: toekomstigNieuw,
    },
    {
      label: 'Bezette dagen (huidige Sanity-regel)',
      sanity: huidigeDagen.size,
      nieuw: huidigeDagen.size,
      toelichting: 'zichtbaarheid ≠ verborgen, inclusief opties die op bezet/publiek staan.',
    },
    {
      label: 'Bezette dagen (nieuwe regel)',
      sanity: huidigeDagen.size,
      nieuw: nieuweDagen.size,
      toelichting: 'Alleen definitief + interne blokkade. Verschil is verwacht tot cutover.',
    },
    {
      label: 'Aanvragen',
      sanity: dump.aanvragen.length,
      nieuw: aanvragen.length,
    },
    {
      label: 'Actieve vrienden',
      sanity: dump.vrienden.filter((v) => v.actief !== false).length,
      nieuw: vrienden.filter((v) => v.actief).length,
    },
    {
      label: 'Inactieve vrienden',
      sanity: dump.vrienden.filter((v) => v.actief === false).length,
      nieuw: vrienden.filter((v) => !v.actief).length,
    },
    {
      label: 'Nieuwsbrieven',
      sanity: dump.nieuwsbrieven.length,
      nieuw: nieuwsbrieven.length,
    },
    {
      label: 'Relaties (personen + afgeleid)',
      sanity: dump.personen.length,
      nieuw: relaties.length,
      toelichting: 'Huurders zonder adresboek-record worden bij import als relatie aangemaakt.',
    },
  ];

  return {
    aanvragen,
    boekingen,
    agenda,
    intern,
    relaties,
    gastheren,
    vrienden,
    nieuwsbrieven,
    instellingen,
    templates,
    controles,
    issues,
    bezetteDagenHuidig: huidigeDagen.size,
    bezetteDagenNieuw: nieuweDagen.size,
  };
}
