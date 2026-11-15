import assert from 'node:assert/strict';
import test from 'node:test';
import type { Actor } from '../src/lib/operatie/kern.ts';
import {
  bewaarDefinitiefContract,
  type ContractWizardSessie,
} from '../src/lib/operatie/contract-wizard-sessie.ts';
import {
  controleerWizard,
  euroNaarCent,
  legeWizardVelden,
  maakDefinitiefContract,
  wizardUitDossier,
  type ContractWizardVelden,
} from '../src/platform/contract-wizard.ts';
import { legeInstellingen } from '../src/platform/documentenflow.ts';

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

test('definitief maken schrijft het contract en laat de status staan', async () => {
  const schrijfsels: { tabel: string; waarden: Record<string, unknown> }[] = [];
  const tabellen: Record<string, Record<string, unknown>[]> = {
    contractversies: [],
    boekingen: [{ id: 44, status: 'optie' }],
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
  assert.match(uit.melding, /definitief/);
  assert.match(uit.melding, /geen mail/);
  const versie = schrijfsels.find((item) => item.tabel === 'contractversies');
  assert.equal(versie?.waarden.bestuur_verplicht, false);
  assert.match(String(versie?.waarden.tekst), /Huurovereenkomst/);
  for (const item of schrijfsels) assert.equal('status' in item.waarden, false);
  assert.equal(tabellen.boekingen[0].status, 'optie');
  assert.equal(tabellen.aanvragen[0].status, 'goedgekeurd');
});
