import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aanmeldGeheim,
  aanmeldGlobaalTeVaak,
  besluitAanmelding,
  maakAanmeldbewijs,
  MIN_INVULTIJD_MS,
  oordeelAanmelding,
  resetAanmeldLimiet,
} from '../src/lib/aanmeld-bewijs.ts';
import { leesVriendAanmelding } from '../src/lib/vriend-aanmelding.ts';
import { geheugenVrienden, maakVriendAan } from '../src/lib/vrienden-supabase.ts';
import { POST } from '../src/pages/api/vrienden-aanmelden.ts';

const GEHEIM = 'test-geheim';
const NONCE = '11111111-1111-4111-8111-111111111111';
const NU = 1_700_000_000_000;
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

async function basis(over: Partial<Parameters<typeof oordeelAanmelding>[0]> = {}) {
  const bewijs = await maakAanmeldbewijs(GEHEIM, NONCE, NU - MIN_INVULTIJD_MS - 500);
  return oordeelAanmelding({
    honeypot: '',
    bewijs,
    nonceUitCookie: NONCE,
    userAgent: BROWSER,
    oorsprongOk: true,
    geheim: GEHEIM,
    nu: NU,
    ...over,
  });
}

test('een ingevuld formulier met geldig bewijs mag worden opgeslagen', async () => {
  assert.deepEqual(await basis(), { actie: 'opslaan' });
});

test('een honeypot en een script-user-agent lijken geslaagd en slaan niets op', async () => {
  assert.deepEqual(await basis({ honeypot: 'https://spam.test' }), { actie: 'stil' });
  assert.deepEqual(await basis({ userAgent: 'curl/8.0' }), { actie: 'stil' });
  assert.deepEqual(await basis({ userAgent: '   ' }), { actie: 'stil' });
});

test('direct posten zonder of met een vervalst bewijs wordt geweigerd', async () => {
  const zonder = await basis({ bewijs: '' });
  assert.equal(zonder.actie, 'weiger');
  const vals = await basis({ bewijs: `${NU - 10_000}.${NONCE}.niet-de-handtekening` });
  assert.equal(vals.actie, 'weiger');
  const anderGeheim = await maakAanmeldbewijs('ander-geheim', NONCE, NU - 10_000);
  assert.equal((await basis({ bewijs: anderGeheim })).actie, 'weiger');
});

test('te snel, verlopen of een andere cookie wordt geweigerd', async () => {
  const vers = await maakAanmeldbewijs(GEHEIM, NONCE, NU - 200);
  const teSnel = await basis({ bewijs: vers });
  assert.equal(teSnel.actie, 'weiger');
  if (teSnel.actie === 'weiger') assert.match(teSnel.melding, /te snel/);
  const oud = await maakAanmeldbewijs(GEHEIM, NONCE, NU - 3 * 60 * 60 * 1000);
  const verlopen = await basis({ bewijs: oud });
  assert.equal(verlopen.actie, 'weiger');
  if (verlopen.actie === 'weiger') assert.match(verlopen.melding, /verlopen/);
  const andereCookie = await basis({ nonceUitCookie: '22222222-2222-4222-8222-222222222222' });
  assert.equal(andereCookie.actie, 'weiger');
});

test('een vreemde oorsprong en een vol limiet blokkeren, het limiet telt pas na een geldig bewijs', async () => {
  let teller = 0;
  const limietBereikt = () => {
    teller += 1;
    return teller > 1;
  };
  assert.equal((await basis({ limietBereikt })).actie, 'opslaan');
  assert.equal((await basis({ limietBereikt })).actie, 'weiger');
  teller = 0;
  await basis({ bewijs: '', limietBereikt });
  assert.equal(teller, 0);
  const vreemd = await basis({ oorsprongOk: false });
  assert.equal(vreemd.actie, 'weiger');
});

test('zonder servergeheim in productie is aanmelden dicht', async () => {
  assert.equal(aanmeldGeheim({}), '');
  assert.equal(aanmeldGeheim({}, true), 'lokale-aanmeldpoort');
  assert.equal(aanmeldGeheim({ CRON_SECRET: ' cron ' }), 'cron');
  const dicht = await basis({ geheim: '' });
  assert.equal(dicht.actie, 'weiger');
});

test('de globale rem stopt na dertig geldige pogingen in hetzelfde venster', () => {
  resetAanmeldLimiet();
  for (let i = 0; i < 30; i++) assert.equal(aanmeldGlobaalTeVaak(NU), false);
  assert.equal(aanmeldGlobaalTeVaak(NU), true);
  assert.equal(aanmeldGlobaalTeVaak(NU + 16 * 60 * 1000), false);
  resetAanmeldLimiet();
});

test('de json-route slaat geen vriend op', async () => {
  const res = await POST({} as never);
  assert.equal(res.status, 403);
  const lichaam = await res.json() as { error: string };
  assert.match(lichaam.error, /formulier/);
});

const geldigFormulier = {
  voornaam: 'Ada',
  achternaam: 'Lovelace',
  email: 'ada@example.test',
  telefoon: '06 12 34 56 78',
  geboortedatum: '1990-05-04',
  toestemming: 'ja',
};

test('alleen een geldige aanmelding met botbewijs wordt één keer opgeslagen', async () => {
  const gelezen = leesVriendAanmelding(geldigFormulier, '2026-11-12');
  const oordeel = await basis();
  const besluit = besluitAanmelding(oordeel, gelezen);
  assert.equal(besluit.soort, 'opslaan');
  assert.equal(gelezen.ok, true);
  if (!gelezen.ok || besluit.soort !== 'opslaan') return;

  const bestaand = geheugenVrienden([{
    _id: '9',
    naam: 'Bo',
    voornaam: 'Bo',
    achternaam: 'Elders',
    email: 'bo@example.test',
    telefoon: null,
    geboortedatum: null,
    actief: true,
    frequentie: 'maandelijks',
    uitschrijfToken: 'tok-bo',
  }]);
  await maakVriendAan(gelezen.aanmelding, bestaand);
  assert.equal(bestaand.alle().length, 2);
  assert.equal(bestaand.alle()[0].email, 'bo@example.test');
  assert.equal(bestaand.alle()[0].frequentie, 'maandelijks');
  assert.equal(bestaand.alle()[0].uitschrijfToken, 'tok-bo');
  const ada = bestaand.alle()[1];
  assert.equal(ada.voornaam, 'Ada');
  assert.equal(ada.achternaam, 'Lovelace');
  assert.equal(ada.telefoon, '0612345678');
  assert.equal(ada.geboortedatum, '1990-05-04');
  await maakVriendAan(gelezen.aanmelding, bestaand);
  assert.equal(bestaand.alle().length, 2);
});

test('ongeldige invoer en een bot zonder bewijs worden niet opgeslagen', async () => {
  const ongeldig = leesVriendAanmelding({ ...geldigFormulier, voornaam: '' }, '2026-11-12');
  const metBewijs = await basis();
  const geweigerdVeld = besluitAanmelding(metBewijs, ongeldig);
  assert.equal(geweigerdVeld.soort, 'fout');
  if (geweigerdVeld.soort === 'fout') assert.match(geweigerdVeld.melding, /voornaam/);

  const zonderBewijs = await basis({ bewijs: '' });
  const geweigerdeBot = besluitAanmelding(zonderBewijs, leesVriendAanmelding(geldigFormulier, '2026-11-12'));
  assert.equal(geweigerdeBot.soort, 'fout');
  if (geweigerdeBot.soort === 'fout') assert.match(geweigerdeBot.melding, /verlopen/);
});
