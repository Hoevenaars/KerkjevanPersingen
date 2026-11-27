import assert from 'node:assert/strict';
import test from 'node:test';
import { STANDAARD_AUTOMATISERINGEN } from '../src/platform/automatisering.ts';
import { geheugenNieuwsbrief } from '../src/lib/nieuwsbrief-supabase.ts';
import { verstuurPreview, verstuurWekelijkseNieuwsbrief } from '../src/lib/nieuwsbrief.ts';
import { geheugenVrienden, type Vriend } from '../src/lib/vrienden-supabase.ts';
import { MailTempoLimiet, type MailBericht } from '../src/lib/mail-transport.ts';
import { VOORZITTER_EMAIL } from '../src/lib/mail-adressen.ts';
import { NIEUWSBRIEF_PER_RONDE } from '../src/platform/nieuwsbrief-keten.ts';

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
  assert.equal(verzonden[0].replyTo, VOORZITTER_EMAIL);
  assert.deepEqual(verzonden[0].tags, [
    { name: 'soort', value: 'nieuwsbrief' },
    { name: 'editie', value: '9' },
    { name: 'vriend', value: '1' },
  ]);
  assert.match(verzonden[0].tekst, /Een groet uit Persingen/);
  assert.match(verzonden[0].tekst, /Hartelijke groeten/);
  assert.equal(verzonden[0].tekst.includes('De klok is gerepareerd.'), false);
  assert.equal(verzonden[0].tekst.includes('Steun het kerkje'), false);
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
  assert.match(uit.tekst, /Een groet uit Persingen/);
  assert.equal(uit.tekst.includes('De klok is gerepareerd.'), false);
  assert.match(uit.tekst, /token=preview/);
  assert.equal(bron.verzendingen.length, 0);
  assert.equal(bron.weken[0].verstuurd, false);
});

function vriendNummer(n: number): Vriend {
  return {
    _id: String(n),
    naam: `Vriend ${n}`,
    email: `vriend${n}@example.test`,
    actief: true,
    frequentie: 'wekelijks',
    uitschrijfToken: `tok-${n}`,
  };
}

test('aan stuurt twaalf vrienden per ronde en maakt de week pas af bij de laatste', async () => {
  const bron = bronMetNieuws();
  const aantal = NIEUWSBRIEF_PER_RONDE + 1;
  const vrienden = geheugenVrienden(Array.from({ length: aantal }, (_, index) => vriendNummer(index + 1)));
  const verzonden: string[] = [];
  const pauzes: number[] = [];
  const eerste = await verstuurWekelijkseNieuwsbrief({
    register: register('actief'),
    datum: DATUM,
    vrienden,
    bron,
    pauzeMs: 500,
    wacht: async (ms) => {
      pauzes.push(ms);
    },
    transport: {
      async verstuur(brief) {
        verzonden.push(brief.naar);
      },
    },
  });
  assert.equal(eerste.verstuurd, NIEUWSBRIEF_PER_RONDE);
  assert.equal(eerste.overgeslagen, 'gespreid, nog 1');
  assert.equal(pauzes.length, NIEUWSBRIEF_PER_RONDE - 1);
  assert.deepEqual(pauzes, Array.from({ length: NIEUWSBRIEF_PER_RONDE - 1 }, () => 500));
  assert.equal(bron.weken[0].verstuurd, false);
  assert.deepEqual(verzonden, Array.from({ length: NIEUWSBRIEF_PER_RONDE }, (_, index) => `vriend${index + 1}@example.test`));

  const tweede = await verstuurWekelijkseNieuwsbrief({
    register: register('actief'),
    datum: DATUM,
    vrienden,
    bron,
    pauzeMs: 0,
    transport: {
      async verstuur(brief) {
        verzonden.push(brief.naar);
      },
    },
  });
  assert.equal(tweede.verstuurd, 1);
  assert.equal(tweede.overgeslagen, 'aan');
  assert.equal(verzonden.at(-1), 'vriend13@example.test');
  assert.equal(bron.weken[0].verstuurd, true);
});

test('een tempo-limiet stopt de ronde en de volgende ronde gaat verder waar die bleef', async () => {
  const bron = bronMetNieuws();
  const vrienden = geheugenVrienden([vriendNummer(1), vriendNummer(2), vriendNummer(3)]);
  let poging = 0;
  const eerste = await verstuurWekelijkseNieuwsbrief({
    register: register('actief'),
    datum: DATUM,
    vrienden,
    bron,
    pauzeMs: 0,
    transport: {
      async verstuur(brief) {
        poging += 1;
        if (poging === 2) throw new MailTempoLimiet('Too many requests');
        return brief.naar;
      },
    },
  });
  assert.equal(eerste.verstuurd, 1);
  assert.equal(eerste.overgeslagen, 'resend 429, nog 2');
  assert.equal(bron.weken[0].verstuurd, false);

  const vervolg = await verstuurWekelijkseNieuwsbrief({
    register: register('actief'),
    datum: DATUM,
    vrienden,
    bron,
    alleenVervolg: true,
    pauzeMs: 0,
    transport: {
      async verstuur() {
        return 'ok';
      },
    },
  });
  assert.equal(vervolg.verstuurd, 2);
  assert.equal(vervolg.overgeslagen, 'aan');
  assert.equal(bron.weken[0].verstuurd, true);
});

test('een vervolgronde begint geen nieuwe brief', async () => {
  const bron = bronMetNieuws();
  let aangeroepen = 0;
  const uit = await verstuurWekelijkseNieuwsbrief({
    register: register('actief'),
    datum: DATUM,
    vrienden: geheugenVrienden([VRIEND]),
    bron,
    alleenVervolg: true,
    transport: {
      async verstuur() {
        aangeroepen += 1;
      },
    },
  });
  assert.equal(aangeroepen, 0);
  assert.equal(uit.verstuurd, 0);
  assert.equal(uit.overgeslagen, 'wacht op het verzendmoment');
  assert.equal(bron.weken[0].verstuurd, false);
});
