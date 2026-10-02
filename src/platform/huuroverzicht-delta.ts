/**
 * Delta-migratie huuroverzicht → Supabase (relaties, boekingen, betalingen).
 * Alleen mutaties uit het delta-JSON; idempotent via migration_source + migration_external_id.
 */

import { normEmail, normNaam, telefoonSleutel } from './consolidatie-dry-run.ts';

export const DELTA_MIGRATION_SOURCE = 'huuroverzicht_delta';

export interface HuuroverzichtDelta {
  source_period: { old: string; new: string };
  changes: DeltaChange[];
}

export type DeltaChange = {
  year: number;
  slot: string;
  date_start: string;
  date_end: string;
  person?: string;
  entity: string;
  action: string;
  changes?: Record<string, { old: string; new: string }>;
  record?: Record<string, string>;
  meaning?: string;
};

export interface DbBoeking {
  id: number;
  status: string;
  start_datum: string;
  eind_datum: string;
  huurder_naam_snapshot: string | null;
  huurder_email_snapshot: string | null;
  huurder_telefoon_snapshot: string | null;
  huurder_relatie_id: number | null;
  interne_titel: string;
  interne_notities: string | null;
  mede_exposanten: string | null;
  legacy_id: string | null;
  migration_source: string | null;
  migration_external_id: string | null;
  tarief_bedrag: string | null;
}

export interface DbRelatie {
  id: number;
  naam: string;
  email: string | null;
  telefoon: string | null;
  migration_source: string | null;
  migration_external_id: string | null;
  legacy_id: string | null;
}

export interface DbBetaling {
  id: number;
  boeking_id: number;
  soort: string;
  bedrag: string;
  status: string;
  vervaldatum: string | null;
  ontvangen_op: string | null;
  referentie: string | null;
  migration_source: string | null;
  migration_external_id: string | null;
}

export interface DbSnapshot {
  boekingen: DbBoeking[];
  relaties: DbRelatie[];
  betalingen: DbBetaling[];
}

export interface DryRunRegel {
  changeIndex: number;
  entiteit: string;
  actie: string;
  databaseId: string | number | null;
  veld: string;
  oud: string;
  nieuw: string;
  opmerking?: string;
}

export interface DeltaPlan {
  batchId: string;
  regels: DryRunRegel[];
  sql: string[];
  geblokkeerd: { changeIndex: number; reden: string }[];
  nietGematcht: { changeIndex: number; person: string; slot: string; reden: string }[];
  telling: {
    nieuweRelaties: number;
    nieuweBoekingen: number;
    geannuleerdeBoekingen: number;
    gewijzigdeBoekingen: number;
    betalingenGewijzigd: number;
    betalingenNieuw: number;
    correctiesRestituties: number;
  };
}

const BEDRAG = /(\d+(?:[.,]\d+)?)/;

function primaireNaam(persoon: string): string {
  return persoon.split(/\s+icm\s+/i)[0]?.trim() ?? persoon.trim();
}

function normPersoon(persoon: string): string {
  return normNaam(primaireNaam(persoon));
}

function namenLijkenOvereen(snapshot: string | null | undefined, persoon: string): boolean {
  if (!snapshot) return false;
  const a = normNaam(snapshot);
  const b = normPersoon(persoon);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const woordenA = a.split(/\s+/).filter(Boolean);
  const woordenB = b.split(/\s+/).filter(Boolean);
  if (woordenB.length >= 2 && woordenB.every((w) => a.includes(w))) return true;
  if (woordenA.length >= 2 && woordenA.every((w) => b.includes(w))) return true;
  return false;
}

function parseDatumUitTermijn(tekst: string): string | null {
  const s = tekst.replace(/\s+/g, ' ').trim();
  let m = s.match(/(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})/);
  if (m) {
    const dag = m[1].padStart(2, '0');
    const maand = m[2].padStart(2, '0');
    return `${m[3]}-${maand}-${dag}`;
  }
  m = s.match(/betaald\s+(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})/i);
  if (m) {
    const dag = m[1].padStart(2, '0');
    const maand = m[2].padStart(2, '0');
    return `${m[3]}-${maand}-${dag}`;
  }
  return null;
}

function parseBedrag(tekst: string): number | null {
  const m = tekst.replace(/\./g, '').match(BEDRAG);
  if (!m) return null;
  const waarde = Number(m[1].replace(',', '.'));
  return Number.isFinite(waarde) ? waarde : null;
}

function isAchterstalligFlag(tekst: string): boolean {
  return /\*\s*$/.test(tekst.trim()) || tekst.includes('*');
}

function isBetaaldTermijn(tekst: string): boolean {
  return /betaald/i.test(tekst) && !isAchterstalligFlag(tekst);
}

function deltaExternalId(batchId: string, change: DeltaChange, suffix = ''): string {
  const persoon = (change.person ?? 'slot').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  return `${batchId}:${change.date_start}:${persoon}${suffix ? `:${suffix}` : ''}`;
}

function escSql(val: string | null | undefined): string {
  if (val == null) return 'null';
  return `'${String(val).replace(/'/g, "''")}'`;
}

function matchBoeking(
  db: DbSnapshot,
  change: DeltaChange,
  person: string,
  record?: Record<string, string>,
): { match?: DbBoeking; conflict?: string } {
  const email = record?.email ? normEmail(record.email.replace(/\s+/g, '')) : '';
  const tel = record?.telefoon ? telefoonSleutel(record.telefoon) : '';

  const periode = db.boekingen.filter(
    (b) => b.start_datum === change.date_start && b.eind_datum === change.date_end,
  );

  const kandidaten = periode.filter((b) => {
    if (person && !namenLijkenOvereen(b.huurder_naam_snapshot, person)) {
      if (!email && !tel) return false;
    }
    if (email && normEmail(b.huurder_email_snapshot ?? '') === email) return true;
    if (tel && telefoonSleutel(b.huurder_telefoon_snapshot ?? '') === tel) return true;
    if (person && namenLijkenOvereen(b.huurder_naam_snapshot, person)) return true;
    return false;
  });

  if (kandidaten.length > 1) {
    return { conflict: `meerdere boekingen (${kandidaten.map((k) => k.id).join(', ')}) op ${change.date_start}` };
  }
  if (kandidaten.length === 1) return { match: kandidaten[0] };

  const alDelta = db.boekingen.find(
    (b) =>
      b.migration_source === DELTA_MIGRATION_SOURCE &&
      b.migration_external_id === deltaExternalId('', change),
  );
  if (alDelta) return { match: alDelta };

  return {};
}

function matchRelatie(db: DbSnapshot, record: Record<string, string>, persoon: string): { match?: DbRelatie; conflict?: string } {
  const email = normEmail(record.email?.replace(/\s+/g, '') ?? '');
  const tel = telefoonSleutel(record.telefoon ?? '');
  const naam = normNaam(primaireNaam(persoon));

  const opEmail = email ? db.relaties.filter((r) => normEmail(r.email ?? '') === email) : [];
  const opTel = tel && naam ? db.relaties.filter((r) => telefoonSleutel(r.telefoon ?? '') === tel && normNaam(r.naam) === naam) : [];
  const opNaam = db.relaties.filter((r) => normNaam(r.naam) === naam);

  const uniek = new Set([...opEmail, ...opTel, ...opNaam].map((r) => r.id));
  if (uniek.size > 1) return { conflict: 'meerdere relaties op e-mail/telefoon/naam' };
  const rij = opEmail[0] ?? opTel[0] ?? opNaam[0];
  return rij ? { match: rij } : {};
}

function betalingVoorBoeking(db: DbSnapshot, boekingId: number, soort: string): DbBetaling | undefined {
  return db.betalingen.find((p) => p.boeking_id === boekingId && p.soort === soort);
}

function voegNotitieToe(huidig: string | null, extra: string): string {
  const basis = (huidig ?? '').trim();
  if (!extra.trim()) return basis;
  if (basis.includes(extra.trim())) return basis;
  return basis ? `${basis}\n${extra.trim()}` : extra.trim();
}

function pushSql(plan: DeltaPlan, sql: string) {
  plan.sql.push(sql);
}

function telDelta(plan: DeltaPlan, key: keyof DeltaPlan['telling'], delta = 1) {
  plan.telling[key] += delta;
}

export function planHuuroverzichtDelta(delta: HuuroverzichtDelta, db: DbSnapshot): DeltaPlan {
  const batchId = delta.source_period.new.replace(/\//g, '-');
  const plan: DeltaPlan = {
    batchId,
    regels: [],
    sql: [],
    geblokkeerd: [],
    nietGematcht: [],
    telling: {
      nieuweRelaties: 0,
      nieuweBoekingen: 0,
      geannuleerdeBoekingen: 0,
      gewijzigdeBoekingen: 0,
      betalingenGewijzigd: 0,
      betalingenNieuw: 0,
      correctiesRestituties: 0,
    },
  };

  const pendingPaymentMoves: { vanBoekingId: number; naarExternalId: string }[] = [];
  let afkeBoekingIdVoorHerallocatie: number | null = null;

  delta.changes.forEach((change, changeIndex) => {
    const person = change.person ?? '';

    if (change.entity === 'availability' && change.action === 'reopen_slot') {
      plan.regels.push({
        changeIndex,
        entiteit: 'beschikbaarheid',
        actie: 'controle',
        databaseId: null,
        veld: 'slot',
        oud: change.slot,
        nieuw: 'beschikbaar',
        opmerking: 'Geen actieve boeking op periode na annuleringen',
      });
      return;
    }

    if (change.entity === 'booking_note' && change.action === 'correct') {
      const { match, conflict } = matchBoeking(db, change, person);
      if (conflict) {
        plan.geblokkeerd.push({ changeIndex, reden: conflict });
        return;
      }
      if (!match) {
        plan.nietGematcht.push({ changeIndex, person, slot: change.slot, reden: 'geen boeking' });
        return;
      }
      const noteKey = Object.keys(change.changes ?? {})[0] ?? 'notitie';
      const nieuw = change.changes?.[noteKey]?.new ?? '';
      const oud = match.interne_notities ?? '';
      const merged = voegNotitieToe(oud, nieuw);
      if (merged !== oud) {
        plan.regels.push({
          changeIndex,
          entiteit: 'boeking',
          actie: 'update',
          databaseId: match.id,
          veld: 'interne_notities',
          oud,
          nieuw: merged,
        });
        pushSql(
          plan,
          `update public.boekingen set interne_notities = ${escSql(merged)}, bijgewerkt_op = now() where id = ${match.id};`,
        );
        telDelta(plan, 'gewijzigdeBoekingen');
      }
      return;
    }

    if (change.entity === 'booking_payment' && change.action === 'update') {
      const { match, conflict } = matchBoeking(db, change, person);
      if (conflict) {
        plan.geblokkeerd.push({ changeIndex, reden: conflict });
        return;
      }
      if (!match) {
        plan.nietGematcht.push({ changeIndex, person, slot: change.slot, reden: 'geen boeking op periode+kenmerken' });
        return;
      }

      for (const [veld, wijziging] of Object.entries(change.changes ?? {})) {
        if (veld === 'betaling_in_2026_note') {
          const merged = voegNotitieToe(match.interne_notities, wijziging.new);
          if (merged !== (match.interne_notities ?? '')) {
            plan.regels.push({
              changeIndex,
              entiteit: 'boeking',
              actie: 'update',
              databaseId: match.id,
              veld: 'interne_notities',
              oud: match.interne_notities ?? '',
              nieuw: merged,
              opmerking: 'context overbetaling/restitutie',
            });
            pushSql(
              plan,
              `update public.boekingen set interne_notities = ${escSql(merged)}, bijgewerkt_op = now() where id = ${match.id};`,
            );
            telDelta(plan, 'gewijzigdeBoekingen');
          }
          if (/terug\s*betaald/i.test(wijziging.new)) {
            const ext = `${deltaExternalId(batchId, change, 'restitutie-100')}`;
            const bestaat = db.betalingen.some(
              (p) => p.migration_source === DELTA_MIGRATION_SOURCE && p.migration_external_id === ext,
            );
            if (!bestaat) {
              plan.regels.push({
                changeIndex,
                entiteit: 'betaling',
                actie: 'insert',
                databaseId: match.id,
                veld: 'restitutie',
                oud: '',
                nieuw: '100 ontvangen (terugbetaald)',
              });
              pushSql(
                plan,
                `insert into public.betalingen (boeking_id, soort, bedrag, status, ontvangen_op, referentie, migration_source, migration_external_id, migration_batch_id)
                 select ${match.id}, 'restitutie', 100, 'ontvangen', '2026-09-02'::timestamptz, 'huuroverzicht: overbetaling terugbetaald', '${DELTA_MIGRATION_SOURCE}', '${ext}', '${batchId}'
                 where not exists (select 1 from public.betalingen where migration_source='${DELTA_MIGRATION_SOURCE}' and migration_external_id='${ext}');`,
              );
              telDelta(plan, 'betalingenNieuw');
              telDelta(plan, 'correctiesRestituties');
            }
          }
          continue;
        }

        const soort = veld === 'termijn_1' ? 'aanbetaling' : veld === 'termijn_2' ? 'restant' : '';
        if (!soort) continue;

        if (isAchterstalligFlag(wijziging.new) && !isBetaaldTermijn(wijziging.new)) {
          const betaling = betalingVoorBoeking(db, match.id, soort);
          if (!betaling) continue;
          const ref = voegNotitieToe(betaling.referentie, 'achterstallig/follow-up (huuroverzicht *)');
          if (ref !== (betaling.referentie ?? '')) {
            plan.regels.push({
              changeIndex,
              entiteit: 'betaling',
              actie: 'update',
              databaseId: betaling.id,
              veld: 'referentie',
              oud: betaling.referentie ?? '',
              nieuw: ref,
            });
            pushSql(
              plan,
              `update public.betalingen set referentie = ${escSql(ref)} where id = ${betaling.id};`,
            );
            telDelta(plan, 'betalingenGewijzigd');
          }
          continue;
        }

        if (isBetaaldTermijn(wijziging.new)) {
          const bedrag = parseBedrag(wijziging.new) ?? parseBedrag(wijziging.old);
          const datum = parseDatumUitTermijn(wijziging.new);
          const betaling = betalingVoorBoeking(db, match.id, soort);
          if (betaling) {
            if (betaling.status !== 'ontvangen' || (datum && !betaling.ontvangen_op)) {
              plan.regels.push({
                changeIndex,
                entiteit: 'betaling',
                actie: 'update',
                databaseId: betaling.id,
                veld: 'status/ontvangen_op',
                oud: `${betaling.status} ${betaling.ontvangen_op ?? ''}`.trim(),
                nieuw: `ontvangen ${datum ?? ''}`.trim(),
              });
              pushSql(
                plan,
                `update public.betalingen set status = 'ontvangen', ontvangen_op = coalesce(${datum ? `'${datum}'::timestamptz` : 'ontvangen_op'}, ontvangen_op), vervaldatum = null where id = ${betaling.id} and status is distinct from 'ontvangen';`,
              );
              telDelta(plan, 'betalingenGewijzigd');
            }
          } else if (bedrag != null) {
            const ext = `${deltaExternalId(batchId, change, soort)}`;
            plan.regels.push({
              changeIndex,
              entiteit: 'betaling',
              actie: 'insert',
              databaseId: match.id,
              veld: soort,
              oud: '',
              nieuw: `${bedrag} ontvangen ${datum ?? ''}`.trim(),
            });
            pushSql(
              plan,
              `insert into public.betalingen (boeking_id, soort, bedrag, status, ontvangen_op, migration_source, migration_external_id, migration_batch_id)
               select ${match.id}, '${soort}', ${bedrag}, 'ontvangen', ${datum ? `'${datum}'::timestamptz` : 'null'}, '${DELTA_MIGRATION_SOURCE}', '${ext}', '${batchId}'
               where not exists (select 1 from public.betalingen where migration_source='${DELTA_MIGRATION_SOURCE}' and migration_external_id='${ext}');`,
            );
            telDelta(plan, 'betalingenNieuw');
          }
        }
      }
      return;
    }

    if (change.entity === 'booking') {
      if (change.action === 'update') {
        const { match, conflict } = matchBoeking(db, change, person);
        if (conflict) {
          plan.geblokkeerd.push({ changeIndex, reden: conflict });
          return;
        }
        if (!match) {
          plan.nietGematcht.push({ changeIndex, person, slot: change.slot, reden: 'geen boeking' });
          return;
        }

        for (const [veld, wijziging] of Object.entries(change.changes ?? {})) {
          if (veld === 'slot_label' && /geannuleerd/i.test(wijziging.new)) {
            if (/afke van halen/i.test(person)) afkeBoekingIdVoorHerallocatie = match.id;
            if (match.status !== 'geannuleerd') {
              plan.regels.push({
                changeIndex,
                entiteit: 'boeking',
                actie: 'update',
                databaseId: match.id,
                veld: 'status',
                oud: match.status,
                nieuw: 'geannuleerd',
              });
              pushSql(
                plan,
                `update public.boekingen set status = 'geannuleerd', interne_titel = ${escSql(wijziging.new.replace(/\s*geannuleerd/i, '').trim() + ' geannuleerd')}, bijgewerkt_op = now() where id = ${match.id};`,
              );
              telDelta(plan, 'gewijzigdeBoekingen');
              telDelta(plan, 'geannuleerdeBoekingen');
            }
          }
          if (veld === 'huurder') {
            const mede = wijziging.new.includes('icm') ? wijziging.new.split(/\s+icm\s+/i).slice(1).join(' icm ') : '';
            plan.regels.push({
              changeIndex,
              entiteit: 'boeking',
              actie: 'update',
              databaseId: match.id,
              veld: 'huurder_naam_snapshot/mede_exposanten',
              oud: `${match.huurder_naam_snapshot ?? ''} | ${match.mede_exposanten ?? ''}`,
              nieuw: `${primaireNaam(wijziging.new)} | ${mede}`,
            });
            pushSql(
              plan,
              `update public.boekingen set huurder_naam_snapshot = ${escSql(primaireNaam(wijziging.new))}, mede_exposanten = ${mede ? escSql(mede) : 'null'}, bijgewerkt_op = now() where id = ${match.id};`,
            );
            telDelta(plan, 'gewijzigdeBoekingen');
          }
        }
        return;
      }

      if (change.action === 'insert_cancelled_booking' || change.action === 'insert' || change.action === 'insert_replacement_booking') {
        const record = change.record ?? {};
        const ext = deltaExternalId(batchId, change);
        const bestaat = db.boekingen.some(
          (b) => b.migration_source === DELTA_MIGRATION_SOURCE && b.migration_external_id === ext,
        );
        if (bestaat) return;

        const { match: overlap } = matchBoeking(db, change, person, record);
        if (overlap && change.action !== 'insert_replacement_booking') {
          plan.regels.push({
            changeIndex,
            entiteit: 'boeking',
            actie: 'skip',
            databaseId: overlap.id,
            veld: 'insert',
            oud: '',
            nieuw: 'bestaat al',
          });
          return;
        }

        let relatieId: number | null = null;
        const rel = matchRelatie(db, record, person || record.huurder || '');
        if (rel.conflict) {
          plan.geblokkeerd.push({ changeIndex, reden: rel.conflict });
          return;
        }
        if (rel.match) relatieId = rel.match.id;
        else {
          const naam = primaireNaam(record.huurder || person);
          plan.regels.push({
            changeIndex,
            entiteit: 'relatie',
            actie: 'insert',
            databaseId: null,
            veld: 'naam',
            oud: '',
            nieuw: naam,
          });
          const relExt = `${ext}:relatie`;
          pushSql(
            plan,
            `insert into public.relaties (naam, email, telefoon, migration_source, migration_external_id, migration_batch_id)
             select ${escSql(naam)}, ${record.email ? escSql(record.email.replace(/\s+/g, '')) : 'null'}, ${record.telefoon ? escSql(record.telefoon) : 'null'}, '${DELTA_MIGRATION_SOURCE}', '${relExt}', '${batchId}'
             where not exists (select 1 from public.relaties where migration_source='${DELTA_MIGRATION_SOURCE}' and migration_external_id='${relExt}')
             returning id;`,
          );
          telDelta(plan, 'nieuweRelaties');
          pushSql(
            plan,
            `-- relatie_id voor ${ext} via subselect`,
          );
          relatieId = null;
        }

        const status =
          change.action === 'insert_cancelled_booking' ? 'geannuleerd' : 'migratie_vastgelegd';
        const titel = (record.slot_label || change.slot).replace(/\s*geannuleerd.*/i, '').trim() || change.slot;
        const notities = voegNotitieToe(record.bijzonderheden ?? '', record.legacy_payment_note ?? '');
        const tarief = parseBedrag(record.te_betalen ?? '') ?? 490;
        const huurderNaam = record.huurder || person;
        const email = record.email?.replace(/\s+/g, '') ?? null;
        const relatieExpr = relatieId
          ? String(relatieId)
          : `(select id from public.relaties where migration_source='${DELTA_MIGRATION_SOURCE}' and migration_external_id='${ext}:relatie' limit 1)`;

        plan.regels.push({
          changeIndex,
          entiteit: 'boeking',
          actie: 'insert',
          databaseId: ext,
          veld: 'boeking',
          oud: '',
          nieuw: `${huurderNaam} ${status}`,
        });
        pushSql(
          plan,
          `insert into public.boekingen (
            status, interne_titel, start_datum, eind_datum, huurder_relatie_id,
            huurder_naam_snapshot, huurder_email_snapshot, huurder_telefoon_snapshot,
            interne_notities, tarief_bedrag, migration_source, migration_external_id, migration_batch_id
          )
          select '${status}', ${escSql(titel)}, '${change.date_start}', '${change.date_end}', ${relatieExpr},
            ${escSql(huurderNaam)}, ${email ? escSql(email) : 'null'}, ${record.telefoon ? escSql(record.telefoon) : 'null'},
            ${notities ? escSql(notities) : 'null'}, ${tarief}, '${DELTA_MIGRATION_SOURCE}', '${ext}', '${batchId}'
          where not exists (select 1 from public.boekingen where migration_source='${DELTA_MIGRATION_SOURCE}' and migration_external_id='${ext}');`,
        );
        telDelta(plan, 'nieuweBoekingen');
        if (status === 'geannuleerd') telDelta(plan, 'geannuleerdeBoekingen');

        if (change.action === 'insert_replacement_booking' && afkeBoekingIdVoorHerallocatie) {
          pendingPaymentMoves.push({ vanBoekingId: afkeBoekingIdVoorHerallocatie, naarExternalId: ext });
        }

        const term1 = record.termijn_1 ?? '';
        const term2 = record.termijn_2 ?? '';
        for (const [termijn, soort] of [
          [term1, 'aanbetaling'],
          [term2, 'restant'],
        ] as const) {
          if (!termijn || isAchterstalligFlag(termijn)) continue;
          if (!isBetaaldTermijn(termijn)) continue;
          const bedrag = parseBedrag(termijn);
          const datum = parseDatumUitTermijn(termijn);
          if (bedrag == null) continue;
          const payExt = `${ext}:${soort}`;
          pushSql(
            plan,
            `insert into public.betalingen (boeking_id, soort, bedrag, status, ontvangen_op, migration_source, migration_external_id, migration_batch_id)
             select b.id, '${soort}', ${bedrag}, 'ontvangen', ${datum ? `'${datum}'::timestamptz` : 'null'}, '${DELTA_MIGRATION_SOURCE}', '${payExt}', '${batchId}'
             from public.boekingen b
             where b.migration_source='${DELTA_MIGRATION_SOURCE}' and b.migration_external_id='${ext}'
             and not exists (select 1 from public.betalingen p where p.migration_source='${DELTA_MIGRATION_SOURCE}' and p.migration_external_id='${payExt}');`,
          );
          telDelta(plan, 'betalingenNieuw');
        }
      }
    }
  });

  for (const move of pendingPaymentMoves) {
    plan.regels.push({
      changeIndex: -1,
      entiteit: 'betaling',
      actie: 'reassociate',
      databaseId: move.vanBoekingId,
      veld: 'boeking_id',
      oud: String(move.vanBoekingId),
      nieuw: move.naarExternalId,
      opmerking: 'Bestaande ontvangsten van Afke; geen dubbele omzet',
    });
    pushSql(
      plan,
      `update public.betalingen p set boeking_id = (select id from public.boekingen where migration_source='${DELTA_MIGRATION_SOURCE}' and migration_external_id='${move.naarExternalId}' limit 1)
       where p.boeking_id = ${move.vanBoekingId} and p.soort in ('aanbetaling','restant') and p.status = 'ontvangen'
       and not exists (
         select 1 from public.betalingen p2
         join public.boekingen b2 on b2.id = p2.boeking_id
         where b2.migration_source='${DELTA_MIGRATION_SOURCE}' and b2.migration_external_id='${move.naarExternalId}'
           and p2.soort = p.soort and p2.status = 'ontvangen'
       );`,
    );
    telDelta(plan, 'betalingenGewijzigd');
  }

  return plan;
}

export function formatDryRun(plan: DeltaPlan): string {
  const lines = [
    `Huuroverzicht delta dry-run (batch ${plan.batchId})`,
    '',
    'Mutaties:',
  ];
  for (const r of plan.regels) {
    lines.push(
      `  [${r.changeIndex}] ${r.entiteit} #${r.databaseId ?? '—'} | ${r.actie} | ${r.veld}: ${JSON.stringify(r.oud)} → ${JSON.stringify(r.nieuw)}${r.opmerking ? ` (${r.opmerking})` : ''}`,
    );
  }
  if (plan.geblokkeerd.length) {
    lines.push('', 'Geblokkeerd (niet-unieke match):');
    for (const g of plan.geblokkeerd) lines.push(`  [${g.changeIndex}] ${g.reden}`);
  }
  if (plan.nietGematcht.length) {
    lines.push('', 'Niet gematcht:');
    for (const n of plan.nietGematcht) lines.push(`  [${n.changeIndex}] ${n.person} @ ${n.slot}: ${n.reden}`);
  }
  lines.push(
    '',
    `Telling: relaties+${plan.telling.nieuweRelaties} boekingen+${plan.telling.nieuweBoekingen} geannuleerd+${plan.telling.geannuleerdeBoekingen} boeking-wijz+${plan.telling.gewijzigdeBoekingen} betaling-wijz+${plan.telling.betalingenGewijzigd} betaling-nieuw+${plan.telling.betalingenNieuw} restitutie/correctie+${plan.telling.correctiesRestituties}`,
  );
  return lines.join('\n');
}
