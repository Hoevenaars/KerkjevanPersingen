import assert from 'node:assert/strict';
import test from 'node:test';
import type { Actor } from '../src/lib/operatie/kern.ts';
import {
  bewaarDefinitiefContract,
  type ContractWizardSessie,
} from '../src/lib/operatie/contract-wizard-sessie.ts';
import {
  adresUitAanvraagOfWizard,
  betaalregelsUitWizard,
  controleerWizard,
  euroNaarCent,
  legeWizardVelden,
  maakDefinitiefContract,
  planBetaalregels,
  toonContractWizard,
  wizardUitDossier,
  type ContractWizardVelden,
} from '../src/platform/contract-wizard.ts';
import { vingerafdruk } from '../src/platform/documentenflow.ts';
import { legeInstellingen, leesInstellingen } from '../src/platform/documentenflow.ts';
import { VERHUURDER } from '../src/platform/verhuurder.ts';

const beheerder: Actor = {
  type: 'gebruiker',
  naam: 'Nelleke',
  rechten: { isSuperAdmin: false, perModule: { aanvragen: 'schrijven' } },
};

function compleet(extra: Partial<ContractWizardVelden> = {}): ContractWizardVelden {
  return {
    ...legeWizardVelden(),
    naam: 'Ada Berg',
    straat: 'Molenstraat',
    huisnummer: '3',
    postcode: '6575 AB',
    woonplaats: 'Persingen',
    email: 'ada@voorbeeld.nl',
    telefoon: '06 10 20 30 40',
    soortLabel: 'Expositie',
    activiteit: 'Expositie: Ada Berg',
    periodeVan: '2027-05-15',
    periodeTot: '2027-05-16',
    tijdVan: '10:00',
    tijdTot: '17:00',
    opbouw: 'vrijdag 9:00',
    afbouw: 'zondag 18:00',
    personen: '',
    contactpersoon: 'Ada Berg',
    huurprijs: '490,00',
    aanbetaling: '0',
    restVerval: '2027-04-01',
    ondertekenaarNaam: 'Hans Maas',
    ondertekenaarFunctie: 'bestuur',
    tenaamstelling: 'Stichting Het Kerkje van Persingen',
    iban: 'NL91 ABNA 0417 1643 00',
    voorwaardenVastgesteldOp: '2026-01-01',
    huisregelsVastgesteldOp: '2026-01-01',
    ...extra,
  };
}

test('eurobedragen worden centen, ook met een euroteken', () => {
  assert.equal(euroNaarCent('490.00'), 49000);
  assert.equal(euroNaarCent('€ 1.250,50'), 125050);
  assert.equal(euroNaarCent('0'), 0);
  assert.equal(euroNaarCent(''), null);
});

test('lege verplichte velden blijven een gat', () => {
  const gaten = controleerWizard(legeWizardVelden());
  assert.ok(gaten.includes('Naam huurder'));
  assert.ok(gaten.includes('Gebruik van'));
  assert.ok(gaten.includes('Aanbetaling (vul 0 in als die er niet is)'));
});

test('een aanbetaling van 0 heeft geen vervaldatum nodig', () => {
  const gemaakt = maakDefinitiefContract(compleet(), '44', 1, '2026-11-15');
  assert.ok(!('fout' in gemaakt));
  if ('fout' in gemaakt) return;
  assert.match(gemaakt.tekst, /Totale overeengekomen huurprijs: € 490,00/);
  assert.match(gemaakt.tekst, /Aanbetaling \/ reserveringsbedrag: niet van toepassing/);
  assert.match(gemaakt.tekst, /Restbetaling: € 490,00/);
  assert.match(gemaakt.tekst, /Aantal personen: niet van toepassing/);
  assert.equal(gemaakt.nummer, 'KVP-20270515-44-v1');
});

test('een restbedrag van 0 maakt de restbetaling niet van toepassing', () => {
  const gemaakt = maakDefinitiefContract(compleet({ huurprijs: '100', aanbetaling: '100', aanbetalingVerval: '2027-01-01' }), '44', 1, '2026-11-15');
  assert.ok(!('fout' in gemaakt));
  if ('fout' in gemaakt) return;
  assert.match(gemaakt.tekst, /Restbetaling: niet van toepassing/);
  assert.match(gemaakt.tekst, /Vervaldatum restbetaling: niet van toepassing/);
});

test('bekende dossiergegevens staan ingevuld en gebruikstijden blijven leeg', () => {
  const velden = wizardUitDossier({
    boekingId: 'b-044',
    soortLabel: 'Expositie',
    activiteit: 'Expositie: Ada Berg',
    naam: 'Ada Berg',
    email: 'ada@voorbeeld.nl',
    telefoon: '06 10 20 30 40',
    adres: 'Molenstraat 3, 6575 AB Persingen',
    straat: '',
    huisnummer: '',
    toevoeging: '',
    postcode: '',
    woonplaats: '',
    periodeVan: '2027-05-15',
    periodeTot: '2027-05-16',
    personen: '1',
    huurprijs: '490.00',
    aanbetaling: '€ 100',
  }, legeInstellingen());
  assert.equal(velden.naam, 'Ada Berg');
  assert.equal(velden.huurprijs, '490.00');
  assert.equal(velden.aanbetaling, '100');
  assert.equal(velden.straat, '');
  assert.equal(velden.tijdVan, '');
  assert.equal(velden.iban, '');
});

test('een leeg contract krijgt de gepubliceerde verhuurder', () => {
  const gelezen = leesInstellingen([]);
  assert.equal(gelezen.iban, VERHUURDER.iban);
  assert.equal(gelezen.ondertekenaarNaam, 'Nelleke van der Pol');
  assert.equal(gelezen.gereedRegel, '');
  assert.equal(leesInstellingen([{ sleutel: 'documentenflow_iban', waarde: '' }]).iban, '');
  const velden = wizardUitDossier({
    boekingId: '44',
    soortLabel: 'Expositie',
    activiteit: 'Ada',
    naam: 'Ada Berg',
    email: 'ada@voorbeeld.nl',
    telefoon: '',
    adres: '',
    straat: 'Molenstraat',
    huisnummer: '3',
    toevoeging: '',
    postcode: '6575 AB',
    woonplaats: 'Persingen',
    periodeVan: '2027-05-15',
    periodeTot: '2027-05-16',
    personen: '',
    huurprijs: '',
    aanbetaling: '',
  }, gelezen);
  assert.equal(velden.tenaamstelling, 'Stichting Het Kerkje van Persingen');
  assert.equal(velden.voorwaardenVastgesteldOp, '2026-11-15');
});

test('definitief maken schrijft het contract en laat de status staan', async () => {
  const schrijfsels: { tabel: string; waarden: Record<string, unknown> }[] = [];
  const tabellen: Record<string, Record<string, unknown>[]> = {
    contractversies: [],
    boekingen: [{ id: 44, status: 'optie', verhuurtype_sleutel: 'expositie' }],
    aanvragen: [{ id: 104, status: 'goedgekeurd' }],
    instellingen: [],
  };
  const client: ContractWizardSessie = {
    from(tabel) {
      const filters: { kolom: string; waarde: unknown }[] = [];
      let oplopend = true;
      let limiet = 100;
      const past = (rij: Record<string, unknown>) => filters.every((filter) => rij[filter.kolom] === filter.waarde);
      const query = {
        select() {
          return query;
        },
        eq(kolom: string, waarde: unknown) {
          filters.push({ kolom, waarde });
          return query;
        },
        order(_kolom: string, opties?: { ascending?: boolean }) {
          oplopend = opties?.ascending !== false;
          return query;
        },
        limit(aantal: number) {
          limiet = aantal;
          return query;
        },
        maybeSingle() {
          return Promise.resolve({ data: tabellen[tabel]?.[0] ?? null, error: null });
        },
        then(resolve: (waarde: { data: Record<string, unknown>[] | null; error: null }) => unknown, reject?: (reden: unknown) => unknown) {
          const gevonden = (tabellen[tabel] ?? []).filter(past).slice(0, limiet);
          if (!oplopend) gevonden.reverse();
          return Promise.resolve({ data: gevonden, error: null }).then(resolve, reject);
        },
      };
      return {
        select: query.select,
        update(waarden: Record<string, unknown>) {
          schrijfsels.push({ tabel, waarden });
          return query;
        },
        insert(rij: Record<string, unknown>) {
          schrijfsels.push({ tabel, waarden: rij });
          const opgeslagen = { id: 1, ...rij };
          tabellen[tabel] = [...(tabellen[tabel] ?? []), opgeslagen];
          return query;
        },
        upsert(rij: Record<string, unknown>) {
          schrijfsels.push({ tabel, waarden: rij });
          tabellen[tabel] = [...(tabellen[tabel] ?? []), rij];
          return query;
        },
      };
    },
  };
  const uit = await bewaarDefinitiefContract(client, { boekingId: 44, aanvraagId: 104, velden: compleet(), actor: beheerder });
  assert.equal(uit.ok, true);
  assert.match(uit.melding, /opgeslagen/);
  assert.match(uit.melding, /geen mail/);
  const versie = schrijfsels.find((item) => item.tabel === 'contractversies');
  assert.equal(versie?.waarden.bestuur_verplicht, true);
  assert.match(String(versie?.waarden.tekst), /Huurovereenkomst/);
  const verwacht = maakDefinitiefContract(compleet(), '44', 1, String(versie?.waarden.opgesteld_op), 'expositie');
  assert.ok(!('fout' in verwacht));
  if (!('fout' in verwacht)) assert.equal(versie?.waarden.vingerafdruk, verwacht.vingerafdruk);
  const rest = schrijfsels.find((item) => item.tabel === 'betalingen');
  assert.equal(rest?.waarden.soort, 'restant');
  assert.equal(rest?.waarden.bedrag, 490);
  assert.equal(rest?.waarden.vervaldatum, '2027-04-01');
  for (const item of schrijfsels) {
    if (item.tabel === 'boekingen' || item.tabel === 'aanvragen') assert.equal('status' in item.waarden, false);
  }
  assert.equal(tabellen.boekingen[0].status, 'optie');
  assert.equal(tabellen.aanvragen[0].status, 'goedgekeurd');
});

test('een nieuwe versie blijft te openen en de vingerafdruk volgt soort en betaaldatum', () => {
  assert.equal(toonContractWizard(true, true, false), false);
  assert.equal(toonContractWizard(true, true, true), true);
  assert.equal(toonContractWizard(false, false, true), false);
  const velden = compleet();
  const gemaakt = maakDefinitiefContract(velden, '44', 2, '2026-11-15', 'expositie');
  assert.ok(!('fout' in gemaakt));
  if ('fout' in gemaakt) return;
  assert.equal(gemaakt.bron.soort, 'expositie');
  const zonderSoort = maakDefinitiefContract(velden, '44', 2, '2026-11-15');
  assert.ok(!('fout' in zonderSoort));
  if (!('fout' in zonderSoort)) assert.notEqual(gemaakt.vingerafdruk, zonderSoort.vingerafdruk);
  const regels = betaalregelsUitWizard(velden);
  assert.ok(Array.isArray(regels));
  if (!Array.isArray(regels)) return;
  const dossier = vingerafdruk({
    ...gemaakt.bron,
    restCent: 49000,
    restVerval: '2027-04-01',
    aanbetalingCent: 0,
    aanbetalingVerval: '',
  }, gemaakt.afspraken, gemaakt.instellingen);
  assert.equal(dossier, gemaakt.vingerafdruk);
  const leeg = { straat: '', huisnummer: '', toevoeging: '', postcode: '', woonplaats: '' };
  assert.equal(adresUitAanvraagOfWizard({ ...leeg, straat: 'Dorpstraat' }, { straat: 'Anders' }).straat, 'Dorpstraat');
  assert.equal(adresUitAanvraagOfWizard(leeg, { straat: 'Molenstraat', huisnummer: '3' }).huisnummer, '3');
});

test('een ontvangen bedrag dat afwijkt blokkeert, een open regel wordt bijgewerkt', () => {
  const plan = betaalregelsUitWizard(compleet({ aanbetaling: '100', aanbetalingVerval: '2027-01-15' }));
  assert.ok(Array.isArray(plan));
  if (!Array.isArray(plan)) return;
  const fout = planBetaalregels([
    { id: 1, soort: 'aanbetaling', bedrag: 50, status: 'ontvangen', vervaldatum: '2027-01-15' },
  ], plan);
  assert.ok('fout' in fout);
  const bijgewerkt = planBetaalregels([
    { id: 2, soort: 'restant', bedrag: 100, status: 'open', vervaldatum: '2020-01-01' },
    { id: 3, soort: 'aanbetaling', bedrag: 10, status: 'geannuleerd', vervaldatum: '' },
  ], plan);
  assert.ok(!('fout' in bijgewerkt));
  if ('fout' in bijgewerkt) return;
  assert.equal(bijgewerkt.inserts.length, 0);
  assert.equal(bijgewerkt.updates.find((regel) => regel.id === 3)?.status, 'open');
  assert.equal(bijgewerkt.updates.find((regel) => regel.id === 3)?.bedrag, 100);
  assert.equal(bijgewerkt.updates.find((regel) => regel.id === 2)?.vervaldatum, '2027-04-01');
});

function sessieMet(tabellen: Record<string, Record<string, unknown>[]>): {
  client: ContractWizardSessie;
  schrijfsels: { tabel: string; waarden: Record<string, unknown> }[];
} {
  const schrijfsels: { tabel: string; waarden: Record<string, unknown> }[] = [];
  const client: ContractWizardSessie = {
    from(tabel) {
      const filters: { kolom: string; waarde: unknown }[] = [];
      let oplopend = true;
      let limiet = 100;
      let soort: 'lees' | 'schrijf' = 'lees';
      let waarden: Record<string, unknown> = {};
      let genoteerd = false;
      const noteer = () => {
        if (soort !== 'schrijf' || genoteerd) return;
        genoteerd = true;
        schrijfsels.push({ tabel, waarden });
      };
      const gevondenRijen = () => {
        const gewoon = filters.filter((filter) => !filter.kolom.startsWith('__'));
        const gevonden = (tabellen[tabel] ?? []).filter((rij) => gewoon.every((filter) => rij[filter.kolom] === filter.waarde));
        const orderFilter = filters.find((filter) => filter.kolom.startsWith('__order_'));
        if (orderFilter) {
          const kolom = orderFilter.kolom.slice('__order_'.length);
          gevonden.sort((a, b) => Number(a[kolom]) - Number(b[kolom]));
          if (orderFilter.waarde === false) gevonden.reverse();
        }
        return gevonden.slice(0, limiet);
      };
      const query = {
        select() {
          return query;
        },
        eq(kolom: string, waarde: unknown) {
          filters.push({ kolom, waarde });
          return query;
        },
        order(kolom: string, opties?: { ascending?: boolean }) {
          oplopend = opties?.ascending !== false;
          filters.push({ kolom: `__order_${kolom}`, waarde: oplopend });
          return query;
        },
        limit(aantal: number) {
          limiet = aantal;
          return query;
        },
        maybeSingle() {
          noteer();
          return Promise.resolve({ data: gevondenRijen()[0] ?? null, error: null });
        },
        then(resolve: (waarde: { data: Record<string, unknown>[] | null; error: null }) => unknown, reject?: (reden: unknown) => unknown) {
          noteer();
          return Promise.resolve({ data: gevondenRijen(), error: null }).then(resolve, reject);
        },
      };
      return {
        select: query.select,
        update(volgende: Record<string, unknown>) {
          soort = 'schrijf';
          waarden = volgende;
          return query;
        },
        insert(rij: Record<string, unknown>) {
          soort = 'schrijf';
          waarden = rij;
          const opgeslagen = { id: (tabellen[tabel]?.length ?? 0) + 1, ...rij };
          tabellen[tabel] = [...(tabellen[tabel] ?? []), opgeslagen];
          return query;
        },
        upsert(rij: Record<string, unknown>) {
          soort = 'schrijf';
          waarden = rij;
          tabellen[tabel] = [...(tabellen[tabel] ?? []), rij];
          return query;
        },
      };
    },
  };
  return { client, schrijfsels };
}

test('een nieuwe versie laat de vorige direct vervallen', async () => {
  const eerste = maakDefinitiefContract(compleet(), '44', 1, '2026-11-15');
  assert.ok(!('fout' in eerste));
  if ('fout' in eerste) return;
  const tabellen: Record<string, Record<string, unknown>[]> = {
    contractversies: [{
      id: 1,
      boeking_id: 44,
      versie: 1,
      contractnummer: eerste.nummer,
      vingerafdruk: eerste.vingerafdruk,
      afspraken: { wizard: compleet() },
    }],
    contract_tekeningen: [
      { id: 9, boeking_id: 44, versie: 1, ondertekend_op: null, token_hash: 'oud' },
    ],
    contract_verzendingen: [
      { id: 3, boeking_id: 44, versie: 1, soort: 'contract', status: 'verzonden' },
      { id: 4, boeking_id: 44, versie: 1, soort: 'proef', status: 'verzonden' },
    ],
    boekingen: [{ id: 44, status: 'optie' }],
    aanvragen: [{ id: 104, status: 'goedgekeurd' }],
    instellingen: [],
  };
  const { client, schrijfsels } = sessieMet(tabellen);
  const uit = await bewaarDefinitiefContract(client, {
    boekingId: 44,
    aanvraagId: 104,
    velden: compleet(),
    actor: beheerder,
    vervang: true,
  });
  assert.equal(uit.ok, true);
  assert.match(uit.melding, /vervallen/);
  assert.match(uit.melding, /geen mail/);
  const versies = schrijfsels.filter((item) => item.tabel === 'contractversies' && item.waarden.versie === 2);
  assert.equal(versies.length, 1);
  assert.equal(versies[0]?.waarden.bestuur, 'open');
  assert.equal(versies[0]?.waarden.ondertekening, 'open');
  assert.equal(tabellen.boekingen[0]?.status, 'optie');
  const tekeningen = schrijfsels.filter((item) => item.tabel === 'contract_tekeningen');
  assert.equal(tekeningen.length, 1);
  assert.equal(tekeningen[0]?.waarden.verloopt_op, '1970-01-01T00:00:00.000Z');
  assert.notEqual(tekeningen[0]?.waarden.token_hash, 'oud');
  const ingetrokken = schrijfsels.filter((item) => item.tabel === 'contract_verzendingen');
  assert.equal(ingetrokken.length, 1);
  assert.equal(ingetrokken[0]?.waarden.status, 'ingetrokken');
});

test('dezelfde gegevens zonder nieuwe versie laten de tekenlink staan', async () => {
  const eerste = maakDefinitiefContract(compleet(), '44', 1, '2026-11-15');
  assert.ok(!('fout' in eerste));
  if ('fout' in eerste) return;
  const tabellen: Record<string, Record<string, unknown>[]> = {
    contractversies: [{
      id: 1,
      boeking_id: 44,
      versie: 1,
      contractnummer: eerste.nummer,
      vingerafdruk: eerste.vingerafdruk,
      afspraken: {},
    }],
    contract_tekeningen: [{ id: 9, boeking_id: 44, versie: 1, ondertekend_op: null }],
    boekingen: [{ id: 44 }],
    aanvragen: [],
    instellingen: [],
  };
  const { client, schrijfsels } = sessieMet(tabellen);
  const uit = await bewaarDefinitiefContract(client, { boekingId: 44, aanvraagId: null, velden: compleet(), actor: beheerder });
  assert.equal(uit.ok, true);
  assert.match(uit.melding, /al opgeslagen/);
  assert.equal(schrijfsels.some((item) => item.tabel === 'contract_tekeningen'), false);
  assert.equal(schrijfsels.some((item) => item.tabel === 'contractversies'), false);
});

test('een ondertekende oude versie behoudt de downloadlink', async () => {
  const eerste = maakDefinitiefContract(compleet(), '44', 1, '2026-11-15');
  assert.ok(!('fout' in eerste));
  if ('fout' in eerste) return;
  const tabellen: Record<string, Record<string, unknown>[]> = {
    contractversies: [{
      id: 1,
      boeking_id: 44,
      versie: 1,
      contractnummer: eerste.nummer,
      vingerafdruk: 'anders',
      afspraken: {},
    }],
    contract_tekeningen: [{ id: 9, boeking_id: 44, versie: 1, ondertekend_op: '2026-11-01T10:00:00.000Z', token_hash: 'blijft' }],
    contract_verzendingen: [],
    boekingen: [{ id: 44 }],
    aanvragen: [],
    instellingen: [],
  };
  const { client, schrijfsels } = sessieMet(tabellen);
  const uit = await bewaarDefinitiefContract(client, {
    boekingId: 44,
    aanvraagId: null,
    velden: compleet({ huurprijs: '500,00' }),
    actor: beheerder,
  });
  assert.equal(uit.ok, true);
  assert.match(uit.melding, /vervallen/);
  assert.equal(schrijfsels.some((item) => item.tabel === 'contract_tekeningen'), false);
  assert.equal(schrijfsels.some((item) => item.tabel === 'contractversies' && item.waarden.versie === 2), true);
});
