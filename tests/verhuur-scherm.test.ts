import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DemoBoeking } from '../src/platform/demo-data.ts';
import { maakVerhuurOverzicht, type OverzichtBetaling, type OverzichtInvoer } from '../src/platform/verhuur-overzicht.ts';
import {
  STUK_BEOORDELING_BLOKKADE,
  aandachtVan,
  beoordeelDossierActie,
  beoordeelGastheerActie,
  bouwSchermRijen,
  dossierActiesZichtbaar,
  dossierAdres,
  dossierUitBron,
  gastheerOverlapNamen,
  leesSchermFilter,
  maakDossierWeergave,
  mobielStatus,
  staatKleur,
  stukKanBeoordelen,
  stukkenStand,
  stukkenTekst,
  veiligeBestandsUrl,
  veiligeVerhuurTerug,
  verhuurQuery,
  type SchermRij,
} from '../src/platform/verhuur-scherm.ts';

function boeking(deel: Partial<DemoBoeking> & Pick<DemoBoeking, 'id' | 'status' | 'start' | 'eind'>): DemoBoeking {
  return {
    nummer: deel.id,
    interneTitel: '',
    soort: '',
    huurder: '',
    email: '',
    tarief: '',
    aanbetaling: '',
    aanbetalingBinnen: false,
    publiek: false,
    notities: '',
    relatieId: '',
    ...deel,
  };
}

function betaling(deel: Partial<OverzichtBetaling> & Pick<OverzichtBetaling, 'boekingId' | 'soort' | 'status'>): OverzichtBetaling {
  return { id: `${deel.boekingId}-${deel.soort}`, bedrag: 0, vervaldatum: '', ontvangenOp: '', ...deel };
}

function invoer(deel: Partial<OverzichtInvoer> & Pick<OverzichtInvoer, 'jaar'>): OverzichtInvoer {
  return {
    maand: null,
    boekingen: [],
    betalingen: [],
    betaalregelsZichtbaar: true,
    blokkades: [],
    bronnen: [],
    aanvragen: [],
    documenten: [],
    ...deel,
  };
}

function params(waarden: Record<string, string>): { get(naam: string): string | null } {
  return { get: (naam) => waarden[naam] ?? null };
}

describe('stukken', () => {
  test('ontbrekend bewijs blijft onbekend en wordt nooit groen', () => {
    assert.equal(stukkenStand({}), 'onbekend');
    assert.equal(stukkenStand({ contentstatus: '', inhoudStatus: null }), 'onbekend');
    assert.equal(stukkenTekst('onbekend'), 'Onbekend');
    assert.equal(staatKleur('onbekend'), 'unknown');
    assert.equal(staatKleur('compleet'), 'ok');
    assert.equal(stukKanBeoordelen(), false);
    assert.match(STUK_BEOORDELING_BLOKKADE, /nog niet opgeslagen/);
  });

  test('een expliciete indiening vraagt beoordeling en een akkoord is compleet', () => {
    assert.equal(stukkenStand({ inhoudStatus: 'ingediend' }), 'te_beoordelen');
    assert.equal(stukkenStand({ contentstatus: 'goedgekeurd' }), 'compleet');
    assert.equal(stukkenStand({ inhoudStatus: 'gevraagd' }), 'niet_aangeleverd');
    assert.equal(stukkenStand({ contentstatus: 'goedgekeurd', inhoudStatus: 'ingediend' }), 'te_beoordelen');
    assert.equal(stukkenStand({ inhoudStatus: 'niet_vereist' }), 'onbekend');
  });

  test('onbekend telt niet als open taak, een open restant en een expositie zonder gastheer wel', () => {
    assert.deepEqual(
      aandachtVan({
        herkomst: 'boeking',
        bezet: true,
        soort: 'concert',
        heeftGastheer: false,
        aanbetaling: 'onbekend',
        rest: 'onbekend',
        stukken: 'onbekend',
      }),
      { nodig: false, taken: [] },
    );
    const open = aandachtVan({
      herkomst: 'boeking',
      bezet: true,
      soort: 'expositie',
      heeftGastheer: false,
      aanbetaling: 'afgerond',
      rest: 'openstaand',
      stukken: 'te_beoordelen',
    });
    assert.equal(open.nodig, true);
    assert.equal(open.taken.length, 3);
    assert.equal(
      aandachtVan({
        herkomst: 'vrij',
        bezet: false,
        soort: '',
        heeftGastheer: false,
        aanbetaling: 'openstaand',
        rest: 'openstaand',
        stukken: 'te_beoordelen',
      }).nodig,
      false,
    );
  });
});

describe('gastheeractie', () => {
  test('alleen koppelen of bevestigd losmaken, nooit een duplicaat', () => {
    assert.equal(beoordeelGastheerActie({ actie: 'annuleer', gekozenId: '1', huidigeId: '', bevestig: '' }).ok, false);
    assert.equal(beoordeelGastheerActie({ actie: 'gastheer', gekozenId: '4', huidigeId: '4', bevestig: '' }).ok, false);
    assert.equal(beoordeelGastheerActie({ actie: 'gastheer', gekozenId: '5', huidigeId: '4', bevestig: '' }).ok, false);
    assert.deepEqual(beoordeelGastheerActie({ actie: 'gastheer', gekozenId: '5', huidigeId: '4', bevestig: 'ja' }), {
      ok: true,
      gastheerId: '5',
    });
    assert.equal(beoordeelGastheerActie({ actie: 'gastheer', gekozenId: '', huidigeId: '4', bevestig: '' }).ok, false);
    assert.deepEqual(beoordeelGastheerActie({ actie: 'gastheer', gekozenId: '', huidigeId: '4', bevestig: 'ja' }), {
      ok: true,
      gastheerId: '',
    });
    assert.deepEqual(beoordeelGastheerActie({ actie: 'gastheer', gekozenId: '8', huidigeId: '', bevestig: '' }), {
      ok: true,
      gastheerId: '8',
    });
  });

  test('een gastheer in een overlappende bezette periode wordt geweigerd, een geannuleerde niet', () => {
    const boekingen = [
      { id: '67', status: 'definitief', start: '2027-07-10', eind: '2027-07-11', huurder: 'Mirjam Withaar', gastheerId: '' },
      { id: '70', status: 'definitief', start: '2027-07-10', eind: '2027-07-11', huurder: 'Andere huurder', gastheerId: 'g' },
      { id: '76', status: 'geannuleerd', start: '2027-07-10', eind: '2027-07-11', huurder: 'Mariet van Hovell tot Westerflier', gastheerId: 'g' },
      { id: '80', status: 'definitief', start: '2027-08-01', eind: '2027-08-02', huurder: 'Later', gastheerId: 'g' },
    ];
    const overlap = gastheerOverlapNamen({ boekingId: '67', gastheerId: 'g', boekingen });
    assert.deepEqual(overlap, ['Andere huurder']);
    const besluit = beoordeelGastheerActie({
      actie: 'gastheer',
      gekozenId: 'g',
      huidigeId: '',
      bevestig: 'ja',
      overlapNamen: overlap,
    });
    assert.equal(besluit.ok, false);
    if (!besluit.ok) assert.match(besluit.melding, /Andere huurder/);
    assert.deepEqual(gastheerOverlapNamen({ boekingId: '67', gastheerId: 'vrij', boekingen }), []);
  });
});

describe('agendaweergave', () => {
  const withaar = boeking({
    id: '67',
    status: 'migratie_vastgelegd',
    start: '2027-07-10',
    eind: '2027-07-11',
    huurder: 'Mirjam Withaar',
    medeExposanten: 'Mede-exposant',
    soort: 'expositie',
    notities: 'Verplaatst',
  });
  const hovell = boeking({
    id: '76',
    status: 'geannuleerd',
    start: '2027-07-10',
    eind: '2027-07-11',
    huurder: 'Mariet van Hovell tot Westerflier',
  });

  test('4 november 2026: mei blijft vrij en de geannuleerde huur is niet bezet', () => {
    const overzicht = maakVerhuurOverzicht(invoer({
      jaar: 2027,
      maand: 5,
      boekingen: [withaar, hovell],
      betalingen: [
        betaling({ boekingId: '67', soort: 'aanbetaling', status: 'ontvangen', bedrag: 100 }),
        betaling({ boekingId: '67', soort: 'restant', status: 'open', bedrag: 50 }),
      ],
    }));
    const scherm = bouwSchermRijen({
      overzicht,
      boekingen: [withaar, hovell],
      gastheren: [],
      toewijzingen: [],
      activiteiten: [],
      zoek: '',
      alleenAandacht: false,
    });
    const mei = scherm.rijen.find((rij) => rij.start === '2027-05-08');
    assert.equal(mei?.herkomst, 'vrij');
    assert.equal(mei?.huurder, 'Vrij weekend');
    assert.equal(mei?.bezet, false);
    assert.equal(mei?.aandacht, false);
    assert.equal(scherm.rijen.some((rij) => rij.huurder.includes('Withaar')), false);
    assert.equal(scherm.rijen.some((rij) => rij.huurder.includes('Hovell')), false);
  });

  test('zoeken en alleen aandacht filteren de maand, een aanvraag vult geen rij', () => {
    const overzicht = maakVerhuurOverzicht(invoer({
      jaar: 2027,
      maand: 7,
      boekingen: [withaar, hovell],
      aanvragen: [{
        id: 'a1',
        status: 'nieuw',
        naam: 'Nieuwe aanvraag',
        email: 'a@example.test',
        telefoon: '',
        adres: '',
        soort: 'expositie',
        start: '2027-07-17',
        eind: '2027-07-18',
        personen: '',
        toelichting: '',
        binnengekomen: '2026-11-01',
      }],
      betalingen: [
        betaling({ boekingId: '67', soort: 'aanbetaling', status: 'ontvangen', bedrag: 100 }),
        betaling({ boekingId: '67', soort: 'restant', status: 'open', bedrag: 390 }),
      ],
    }));
    const scherm = bouwSchermRijen({
      overzicht,
      boekingen: [withaar, hovell],
      gastheren: [{ id: 'g', naam: 'Hans', actief: true }],
      toewijzingen: [],
      activiteiten: [{ boekingId: '67', inhoudStatus: 'ingediend', tabel: 'publieke_activiteiten' }],
      zoek: 'withaar',
      alleenAandacht: true,
    });
    assert.equal(scherm.rijen.length, 1);
    assert.equal(scherm.rijen[0].huurder, 'Mirjam Withaar');
    assert.match(scherm.rijen[0].activiteit, /Expositie/);
    assert.match(scherm.rijen[0].activiteit, /Mede-exposant/);
    assert.equal(scherm.rijen[0].stukkenTekst, 'Te beoordelen');
    assert.equal(scherm.rijen[0].restTekst, 'Open');
    assert.equal(scherm.rijen[0].contractTekst, 'Onbekend');
    assert.equal(scherm.rijen[0].aandacht, true);
    assert.equal(scherm.aandachtAantal >= 1, true);
    assert.equal(overzicht.aanvragen.length, 1);
    assert.equal(overzicht.rijen.some((rij) => rij.huurder === 'Nieuwe aanvraag'), false);
    const geannuleerd = bouwSchermRijen({
      overzicht,
      boekingen: [withaar, hovell],
      gastheren: [],
      toewijzingen: [],
      activiteiten: [],
      zoek: 'hovell',
      alleenAandacht: false,
    }).rijen[0];
    assert.equal(geannuleerd.bezet, false);
    assert.match(geannuleerd.activiteit, /Geannuleerd/);
    assert.equal(mobielStatus(geannuleerd), 'Geannuleerd');
  });

  test('het dossier toont de ledger en geen verzonnen contract of beoordelknop', () => {
    const overzicht = maakVerhuurOverzicht(invoer({
      jaar: 2027,
      maand: 7,
      boekingen: [{ ...withaar, gastheerId: 'g' }],
      betalingen: [
        betaling({ boekingId: '67', soort: 'aanbetaling', status: 'ontvangen', bedrag: 100, ontvangenOp: '2026-01-02' }),
        betaling({ boekingId: '67', soort: 'restant', status: 'open', bedrag: 390 }),
      ],
    }));
    const rij = bouwSchermRijen({
      overzicht,
      boekingen: [{ ...withaar, gastheerId: 'g' }],
      gastheren: [{ id: 'g', naam: 'Hans', actief: true }],
      toewijzingen: [{ boekingId: '67', relatieId: 'n', relatieNaam: 'Nelleke' }],
      activiteiten: [{
        boekingId: '67',
        tabel: 'publieke_activiteiten',
        inhoudStatus: 'ingediend',
        volledigeOmschrijving: 'Schilderijen over de Waal.',
        fotoPad: '/foto/expositie.jpg',
        inhoudVersie: 2,
      }],
      zoek: 'withaar',
      alleenAandacht: false,
    }).rijen[0] as SchermRij;
    const dossier = maakDossierWeergave({
      rij,
      boeking: { ...withaar, gastheerId: 'g', email: 'mirjam@example.test', notities: 'Verplaatst' },
      relatie: { naam: 'Mirjam Withaar', organisatie: '', email: 'anders@example.test', telefoon: '06 00000000', adres: 'Dorp 1' },
      activiteit: {
        boekingId: '67',
        inhoudStatus: 'ingediend',
        volledigeOmschrijving: 'Schilderijen over de Waal.',
        fotoPad: '/foto/expositie.jpg',
        inhoudVersie: 2,
      },
      gastheren: [{ id: 'g', naam: 'Hans', actief: true }, { id: 'n', naam: 'Nelleke', actief: true }],
      toewijzingen: [{ boekingId: '67', relatieId: 'n', relatieNaam: 'Nelleke' }],
      documenten: [{ boekingId: '67', naam: 'contract.pdf', soort: 'contract', datum: '2026-01-01', url: 'javascript:alert(1)' }],
      betalingen: [
        { boekingId: '67', soort: 'aanbetaling', bedrag: 100, status: 'ontvangen' },
        { boekingId: '67', soort: 'restant', bedrag: 390, status: 'open' },
      ],
      betaalregelsZichtbaar: true,
      intake: [{ naam: 'foto.jpg', url: 'https://example.test/bestand' }],
    });
    assert.equal(dossier.gastheerNaam, 'Hans');
    assert.deepEqual(dossier.historie, ['Nelleke']);
    assert.match(dossier.stukTekst, /Schilderijen/);
    assert.equal(dossier.fotoUrl, '/foto/expositie.jpg');
    assert.equal(dossier.documenten[0].url, null);
    assert.equal(dossier.intake[0].url, 'https://example.test/bestand');
    assert.match(dossier.contractTekst, /Onbekend/);
    assert.equal(dossier.betalingen[0].tekst, 'Ontvangen');
    assert.match(dossier.betalingen[1].detail, /390/);
    assert.match(dossier.betaalToelichting, /aanbetaling_ontvangen beslist niet/);
    assert.equal(stukKanBeoordelen(), false);
    const bron = dossierUitBron({
      boeking: { ...withaar, gastheerId: 'g', email: 'mirjam@example.test' },
      invoer: invoer({
        jaar: 2027,
        maand: 7,
        boekingen: [{ ...withaar, gastheerId: 'g' }],
        betalingen: [
          betaling({ boekingId: '67', soort: 'aanbetaling', status: 'ontvangen', bedrag: 100, ontvangenOp: '2026-01-02' }),
          betaling({ boekingId: '67', soort: 'restant', status: 'open', bedrag: 390 }),
        ],
      }),
      relatie: { naam: 'Mirjam Withaar', organisatie: '', email: 'anders@example.test', telefoon: '06 00000000', adres: 'Dorp 1' },
      activiteit: { titel: 'Schilderijen', zichtbaarheid: 'publiek', levenscyclus: 'actief' },
      sporen: {
        verzendingen: [],
        verzendingFout: null,
        audit: [{ actie: 'gastheer_gekoppeld', op: '2026-11-08', actorType: 'gebruiker', van: '', naar: 'mirjam@example.test' }],
        auditFout: null,
        auditZichtbaar: true,
      },
    });
    assert.equal(bron.gegevens.some((regel) => regel.label === 'Mede-exposant' && regel.waarde === 'Mede-exposant'), true);
    assert.equal(bron.gegevens.some((regel) => regel.label === 'Bezetting' && regel.waarde === 'Bezet'), true);
    assert.match(bron.geschiedenis.map((regel) => regel.waarde).join(' '), /adres verborgen/);
    assert.equal(bron.geschiedenis.some((regel) => regel.waarde.includes('mirjam@example.test')), false);
    assert.match(bron.betaling.map((regel) => regel.waarde).join(' '), /390/);
  });
});

describe('adres en filter', () => {
  test('zonder maand opent de huidige maand en de query bewaart het dossier', () => {
    assert.deepEqual(leesSchermFilter(params({ jaar: '2027' }), '2026-11-08'), {
      jaar: 2027,
      maand: 11,
      zoek: '',
      aandacht: false,
    });
    assert.equal(leesSchermFilter(params({ jaar: '2027', maand: 'alle' }), '2026-11-08').maand, null);
    assert.equal(
      verhuurQuery(params({ jaar: '2027', maand: '5', q: 'marieke', bron: 'demo' }), { dossier: '67', aandacht: '1' }),
      '/beheer/verhuur/?jaar=2027&maand=5&q=marieke&aandacht=1&bron=demo&dossier=67',
    );
    assert.equal(verhuurQuery(params({ dossier: '67', melding: 'weg' }), { dossier: null }).includes('melding'), false);
    assert.equal(dossierAdres('67', params({ jaar: '2027', maand: '7', q: 'withaar' })), '/beheer/verhuur/?jaar=2027&maand=7&q=withaar&dossier=67');
    assert.equal(veiligeVerhuurTerug('/beheer/verhuur/?jaar=2027&maand=7&q=withaar&dossier=67'), '/beheer/verhuur/?jaar=2027&maand=7&q=withaar&dossier=67');
    assert.equal(veiligeVerhuurTerug('https://evil.test/beheer/verhuur/'), '/beheer/verhuur/');
    assert.equal(veiligeVerhuurTerug('//evil.test/beheer/verhuur/'), '/beheer/verhuur/');
    assert.equal(veiligeVerhuurTerug('/beheer/boekingen/1/'), '/beheer/verhuur/');
  });

  test('dossieracties volgen de bestaande statuspoort en laten mail en publicatie dicht', () => {
    assert.deepEqual(dossierActiesZichtbaar('optie'), {
      verleng: true,
      definitief: true,
      annuleer: true,
      afronden: false,
      migratie: false,
    });
    assert.deepEqual(dossierActiesZichtbaar('definitief'), {
      verleng: false,
      definitief: false,
      annuleer: true,
      afronden: true,
      migratie: false,
    });
    assert.equal(dossierActiesZichtbaar('migratie_vastgelegd').migratie, true);
    assert.equal(dossierActiesZichtbaar('migratie_vastgelegd').definitief, false);
    assert.equal(dossierActiesZichtbaar('migratie_vastgelegd').annuleer, true);
    assert.equal(dossierActiesZichtbaar('geannuleerd').annuleer, false);
    assert.equal(dossierActiesZichtbaar('afgerond').afronden, false);

    const basis = {
      status: 'optie',
      reden: 'Afgesproken zonder aanbetaling',
      omschrijving: '',
      bevestig: 'ja',
      incidentId: '',
      openIncidentIds: [] as string[],
    };
    assert.deepEqual(beoordeelDossierActie({ ...basis, actie: 'definitief' }), {
      ok: true,
      soort: 'handmatig_definitief',
      reden: 'Afgesproken zonder aanbetaling',
    });
    assert.equal(beoordeelDossierActie({ ...basis, actie: 'definitief', bevestig: '' }).ok, false);
    assert.equal(beoordeelDossierActie({ ...basis, actie: 'definitief', reden: '  ' }).ok, false);
    assert.equal(beoordeelDossierActie({ ...basis, actie: 'definitief', status: 'definitief' }).ok, false);
    assert.equal(beoordeelDossierActie({ ...basis, actie: 'definitief', status: 'migratie_vastgelegd' }).ok, false);
    assert.deepEqual(beoordeelDossierActie({ ...basis, actie: 'verleng' }), { ok: true, soort: 'verleng' });
    assert.equal(beoordeelDossierActie({ ...basis, actie: 'verleng', status: 'definitief' }).ok, false);
    assert.deepEqual(beoordeelDossierActie({ ...basis, actie: 'annuleer', status: 'migratie_vastgelegd', reden: 'Weg' }), {
      ok: true,
      soort: 'annuleer',
      reden: 'Weg',
    });
    assert.equal(beoordeelDossierActie({ ...basis, actie: 'annuleer', status: 'afgerond' }).ok, false);
    assert.equal(beoordeelDossierActie({ ...basis, actie: 'annuleer', status: 'geannuleerd' }).ok, false);
    assert.deepEqual(beoordeelDossierActie({ ...basis, actie: 'sluit', status: 'definitief', reden: '' }), {
      ok: true,
      soort: 'sluit',
      reden: '',
    });
    assert.equal(beoordeelDossierActie({ ...basis, actie: 'sluit', status: 'definitief', openIncidentIds: ['9'] }).ok, false);
    assert.equal(beoordeelDossierActie({ ...basis, actie: 'sluit', status: 'optie' }).ok, false);
    assert.deepEqual(beoordeelDossierActie({ ...basis, actie: 'incident', omschrijving: ' Lekkage ' }), {
      ok: true,
      soort: 'incident',
      omschrijving: 'Lekkage',
    });
    assert.equal(beoordeelDossierActie({ ...basis, actie: 'incident', omschrijving: ' ' }).ok, false);
    assert.deepEqual(
      beoordeelDossierActie({ ...basis, actie: 'incident_sluiten', incidentId: '9', openIncidentIds: ['9'] }),
      { ok: true, soort: 'incident_sluiten', incidentId: '9' },
    );
    assert.equal(beoordeelDossierActie({ ...basis, actie: 'incident_sluiten', incidentId: '8', openIncidentIds: ['9'] }).ok, false);

    for (const actie of ['betaling', 'publiceren', 'goedkeuren', 'afkeuren', 'gastheer', 'mailverstuur', 'datum']) {
      const uit = beoordeelDossierActie({ ...basis, actie });
      assert.equal(uit.ok, false, actie);
      if (!uit.ok) assert.match(uit.melding, /niets gewijzigd/i);
    }
    const betaling = beoordeelDossierActie({ ...basis, actie: 'betaling' });
    if (!betaling.ok) assert.match(betaling.melding, /bevestigingsmail/);
    const stuk = beoordeelDossierActie({ ...basis, actie: 'goedkeuren' });
    if (!stuk.ok) assert.match(stuk.melding, /publiceert|opslag/);
  });

  test('een onveilig bestandspad wordt geen link', () => {
    assert.equal(veiligeBestandsUrl('javascript:alert(1)'), null);
    assert.equal(veiligeBestandsUrl('//evil.test/a.jpg'), null);
    assert.equal(veiligeBestandsUrl('/foto/a.jpg'), '/foto/a.jpg');
    assert.equal(veiligeBestandsUrl('https://cdn.example/a.jpg'), 'https://cdn.example/a.jpg');
  });
});
