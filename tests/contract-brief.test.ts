import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { verwerkContractActie } from '../src/lib/contract-actie.ts';
import { stelMailconceptSamen } from '../src/platform/mailconcept.ts';
import { contractBronUitBoeking, genereerContractbrief } from '../src/platform/contract-brief.ts';

const nick = contractBronUitBoeking(
  {
    id: '42',
    nummer: '2026-088',
    interneTitel: 'Expositie Hoevenaars',
    soort: 'expositie',
    start: '2026-11-21',
    eind: '2026-11-22',
    huurder: 'Nick Hoevenaars',
    email: 'nick@example.nl',
    tarief: '€ 490',
  },
  { naam: 'Nick Hoevenaars', email: 'nick@example.nl', telefoon: '06 11111111', adres: 'Dorpstraat 1, Persingen' },
);

test('het contract van Nick Hoevenaars is leesbaar en gebruikt zijn boeking', () => {
  const brief = genereerContractbrief(nick);
  assert.equal('fout' in brief, false);
  if ('fout' in brief) return;
  assert.equal(brief.onderwerp, 'Contract voor uw boeking');
  assert.match(brief.tekst, /Beste Nick Hoevenaars/);
  assert.match(brief.tekst, /21 november 2026 tot en met 22 november 2026/);
  assert.match(brief.tekst, /€ 490/);
  assert.match(brief.tekst, /nick@example\.nl/);
  assert.match(brief.tekst, /Dorpstraat 1, Persingen/);
  assert.match(brief.tekst, /Expositie/);
  assert.match(brief.tekst, /Hans Maas, contractbeheer/);
  assert.equal(brief.tekst.includes('Nelleke van der Pol'), false);
  assert.equal(brief.tekst.includes('{{'), false);
});

test('versturen gebruikt de gelezen tekst en een lege brief verstuurt niets', async () => {
  const gelezen = genereerContractbrief(nick);
  assert.equal('fout' in gelezen, false);
  if ('fout' in gelezen) return;
  const concept = stelMailconceptSamen({
    ontvanger: nick.email,
    naam: nick.huurder,
    template: null,
    onderwerp: gelezen.onderwerp,
    inhoud: gelezen.tekst,
    brief: true,
  });
  assert.equal('fout' in concept, false);
  if ('fout' in concept) return;
  assert.match(concept.text, /Beste Nick Hoevenaars/);
  assert.equal(concept.text.includes('Beste Nick,\n\nBeste Nick'), false);

  let aangeroepen = 0;
  const uit = await verwerkContractActie({
    actie: 'contract_verstuur',
    bron: nick,
    bestaandeContracten: 0,
    tekst: gelezen.tekst,
    onderwerp: gelezen.onderwerp,
    demo: false,
    opslag: null,
    gebruikerId: null,
    verstuur: async () => {
      aangeroepen += 1;
      return { ok: true, melding: 'Mail verstuurd naar de dossierontvanger.' };
    },
  });
  assert.equal(aangeroepen, 0);
  assert.equal(uit.ok, false);
  assert.match(uit.melding, /PDF/);
  assert.equal(uit.toonBrief, true);

  const leeg = await verwerkContractActie({
    actie: 'contract_verstuur',
    bron: { ...nick, email: 'niet ingevuld' },
    bestaandeContracten: 0,
    tekst: '',
    onderwerp: '',
    demo: false,
    opslag: null,
    gebruikerId: null,
    verstuur: async () => {
      aangeroepen += 1;
      return { ok: true, melding: 'niet' };
    },
  });
  assert.equal(aangeroepen, 0);
  assert.match(leeg.melding, /PDF/);
});

test('genereren in het voorbeeld bewaart geen bestand', async () => {
  let uploads = 0;
  const uit = await verwerkContractActie({
    actie: 'contract_genereer',
    bron: nick,
    bestaandeContracten: 1,
    tekst: '',
    onderwerp: '',
    demo: true,
    opslag: {
      storage: { from: () => ({ upload: async (_pad: string, body: Blob) => { uploads += 1; assert.equal(body.type, 'text/plain'); return { error: null }; } }) },
      from: () => ({ insert: async () => ({ error: null }) }),
    },
    gebruikerId: null,
  });
  assert.equal(uploads, 0);
  assert.match(uit.melding, /aanvraagdossier/);
  assert.match(uit.brief?.tekst ?? '', /Nick Hoevenaars/);
});

test('de bucket laat de contracttekst toe', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261115180000_contractbrief_tekst.sql', import.meta.url), 'utf8');
  assert.match(sql, /text\/plain/);
  assert.match(sql, /booking-documents/);
  assert.equal(sql.toLowerCase().includes('delete from'), false);
});
