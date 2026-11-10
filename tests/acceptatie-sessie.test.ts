import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptatieBesluit, acceptatieIsoleert } from '../src/platform/acceptatie-sessie.ts';
import { leesSupabaseOmgeving } from '../src/lib/supabase.ts';

const lokaal = { BEHEER_ACCEPTATIE: 'lokaal', NODE_ENV: 'development' };

function besluit(extra: Partial<Parameters<typeof acceptatieBesluit>[0]> = {}) {
  return acceptatieBesluit({
    dev: true,
    env: lokaal,
    hostname: '127.0.0.1',
    methode: 'GET',
    url: new URL('http://127.0.0.1:4399/beheer/verhuur/?jaar=2026'),
    ...extra,
  });
}

describe('acceptatiepoort', () => {
  test('neemt geen verbinding met het Supabase-project op', () => {
    assert.equal(
      leesSupabaseOmgeving({
        BEHEER_ACCEPTATIE: 'lokaal',
        NODE_ENV: 'development',
        SUPABASE_URL: 'https://xskqpefeumylrticrphp.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
        SUPABASE_SERVICE_ROLE_KEY: 'dienst-sleutel',
      }),
      null,
    );
    assert.notEqual(leesSupabaseOmgeving({ NODE_ENV: 'test' }), null);
  });

  test('blijft dicht in productie, zonder de waarde, en buiten loopback', () => {
    assert.equal(acceptatieIsoleert({ BEHEER_ACCEPTATIE: 'lokaal', NODE_ENV: 'production' }), false);
    assert.equal(acceptatieIsoleert({ NODE_ENV: 'development' }), false);
    assert.equal(besluit({ dev: false }).soort, 'uit');
    assert.equal(besluit({ env: { BEHEER_ACCEPTATIE: 'true', NODE_ENV: 'development' } }).soort, 'uit');
    assert.equal(besluit({ hostname: 'kerkjepersingen.nl' }).soort, 'uit');
    assert.equal(besluit({ env: { BEHEER_ACCEPTATIE: 'lokaal', NODE_ENV: 'production' } }).soort, 'uit');
  });

  test('schrijft niets en dwingt voorbeelddata af', () => {
    assert.equal(besluit({ methode: 'POST' }).soort, 'verboden');
    assert.equal(besluit({ methode: 'DELETE' }).soort, 'verboden');
    const omweg = besluit();
    assert.equal(omweg.soort, 'redirect');
    if (omweg.soort === 'redirect') {
      assert.equal(omweg.naar, '/beheer/verhuur/?jaar=2026&bron=demo');
    }
  });

  test('een super admin komt binnen, een lege rol niet als super admin', () => {
    const url = new URL('http://127.0.0.1:4399/beheer/?bron=demo');
    const open = besluit({ url });
    assert.equal(open.soort, 'door');
    if (open.soort === 'door') assert.equal(open.sessie.effectieveRechten.isSuperAdmin, true);

    const beperkt = besluit({ url: new URL('http://127.0.0.1:4399/beheer/finance/?bron=demo&kijk=rol:hans') });
    assert.equal(beperkt.soort, 'door');
    if (beperkt.soort === 'door') {
      assert.equal(beperkt.sessie.viewAs?.naam, 'Hans');
      assert.equal(beperkt.sessie.effectieveRechten.isSuperAdmin, false);
      assert.equal(beperkt.sessie.effectieveRechten.perModule.finance, 'verborgen');
      assert.equal(beperkt.sessie.effectieveRechten.perModule.dashboard, 'lezen');
    }
  });
});
