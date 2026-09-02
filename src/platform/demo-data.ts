/**
 * Voorbeelddata voor de klikbare /beheer-bouwplaats.
 * Staat los van Sanity en van de publieke website. Niets hiervan is écht.
 */

export const DEMO_BANNER =
  'Voorbeelddata — niet gekoppeld aan de website, agenda of Sanity. Nelleke en het bestuur merken hier niets van.';

export interface DemoAanvraag {
  id: string;
  status: 'nieuw' | 'in_behandeling' | 'goedgekeurd' | 'afgewezen' | 'gesloten';
  naam: string;
  email: string;
  telefoon: string;
  adres: string;
  soort: string;
  start: string;
  eind: string;
  personen: string;
  toelichting: string;
  binnengekomen: string;
  website?: string;
  boekingId?: string;
}

export interface DemoBoeking {
  id: string;
  nummer: string;
  status: 'optie' | 'optie_verlopen' | 'definitief' | 'afgewezen' | 'geannuleerd';
  interneTitel: string;
  soort: string;
  start: string;
  eind: string;
  huurder: string;
  email: string;
  tarief: string;
  aanbetaling: string;
  aanbetalingBinnen: boolean;
  optieEind?: string;
  publiek: boolean;
  notities: string;
  aanvraagId?: string;
  relatieId: string;
}

export interface DemoActiviteit {
  id: string;
  boekingId?: string;
  titel: string;
  slug: string;
  start: string;
  eind: string;
  status: 'concept' | 'online' | 'wacht_op_definitief' | 'mist_content';
  omschrijving: string;
}

export interface DemoIntern {
  id: string;
  titel: string;
  start: string;
  eind: string;
  blokkeert: boolean;
}

export interface DemoRelatie {
  id: string;
  naam: string;
  email: string;
  telefoon: string;
  rollen: string[];
  reservelijst: boolean;
}

export interface DemoVriend {
  id: string;
  naam: string;
  email: string;
  actief: boolean;
  frequentie: 'wekelijks' | 'tweewekelijks' | 'maandelijks';
}

export interface DemoNieuwsbrief {
  id: string;
  week: string;
  kortNieuws: string;
  donatieUpdate: string;
  overgeslagen: boolean;
  verstuurd: boolean;
}

export interface DemoTemplate {
  id: string;
  naam: string;
  verhuurtype: string;
  trigger: string;
  termijn: string;
  verzendwijze: 'automatisch' | 'concept' | 'handmatig';
  ontvanger: string;
  onderwerp: string;
  inhoud: string;
}

export interface DemoGebruiker {
  id: string;
  naam: string;
  email: string;
  superAdmin: boolean;
  rechten: Record<string, 'verborgen' | 'lezen' | 'schrijven'>;
}

export const DEMO_GEBRUIKERS: DemoGebruiker[] = [
  {
    id: 'nick',
    naam: 'Nick',
    email: 'nick@voorbeeld.nl',
    superAdmin: true,
    rechten: {},
  },
  {
    id: 'nelleke',
    naam: 'Nelleke',
    email: 'nelleke@voorbeeld.nl',
    superAdmin: false,
    rechten: {
      dashboard: 'lezen',
      aanvragen: 'schrijven',
      boekingen: 'schrijven',
      kalender: 'schrijven',
      agenda: 'schrijven',
      finance: 'lezen',
      nieuwsbrief: 'schrijven',
      vrienden: 'schrijven',
      relaties: 'schrijven',
      templates: 'schrijven',
      gebruikers: 'verborgen',
      instellingen: 'lezen',
    },
  },
  {
    id: 'paul',
    naam: 'Paul',
    email: 'paul@voorbeeld.nl',
    superAdmin: false,
    rechten: {
      dashboard: 'lezen',
      aanvragen: 'verborgen',
      boekingen: 'lezen',
      kalender: 'lezen',
      agenda: 'verborgen',
      finance: 'schrijven',
      nieuwsbrief: 'verborgen',
      vrienden: 'verborgen',
      relaties: 'verborgen',
      templates: 'verborgen',
      gebruikers: 'verborgen',
      instellingen: 'lezen',
    },
  },
];

export const DEMO_RELATIES: DemoRelatie[] = [
  {
    id: 'r-817',
    naam: 'Marieke Jansen',
    email: 'marieke@voorbeeld.nl',
    telefoon: '06 12 34 56 78',
    rollen: ['Exposant'],
    reservelijst: true,
  },
  {
    id: 'r-818',
    naam: 'Kim de Vries',
    email: 'kim@voorbeeld.nl',
    telefoon: '06 22 33 44 55',
    rollen: ['Huurder'],
    reservelijst: false,
  },
  {
    id: 'r-819',
    naam: 'Henk Vos',
    email: 'henk@voorbeeld.nl',
    telefoon: '06 98 76 54 32',
    rollen: ['Gastheer'],
    reservelijst: false,
  },
  {
    id: 'r-820',
    naam: 'Sanne Bakker',
    email: 'sanne@voorbeeld.nl',
    telefoon: '06 11 22 33 44',
    rollen: ['Exposant'],
    reservelijst: true,
  },
];

export const DEMO_AANVRAGEN: DemoAanvraag[] = [
  {
    id: 'a-101',
    status: 'nieuw',
    naam: 'Marieke Jansen',
    email: 'marieke@voorbeeld.nl',
    telefoon: '06 12 34 56 78',
    adres: 'Kerkstraat 12, 6511 AA Nijmegen',
    soort: 'expositie',
    start: '2026-10-10',
    eind: '2026-10-11',
    personen: '',
    toelichting: 'Schilderijen over de Ooijpolder. Weekend 10 en 11 oktober.',
    binnengekomen: '2026-09-01T09:12:00+02:00',
    website: 'https://voorbeeld.nl/marieke',
  },
  {
    id: 'a-102',
    status: 'in_behandeling',
    naam: 'Familie Hendriks',
    email: 'hendriks@voorbeeld.nl',
    telefoon: '024 123 4567',
    adres: 'Waalkade 8, 6511 XR Nijmegen',
    soort: 'bruiloft',
    start: '2026-11-04',
    eind: '2026-11-04',
    personen: '45',
    toelichting: 'Kleine ceremonie op woensdagmiddag.',
    binnengekomen: '2026-08-28T14:40:00+02:00',
  },
  {
    id: 'a-103',
    status: 'goedgekeurd',
    naam: 'Kim de Vries',
    email: 'kim@voorbeeld.nl',
    telefoon: '06 22 33 44 55',
    adres: 'Lange Hezelstraat 4, 6511 VD Nijmegen',
    soort: 'bruiloft',
    start: '2026-09-09',
    eind: '2026-09-09',
    personen: '80',
    toelichting: 'Ceremonie 14–16 uur.',
    binnengekomen: '2026-08-12T11:00:00+02:00',
    boekingId: 'b-043',
  },
];

export const DEMO_BOEKINGEN: DemoBoeking[] = [
  {
    id: 'b-042',
    nummer: '2026-042',
    status: 'optie',
    interneTitel: 'Expositie: Marieke Jansen (optie)',
    soort: 'expositie',
    start: '2026-09-12',
    eind: '2026-09-13',
    huurder: 'Marieke Jansen',
    email: 'marieke@voorbeeld.nl',
    tarief: '€ 490',
    aanbetaling: '€ 100',
    aanbetalingBinnen: false,
    optieEind: '2026-09-08',
    publiek: true,
    notities: 'Optie bijna verlopen. Contractbeheerder belt als het verstrijkt.',
    relatieId: 'r-817',
  },
  {
    id: 'b-041',
    nummer: '2026-041',
    status: 'optie_verlopen',
    interneTitel: 'Concert: kwartet in overleg',
    soort: 'concert',
    start: '2026-09-18',
    eind: '2026-09-18',
    huurder: 'Kwartet Aa',
    email: 'kwartet@voorbeeld.nl',
    tarief: 'Op aanvraag',
    aanbetaling: '€ 100',
    aanbetalingBinnen: false,
    optieEind: '2026-08-30',
    publiek: true,
    notities: 'Optie verlopen — actie vereist.',
    relatieId: 'r-820',
  },
  {
    id: 'b-043',
    nummer: '2026-043',
    status: 'definitief',
    interneTitel: 'Bruiloft Kim en Jeroen',
    soort: 'bruiloft',
    start: '2026-09-09',
    eind: '2026-09-09',
    huurder: 'Kim de Vries',
    email: 'kim@voorbeeld.nl',
    tarief: '€ 550',
    aanbetaling: '€ 100',
    aanbetalingBinnen: true,
    publiek: false,
    notities: 'Privé. Niet in de publieke agenda.',
    aanvraagId: 'a-103',
    relatieId: 'r-818',
  },
  {
    id: 'b-040',
    nummer: '2026-040',
    status: 'definitief',
    interneTitel: 'Expositie: Sanne Bakker',
    soort: 'expositie',
    start: '2026-09-19',
    eind: '2026-09-20',
    huurder: 'Sanne Bakker',
    email: 'sanne@voorbeeld.nl',
    tarief: '€ 490',
    aanbetaling: '€ 100',
    aanbetalingBinnen: true,
    publiek: true,
    notities: 'Foto ontbreekt nog. Titel en datum zijn wel klaar.',
    relatieId: 'r-820',
  },
];

export const DEMO_AGENDA: DemoActiviteit[] = [
  {
    id: 'p-040',
    boekingId: 'b-040',
    titel: 'Expositie Sanne Bakker',
    slug: 'expositie-sanne-bakker',
    start: '2026-09-19',
    eind: '2026-09-20',
    status: 'mist_content',
    omschrijving: '',
  },
  {
    id: 'p-042',
    boekingId: 'b-042',
    titel: 'Expositie Marieke Jansen',
    slug: 'expositie-marieke-jansen',
    start: '2026-09-12',
    eind: '2026-09-13',
    status: 'wacht_op_definitief',
    omschrijving: 'Schilderijen over de Ooijpolder.',
  },
];

export const DEMO_INTERN: DemoIntern[] = [
  {
    id: 'i-1',
    titel: 'Bestuursbijeenkomst',
    start: '2026-09-15',
    eind: '2026-09-15',
    blokkeert: false,
  },
  {
    id: 'i-2',
    titel: 'Kerstsluiting',
    start: '2026-12-25',
    eind: '2026-12-26',
    blokkeert: true,
  },
];

export const DEMO_VRIENDEN: DemoVriend[] = [
  { id: 'v-1', naam: 'Anna Peters', email: 'anna@voorbeeld.nl', actief: true, frequentie: 'wekelijks' },
  { id: 'v-2', naam: 'Bert Mol', email: 'bert@voorbeeld.nl', actief: true, frequentie: 'tweewekelijks' },
  { id: 'v-3', naam: 'Carla Smit', email: 'carla@voorbeeld.nl', actief: false, frequentie: 'maandelijks' },
];

export const DEMO_NIEUWSBRIEVEN: DemoNieuwsbrief[] = [
  {
    id: 'nb-2026-08-31',
    week: '2026-08-31',
    kortNieuws: 'Het nieuwe infobord bij de parkeerplaats is geplaatst.',
    donatieUpdate: 'Met de donaties van deze zomer is de gevel opnieuw gevoegd.',
    overgeslagen: false,
    verstuurd: false,
  },
  {
    id: 'nb-2026-08-24',
    week: '2026-08-24',
    kortNieuws: '',
    donatieUpdate: '',
    overgeslagen: false,
    verstuurd: true,
  },
];

export const DEMO_TEMPLATES: DemoTemplate[] = [
  {
    id: 'praktisch_4w',
    naam: 'Praktische informatie',
    verhuurtype: 'Expositie',
    trigger: 'Voor activiteit',
    termijn: '4 weken',
    verzendwijze: 'concept',
    ontvanger: 'Huurder/exposant',
    onderwerp: 'Praktische informatie — Kerkje van Persingen',
    inhoud:
      'Beste {naam},\n\nOver vier weken is het zover: {soort} op {datum} in het kerkje van Persingen.\n\nAdres: Persingensestraat 7, 6575 JA Persingen.\nParkeren: alleen op het terrein aan de overkant.',
  },
  {
    id: 'content_verzoek',
    naam: 'Tekst/foto aanleveren',
    verhuurtype: 'Expositie',
    trigger: 'Voor activiteit',
    termijn: '4 maanden',
    verzendwijze: 'concept',
    ontvanger: 'Huurder/exposant',
    onderwerp: 'Tekst en foto voor de website',
    inhoud: 'Beste {naam},\n\nWilt u ons vóór {uitersteDatum} een korte tekst en één foto sturen?',
  },
  {
    id: 'aanbetaling_check_paul',
    naam: 'Aanbetaling-check',
    verhuurtype: 'Alle',
    trigger: 'Na optie',
    termijn: '14 dagen',
    verzendwijze: 'concept',
    ontvanger: 'Finance (Paul)',
    onderwerp: 'Aanbetaling binnen?',
    inhoud: 'Paul, korte check.\n\nBoeking: {soort} op {datum}, {naam}.\nIs de aanbetaling binnen?',
  },
  {
    id: 'optie_verlopen_contractbeheerder',
    naam: 'Optie verlopen',
    verhuurtype: 'Alle',
    trigger: 'Optie verlopen',
    termijn: 'Direct',
    verzendwijze: 'automatisch',
    ontvanger: 'Contractbeheerder',
    onderwerp: 'Optie verlopen — actie vereist',
    inhoud: 'De optie voor {soort} op {datum} is verlopen. Neem contact op met de klant.',
  },
  {
    id: 'reservelijst',
    naam: 'Vrijgekomen weekend',
    verhuurtype: 'Expositie',
    trigger: 'Handmatig bij annulering',
    termijn: '—',
    verzendwijze: 'handmatig',
    ontvanger: 'Reservelijst',
    onderwerp: 'Er is een expositie-weekend vrijgekomen',
    inhoud: 'Beste {naam},\n\nEr is een expositie-weekend vrijgekomen: {datum}.',
  },
  {
    id: 'contract_begeleiding',
    naam: 'Contract meesturen',
    verhuurtype: 'Alle',
    trigger: 'Handmatig',
    termijn: '—',
    verzendwijze: 'handmatig',
    ontvanger: 'Huurder',
    onderwerp: 'Contract voor uw boeking',
    inhoud: 'Beste {naam},\n\nBij deze het contract voor uw {soort} op {datum}. Het tarief is {tarief}.',
  },
];

export const DEMO_INSTELLINGEN = {
  optietermijn: 14,
  betaaltermijn: 14,
  aanbetaling: 100,
  contractbeheerder: 'Nelleke',
  openingVan: '11:00',
  openingTot: '17:00',
};

export const DEMO_COMMUNICATIE = [
  {
    id: 'c-1',
    boekingId: 'b-042',
    template: 'Optie verlopen',
    status: 'gepland',
    wanneer: '2026-09-08',
    ontvanger: 'Nelleke (contractbeheerder)',
  },
  {
    id: 'c-2',
    boekingId: 'b-042',
    template: 'Aanbetaling-check',
    status: 'concept',
    wanneer: '2026-09-02',
    ontvanger: 'Paul',
  },
  {
    id: 'c-3',
    boekingId: 'b-043',
    template: 'Praktische informatie',
    status: 'verzonden',
    wanneer: '2026-08-12',
    ontvanger: 'Kim de Vries',
  },
  {
    id: 'c-4',
    boekingId: 'b-040',
    template: 'Tekst/foto aanleveren',
    status: 'concept',
    wanneer: '2026-09-01',
    ontvanger: 'Sanne Bakker',
  },
] as const;

export const DEMO_DOCUMENTEN = [
  {
    id: 'd-1',
    boekingId: 'b-043',
    naam: 'contract-kim-jeroen.pdf',
    soort: 'Contract',
    datum: '2026-08-13',
  },
  {
    id: 'd-2',
    boekingId: 'b-040',
    naam: 'verzekering-sanne.pdf',
    soort: 'Verzekering',
    datum: '2026-08-20',
  },
] as const;

const MAANDEN_NL = [
  'januari',
  'februari',
  'maart',
  'april',
  'mei',
  'juni',
  'juli',
  'augustus',
  'september',
  'oktober',
  'november',
  'december',
];

export function formatNl(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return `${Number(m[3])} ${MAANDEN_NL[Number(m[2]) - 1]} ${m[1]}`;
}

export function formatMaandNl(jaarMaand: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(jaarMaand);
  if (!m) return jaarMaand;
  return `${MAANDEN_NL[Number(m[2]) - 1]} ${m[1]}`;
}

export function verschuifMaand(jaarMaand: string, delta: number): string {
  const [jaar, maand] = jaarMaand.split('-').map(Number);
  const d = new Date(Date.UTC(jaar, maand - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function maandRaster(jaarMaand: string): { ymd: string | null; dag: number | null }[] {
  const [jaar, maand] = jaarMaand.split('-').map(Number);
  const yyyy = String(jaar);
  const mm = String(maand).padStart(2, '0');
  const eerste = new Date(Date.UTC(jaar, maand - 1, 1));
  const startWeekdag = eerste.getUTCDay();
  const maandagIndex = startWeekdag === 0 ? 6 : startWeekdag - 1;
  const dagenInMaand = new Date(Date.UTC(jaar, maand, 0)).getUTCDate();
  const cellen: { ymd: string | null; dag: number | null }[] = [];
  for (let i = 0; i < maandagIndex; i++) cellen.push({ ymd: null, dag: null });
  for (let dag = 1; dag <= dagenInMaand; dag++) {
    cellen.push({
      ymd: `${yyyy}-${mm}-${String(dag).padStart(2, '0')}`,
      dag,
    });
  }
  while (cellen.length % 7 !== 0) cellen.push({ ymd: null, dag: null });
  return cellen;
}

export function demoDashboardBron() {
  return {
    nieuweAanvragen: DEMO_AANVRAGEN.filter((a) => a.status === 'nieuw').length,
    optiesBijnaVerlopen: DEMO_BOEKINGEN.filter((b) => b.status === 'optie').length,
    optiesVerlopen: DEMO_BOEKINGEN.filter((b) => b.status === 'optie_verlopen').length,
    aanbetalingenControleren: DEMO_BOEKINGEN.filter(
      (b) => !b.aanbetalingBinnen && (b.status === 'optie' || b.status === 'definitief'),
    ).length,
    activiteitMistContent: DEMO_AGENDA.filter((a) => a.status === 'mist_content').length,
    communicatieKlaar: DEMO_COMMUNICATIE.filter((c) => c.status === 'concept').length,
    nieuwsbriefVoorbereiden: DEMO_NIEUWSBRIEVEN.filter((n) => !n.verstuurd && !n.overgeslagen).length,
    activiteiten7Dagen: DEMO_BOEKINGEN.filter((b) => b.start >= '2026-09-02' && b.start <= '2026-09-09').length,
    mailFout: 0,
  };
}

export const DASHBOARD_HREF: Record<string, string> = {
  nieuwe_aanvragen: '/beheer/aanvragen/?status=nieuw',
  opties_bijna_verlopen: '/beheer/boekingen/?status=optie',
  opties_verlopen: '/beheer/boekingen/?status=optie_verlopen',
  aanbetalingen_controleren: '/beheer/finance/',
  activiteit_mist_content: '/beheer/agenda/',
  communicatie_klaar: '/beheer/boekingen/',
  nieuwsbrief_voorbereiden: '/beheer/nieuwsbrief/',
  activiteiten_7_dagen: '/beheer/kalender/?maand=2026-09',
  mail_fout: '/beheer/instellingen/templates/',
};

export function zoekDemo(q: string): { soort: string; titel: string; href: string; extra: string }[] {
  const naald = q.trim().toLowerCase();
  if (!naald) return [];
  const treffers: { soort: string; titel: string; href: string; extra: string }[] = [];

  for (const r of DEMO_RELATIES) {
    if (`${r.naam} ${r.email}`.toLowerCase().includes(naald)) {
      treffers.push({ soort: 'Relatie', titel: r.naam, href: `/beheer/relaties/${r.id}/`, extra: r.email });
    }
  }
  for (const a of DEMO_AANVRAGEN) {
    const tekst = `${a.naam} ${a.email} ${a.start} ${formatNl(a.start)} ${a.soort}`.toLowerCase();
    if (tekst.includes(naald)) {
      treffers.push({
        soort: 'Aanvraag',
        titel: a.naam,
        href: `/beheer/aanvragen/${a.id}/`,
        extra: `${a.soort} · ${formatNl(a.start)}`,
      });
    }
  }
  for (const b of DEMO_BOEKINGEN) {
    const tekst = `${b.nummer} ${b.huurder} ${b.interneTitel} ${b.start} ${formatNl(b.start)}`.toLowerCase();
    if (tekst.includes(naald)) {
      treffers.push({
        soort: 'Boeking',
        titel: `${b.nummer} ${b.interneTitel}`,
        href: `/beheer/boekingen/${b.id}/`,
        extra: `${b.status} · ${formatNl(b.start)}`,
      });
    }
  }
  for (const p of DEMO_AGENDA) {
    if (`${p.titel} ${p.start} ${formatNl(p.start)}`.toLowerCase().includes(naald)) {
      treffers.push({
        soort: 'Agenda',
        titel: p.titel,
        href: `/beheer/agenda/${p.id}/`,
        extra: formatNl(p.start),
      });
    }
  }
  return treffers;
}

export const AANVRAAG_LABEL: Record<DemoAanvraag['status'], string> = {
  nieuw: 'Nieuw',
  in_behandeling: 'In behandeling',
  goedgekeurd: 'Goedgekeurd',
  afgewezen: 'Afgewezen',
  gesloten: 'Gesloten',
};

export const BOEKING_LABEL: Record<DemoBoeking['status'], string> = {
  optie: 'Optie',
  optie_verlopen: 'Optie verlopen',
  definitief: 'Definitief',
  afgewezen: 'Afgewezen',
  geannuleerd: 'Geannuleerd',
};

export const SOORT_LABEL: Record<string, string> = {
  expositie: 'Expositie',
  bruiloft: 'Bruiloft',
  concert: 'Concert',
  diverse: 'Diverse bijeenkomst',
};

export const AGENDA_LABEL: Record<DemoActiviteit['status'], string> = {
  concept: 'Concept',
  online: 'Online',
  wacht_op_definitief: 'Wacht op definitief',
  mist_content: 'Mist content',
};

export const COMMUNICATIE_LABEL: Record<string, string> = {
  gepland: 'Gepland',
  concept: 'Concept',
  wachtrij: 'Wachtrij',
  verzonden: 'Verzonden',
  fout: 'Fout',
  geannuleerd: 'Geannuleerd',
};

export const DEMO_FLASH =
  'Voorbeeldactie uitgevoerd — niets is opgeslagen, gemaild of naar de website/agenda gestuurd.';

export function demoNaActie(url: URL, extra: Record<string, string> = {}): string {
  const next = new URL(url);
  next.searchParams.set('demo', '1');
  for (const [k, v] of Object.entries(extra)) next.searchParams.set(k, v);
  return next.pathname + next.search;
}
