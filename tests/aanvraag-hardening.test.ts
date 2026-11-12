import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { bestuurMail, LEGE_AANVRAAG, type Aanvraag } from '../src/lib/aanvraag.ts';
import { leesExtraAanvraagOntvanger, ontvangersZonderBcc, uniekeOntvangers } from '../src/lib/aanvraag-ontvangers.ts';
import { voerDossierViaSessie, type DossierSessie } from '../src/lib/operatie/dossier-sessie.ts';
import type { Actor } from '../src/lib/operatie/kern.ts';
import { fotoPlekken, fotoRetryCookieOpties, fotoRetryToken } from '../src/platform/aanvraag-foto.ts';
import { labelGastheer } from '../src/platform/aanvraag-weergave.ts';
import { INITIELE_TARIEVEN, kiesTarief } from '../src/platform/finance.ts';
import { serialiseerMedeExposanten } from '../src/platform/mede-exposanten.ts';
import { tariefIndicatie } from '../src/platform/tarief-indicatie.ts';
import { gastbegeleiderOntbreekt, gastbegeleiderRelevant, hoortOpGastbegeleiderbord } from '../src/platform/verhuur-classificatie.ts';

const beheer: Actor = {
  type: 'gebruiker',
  naam: 'Nelleke',
  rechten: { isSuperAdmin: true, perModule: {} },
};

function aanvraag(extra: Partial<Aanvraag> = {}): Aanvraag {
  return {
    ...LEGE_AANVRAAG,
    datum: '2026-12-01',
    soort: 'expositie',
    naam: 'Kim',
    email: 'kim@example.test',
    telefoon: '0612345678',
    adres: 'Persingensestraat 13, 6575 JA Persingen',
    straat: 'Persingensestraat',
    huisnummer: '13',
    postcode: '6575 JA',
    woonplaats: 'Persingen',
    akkoordVoorwaarden: 'ja',
    ...extra,
  };
}

test('een lege extra ontvanger blijft leeg en leest geen voorzitter', async () => {
  let voorzitter = 0;
  const waarschuwingen: string[] = [];
  const origineel = console.warn;
  console.warn = (...delen: unknown[]) => {
    waarschuwingen.push(delen.map(String).join(' '));
  };
  const leeg = {
    from(tabel: string) {
      return {
        select() {
          return {
            async in() {
              assert.equal(tabel, 'instellingen');
              return { data: [{ sleutel: 'extra_ontvangst_adres', waarde: '' }], error: null };
            },
            async eq() {
              voorzitter += 1;
              return { data: [{ email: 'voorzitter@example.test' }], error: null };
            },
          };
        },
      };
    },
  };
  try {
    assert.equal(await leesExtraAanvraagOntvanger({}, leeg), '');
    assert.equal(voorzitter, 0);
    assert.match(waarschuwingen.join('\n'), /extra ontvanger niet geconfigureerd/);
    waarschuwingen.length = 0;
    const ingevuld = {
      from() {
        return {
          select() {
            return {
              async in() {
                return { data: [{ sleutel: 'extra_ontvangst_adres', waarde: 'extra@example.test' }], error: null };
              },
            };
          },
        };
      },
    };
    assert.equal(await leesExtraAanvraagOntvanger({}, ingevuld), 'extra@example.test');
    assert.equal(waarschuwingen.length, 0);
  } finally {
    console.warn = origineel;
  }
});

test('dubbele ontvangers en een adres dat al BCC is vallen weg', () => {
  assert.deepEqual(uniekeOntvangers(['A@example.test', 'a@example.test', 'b@example.test']), ['a@example.test', 'b@example.test']);
  assert.deepEqual(ontvangersZonderBcc(['a@example.test', 'b@example.test'], ['B@example.test']), ['a@example.test']);
  assert.deepEqual(ontvangersZonderBcc(['a@example.test', 'c@example.test'], ['b@example.test']), ['a@example.test', 'c@example.test']);
});

test('foto-retry blijft op dezelfde aanvraag, maximaal acht, en heropent een gesloten token niet', () => {
  assert.equal(fotoPlekken(0, 8).ok, true);
  assert.equal(fotoPlekken(8, 1).ok, false);
  assert.equal(fotoPlekken(3, 6).ok, false);
  assert.equal(fotoPlekken(3, 5).ok, true);
  const token = '11111111-1111-4111-8111-111111111111';
  assert.equal(fotoRetryToken(token.toUpperCase()), token);
  assert.equal(fotoRetryToken(`aanvragen/4/${token}/ander.jpg`), '');
  assert.equal(fotoRetryToken(''), '');
  const cookie = fotoRetryCookieOpties(true);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.path, '/verhuur/aanvragen/');
  assert.equal(cookie.maxAge, 20 * 60);
  const sql = readFileSync(new URL('../supabase/migrations/20261101160000_foto_upload_retry.sql', import.meta.url), 'utf8');
  assert.match(sql, /foto_upload_token = p_token/);
  assert.match(sql, /foto_upload_geldig_tot > now\(\)/);
  assert.match(sql, /id = p_aanvraag_id/);
  assert.doesNotMatch(sql, /drop column/i);
  assert.doesNotMatch(sql, /truncate/i);
  assert.doesNotMatch(sql, /extra_ontvangst_adres/);
  const eerder = readFileSync(new URL('../supabase/migrations/20261101140000_aanvraag_adres_en_fotos.sql', import.meta.url), 'utf8');
  assert.match(eerder, /on conflict \(sleutel\) do nothing/i);
});

test('de mail toont Overige, een legacy adres, vier mede-exposanten en geen opslaglink', () => {
  const overige = bestuurMail(aanvraag({
    soort: 'diverse',
    website: '',
    adres: 'Dorpsstraat 1, Dorp',
    medeExposanten: 'Piet en Marie',
  }));
  assert.match(overige.text, /Soort: Overige/);
  assert.match(overige.text, /Adres: Dorpsstraat 1, Dorp/);
  assert.match(overige.text, /Mede-exposanten: Piet en Marie/);
  assert.doesNotMatch(overige.text, /^Website:/m);
  const met = bestuurMail(aanvraag({
    website: 'https://voorbeeld.nl',
    medeExposanten: serialiseerMedeExposanten(['Een', 'Twee', 'Drie', 'Vier']),
    fotoNamen: ['een.jpg', 'twee.png'],
  }));
  assert.match(met.text, /Website: https:\/\/voorbeeld.nl/);
  assert.match(met.text, /Mede-exposanten: Een, Twee, Drie, Vier/);
  assert.match(met.text, /2 bij de aanvraag in beheer/);
  assert.doesNotMatch(met.text, /aanvraag-fotos|supabase\.co|storage\/v1/);
  const zonder = bestuurMail(aanvraag({ website: '' }));
  assert.doesNotMatch(zonder.text, /^Website:/m);
  assert.doesNotMatch(zonder.text, /Foto’s van het werk/);
});

test('tarieven voor en na 2029 komen uit dezelfde centrale keuze', () => {
  assert.equal(tariefIndicatie(kiesTarief(INITIELE_TARIEVEN, 'expositie', '2028-12-31')), '€490');
  assert.equal(tariefIndicatie(kiesTarief(INITIELE_TARIEVEN, 'expositie', '2029-01-01')), '€525');
  assert.equal(tariefIndicatie(kiesTarief(INITIELE_TARIEVEN, 'diverse', '2028-12-31')), 'vanaf €250');
  assert.equal(tariefIndicatie(kiesTarief(INITIELE_TARIEVEN, 'diverse', '2029-01-01')), 'vanaf €275');
  assert.equal(tariefIndicatie(kiesTarief(INITIELE_TARIEVEN, 'bruiloft', '2028-12-31')), '€550');
  assert.equal(tariefIndicatie(kiesTarief(INITIELE_TARIEVEN, 'concert', '2029-01-01')), 'op aanvraag');
});

test('expositie heet Expositiebegeleider en een ander type Gastheer', () => {
  assert.equal(labelGastheer('expositie'), 'Expositiebegeleider');
  assert.equal(labelGastheer('bruiloft'), 'Gastheer');
  assert.equal(labelGastheer('concert'), 'Gastheer');
  assert.equal(labelGastheer('diverse'), 'Gastheer');
  assert.equal(gastbegeleiderRelevant({ soort: 'expositie', heeftKoppeling: false }), true);
  assert.equal(gastbegeleiderRelevant({ soort: 'bruiloft', heeftKoppeling: false }), false);
  assert.equal(gastbegeleiderRelevant({ soort: 'bruiloft', heeftKoppeling: true }), true);
  assert.equal(gastbegeleiderOntbreekt({ soort: 'concert', heeftKoppeling: false }), false);
  assert.equal(hoortOpGastbegeleiderbord('migratie_vastgelegd'), true);
  const planning = readFileSync(new URL('../src/pages/beheer/planning/index.astro', import.meta.url), 'utf8');
  assert.match(planning, /name="gastheerId"/);
  assert.match(planning, /hoortOpGastbegeleiderbord/);
  assert.doesNotMatch(planning, /gastbegeleiderRelevant/);
});

test('goedkeuren kopieert het samengestelde adres en de legacy mede-exposanten', async () => {
  const staat = { boeking: null as Record<string, unknown> | null };
  const client = {
    from(tabel: string) {
      const q = {
        actie: 'select',
        waarden: {} as Record<string, unknown>,
        select() { return q; },
        update(waarden: Record<string, unknown>) { q.actie = 'update'; q.waarden = waarden; return q; },
        insert(waarden: Record<string, unknown>) { q.actie = 'insert'; q.waarden = waarden; return q; },
        eq() { return q; },
        neq() { return q; },
        in() { return q; },
        async maybeSingle() {
          if (tabel === 'aanvragen' && q.actie === 'select') {
            return {
              data: {
                id: 12,
                status: 'nieuw',
                naam: 'Kim',
                email: 'kim@example.test',
                telefoon: '0612345678',
                adres: 'Persingensestraat 13, 6575 JA Persingen',
                verhuurtype_sleutel: 'diverse',
                start_datum: '2027-03-02',
                eind_datum: '2027-03-02',
                boeking_id: null,
                relatie_id: 4,
                toelichting: 'Kleine groep',
                aantal_personen: '12',
                website: null,
                mede_exposanten: 'Piet en Marie',
              },
              error: null,
            };
          }
          if (tabel === 'boekingen' && q.actie === 'insert') {
            staat.boeking = q.waarden;
            return { data: { id: 90 }, error: null };
          }
          if (tabel === 'aanvragen' && q.actie === 'update') return { data: { id: 12 }, error: null };
          return { data: { id: 1 }, error: null };
        },
        then(resolve: (waarde: { data: never[]; error: null }) => unknown) {
          return Promise.resolve(resolve({ data: [], error: null }));
        },
      };
      return q;
    },
  };
  const uit = await voerDossierViaSessie(client as unknown as DossierSessie, {
    soort: 'beoordeel',
    aanvraagId: '12',
    besluit: 'goedkeuren',
  }, beheer);
  assert.equal(uit.ok, true);
  assert.equal(staat.boeking?.huurder_naam_snapshot, 'Kim');
  assert.equal(staat.boeking?.huurder_email_snapshot, 'kim@example.test');
  assert.equal(staat.boeking?.huurder_telefoon_snapshot, '0612345678');
  assert.equal(staat.boeking?.huurder_adres_snapshot, 'Persingensestraat 13, 6575 JA Persingen');
  assert.equal(staat.boeking?.verhuurtype_sleutel, 'diverse');
  assert.equal(staat.boeking?.start_datum, '2027-03-02');
  assert.equal(staat.boeking?.mede_exposanten, 'Piet en Marie');
  assert.equal(staat.boeking?.toelichting, 'Kleine groep');
});
