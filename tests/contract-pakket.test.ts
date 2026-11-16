import assert from 'node:assert/strict';
import test from 'node:test';
import { VOORWAARDEN_V1 } from '../src/platform/documenten/teksten-v1.ts';
import {
  CONTRACT_MAIL_ONDERWERP,
  contractmailMagWeg,
  contractPakketTekst,
  maakContractPdf,
  resendAttachments,
  tekenLinkGeldig,
  tekenUrl,
} from '../src/platform/contract-pakket.ts';
import {
  hashTekenToken,
  maakTekenToken,
  ondertekendePdf,
  voerTekenstap,
  type TekenDossier,
  type TekenWinkel,
} from '../src/platform/contract-tekenen.ts';
import {
  bouwOpvolging,
  contractTekst,
  voerFlowUit,
  type ContractAfspraken,
  type ContractBron,
  type ContractVersie,
  type DocumentenflowInstellingen,
  type FlowContext,
} from '../src/platform/documentenflow.ts';
import { pasDocumentenflowToe } from '../src/lib/operatie/documentenflow-sessie.ts';
import type { GebruikerRechten } from '../src/platform/types.ts';

const afspraken: ContractAfspraken = {
  tijdVan: '13:00',
  tijdTot: '18:00',
  opbouw: 'Vanaf 10:00',
  afbouw: 'Tot 20:00',
  contactpersoon: 'José de Vries',
};

function rechten(perModule: GebruikerRechten['perModule']): GebruikerRechten {
  return { isSuperAdmin: false, perModule };
}

function instellingen(): DocumentenflowInstellingen {
  return {
    bestuursakkoordVerplicht: true,
    gereedRegel: 'ondertekend',
    ondertekenaarNaam: 'A. de Boer',
    ondertekenaarFunctie: 'Voorzitter',
    iban: 'NL91ABNA0417164300',
    tenaamstelling: 'Stichting Het Kerkje van Persingen',
    voorwaardenVastgesteldOp: '2026-11-15',
    huisregelsVastgesteldOp: '2026-11-15',
    coordinatorContact: '',
    publicatieRoute: '',
  };
}

function bron(extra: Partial<ContractBron> = {}): ContractBron {
  return {
    boekingId: '42',
    soort: 'bruiloft',
    soortLabel: 'Bruiloft',
    activiteit: 'Huwelijk José',
    toelichting: '',
    periodeVan: '2026-09-09',
    periodeTot: '2026-09-09',
    geboektOp: '2026-06-01',
    huurderNaam: 'José de Vries',
    straat: 'Kerkstraat',
    huisnummer: '1',
    toevoeging: '',
    postcode: '6575 AB',
    woonplaats: 'Persingen',
    email: 'jose@voorbeeld.nl',
    telefoon: '0612345678',
    personen: '40',
    huurprijsCent: 55000,
    aanbetalingCent: 10000,
    aanbetalingVerval: '2026-07-01',
    restCent: 45000,
    restVerval: '2026-08-01',
    gastNaam: '',
    gastEmail: '',
    gastTelefoon: '',
    promotieAanwezig: false,
    boekingStatus: 'optie',
    ...extra,
  };
}

function context(extra: Partial<FlowContext> = {}): FlowContext {
  return {
    nu: '2026-06-02T10:00:00.000Z',
    vandaag: '2026-06-02',
    actorNaam: 'Bestuur',
    rechten: rechten({ aanvragen: 'schrijven', boekingen: 'schrijven', instellingen: 'schrijven' }),
    instellingen: instellingen(),
    bron: bron(),
    versies: [],
    betaling: { stand: 'open', toelichting: '' },
    modus: 'aan',
    testadres: 'nhoevenaars@gmail.com',
    ...extra,
  };
}

function versieVan(extra: Partial<ContractBron> = {}): ContractVersie {
  const uit = voerFlowUit({ soort: 'maken', afspraken }, context({ bron: bron(extra) }));
  assert.equal(uit.ok, true);
  if (!uit.ok) throw new Error('maken');
  const versie = uit.versies.at(-1);
  assert.ok(versie);
  return versie;
}

test('een bruiloft en een expositie krijgen de juiste bijlagen en bedragen', () => {
  const bruiloft = versieVan();
  assert.match(bruiloft.tekst, /550,00/);
  assert.match(bruiloft.tekst, /100,00/);
  assert.match(bruiloft.tekst, /450,00/);
  assert.equal(bruiloft.voorwaardenTekst, VOORWAARDEN_V1);
  const zonderPlattegrond = contractPakketTekst({
    tekst: bruiloft.tekst,
    voorwaardenTekst: bruiloft.voorwaardenTekst,
    huisregelsTekst: bruiloft.huisregelsTekst,
    plattegrondTekst: bruiloft.plattegrondTekst,
    soort: 'bruiloft',
  });
  assert.equal(zonderPlattegrond.includes('Plattegrond expositieruimte'), false);
  const expositie = versieVan({ soort: 'expositie', soortLabel: 'Expositie', activiteit: 'Zomer' });
  const metPlattegrond = contractPakketTekst({
    tekst: expositie.tekst,
    voorwaardenTekst: expositie.voorwaardenTekst,
    huisregelsTekst: expositie.huisregelsTekst,
    plattegrondTekst: expositie.plattegrondTekst,
    soort: 'expositie',
  });
  assert.match(metPlattegrond, /Plattegrond expositieruimte/);
  assert.match(metPlattegrond, /Verhuurvoorwaarden/);
});

test('ontbrekende huurprijs of een nulbedrag levert geen contract', () => {
  assert.equal(contractTekst(bron({ huurprijsCent: null }), afspraken, instellingen(), 'KVP', 1, '2026-06-02').tekst, null);
  assert.equal(contractTekst(bron({ huurprijsCent: 0, restCent: 0 }), afspraken, instellingen(), 'KVP', 1, '2026-06-02').tekst, null);
  assert.equal(voerFlowUit({ soort: 'maken', afspraken }, context({ bron: bron({ email: '' }) })).ok, false);
});

test('de provider-payload bevat de PDF en een mail zonder bijlage gaat niet weg', async () => {
  const versie = versieVan();
  const pdf = await maakContractPdf({
    tekst: versie.tekst,
    voorwaardenTekst: versie.voorwaardenTekst,
    huisregelsTekst: versie.huisregelsTekst,
    plattegrondTekst: versie.plattegrondTekst,
    soort: 'bruiloft',
  }, `${versie.contractnummer}.pdf`, versie.contractnummer);
  assert.equal(pdf.ok, true);
  if (!pdf.ok) return;
  const token = maakTekenToken();
  const link = tekenUrl(token);
  assert.equal(tekenLinkGeldig(link), true);
  assert.equal(tekenLinkGeldig('https://kerkjepersingen.nl/tekenen/kort'), false);
  const attachments = resendAttachments([pdf.bijlage], versie.contractnummer);
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].filename, `${versie.contractnummer}.pdf`);
  assert.equal(attachments[0].content.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(attachments[0].content.byteLength > 800);
  assert.equal(contractmailMagWeg({
    tekst: `verhuurvoorwaarden\nhttps://kerkjepersingen.nl/privacyverklaring/\n${link}`,
    link,
    bijlagen: [pdf.bijlage],
    contractnummer: versie.contractnummer,
  }), null);
  assert.match(contractmailMagWeg({
    tekst: `verhuurvoorwaarden\nhttps://kerkjepersingen.nl/privacyverklaring/\n${link}`,
    link,
    bijlagen: [],
    contractnummer: versie.contractnummer,
  }) ?? '', /bijlage/i);
  assert.throws(() => resendAttachments([]), /bijlage/i);
});

test('goedkeuring vervalt als de prijs daarna wijzigt en een handtekening maakt de boeking niet definitief', () => {
  const versie = versieVan();
  const akkoord = voerFlowUit({ soort: 'akkoord' }, context({ versies: [versie] }));
  assert.equal(akkoord.ok, true);
  if (!akkoord.ok) return;
  const verouderd = voerFlowUit({ soort: 'verzend', proef: false, poging: '1' }, context({
    versies: akkoord.versies,
    bron: bron({ huurprijsCent: 60000, restCent: 50000 }),
  }));
  assert.equal(verouderd.ok, false);
  if (verouderd.ok) return;
  assert.match(verouderd.melding, /goedkeuring|gewijzigd/i);
  const getekend: ContractVersie = { ...akkoord.versies[0], ondertekening: 'ontvangen' };
  const gereed = voerFlowUit({ soort: 'gereed', poging: '1' }, context({
    versies: [getekend],
    rechten: rechten({ boekingen: 'schrijven', instellingen: 'schrijven' }),
    betaling: { stand: 'open', toelichting: '' },
  }));
  assert.equal(gereed.ok, false);
  if (gereed.ok) return;
  assert.match(gereed.melding, /aanbetaling/i);
  const weergave = bouwOpvolging({
    rechten: rechten({ instellingen: 'schrijven', aanvragen: 'schrijven' }),
    bron: bron(),
    instellingen: instellingen(),
    versies: akkoord.versies,
    betaling: { stand: 'open', toelichting: '' },
    vandaag: '2026-06-02',
    bekijkHref: '/beheer/aanvragen/1/?document=contract',
    fout: '',
    modus: 'aan',
  });
  assert.equal(weergave.kanVerzenden, true);
  assert.equal(weergave.kanGoedkeuren, false);
  assert.match(weergave.regels.find((regel) => regel.label === 'Bestuur akkoord')?.waarde ?? '', /Akkoord/);
});

test('een tekenlink werkt eenmalig, verloopt, en hoort niet bij een andere boeking', async () => {
  const token = maakTekenToken();
  const andere = maakTekenToken();
  assert.notEqual(hashTekenToken(token), hashTekenToken(andere));
  const basis = versieVan();
  const dossier: TekenDossier = {
    boekingId: '42',
    versie: 1,
    contractnummer: basis.contractnummer,
    tokenHash: hashTekenToken(token),
    verlooptOp: '2026-06-20T00:00:00.000Z',
    codeHash: null,
    codeVerloopt: null,
    pogingen: 0,
    geverifieerdOp: null,
    ondertekendOp: null,
    naam: null,
    email: 'jose@voorbeeld.nl',
    vrijgegeven: true,
    documentHash: null,
    pdfPad: null,
    bevestigingId: null,
    huurderNaam: 'José de Vries',
    pakket: {
      tekst: basis.tekst,
      voorwaardenTekst: basis.voorwaardenTekst,
      huisregelsTekst: basis.huisregelsTekst,
      plattegrondTekst: basis.plattegrondTekst,
      soort: 'bruiloft',
    },
  };
  const geheugen = new Map<string, TekenDossier>([[dossier.tokenHash, dossier]]);
  let mails = 0;
  let pdfs = 0;
  const winkel: TekenWinkel = {
    async lees(hash) {
      return geheugen.get(hash) ?? null;
    },
    async bewaarCode(hash, codeHash, verloopt, pogingen) {
      const rij = geheugen.get(hash);
      if (!rij) return;
      geheugen.set(hash, { ...rij, codeHash, codeVerloopt: verloopt, pogingen });
    },
    async zetGeverifieerd(hash, op) {
      const rij = geheugen.get(hash);
      if (!rij) return;
      geheugen.set(hash, { ...rij, geverifieerdOp: op });
    },
    async legOndertekening(input) {
      const rij = geheugen.get(input.tokenHash);
      if (!rij || rij.ondertekendOp) return 'al';
      pdfs += 1;
      geheugen.set(input.tokenHash, {
        ...rij,
        ondertekendOp: input.op,
        naam: input.naam,
        documentHash: input.documentHash,
        pdfPad: input.pdfPad,
      });
      return 'nieuw';
    },
  };
  const geheim = 'test-geheim';
  const nu = '2026-06-02T10:00:00.000Z';
  assert.equal((await voerTekenstap({ soort: 'bekijk', token: andere, nu }, winkel)).ok, false);
  const verlopen = await voerTekenstap({ soort: 'bekijk', token, nu: '2026-07-01T00:00:00.000Z' }, winkel);
  assert.equal(verlopen.ok, false);
  if (!verlopen.ok) assert.equal(verlopen.melding, 'Deze link is verlopen.');
  const codeUit = await voerTekenstap({ soort: 'code', token, nu, geheim }, winkel);
  assert.equal(codeUit.ok, true);
  if (!codeUit.ok || !codeUit.code) return;
  mails += codeUit.mail === 'code' ? 1 : 0;
  const fout = await voerTekenstap({ soort: 'controle', token, nu, geheim, code: '000000' }, winkel);
  assert.equal(fout.ok, false);
  const goed = await voerTekenstap({ soort: 'controle', token, nu, geheim, code: codeUit.code }, winkel);
  assert.equal(goed.ok, true);
  if (!goed.ok || !goed.cookie) return;
  const teken = await voerTekenstap({
    soort: 'onderteken',
    token,
    nu,
    naam: 'José de Vries',
    akkoord: true,
    cookie: goed.cookie,
    geheim,
    ipHash: 'abc',
    userAgent: 'test',
  }, winkel);
  assert.equal(teken.ok, true);
  if (!teken.ok || !teken.pdf) return;
  mails += teken.mail === 'bevestiging' ? 1 : 0;
  const latin = Buffer.from(teken.pdf).toString('latin1');
  assert.match(latin, /elektronische ondertekening/i);
  assert.match(latin, /geen gekwalificeerde/i);
  assert.match(latin, /Jos/);
  assert.match(latin, /Verhuurvoorwaarden/);
  const nogmaals = await voerTekenstap({
    soort: 'onderteken',
    token,
    nu,
    naam: 'José de Vries',
    akkoord: true,
    cookie: goed.cookie,
    geheim,
    ipHash: null,
    userAgent: 'test',
  }, winkel);
  assert.equal(nogmaals.ok, true);
  if (!nogmaals.ok) return;
  assert.equal(nogmaals.mail, undefined);
  assert.equal(pdfs, 1);
  assert.equal(mails, 2);
  const bewijs = ondertekendePdf(dossier, {
    naam: 'José de Vries',
    email: dossier.email,
    op: nu,
    contractnummer: dossier.contractnummer,
    versie: 1,
    documentHash: 'abc',
  });
  assert.equal(Buffer.from(bewijs).subarray(0, 5).toString('latin1'), '%PDF-');
});

test('een proeflink die nog niet is vrijgegeven kan niet worden ondertekend', async () => {
  const token = maakTekenToken();
  const basis = versieVan();
  const dossier: TekenDossier = {
    boekingId: '42',
    versie: 1,
    contractnummer: basis.contractnummer,
    tokenHash: hashTekenToken(token),
    verlooptOp: '2026-06-20T00:00:00.000Z',
    codeHash: null,
    codeVerloopt: null,
    pogingen: 0,
    geverifieerdOp: null,
    ondertekendOp: null,
    naam: null,
    email: 'jose@voorbeeld.nl',
    vrijgegeven: false,
    documentHash: null,
    pdfPad: null,
    bevestigingId: null,
    huurderNaam: 'José de Vries',
    pakket: {
      tekst: basis.tekst,
      voorwaardenTekst: basis.voorwaardenTekst,
      huisregelsTekst: basis.huisregelsTekst,
      plattegrondTekst: basis.plattegrondTekst,
      soort: 'bruiloft',
    },
  };
  const winkel: TekenWinkel = {
    async lees() { return dossier; },
    async bewaarCode() {},
    async zetGeverifieerd() {},
    async legOndertekening() { return 'nieuw'; },
  };
  const bekijk = await voerTekenstap({ soort: 'bekijk', token, nu: '2026-06-02T10:00:00.000Z' }, winkel);
  assert.equal(bekijk.ok, true);
  const code = await voerTekenstap({ soort: 'code', token, nu: '2026-06-02T10:00:00.000Z', geheim: 'test' }, winkel);
  assert.equal(code.ok, false);
  if (!code.ok) assert.match(code.melding, /niet vrijgegeven/);
});

test('de contractmail noemt dezelfde versie, de link en de vervaldatum', async () => {
  const versie = versieVan();
  versie.bestuur = 'akkoord';
  const link = tekenUrl(maakTekenToken());
  const uit = voerFlowUit({ soort: 'verzend', proef: true, poging: 'mail' }, context({
    versies: [versie],
    modus: 'test',
    tekenLink: link,
    tekenVerloopt: '2026-11-30T00:13:00.000Z',
  }));
  assert.equal(uit.ok, true);
  if (!uit.ok || !uit.mail) return;
  assert.equal(uit.mail.onderwerp, CONTRACT_MAIL_ONDERWERP);
  assert.match(uit.mail.tekst, /Beste José de Vries/);
  assert.match(uit.mail.tekst, new RegExp(versie.contractnummer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(uit.mail.tekst, /Documentversie: 1/);
  assert.match(uit.mail.tekst, /Verhuurvoorwaarden: 1\.0/);
  assert.match(uit.mail.tekst, /30 november 2026/);
  assert.equal(uit.mail.tekst.includes(link), true);
  assert.equal(uit.mail.tekst.includes('https://kerkjepersingen.nl/privacyverklaring/'), true);
  assert.match(uit.mail.tekst, /verhuurvoorwaarden/i);
  assert.match(uit.mail.tekst, /nog niet automatisch definitief/);
  assert.match(uit.mail.tekst, /geen gekwalificeerde/);
  assert.equal(uit.mail.tekst.includes('{{'), false);
  assert.equal(/<\/?[a-z]/i.test(uit.mail.tekst), false);
  const html = uit.mail.html ?? '';
  assert.equal(html.split('data-kerkje-mail').length - 1, 1);
  assert.match(html, /Bekijk en onderteken uw huurovereenkomst/);
  assert.match(html, /Werkt de knop niet/);
  assert.equal(html.includes(link), true);
  assert.match(html, /Bekijk onze privacyverklaring/);
  assert.equal(html.includes('{{'), false);
  const pdf = await maakContractPdf({
    tekst: versie.tekst,
    voorwaardenTekst: versie.voorwaardenTekst,
    huisregelsTekst: versie.huisregelsTekst,
    plattegrondTekst: versie.plattegrondTekst,
    soort: 'bruiloft',
  }, `${versie.contractnummer}.pdf`, versie.contractnummer);
  assert.equal(pdf.ok, true);
  if (!pdf.ok) return;
  assert.equal(contractmailMagWeg({
    tekst: uit.mail.tekst,
    link,
    bijlagen: [pdf.bijlage],
    contractnummer: versie.contractnummer,
  }), null);
});

test('een oude tekenlink ondertekent niet de nieuwere documentversie', async () => {
  const tokenOud = maakTekenToken();
  const tokenNieuw = maakTekenToken();
  const basis = versieVan();
  function dossierVoor(token: string, versie: number, kenmerk: string): TekenDossier {
    return {
      boekingId: '42',
      versie,
      contractnummer: basis.contractnummer,
      tokenHash: hashTekenToken(token),
      verlooptOp: '2026-06-20T00:00:00.000Z',
      codeHash: null,
      codeVerloopt: null,
      pogingen: 0,
      geverifieerdOp: null,
      ondertekendOp: null,
      naam: null,
      email: 'jose@voorbeeld.nl',
      vrijgegeven: true,
      documentHash: null,
      pdfPad: null,
      bevestigingId: null,
      huurderNaam: 'José de Vries',
      pakket: {
        tekst: `${basis.tekst}\n${kenmerk}`,
        voorwaardenTekst: basis.voorwaardenTekst,
        huisregelsTekst: basis.huisregelsTekst,
        plattegrondTekst: basis.plattegrondTekst,
        soort: 'bruiloft',
      },
    };
  }
  const oud = dossierVoor(tokenOud, 1, 'Kenmerk-versie-oud');
  const nieuw = dossierVoor(tokenNieuw, 2, 'Kenmerk-versie-nieuw');
  const winkel: TekenWinkel = {
    async lees(hash) {
      if (hash === oud.tokenHash) return oud;
      if (hash === nieuw.tokenHash) return nieuw;
      return null;
    },
    async bewaarCode() {},
    async zetGeverifieerd() {},
    async legOndertekening() { return 'nieuw'; },
  };
  const nu = '2026-06-02T10:00:00.000Z';
  const gedownload = await voerTekenstap({ soort: 'download', token: tokenOud, nu }, winkel);
  assert.equal(gedownload.ok, true);
  if (!gedownload.ok || !gedownload.pdf) return;
  const latin = Buffer.from(gedownload.pdf).toString('latin1');
  assert.match(latin, /Kenmerk-versie-oud/);
  assert.equal(latin.includes('Kenmerk-versie-nieuw'), false);
  assert.equal(gedownload.dossier.versie, 1);
  const andere = await voerTekenstap({ soort: 'download', token: tokenNieuw, nu }, winkel);
  assert.equal(andere.ok, true);
  if (!andere.ok || !andere.pdf) return;
  assert.equal(Buffer.from(andere.pdf).toString('latin1').includes('Kenmerk-versie-oud'), false);
  assert.equal(andere.dossier.versie, 2);
});

test('het contractpakket is niet geblokkeerd door de documentenflow-vlag', async () => {
  const uit = await pasDocumentenflowToe({
    client: {
      from() {
        const query = {
          select() { return query; },
          eq() { return query; },
          then(resolve: (waarde: { data: null; error: { message: string } }) => void) {
            resolve({ data: null, error: { message: 'kapot' } });
          },
        };
        return query;
      },
    } as never,
    env: {},
    actor: { type: 'gebruiker', naam: 'Beheer', rechten: rechten({}) },
    boekingId: '42',
    actie: { soort: 'akkoord' },
    modus: 'aan',
    testadres: null,
    verstuur: async () => { throw new Error('mail'); },
  });
  assert.equal(uit.ok, false);
  assert.equal(/staat uit/i.test(uit.melding), false);
  assert.match(uit.melding, /kapot/);
});
