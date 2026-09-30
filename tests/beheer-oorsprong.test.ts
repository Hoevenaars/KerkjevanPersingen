import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { zelfdeOorsprong } from '../src/lib/beheer-http.ts';

function verzoek(url: string, headers: Record<string, string>, methode = 'POST'): Request {
  return new Request(url, { method: methode, headers });
}

describe('zelfde oorsprong voor beheer-formulieren', () => {
  test('het publieke domein mag opslaan, ook als de server een intern adres ziet', () => {
    const intern = verzoek('http://127.0.0.1:4321/api/beheer/rollen', {
      origin: 'https://kerkjepersingen.nl',
      host: '127.0.0.1:4321',
    });
    assert.equal(zelfdeOorsprong(intern), true);
  });

  test('een vreemde site mag niet', () => {
    const vreemd = verzoek('https://kerkjepersingen.nl/api/beheer/rollen', {
      origin: 'https://evil.example',
      host: 'kerkjepersingen.nl',
    });
    assert.equal(zelfdeOorsprong(vreemd), false);
  });

  test('lokaal beheer en een doorgestuurd preview-adres blijven geldig', () => {
    const lokaal = verzoek('http://127.0.0.1:4321/api/beheer/rollen', {
      origin: 'http://127.0.0.1:4321',
    });
    assert.equal(zelfdeOorsprong(lokaal), true);

    const preview = verzoek('http://127.0.0.1:4321/api/beheer/rollen', {
      origin: 'https://kerkje-git-preview.vercel.app',
      host: '127.0.0.1:4321',
      'x-forwarded-host': 'kerkje-git-preview.vercel.app',
      'x-forwarded-proto': 'https',
    });
    assert.equal(zelfdeOorsprong(preview), true);
  });
});
