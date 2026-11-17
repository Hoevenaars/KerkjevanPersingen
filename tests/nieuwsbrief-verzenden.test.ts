import assert from 'node:assert/strict';
import test from 'node:test';
import { STANDAARD_AUTOMATISERINGEN } from '../src/platform/automatisering.ts';
import { geheugenNieuwsbrief } from '../src/lib/nieuwsbrief-supabase.ts';
import { verstuurPreview, verstuurWekelijkseNieuwsbrief } from '../src/lib/nieuwsbrief.ts';
import { geheugenVrienden, type Vriend } from '../src/lib/vrienden-supabase.ts';
import type { MailBericht } from '../src/lib/mail-transport.ts';

const DATUM = new Date('2026-09-30T12:00:00Z');
const VRIEND: Vriend = {
  _id: '1',
  naam: 'Bo',
  email: 'bo@example.test',
  actief: true,
  frequentie: 'wekelijks',
  uitschrijfToken: 'tok-1',
};

function register(status: 'actief' | 'test' | 'uit') {
  return STANDAARD_AUTOMATISERINGEN.map((item) =>
    item.sleutel === 'nieuwsbrief' ? { ...item, status } : item,
  );
}

function bronMetNieuws() {
  const bron = geheugenNieuwsbrief();
  bron.weken.push({
    id: '9',
    week: '2026-09-28',
    kortNieuws: 'De klok is gerepareerd.',
    geannuleerd: false,
    verstuurd: false,
    goedgekeurd: true,
    aangemaaktOp: '2026-08-01',
  });
  bron.activiteiten.push({
    _id: 'expo',
    slug: 'expositie',
    interneTitel: 'Herfstexpositie',
    start: '2026-10-03',
    eind: '2026-10-04',
    soort: 'expositie',
    zichtbaarheid: 'publiek',
  });
  return bron;
}

test('aan stuurt de weektekst naar de vriend en markeert de week', async () => {
  const bron = bronMetNieuws();
  const vrienden = geheugenVrienden([VRIEND]);
  const verzonden: MailBericht[] = [];
  const uit = await verstuurWekelijkseNieuwsbrief({
    register: register('actief'),
    datum: DATUM,
    vrienden,
    bron,
    transport: {
      async verstuur(brief) {
        verzonden.push(brief);
      },
    },
  });
  assert.equal(uit.verstuurd, 1);
  assert.equal(uit.overgeslagen, 'aan');
  assert.equal(verzonden.length, 1);
  assert.equal(verzonden[0].naar, 'bo@example.test');
  assert.deepEqual(verzonden[0].tags, [
    { name: 'soort', value: 'nieuwsbrief' },
    { name: 'editie', value: '9' },
    { name: 'vriend', value: '1' },
  ]);
  assert.match(verzonden[0].tekst, /De klok is gerepareerd/);
  assert.match(verzonden[0].tekst, /tok-1/);
  assert.equal(bron.verzendingen[0].test, false);
  assert.equal(bron.verzendingen[0].status, 'verzonden');
  assert.equal(bron.weken[0].verstuurd, true);

  const opnieuw = await verstuurWekelijkseNieuwsbrief({
    register: register('actief'),
    datum: DATUM,
    vrienden,
    bron,
    transport: {
      async verstuur() {
        throw new Error('tweede verzending');
      },
    },
  });
  assert.equal(opnieuw.verstuurd, 0);
  assert.equal(opnieuw.overgeslagen, 'al verstuurd deze week');
});

test('test stuurt één mail naar het testadres en telt de week niet als verstuurd', async () => {
  const bron = bronMetNieuws();
  const verzonden: MailBericht[] = [];
  const uit = await verstuurWekelijkseNieuwsbrief({
    register: register('test'),
    datum: DATUM,
    vrienden: geheugenVrienden([VRIEND, { ...VRIEND, _id: '2', email: 'ada@example.test', uitschrijfToken: 'tok-2' }]),
    bron,
    testadres: 'webmaster@example.test',
    transport: {
      async verstuur(brief) {
        verzonden.push(brief);
      },
    },
  });
  assert.equal(uit.verstuurd, 1);
  assert.equal(verzonden.length, 1);
  assert.equal(verzonden[0].naar, 'webmaster@example.test');
  assert.match(verzonden[0].onderwerp, /^\[TEST]/);
  assert.equal(bron.verzendingen[0].test, true);
  assert.equal(bron.weken[0].verstuurd, false);
});

test('preview is een dry-run en laat de week open', async () => {
  const bron = bronMetNieuws();
  const verzonden: MailBericht[] = [];
  const uit = await verstuurPreview('nhoevenaars@gmail.com', DATUM, {
    register: register('actief'),
    vrienden: geheugenVrienden([VRIEND]),
    bron,
    transport: {
      async verstuur(brief) {
        verzonden.push(brief);
      },
    },
  });
  assert.equal(verzonden.length, 0);
  assert.equal(uit.verstuurd, 0);
  assert.equal(uit.overgeslagen, 'dry-run, geen mail');
  assert.match(uit.tekst, /De klok is gerepareerd/);
  assert.match(uit.tekst, /token=preview/);
  assert.equal(bron.verzendingen.length, 0);
  assert.equal(bron.weken[0].verstuurd, false);
});
