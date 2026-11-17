import assert from 'node:assert/strict';
import test from 'node:test';
import { beschikbaarheidVoor } from '../src/platform/aanvraag-fase.ts';
import { pdfBytes } from '../src/platform/documenten/pdf.ts';
import { VOORWAARDEN_V1 } from '../src/platform/documenten/teksten-v1.ts';
import { documentenflowAan } from '../src/platform/documentenflow-vlag.ts';
import {
  betalingStand,
  bouwOpvolging,
  contractTekst,
  legeInstellingen,
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

function instellingen(extra: Partial<DocumentenflowInstellingen> = {}): DocumentenflowInstellingen {
  return {
    ...legeInstellingen(),
    ondertekenaarNaam: 'A. de Boer',
    ondertekenaarFunctie: 'Voorzitter',
    iban: 'NL91ABNA0417164300',
    tenaamstelling: 'Stichting Het Kerkje van Persingen',
    voorwaardenVastgesteldOp: '2026-11-15',
    huisregelsVastgesteldOp: '2026-11-15',
    ...extra,
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
    gastNaam: 'Nelleke',
    gastEmail: 'nelleke@voorbeeld.nl',
    gastTelefoon: '0687654321',
    promotieAanwezig: false,
    boekingStatus: 'optie',
    ...extra,
  };
}

function context(extra: Partial<FlowContext> = {}): FlowContext {
  return {
    nu: '2026-06-02T10:00:00.000Z',
    vandaag: '2026-06-02',
    actorNaam: 'Beheer',
    rechten: rechten({ aanvragen: 'schrijven', boekingen: 'schrijven' }),
    instellingen: instellingen(),
    bron: bron(),
    versies: [],
    betaling: { stand: 'niet_vastgelegd', toelichting: '' },
    modus: 'aan',
    testadres: 'test@voorbeeld.nl',
    ...extra,
  };
}

function gemaakt(extra: Partial<FlowContext> = {}): ContractVersie {
  const uit = voerFlowUit({ soort: 'maken', afspraken }, context(extra));
  assert.equal(uit.ok, true);
  if (!uit.ok) throw new Error('maken mislukt');
  const versie = uit.versies.at(-1);
  assert.ok(versie);
  return versie;
}

test('documentenflow staat uit zonder vlag en BEHEER_ENABLED zet hem niet aan', async () => {
  assert.equal(documentenflowAan({}), false);
  assert.equal(documentenflowAan({ BEHEER_ENABLED: 'true', DOCUMENTENFLOW: 'false' }), false);
  assert.equal(documentenflowAan({ DOCUMENTENFLOW: 'true' }), true);
  let aangeraakt = false;
  const uit = await pasDocumentenflowToe({
    client: { from() { aangeraakt = true; throw new Error('database'); } } as never,
    env: { BEHEER_ENABLED: 'true' },
    actor: { type: 'gebruiker', naam: 'Beheer', rechten: rechten({}) },
    boekingId: '42',
    actie: { soort: 'praktisch', proef: true, poging: '1' },
    modus: 'aan',
    testadres: null,
    verstuur: async () => { throw new Error('mail'); },
  });
  assert.equal(uit.ok, false);
  assert.match(uit.melding, /uit/i);
  assert.equal(aangeraakt, false);
});

test('rollen: alleen contractbeheer maakt, alleen bestuur keurt goed', () => {
  const lezer = voerFlowUit({ soort: 'maken', afspraken }, context({ rechten: rechten({ aanvragen: 'lezen' }) }));
  assert.equal(lezer.ok, false);
  const bestuurder = voerFlowUit({ soort: 'maken', afspraken }, context({ rechten: rechten({ instellingen: 'schrijven' }) }));
  assert.equal(bestuurder.ok, false);
  const versie = gemaakt();
  const voorgelegd = voerFlowUit({ soort: 'voorleggen' }, context({ versies: [versie] }));
  assert.equal(voorgelegd.ok, true);
  if (!voorgelegd.ok) return;
  const akkoord = voerFlowUit({ soort: 'akkoord' }, context({
    versies: voorgelegd.versies,
    rechten: rechten({ aanvragen: 'schrijven' }),
  }));
  assert.equal(akkoord.ok, false);
  assert.match(akkoord.ok ? '' : akkoord.melding, /bestuur/i);
});

test('ontbrekende gegevens geven geen contract en geen placeholders', () => {
  const leeg = contractTekst(bron({ huurprijsCent: null }), afspraken, legeInstellingen(), 'KVP-test', 1, '2026-06-02');
  assert.equal(leeg.tekst, null);
  assert.ok(leeg.ontbreekt.length > 0);
  assert.equal(leeg.ontbreekt.some((regel) => regel.includes('{{')), false);
  const gemaaktZonder = voerFlowUit({ soort: 'maken', afspraken }, context({ instellingen: legeInstellingen() }));
  assert.equal(gemaaktZonder.ok, false);
});

test('prijs, datum of activiteit geeft een nieuwe versie en zet bestuur terug', () => {
  const eerste = gemaakt();
  const duurder = voerFlowUit({ soort: 'maken', afspraken }, context({
    versies: [{ ...eerste, bestuur: 'akkoord' }],
    bron: bron({ huurprijsCent: 60000, restCent: 50000 }),
  }));
  assert.equal(duurder.ok, true);
  if (!duurder.ok) return;
  assert.equal(duurder.versies.length, 2);
  assert.equal(duurder.versies[0]?.tekst, eerste.tekst);
  assert.equal(duurder.versies[0]?.voorwaardenTekst, VOORWAARDEN_V1);
  assert.notEqual(duurder.versies[1]?.tekst, eerste.tekst);
  assert.equal(duurder.versies[1]?.bestuur, 'open');
  assert.equal(duurder.versies[1]?.voorwaardenTekst, eerste.voorwaardenTekst);
  const andereDag = voerFlowUit({ soort: 'maken', afspraken }, context({
    versies: duurder.versies,
    bron: bron({ periodeVan: '2026-09-10', periodeTot: '2026-09-10' }),
  }));
  assert.equal(andereDag.ok, true);
  if (!andereDag.ok) return;
  assert.equal(andereDag.versies.length, 3);
});

test('verzenden zonder akkoord wordt geweigerd en een proef telt niet als contract', () => {
  const versie = gemaakt();
  const verzend = voerFlowUit({ soort: 'verzend', proef: false, poging: '1' }, context({ versies: [versie] }));
  assert.equal(verzend.ok, false);
  const voorgelegd = voerFlowUit({ soort: 'voorleggen' }, context({ versies: [versie] }));
  assert.equal(voorgelegd.ok, true);
  if (!voorgelegd.ok) return;
  const akkoord = voerFlowUit({ soort: 'akkoord' }, context({
    versies: voorgelegd.versies,
    rechten: rechten({ instellingen: 'schrijven' }),
  }));
  assert.equal(akkoord.ok, true);
  if (!akkoord.ok) return;
  const proef = voerFlowUit({ soort: 'verzend', proef: true, poging: 'proef-1' }, context({
    versies: akkoord.versies,
    modus: 'test',
  }));
  assert.equal(proef.ok, true);
  if (!proef.ok || !proef.mail) return;
  assert.equal(proef.mail.teltAlsVerzonden, false);
  assert.equal(proef.mail.soort, 'proef');
  assert.equal(proef.mail.naar, 'test@voorbeeld.nl');
  assert.equal(proef.mail.bijlagen[0]?.tekst.includes(VOORWAARDEN_V1), true);
  const echte = voerFlowUit({ soort: 'verzend', proef: false, poging: '2' }, context({ versies: akkoord.versies, modus: 'test' }));
  assert.equal(echte.ok, false);
  assert.match(echte.ok ? '' : echte.melding, /Proefmail/);
  const wacht = bouwOpvolging({
    rechten: rechten({ aanvragen: 'schrijven', instellingen: 'schrijven' }),
    bron: bron(),
    instellingen: instellingen(),
    versies: [versie],
    betaling: { stand: 'niet_vastgelegd', toelichting: '' },
    vandaag: '2026-06-02',
    bekijkHref: '/beheer/aanvragen/a/',
    fout: '',
    modus: 'aan',
  });
  assert.equal(wacht.kanVerzenden, false);
  assert.equal(wacht.kanGoedkeuren, true);
  assert.match(wacht.redenen.join(' '), /Bestuursakkoord/);
});

test('een tweede verzending van dezelfde versie stuurt geen mail', () => {
  const versie = gemaakt({ instellingen: instellingen({ bestuursakkoordVerplicht: false }) });
  const eerste = voerFlowUit({ soort: 'verzend', proef: false, poging: '1' }, context({
    versies: [versie],
    instellingen: instellingen({ bestuursakkoordVerplicht: false }),
  }));
  assert.equal(eerste.ok, true);
  if (!eerste.ok || !eerste.mail) return;
  const verzonden: ContractVersie = {
    ...versie,
    verzendingen: [{
      soort: 'contract',
      idempotentie: eerste.mail.idempotentie,
      ontvanger: eerste.mail.naar,
      werkelijk: eerste.mail.naar,
      status: 'verzonden',
      berichtId: 'msg-1',
      op: '2026-06-02T10:00:00.000Z',
      versie: versie.versie,
    }],
  };
  const tweede = voerFlowUit({ soort: 'verzend', proef: false, poging: '2' }, context({
    versies: [verzonden],
    instellingen: instellingen({ bestuursakkoordVerplicht: false }),
  }));
  assert.equal(tweede.ok, true);
  if (!tweede.ok) return;
  assert.equal(tweede.mail, null);
});

test('ondertekening eist het contractnummer en de versie', () => {
  const versie = gemaakt();
  const fout = voerFlowUit({ soort: 'ondertekend', contractnummer: 'KVP-ander', versie: 9 }, context({ versies: [versie] }));
  assert.equal(fout.ok, false);
  const goed = voerFlowUit({ soort: 'ondertekend', contractnummer: versie.contractnummer, versie: versie.versie }, context({ versies: [versie] }));
  assert.equal(goed.ok, true);
  if (!goed.ok) return;
  assert.equal(goed.versies.at(-1)?.ondertekening, 'ontvangen');
});

test('betaling toont alleen wat vastligt', () => {
  assert.equal(betalingStand({ vlag: false, regels: [] }).stand, 'niet_vastgelegd');
  assert.equal(betalingStand({ vlag: true, regels: [] }).stand, 'ontvangen');
  assert.equal(betalingStand({
    vlag: false,
    regels: [{ soort: 'aanbetaling', bedrag: 100, status: 'open', vervaldatum: '2026-07-01' }],
  }).stand, 'open');
  assert.equal(betalingStand({
    vlag: false,
    regels: [
      { soort: 'aanbetaling', bedrag: 100, status: 'ontvangen', vervaldatum: '2026-07-01' },
      { soort: 'restant', bedrag: 390, status: 'open', vervaldatum: '2026-08-01' },
    ],
  }).stand, 'ontvangen');
  const weergave = bouwOpvolging({
    rechten: rechten({ aanvragen: 'schrijven' }),
    bron: bron(),
    instellingen: legeInstellingen(),
    versies: [],
    betaling: { stand: 'niet_vastgelegd', toelichting: '' },
    vandaag: '2026-06-02',
    bekijkHref: '/beheer/aanvragen/a/',
    fout: '',
    modus: 'uit',
  });
  assert.equal(weergave.regels.find((regel) => regel.label === 'Aanbetaling ontvangen')?.waarde, 'Niet vastgelegd');
  assert.equal(legeInstellingen().bestuursakkoordVerplicht, true);
  assert.equal(legeInstellingen().gereedRegel, '');
});

test('een ontbrekende gereed-regel blokkeert de definitieve bevestiging niet', () => {
  const versie = gemaakt();
  const getekend = { ...versie, bestuur: 'akkoord' as const, ondertekening: 'ontvangen' as const };
  const uit = voerFlowUit({ soort: 'gereed', poging: '1' }, context({
    versies: [getekend],
    rechten: rechten({ boekingen: 'schrijven' }),
    betaling: { stand: 'ontvangen', toelichting: '' },
  }));
  assert.equal(uit.ok, true);
  if (!uit.ok) return;
  assert.equal(uit.mail?.soort, 'bevestiging');
  assert.equal(uit.promoveer, true);
});

test('een late expositie biedt geen praktische mail of herinnering', () => {
  const expositie = bron({
    soort: 'expositie',
    soortLabel: 'Expositie',
    periodeVan: '2026-07-01',
    periodeTot: '2026-07-05',
    geboektOp: '2026-06-20',
    promotieAanwezig: false,
  });
  const versie = gemaakt({ bron: expositie });
  const weergave = bouwOpvolging({
    rechten: rechten({ aanvragen: 'schrijven' }),
    bron: expositie,
    instellingen: instellingen(),
    versies: [versie],
    betaling: { stand: 'niet_vastgelegd', toelichting: '' },
    vandaag: '2026-06-21',
    bekijkHref: '/beheer/aanvragen/a/',
    fout: '',
    modus: 'aan',
  });
  assert.equal(weergave.kanPraktisch, false);
  assert.equal(weergave.kanPromotie, false);
  assert.match(weergave.praktischStand, /later/i);
  const mail = voerFlowUit({ soort: 'praktisch', proef: false, poging: '1' }, context({ bron: expositie, versies: [versie], vandaag: '2026-06-21' }));
  assert.equal(mail.ok, false);
});

test('praktische mail en pdf bevatten geen toegangscode of placeholder', () => {
  const expositie = bron({
    soort: 'expositie',
    soortLabel: 'Expositie',
    periodeVan: '2026-08-01',
    periodeTot: '2026-08-03',
    geboektOp: '2026-06-01',
  });
  const versie = gemaakt({ bron: expositie, instellingen: instellingen({ bestuursakkoordVerplicht: false }) });
  const mail = voerFlowUit({ soort: 'praktisch', proef: true, poging: '1' }, context({
    bron: expositie,
    versies: [versie],
    vandaag: '2026-07-15',
    modus: 'test',
    instellingen: instellingen({ bestuursakkoordVerplicht: false }),
  }));
  assert.equal(mail.ok, true);
  if (!mail.ok || !mail.mail) return;
  const tekst = `${mail.mail.tekst}\n${mail.mail.bijlagen.map((deel) => deel.tekst).join('\n')}`;
  assert.equal(/toegangscode|slotcode|pincode|wachtwoord|\{\{/.test(tekst), false);
  assert.equal(mail.mail.bijlagen.some((deel) => deel.bestandsnaam.includes('huisregels')), true);
  const pdf = pdfBytes(`${versie.tekst}\nJosé €`);
  const latin1 = Buffer.from(pdf).toString('latin1');
  assert.match(latin1, /^%PDF/);
  assert.match(latin1, new RegExp(versie.contractnummer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(latin1, /Jos\u00e9/);
  assert.equal(Buffer.from(pdf).includes(Buffer.from('José', 'utf8')), false);
  assert.ok(pdf.includes(0xe9));
  assert.ok(pdf.includes(0x80));
});

test('een overlappende boeking en aanvraag staan samen in de waarschuwing', () => {
  const leeg = {
    documenten: [],
    mails: [],
    betalingen: [],
    activiteiten: [],
  };
  const uit = beschikbaarheidVoor(
    { id: 'a-1', status: 'nieuw', naam: 'Kim', start: '2026-09-09', eind: '2026-09-09' },
    {
      ...leeg,
      aanvragen: [
        { id: 'a-1', status: 'nieuw', naam: 'Kim', start: '2026-09-09', eind: '2026-09-09' },
        { id: 'a-2', status: 'in_behandeling', naam: 'Sanne', start: '2026-09-09', eind: '2026-09-09' },
      ],
      boekingen: [{
        id: 'b-1',
        nummer: '2026-001',
        status: 'definitief',
        start: '2026-09-09',
        eind: '2026-09-09',
        titel: 'Concert',
        huurder: 'Kwartet',
        aanbetalingBinnen: false,
      }],
      blokkades: [],
    },
  );
  assert.equal(uit.uitkomst, 'bezet');
  assert.equal(uit.blokkades.length > 0, true);
  assert.equal(uit.aanvragen.length, 1);
  assert.match(uit.tekst, /blokkade/i);
  assert.match(uit.tekst, /overlappende aanvraag/i);
});

test('een ingetrokken contractversie gaat niet opnieuw de deur uit', () => {
  const versie = gemaakt();
  versie.bestuur = 'akkoord';
  versie.verzendingen = [{
    soort: 'contract',
    idempotentie: 'contract:42:1',
    ontvanger: 'jose@voorbeeld.nl',
    werkelijk: 'jose@voorbeeld.nl',
    status: 'ingetrokken',
    berichtId: 'msg',
    op: '2026-06-02T10:00:00.000Z',
    versie: versie.versie,
  }];
  const uit = voerFlowUit({ soort: 'verzend', proef: false, poging: 'opnieuw' }, context({ versies: [versie] }));
  assert.equal(uit.ok, false);
  if (!uit.ok) assert.match(uit.melding, /ingetrokken/);
  const opnieuw = voerFlowUit({ soort: 'opnieuw', poging: '2' }, context({ versies: [versie] }));
  assert.equal(opnieuw.ok, false);
  const weergave = bouwOpvolging({
    rechten: rechten({ aanvragen: 'schrijven' }),
    bron: bron(),
    instellingen: instellingen(),
    versies: [versie],
    betaling: { stand: 'niet_vastgelegd', toelichting: '' },
    vandaag: '2026-06-02',
    bekijkHref: '/beheer/aanvragen/a/',
    fout: '',
    modus: 'aan',
  });
  assert.equal(weergave.kanVerzenden, false);
  assert.match(weergave.redenen.join(' '), /ingetrokken/);
});

test('een versie zonder verhuursoort blijft goed te keuren als de soort alleen op de aanvraag staat', () => {
  const zonderSoort = bron({ soort: '' });
  const versie = gemaakt({ bron: zonderSoort });
  const metSoort = bron({ soort: 'expositie' });
  const weergave = bouwOpvolging({
    rechten: rechten({ aanvragen: 'schrijven', instellingen: 'schrijven' }),
    bron: metSoort,
    instellingen: instellingen(),
    versies: [versie],
    betaling: { stand: 'niet_vastgelegd', toelichting: '' },
    vandaag: '2026-06-02',
    bekijkHref: '/beheer/aanvragen/a/',
    fout: '',
    modus: 'aan',
  });
  assert.equal(weergave.redenen.some((reden) => /gewijzigd/.test(reden)), false);
  assert.equal(weergave.kanGoedkeuren, true);
  const anderePrijs = bouwOpvolging({
    rechten: rechten({ aanvragen: 'schrijven', instellingen: 'schrijven' }),
    bron: bron({ soort: 'expositie', huurprijsCent: 100, restCent: 0 }),
    instellingen: instellingen(),
    versies: [versie],
    betaling: { stand: 'niet_vastgelegd', toelichting: '' },
    vandaag: '2026-06-02',
    bekijkHref: '/beheer/aanvragen/a/',
    fout: '',
    modus: 'aan',
  });
  assert.equal(anderePrijs.kanGoedkeuren, false);
  assert.match(anderePrijs.redenen.join(' '), /gewijzigd/);
});
