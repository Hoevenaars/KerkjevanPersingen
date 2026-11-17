import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { STANDAARD_AUTOMATISERINGEN } from '../src/platform/automatisering.ts';
import { functioneleStatus, technischeGereedheid } from '../src/platform/automatisering.ts';
import {
  beoordeelVerzending,
  compacteDatum,
  kiesVoorbeeld,
  renderPlanningMail,
  stelPlanningMailSamen,
  tijdWeergave,
  voornaamVan,
  type PlanningMailBundel,
  type PlanningMailClaim,
  type PlanningMailHistorie,
  type PlanningMailOpslag,
  type PlanningOntvanger,
} from '../src/platform/planning-mail.ts';
import { verstuurPlanningMail } from '../src/lib/planning-mail-verzend.ts';
import type { MailTransport } from '../src/lib/mail-transport.ts';

const bron = {
  van: '2026-04-01',
  tot: '2026-04-30',
  tijd: '11:00–17:00',
  boekingen: [
    {
      id: 'weekend',
      status: 'definitief',
      interneTitel: 'Voorjaarsexpositie',
      huurder: 'Ada Vos',
      start: '2026-04-04',
      eind: '2026-04-05',
      gastheerId: 'marieke',
    },
    {
      id: 'leeg',
      status: 'definitief',
      interneTitel: 'Zomerexpositie',
      huurder: 'Boer',
      start: '2026-04-18',
      eind: '2026-04-19',
    },
    {
      id: 'dag',
      status: 'definitief',
      interneTitel: 'Concert',
      huurder: 'Koor',
      start: '2026-04-12',
      eind: '2026-04-12',
      gastheerId: 'hans',
    },
    {
      id: 'buiten',
      status: 'definitief',
      interneTitel: 'Mei',
      huurder: 'Piet',
      start: '2026-05-02',
      eind: '2026-05-03',
      gastheerId: 'marieke',
    },
    {
      id: 'weg',
      status: 'geannuleerd',
      interneTitel: 'Vervallen',
      huurder: 'Niemand',
      start: '2026-04-25',
      eind: '2026-04-26',
    },
  ],
  toewijzingen: [
    { boekingId: 'weekend', relatieId: 'marieke', relatieNaam: 'Marieke Jansen' },
  ],
  gastheren: [
    { id: 'marieke', naam: 'Marieke Jansen', email: 'Marieke@Example.nl', actief: true },
    { id: 'hans', naam: 'Hans Maas', email: 'hans@example.nl', actief: true },
    { id: 'els', naam: 'Els', email: '', actief: true },
    { id: 'oud', naam: 'Oud', email: 'oud@example.nl', actief: false },
  ],
};

function bundel(): PlanningMailBundel {
  return stelPlanningMailSamen(bron);
}

test('de mail toont alleen de gekozen periode, met open en ingevulde diensten', () => {
  const mail = bundel();
  assert.deepEqual(mail.diensten.map((dienst) => dienst.id), ['weekend', 'dag', 'leeg']);
  assert.equal(mail.gepland, 3);
  assert.equal(mail.openstaand, 1);
  const weekend = mail.diensten[0];
  assert.equal(weekend.activiteit, 'Voorjaarsexpositie');
  assert.equal(weekend.tijd, '11:00–17:00');
  assert.deepEqual(weekend.namen, ['Marieke Jansen']);
  assert.equal(weekend.openTekst, null);
  assert.equal(mail.diensten[1].openTekst, null);
  assert.equal(mail.diensten[2].openTekst, 'Nog niet ingevuld');
  assert.deepEqual(mail.ontvangers.map((ontvanger) => ontvanger.email), ['hans@example.nl', 'marieke@example.nl']);
  assert.deepEqual(mail.zonderEmail.map((persoon) => persoon.naam), ['Els']);
});

test('de persoonlijke planning staat bovenaan en een lege indeling zegt dat', () => {
  const mail = bundel();
  const marieke = mail.ontvangers.find((ontvanger) => ontvanger.naam === 'Marieke Jansen');
  assert.ok(marieke);
  const brief = renderPlanningMail(mail, marieke);
  const eigen = brief.tekst.indexOf('Uw diensten (1)');
  const open = brief.tekst.indexOf('Openstaande diensten (1)');
  assert.equal(brief.tekst.includes('De volledige planning'), false);
  assert.equal(brief.html.includes('De volledige planning'), false);
  assert.equal(brief.tekst.includes('Datum:'), false);
  assert.equal(brief.html.includes('Datum:'), false);
  assert.ok(eigen >= 0 && eigen < open);
  assert.match(brief.tekst.slice(eigen, open), /Voorjaarsexpositie/);
  assert.match(brief.tekst.slice(eigen, open), /Za 4 en zo 5 april 2026/);
  assert.match(brief.tekst.slice(eigen, open), /11\.00 – 17\.00 uur/);
  assert.equal(brief.tekst.slice(eigen, open).includes('Marieke Jansen'), false);
  assert.equal(brief.tekst.includes('Concert'), false);
  assert.match(brief.tekst.slice(open), /Zomerexpositie/);
  assert.match(brief.tekst, /Beste Marieke,/);
  assert.match(brief.html, /U bent in deze periode niet ingedeeld|Voorjaarsexpositie/);
  const els = renderPlanningMail(mail, { relatieIds: ['onbekend'], naam: 'Els', email: 'els@example.nl' });
  assert.match(els.tekst, /Uw diensten \(0\)/);
  assert.match(els.tekst, /U bent in deze periode niet ingedeeld/);
  assert.match(els.tekst, /Nog niet ingevuld/);
  assert.equal(els.tekst.includes('Nog 1 gastbegeleider nodig'), false);
  assert.equal(els.tekst.includes('Concert'), false);
  assert.equal(brief.html.includes('<th'), false);
  assert.equal(brief.html.includes('display:flex'), false);
  assert.equal(brief.html.includes('font-size:12px'), false);
  assert.equal(brief.html.includes('font-size:13px'), false);
  assert.match(brief.html, /lang="nl"/);
  assert.match(brief.html, /dir="ltr"/);
  assert.match(brief.html, /<h1/);
  assert.match(brief.html, /max-width:600px/);
  assert.match(brief.html, /font-size:16px/);
  assert.match(brief.html, /role="presentation"/);
});

test('de compacte brief toont alleen eigen en open diensten, ook bij gedeeltelijke bezetting', () => {
  assert.equal(compacteDatum('2026-10-24', '2026-10-25'), 'Za 24 en zo 25 oktober 2026');
  assert.equal(compacteDatum('2026-10-27', '2026-10-27'), 'Di 27 oktober 2026');
  assert.equal(compacteDatum('2026-10-31', '2026-11-01'), 'Za 31 oktober en zo 1 november 2026');
  assert.equal(compacteDatum('2026-12-31', '2027-01-01'), 'Do 31 december 2026 en vr 1 januari 2027');
  assert.equal(tijdWeergave('11:00–17:00'), '11.00 – 17.00 uur');
  assert.equal(voornaamVan('Betty van de Veerdonk'), 'Betty');

  const mail = stelPlanningMailSamen({
    van: '2026-10-01',
    tot: '2026-11-30',
    tijd: '11:00–17:00',
    boekingen: [
      { id: 'een', status: 'definitief', interneTitel: 'Oktober 3/4', huurder: 'Eerste expositie', start: '2026-10-03', eind: '2026-10-04', gastheerId: 'marieke' },
      { id: 'twee', status: 'definitief', interneTitel: 'Oktober 10/11', huurder: 'Tweede expositie', start: '2026-10-10', eind: '2026-10-11', gastheerId: 'marieke' },
      { id: 'vol', status: 'definitief', interneTitel: 'November 14/15', huurder: 'Volle dienst', start: '2026-11-14', eind: '2026-11-15', gastheerId: 'hans' },
      {
        id: 'lang',
        status: 'definitief',
        interneTitel: 'Een bijzonder lange activiteitsnaam die over de regel moet lopen zonder de mail breder te maken',
        huurder: 'Lang',
        start: '2026-10-27',
        eind: '2026-10-27',
      },
    ],
    toewijzingen: [],
    gastheren: [
      { id: 'marieke', naam: 'Marieke Jansen', email: 'marieke@example.nl', actief: true },
      { id: 'hans', naam: 'Hans Maas', email: 'hans@example.nl', actief: true },
      { id: 'els', naam: 'Els Pieters', email: 'els@example.nl', actief: true },
    ],
  });
  const marieke = mail.ontvangers.find((ontvanger) => ontvanger.naam === 'Marieke Jansen');
  assert.ok(marieke);
  const brief = renderPlanningMail(mail, marieke);
  assert.match(brief.tekst, /Uw diensten \(2\)/);
  assert.match(brief.tekst, /Eerste expositie/);
  assert.match(brief.tekst, /Tweede expositie/);
  assert.equal(brief.tekst.includes('Volle dienst'), false);
  assert.match(brief.tekst, /Openstaande diensten \(1\)/);
  assert.match(brief.tekst, /Een bijzonder lange activiteitsnaam/);
  assert.match(brief.html, /overflow-wrap:break-word/);
  assert.match(brief.tekst, /Er zijn geen openstaande diensten|Nog niet ingevuld/);

  const allesDicht = renderPlanningMail({
    onderwerp: mail.onderwerp,
    periodeTekst: mail.periodeTekst,
    tijd: mail.tijd,
    diensten: mail.diensten.filter((dienst) => dienst.id !== 'lang'),
  }, marieke);
  assert.match(allesDicht.tekst, /Er zijn geen openstaande diensten in deze periode/);
  assert.equal(allesDicht.tekst.includes('De volledige planning'), false);

  const gedeeltelijk = renderPlanningMail({
    onderwerp: 'Planning gastbegeleiders, test',
    periodeTekst: '1 november 2026 t/m 8 november 2026',
    tijd: '11:00–17:00',
    diensten: [
      {
        id: 'deel',
        start: '2026-11-07',
        eind: '2026-11-07',
        datumTekst: 'oud',
        tijd: '11:00–17:00',
        activiteit: 'Expositie',
        namen: ['Hans Peters'],
        relatieIds: ['hans'],
        openTekst: 'Nog 1 gastbegeleider nodig',
        ingevuld: 1,
        verwacht: 2,
      },
      {
        id: 'leeg',
        start: '2026-11-08',
        eind: '2026-11-08',
        datumTekst: 'oud',
        tijd: '11:00–17:00',
        activiteit: 'Lege dienst',
        namen: [],
        relatieIds: [],
        openTekst: 'Nog niet ingevuld',
        ingevuld: 0,
        verwacht: 1,
      },
    ],
  }, { relatieIds: ['els'], naam: 'Els Pieters', email: 'els@example.nl' });
  assert.match(gedeeltelijk.tekst, /Uw diensten \(0\)/);
  assert.match(gedeeltelijk.tekst, /Openstaande diensten \(2\)/);
  assert.match(gedeeltelijk.tekst, /Ingedeeld: Hans Peters/);
  assert.match(gedeeltelijk.tekst, /Nog 1 gastbegeleider nodig/);
  assert.match(gedeeltelijk.tekst, /Nog niet ingevuld/);
  assert.equal(gedeeltelijk.tekst.includes('Ingedeeld: Nog niemand'), false);
  assert.equal(gedeeltelijk.html.includes('De volledige planning'), false);
});

test('het voorbeeld kiest de gevraagde ontvanger en verstuurt niets', () => {
  const mail = bundel();
  const gekozen = kiesVoorbeeld(mail.ontvangers, mail.diensten, 'MARIEKE@example.nl');
  assert.equal(gekozen?.naam, 'Marieke Jansen');
  const pagina = readFileSync(new URL('../src/pages/beheer/planning/index.astro', import.meta.url), 'utf8');
  const platform = readFileSync(new URL('../src/platform/planning-mail.ts', import.meta.url), 'utf8');
  assert.match(pagina, /planning-verzend/);
  assert.match(pagina, /value="bewaar"/);
  assert.equal(platform.includes('verstuurGecontroleerd'), false);
  assert.equal(platform.includes('resend'), false);
  const cron = readFileSync(new URL('../src/pages/api/cron/workflow.ts', import.meta.url), 'utf8');
  assert.equal(cron.includes('planning_mail'), false);
});

test('zonder bevestiging, bij dezelfde planning en in voorbeelddata gaat er geen mail uit', async () => {
  const mail = bundel();
  const verboden = transportDatFaalt();
  const geheugen = new GeheugenOpslag();
  const basis = {
    token: '11111111-1111-4111-8111-111111111111',
    opnieuw: false,
    voorbeelddata: false,
    alleenLezen: false,
    magSchrijven: true,
    periodeFout: null,
    bundel: mail,
    actor: { id: '22222222-2222-4222-8222-222222222222', naam: 'Nelleke' },
    opslag: geheugen,
    transport: verboden,
    register: STANDAARD_AUTOMATISERINGEN,
    nu: new Date('2026-04-01T10:00:00Z'),
  };
  const zonderBevestiging = await verstuurPlanningMail({ ...basis, bevestig: false });
  assert.equal(zonderBevestiging.verstuurd, false);
  assert.match(zonderBevestiging.melding, /geen e-mail verstuurd/i);
  assert.equal(verboden.aantal, 0);

  const eerste = await verstuurPlanningMail({ ...basis, bevestig: true });
  assert.equal(eerste.verstuurd, true);
  assert.equal(verboden.aantal, 2);
  assert.equal(verboden.ontvangers.slice().sort().join(','), 'hans@example.nl,marieke@example.nl');
  assert.match(verboden.onderwerpen[0], /Planning gastbegeleiders/);
  assert.equal(geheugen.rijen[0]?.gestartDoorNaam, 'Nelleke');
  assert.equal(geheugen.rijen[0]?.status, 'verzonden');

  const dubbel = await verstuurPlanningMail({
    ...basis,
    bevestig: true,
    token: '33333333-3333-4333-8333-333333333333',
  });
  assert.equal(dubbel.verstuurd, false);
  assert.match(dubbel.melding, /al verstuurd/);
  assert.equal(verboden.aantal, 2);

  const zelfdeToken = await verstuurPlanningMail({ ...basis, bevestig: true, opnieuw: true });
  assert.equal(zelfdeToken.verstuurd, false);
  assert.match(zelfdeToken.melding, /al gestart/);
  assert.equal(verboden.aantal, 2);

  const voorbeeld = await verstuurPlanningMail({
    ...basis,
    bevestig: true,
    voorbeelddata: true,
    token: '44444444-4444-4444-8444-444444444444',
    opnieuw: true,
  });
  assert.equal(voorbeeld.verstuurd, false);
  assert.equal(verboden.aantal, 2);
});

test('een gewijzigde planning mag opnieuw, dezelfde alleen met bewust opnieuw', async () => {
  const mail = bundel();
  assert.equal(beoordeelVerzending({
    bevestig: true,
    token: '11111111-1111-4111-8111-111111111111',
    opnieuw: false,
    voorbeelddata: false,
    alleenLezen: false,
    magSchrijven: true,
    periodeFout: null,
    ontvangers: 1,
    laatsteAfgerond: { status: 'verzonden' },
    besluitProvider: true,
    besluitModus: 'aan',
    besluitReden: 'actief',
  }).stuur, false);
  assert.equal(beoordeelVerzending({
    bevestig: true,
    token: '11111111-1111-4111-8111-111111111111',
    opnieuw: true,
    voorbeelddata: false,
    alleenLezen: false,
    magSchrijven: true,
    periodeFout: null,
    ontvangers: 1,
    laatsteAfgerond: { status: 'verzonden' },
    besluitProvider: true,
    besluitModus: 'aan',
    besluitReden: 'actief',
  }).stuur, true);

  const verboden = transportDatFaalt();
  const geheugen = new GeheugenOpslag();
  await verstuurPlanningMail({
    bevestig: true,
    token: '11111111-1111-4111-8111-111111111111',
    opnieuw: false,
    voorbeelddata: false,
    alleenLezen: false,
    magSchrijven: true,
    periodeFout: null,
    bundel: mail,
    actor: { naam: 'Bestuur' },
    opslag: geheugen,
    transport: verboden,
    register: STANDAARD_AUTOMATISERINGEN,
  });
  const gewijzigd = stelPlanningMailSamen({
    ...bron,
    boekingen: bron.boekingen.map((boeking) => boeking.id === 'weekend'
      ? { ...boeking, gastheerId: undefined }
      : boeking),
    toewijzingen: [],
  });
  assert.notEqual(gewijzigd.hash, mail.hash);
  const opnieuw = await verstuurPlanningMail({
    bevestig: true,
    token: '55555555-5555-4555-8555-555555555555',
    opnieuw: false,
    voorbeelddata: false,
    alleenLezen: false,
    magSchrijven: true,
    periodeFout: null,
    bundel: gewijzigd,
    actor: { naam: 'Bestuur' },
    opslag: geheugen,
    transport: verboden,
    register: STANDAARD_AUTOMATISERINGEN,
  });
  assert.equal(opnieuw.verstuurd, true);
  assert.equal(verboden.aantal, 4);
});

test('de schakelaar is handmatig en heeft geen automatische aanleiding in de tekst', () => {
  const item = STANDAARD_AUTOMATISERINGEN.find((rij) => rij.sleutel === 'planning_mail');
  assert.ok(item);
  assert.equal(item.status, 'actief');
  assert.equal(item.categorie, 'handmatig');
  assert.match(functioneleStatus(item).toelichting, /bevestigde knop/);
  assert.match(technischeGereedheid(item).toelichting, /geen automatische verzending/i);
  const sql = readFileSync(new URL('../supabase/migrations/20261117120000_planning_mail.sql', import.meta.url), 'utf8');
  assert.match(sql, /enable row level security/);
  assert.match(sql, /planning_mail_een_bezig/);
  assert.equal(sql.toLowerCase().includes('cron'), true);
  assert.equal(sql.toLowerCase().includes('pg_cron'), false);
});

function transportDatFaalt(): MailTransport & { aantal: number; ontvangers: string[]; onderwerpen: string[] } {
  const staat = { aantal: 0, ontvangers: [] as string[], onderwerpen: [] as string[] };
  return {
    ...staat,
    async verstuur(bericht) {
      staat.aantal += 1;
      staat.ontvangers.push(bericht.naar);
      staat.onderwerpen.push(bericht.onderwerp);
      return `bericht-${staat.aantal}`;
    },
    get aantal() { return staat.aantal; },
    get ontvangers() { return staat.ontvangers; },
    get onderwerpen() { return staat.onderwerpen; },
  };
}

class GeheugenOpslag implements PlanningMailOpslag {
  rijen: PlanningMailHistorie[] = [];

  async laatsteAfgerond(hash: string) {
    const rij = [...this.rijen].reverse().find((kandidaat) => kandidaat.hash === hash && (kandidaat.status === 'verzonden' || kandidaat.status === 'deels'));
    return rij ? { id: rij.id, status: rij.status, verzondenOp: rij.verzondenOp } : null;
  }

  async sluitVerlopenBezig() {}

  async claim(invoer: PlanningMailClaim) {
    if (this.rijen.some((rij) => rij.token === invoer.token)) {
      return { soort: 'al-gestart' as const, id: this.rijen.find((rij) => rij.token === invoer.token)?.id ?? '' };
    }
    if (this.rijen.some((rij) => rij.hash === invoer.hash && rij.status === 'bezig')) return { soort: 'loopt-al' as const };
    const id = String(this.rijen.length + 1);
    this.rijen.push({
      id,
      token: invoer.token,
      van: invoer.van,
      tot: invoer.tot,
      aangemaaktOp: '2026-04-01T10:00:00Z',
      verzondenOp: null,
      gestartDoorNaam: invoer.gestartDoorNaam,
      status: 'bezig',
      hash: invoer.hash,
      snapshot: invoer.snapshot,
      gelukt: 0,
      aantal: invoer.ontvangers.length,
      toelichting: '',
      ontvangers: invoer.ontvangers.map((ontvanger: PlanningOntvanger) => ({
        naam: ontvanger.naam,
        email: ontvanger.email,
        status: 'wacht',
        foutmelding: '',
        providerBerichtId: '',
      })),
    });
    return { soort: 'nieuw' as const, id };
  }

  async zetOntvanger(id: string, email: string, patch: { status: 'wacht' | 'verzonden' | 'fout'; foutmelding: string; providerBerichtId: string }) {
    const rij = this.rijen.find((kandidaat) => kandidaat.id === id);
    const ontvanger = rij?.ontvangers.find((kandidaat) => kandidaat.email === email);
    if (!ontvanger) return;
    ontvanger.status = patch.status;
    ontvanger.foutmelding = patch.foutmelding;
    ontvanger.providerBerichtId = patch.providerBerichtId;
  }

  async rondAf(id: string, patch: { status: PlanningMailHistorie['status']; gelukt: number; toelichting: string; verzondenOp: string }) {
    const rij = this.rijen.find((kandidaat) => kandidaat.id === id);
    if (!rij) return;
    rij.status = patch.status;
    rij.gelukt = patch.gelukt;
    rij.toelichting = patch.toelichting;
    rij.verzondenOp = patch.verzondenOp;
  }

  async lees(id: string) {
    return this.rijen.find((rij) => rij.id === id) ?? null;
  }

  async recent() {
    return this.rijen;
  }
}
