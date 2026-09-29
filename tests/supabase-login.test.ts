import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STANDAARD_SUPABASE_URL,
  supabaseLoginUitOmgeving,
} from '../src/lib/supabase-project.ts';

describe('supabase-login configuratie', () => {
  test('een lege expliciete omgeving heeft geen login', () => {
    assert.equal(supabaseLoginUitOmgeving({}), null);
    assert.equal(supabaseLoginUitOmgeving({ SUPABASE_URL: 'https://example.supabase.co' }), null);
  });

  test('url en publishable key samen zijn genoeg', () => {
    assert.deepEqual(
      supabaseLoginUitOmgeving({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      }),
      { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' },
    );
  });

  test('het standaardproject vult alleen aan als daarom gevraagd wordt', () => {
    assert.equal(supabaseLoginUitOmgeving({}, true)?.url, STANDAARD_SUPABASE_URL);
    assert.equal(
      supabaseLoginUitOmgeving({ SUPABASE_URL: 'https://ander.supabase.co' }, true)?.url,
      'https://ander.supabase.co',
    );
  });
});
