import assert from 'node:assert/strict';
import test from 'node:test';
import { metBeheerHeaders } from '../src/lib/beheer-http.ts';
import {
  annuleerBoeking,
  annuleerBoekingViaSessie,
  type AnnuleerAudit,
  type AnnuleerDb,
  type AnnuleerSessie,
} from '../src/lib/operatie/annuleer-boeking.ts';

function geheugen(status = 'migratie_vastgelegd', jobs = 0): AnnuleerDb & { audits: AnnuleerAudit[]; status: string; jobs: number } {
  const staat = { status, jobs, audits: [] as AnnuleerAudit[] };
  return {
    get status() {
      return staat.status;
    },
    get jobs() {
      return staat.jobs;
    },
    audits: staat.audits,
    async leesStatus() {
      return { status: staat.status };
    },
    async zetGeannuleerd() {
      staat.status = 'geannuleerd';
      return { status: staat.status };
    },
    async annuleerOpenJobs() {
      return {};
    },
    async aantalJobs() {
      return staat.jobs;
    },
    async schrijfAudit(rij) {
      staat.audits.push(rij);
      return {};
    },
  };
}

test('annuleren zet de status op geannuleerd en schrijft audit, zonder extra jobs', async () => {
  const db = geheugen();
  const uit = await annuleerBoeking(db, 48, '', { type: 'gebruiker', naam: 'Nelleke', id: 'niet-een-uuid' });
  assert.equal(uit.ok, true);
  assert.equal(db.status, 'geannuleerd');
  assert.equal(db.jobs, 0);
  assert.equal(db.audits[0]?.van, 'migratie_vastgelegd');
  assert.equal(db.audits[0]?.naar, 'geannuleerd');
  assert.equal(db.audits[0]?.onderwerp_id, '48');
  assert.equal(db.audits[0]?.actor_id, null);
  assert.match(db.audits[0]?.dedup_sleutel ?? '', /^boeking:48:geannuleerd$/);
});

test('een tweede annulering laat de boeking geannuleerd en maakt geen tweede audit', async () => {
  const db = geheugen('geannuleerd');
  const uit = await annuleerBoeking(db, 48, '', { type: 'gebruiker', naam: 'Nelleke' });
  assert.equal(uit.ok, true);
  assert.equal(uit.melding, 'Boeking was al geannuleerd.');
  assert.equal(db.audits.length, 0);
});

test('een vreemde-sleutel op de actor wordt opnieuw geprobeerd zonder actor-id', async () => {
  let pogingen = 0;
  const db = geheugen();
  db.schrijfAudit = async (rij) => {
    pogingen += 1;
    if (pogingen === 1 && rij.actor_id) return { fout: 'fk', code: '23503' };
    db.audits.push(rij);
    return {};
  };
  const uit = await annuleerBoeking(db, 48, '7 en 8 november', {
    type: 'gebruiker',
    naam: 'Nelleke',
    id: '11111111-1111-4111-8111-111111111111',
  });
  assert.equal(uit.ok, true);
  assert.equal(pogingen, 2);
  assert.equal(db.audits[0]?.actor_id, null);
  assert.equal(db.audits[0]?.reden, '7 en 8 november');
});

test('een nieuwe mailjob laat de annulering niet als geslaagd gelden', async () => {
  const db = geheugen('definitief', 0);
  let telling = 0;
  db.aantalJobs = async () => {
    telling += 1;
    return telling === 1 ? 0 : 1;
  };
  const uit = await annuleerBoeking(db, 48, '', { type: 'gebruiker', naam: 'Nelleke' });
  assert.equal(uit.ok, false);
});

test('de sessie werkt de boeking bij en maakt geen communicatiejob', async () => {
  const aangeroepen: string[] = [];
  let status = 'migratie_vastgelegd';
  const client: AnnuleerSessie = {
    from(tabel) {
      const stappen: string[] = [tabel];
      const query = {
        select(kolommen: string) {
          stappen.push(`select:${kolommen}`);
          return query;
        },
        update(waarden: Record<string, unknown>) {
          stappen.push(`update:${tabel}:${String(waarden.status ?? '')}`);
          if (tabel === 'boekingen') status = String(waarden.status);
          return query;
        },
        insert(rij: AnnuleerAudit) {
          stappen.push('insert:auditlog');
          aangeroepen.push(stappen.join('>'));
          assert.equal(rij.naar, 'geannuleerd');
          return Promise.resolve({ error: null });
        },
        eq() {
          return query;
        },
        neq() {
          return query;
        },
        maybeSingle() {
          aangeroepen.push(stappen.join('>'));
          return Promise.resolve({ data: { status }, error: null });
        },
        then(resolve: (waarde: { data: null; error: null; count: number }) => unknown) {
          aangeroepen.push(stappen.join('>'));
          return Promise.resolve({ data: null, error: null, count: 0 }).then(resolve);
        },
      };
      return query;
    },
  };
  const uit = await annuleerBoekingViaSessie(client, 48, '', { type: 'gebruiker', naam: 'Beheer' });
  assert.equal(uit.ok, true);
  assert.equal(status, 'geannuleerd');
  assert.equal(aangeroepen.some((stap) => stap.startsWith('communicatie_jobs>insert')), false);
  assert.equal(aangeroepen.some((stap) => stap.includes('update:boekingen:geannuleerd')), true);
  assert.equal(aangeroepen.some((stap) => stap.includes('insert:auditlog')), true);
});

test('een redirect houdt status 303 nadat beheerheaders zijn gezet', () => {
  const redirect = Response.redirect('https://kerkjepersingen.nl/beheer/boekingen/48/?melding=klaar', 303);
  assert.throws(() => redirect.headers.set('Cache-Control', 'no-store'));
  const uit = metBeheerHeaders(redirect);
  assert.equal(uit.status, 303);
  assert.equal(uit.headers.get('Location'), 'https://kerkjepersingen.nl/beheer/boekingen/48/?melding=klaar');
  assert.equal(uit.headers.get('Cache-Control'), 'no-store');
  assert.equal(uit.headers.get('X-Robots-Tag'), 'noindex, nofollow');
});
