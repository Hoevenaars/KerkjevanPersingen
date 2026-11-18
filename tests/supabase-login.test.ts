import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STANDAARD_SUPABASE_URL,
  previewRaaktProductie,
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

  test('een preview op het productieproject schrijft niet; productie en een andere host wel', () => {
    const productie = { VERCEL_ENV: 'preview', SUPABASE_URL: STANDAARD_SUPABASE_URL };
    assert.equal(previewRaaktProductie(productie), true);
    assert.equal(previewRaaktProductie({ VERCEL_ENV: 'preview' }), true);
    assert.equal(previewRaaktProductie({ VERCEL_ENV: 'production', SUPABASE_URL: STANDAARD_SUPABASE_URL }), false);
    assert.equal(previewRaaktProductie({ VERCEL_ENV: 'preview', SUPABASE_URL: 'https://staging.supabase.co' }), false);
    assert.equal(previewRaaktProductie({}), false);
  });

  test('het standaardproject vult alleen aan als daarom gevraagd wordt', () => {
    assert.equal(supabaseLoginUitOmgeving({}, true)?.url, STANDAARD_SUPABASE_URL);
    assert.equal(
      supabaseLoginUitOmgeving({ SUPABASE_URL: 'https://ander.supabase.co' }, true)?.url,
      'https://ander.supabase.co',
    );
  });
});
