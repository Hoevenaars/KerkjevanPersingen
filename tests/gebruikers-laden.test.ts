import assert from 'node:assert/strict';
import test from 'node:test';
import { laadAlleGebruikers } from '../src/lib/beheer-gebruikers.ts';
import { leesbareSupabaseFout } from '../src/lib/supabase.ts';

test('een geweigerde sleutel wordt Nederlands, ook als het geen Error is', () => {
  assert.match(
    leesbareSupabaseFout({ message: 'Invalid API key' }, 'Gebruikers konden niet worden geladen.'),
    /weigert de sleutel/,
  );
  assert.equal(
    leesbareSupabaseFout({ code: 'x' }, 'Gebruikers konden niet worden geladen.'),
    'Gebruikers konden niet worden geladen.',
  );
});

test('de gebruikerslijst geeft de PostgREST-melding door als Error', async () => {
  const client = {
    from() {
      return {
        select() {
          return {
            order: () => Promise.resolve({ data: null, error: { message: 'Invalid API key' } }),
          };
        },
      };
    },
  };

  await assert.rejects(
    () => laadAlleGebruikers(client as never),
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      assert.match(leesbareSupabaseFout(error, 'Gebruikers konden niet worden geladen.'), /weigert de sleutel/);
      return true;
    },
  );
});
