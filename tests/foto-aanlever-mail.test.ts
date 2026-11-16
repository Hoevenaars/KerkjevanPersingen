import assert from 'node:assert/strict';
import test from 'node:test';
import { verstuurFotoAanlevering, type TokenClient } from '../src/lib/foto-aanlever-mail.ts';
import type { Actor } from '../src/lib/operatie/kern.ts';
import type { Verzendregel } from '../src/lib/communicatie-log.ts';
import { briefFotoAanlevering, fotoAanleverUrl } from '../src/platform/foto-aanlevering.ts';
import { hashToegangstoken } from '../src/platform/magictoken.ts';
import type { TransportUitkomst } from '../src/lib/mail-transport.ts';

const TOKEN = 'abcdefghijklmnopqrstuvwxyz0123456789ABC';
const LINK = `https://kerkjepersingen.nl/klant/aanleveren/?token=${TOKEN}&beeld=1`;

const beheer: Actor = {
  type: 'gebruiker',
  naam: 'Nelleke',
  rechten: { isSuperAdmin: true, perModule: {} },
};

test('de mail noemt Nick, de bestaande tekst en de aanleverlink', () => {
  const brief = briefFotoAanlevering('Nick Hoevenaars <script>', LINK);
  assert.equal(brief.onderwerp, 'Je afbeelding voor het Kerkje van Persingen');
  assert.match(brief.text, /Beste Nick,/);
  assert.match(brief.text, /niet meegekomen/);
  assert.match(brief.text, /tekst staat al klaar/);
  assert.match(brief.text, /14 dagen/);
  assert.match(brief.text, /klant\/aanleveren/);
  assert.equal(brief.html.includes('<script>'), false);
  assert.match(brief.html, /Afbeelding aanleveren/);
  assert.equal((brief.html.match(/data-kerkje-mail=/g) ?? []).length, 1);
});

test('een link wijst naar het aanleverformulier en eist een afbeelding', () => {
  assert.equal(fotoAanleverUrl('https://kerkjepersingen.nl/beheer/agenda/1/', TOKEN), LINK);
  assert.equal(fotoAanleverUrl('javascript:alert(1)', TOKEN), '');
  assert.equal(fotoAanleverUrl('https://kerkjepersingen.nl', 'kort'), '');
});

function uitkomst(extra: Partial<TransportUitkomst> = {}): TransportUitkomst {
  return {
    verzonden: true,
    providerAangeroepen: true,
    besluit: { uitvoeren: true, provider: true, reden: 'actief', status: 'actief', modus: 'aan' },
    werkelijkeOntvanger: 'nick@example.nl',
    providerBerichtId: 'mail-1',
    ...extra,
  };
}

function tokensVan(): TokenClient & { hashes: string[]; gesloten: string[] } {
  const hashes: string[] = [];
  const gesloten: string[] = [];
  return {
    hashes,
    gesloten,
    async bewaar(rij) {
      hashes.push(rij.token_hash);
      assert.equal(rij.doel, 'content');
      assert.equal(rij.boeking_id, 284);
      return null;
    },
    async sluit(hash) {
      gesloten.push(hash);
    },
    async trekAndereIn(_boekingId, hash) {
      assert.equal(hash, hashes[0]);
    },
  };
}

test('een activiteit zonder foto mailt de link en bewaart alleen de hash', async () => {
  const tokens = tokensVan();
  const logs: Verzendregel[] = [];
  let genoteerd = '';
  const uit = await verstuurFotoAanlevering({
    tokens,
    boekingId: 284,
    naam: 'Nick Hoevenaars',
    email: 'nick@example.nl',
    basisUrl: 'https://kerkjepersingen.nl',
    actor: beheer,
    verstuur: async (brief) => {
      const gevonden = /token=([^&"]+)/.exec(brief.html)?.[1] ?? '';
      const plain = decodeURIComponent(gevonden);
      assert.equal(hashToegangstoken(plain), tokens.hashes[0]);
      assert.match(brief.html, /beeld=1/);
      assert.equal(brief.idempotentie.includes(plain), false);
      return uitkomst();
    },
    legVast: async (regel) => {
      logs.push(regel);
      return { gelogd: true, opnieuwVerstuurd: false };
    },
    noteer: async (actie) => {
      genoteerd = actie;
    },
  });
  assert.equal(uit.ok, true);
  assert.match(uit.melding, /nick@example\.nl/);
  assert.equal(tokens.gesloten.length, 0);
  assert.equal(JSON.stringify(logs).includes(tokens.hashes[0]), false);
  assert.equal(genoteerd, 'foto_aanlevering_gemaild');
});

test('een geblokkeerde mail sluit de link', async () => {
  const tokens = tokensVan();
  const uit = await verstuurFotoAanlevering({
    tokens,
    boekingId: 284,
    naam: 'Nick Hoevenaars',
    email: 'nick@example.nl',
    basisUrl: 'https://kerkjepersingen.nl',
    actor: beheer,
    verstuur: async () => uitkomst({
      verzonden: false,
      providerAangeroepen: false,
      besluit: { uitvoeren: false, provider: false, reden: 'automatisering uit', status: 'uit', modus: 'uit' },
      melding: 'automatisering uit',
      werkelijkeOntvanger: undefined,
      providerBerichtId: null,
    }),
    legVast: async () => ({ gelogd: true, opnieuwVerstuurd: false }),
  });
  assert.equal(uit.ok, false);
  assert.match(uit.melding, /geen mail verstuurd/i);
  assert.deepEqual(tokens.gesloten, tokens.hashes);
});

test('zonder schrijfrecht of zonder adres gaat er geen link open', async () => {
  let bewaard = 0;
  const tokens: TokenClient = {
    async bewaar() {
      bewaard += 1;
      return null;
    },
    async sluit() {},
    async trekAndereIn() {},
  };
  const zonderRecht = await verstuurFotoAanlevering({
    tokens,
    boekingId: 284,
    naam: 'Nick Hoevenaars',
    email: 'nick@example.nl',
    basisUrl: 'https://kerkjepersingen.nl',
    actor: { ...beheer, rechten: { isSuperAdmin: false, perModule: { agenda: 'lezen' } } },
  });
  const zonderMail = await verstuurFotoAanlevering({
    tokens,
    boekingId: 284,
    naam: 'Nick Hoevenaars',
    email: 'geen-adres',
    basisUrl: 'https://kerkjepersingen.nl',
    actor: beheer,
  });
  assert.equal(zonderRecht.ok, false);
  assert.equal(zonderMail.ok, false);
  assert.equal(bewaard, 0);
});
