/**
 * Machineleesbare mapping van het consolidatiepakket naar het bestaande schema.
 * Stabiele sleutels (REL-*, BKG-*, PAY-*, ASN-*, ROL-*, BLK-*) blijven
 * migratiesleutels. Ze vervangen geen primaire sleutel.
 *
 * Dit bestand schrijft niets. De dry-run staat in consolidatie-dry-run.ts.
 */

export interface ConsolidatieVeld {
  bronBestand: string;
  bronVeld: string;
  doelTabel: string;
  doelVeld: string;
  regel: string;
}

export interface SchemaWijziging {
  id: string;
  nodigVoor: string;
  voorstel: string;
}

export const CONSOLIDATIE_VELDEN: readonly ConsolidatieVeld[] = [
  { bronBestand: 'relaties.csv', bronVeld: 'relatie_id', doelTabel: 'domeinrij', doelVeld: 'migration_external_id', regel: 'Geen primaire sleutel. Lookup vóór e-mail en telefoon+naam.' },
  { bronBestand: 'relaties.csv', bronVeld: 'naam', doelTabel: 'relaties', doelVeld: 'naam', regel: 'Lege bron vult een gevulde naam niet leeg.' },
  { bronBestand: 'relaties.csv', bronVeld: 'email', doelTabel: 'relaties', doelVeld: 'email', regel: 'Exact, genormaliseerd naar trim+lowercase. Geen match op lege waarde.' },
  { bronBestand: 'relaties.csv', bronVeld: 'telefoon', doelTabel: 'relaties', doelVeld: 'telefoon', regel: 'Alleen samen met exact genormaliseerde naam. Cijfers, 0-prefix gelijk aan 31.' },
  { bronBestand: 'relaties.csv', bronVeld: 'adres_raw', doelTabel: 'relaties', doelVeld: 'adres', regel: 'Ongewijzigd overnemen als de bronwaarde gevuld is.' },
  { bronBestand: 'relaties.csv', bronVeld: 'geboortedatum', doelTabel: 'relaties', doelVeld: 'geboortedatum', regel: 'Kolom ontbreekt. Alleen een geldige ISO-datum, nooit een kapotte bronwaarde.' },
  { bronBestand: 'relaties.csv', bronVeld: 'geboortedatum_raw', doelTabel: 'domeinrij', doelVeld: 'raw', regel: 'Niet naar een datumkolom als de waarde onvolledig is.' },
  { bronBestand: 'relaties.csv', bronVeld: 'naam_bronwaarden', doelTabel: 'domeinrij', doelVeld: 'raw', regel: 'Audit. Geen fuzzy merge.' },
  { bronBestand: 'relaties.csv', bronVeld: 'email_bronwaarden', doelTabel: 'domeinrij', doelVeld: 'raw', regel: 'Audit.' },
  { bronBestand: 'relaties.csv', bronVeld: 'telefoon_bronwaarden', doelTabel: 'domeinrij', doelVeld: 'raw', regel: 'Audit.' },
  { bronBestand: 'relaties.csv', bronVeld: 'bronreferenties', doelTabel: 'domeinrij', doelVeld: 'raw', regel: 'Koppelt reviewregels zoals RELC-VOL-* aan een REL-*.' },
  { bronBestand: 'relaties.csv', bronVeld: 'review_status', doelTabel: '(poort)', doelVeld: '(geen)', regel: 'Alleen OK mag automatisch. REVIEW_NEEDED blokkeert de rij.' },

  { bronBestand: 'rollen.csv', bronVeld: 'rol_id', doelTabel: 'domeinrij', doelVeld: 'migration_external_id', regel: 'Junction blijft relatie_rollen, niet beheer_rollen.' },
  { bronBestand: 'rollen.csv', bronVeld: 'relatie_id', doelTabel: 'relatie_rollen', doelVeld: 'relatie_id', regel: 'Bestaande relatie, pas na de relatiepoort.' },
  { bronBestand: 'rollen.csv', bronVeld: 'rol', doelTabel: 'relatie_rollen', doelVeld: 'rol', regel: 'Eén rij per rol. rol_raw wordt niet in één tekstveld geplakt.' },
  { bronBestand: 'rollen.csv', bronVeld: 'rol_raw', doelTabel: 'domeinrij', doelVeld: 'raw', regel: 'Audit van de gecombineerde bronrol.' },
  { bronBestand: 'rollen.csv', bronVeld: 'bronbestand', doelTabel: 'domeinrij', doelVeld: 'migration_source_file', regel: 'Herkomst.' },

  { bronBestand: 'boekingen.csv', bronVeld: 'boeking_id', doelTabel: 'domeinrij', doelVeld: 'migration_external_id', regel: 'Ook boekingen.nummer, uniek, zonder de bigint-sleutel te vervangen.' },
  { bronBestand: 'boekingen.csv', bronVeld: 'datum_start', doelTabel: 'boekingen', doelVeld: 'start_datum', regel: 'Alleen als date_parse_status=high.' },
  { bronBestand: 'boekingen.csv', bronVeld: 'datum_eind', doelTabel: 'boekingen', doelVeld: 'eind_datum', regel: 'Alleen als date_parse_status=high.' },
  { bronBestand: 'boekingen.csv', bronVeld: 'datum_suggestie', doelTabel: '(niet)', doelVeld: '(geen)', regel: 'Nooit automatisch als datum importeren.' },
  { bronBestand: 'boekingen.csv', bronVeld: 'status', doelTabel: 'boekingen', doelVeld: 'status', regel: 'actief→migratie_vastgelegd, optie→optie, geannuleerd→geannuleerd. actief wordt geen definitief, zodat historische overlap de bezettingsconstraint niet raakt.' },
  { bronBestand: 'boekingen.csv', bronVeld: 'type', doelTabel: 'boekingen', doelVeld: 'verhuurtype_sleutel', regel: 'huwelijk→bruiloft. pasen en pinksteren blijven leeg; dat zijn geen verhuurtypen.' },
  { bronBestand: 'boekingen.csv', bronVeld: 'huurder_primair_naam', doelTabel: 'boekingen', doelVeld: 'huurder_naam_snapshot', regel: 'Snapshot. Geen nieuwe relatie op alleen naam.' },
  { bronBestand: 'boekingen.csv', bronVeld: 'relatie_id', doelTabel: 'boekingen', doelVeld: 'huurder_relatie_id', regel: 'Alleen als die relatie zelf importeerbaar is.' },
  { bronBestand: 'boekingen.csv', bronVeld: 'telefoon_raw', doelTabel: 'boekingen', doelVeld: 'huurder_telefoon_snapshot', regel: 'Achterhouden als review.csv het veld telefoon raakt.' },
  { bronBestand: 'boekingen.csv', bronVeld: 'email_raw', doelTabel: 'boekingen', doelVeld: 'huurder_email_snapshot', regel: 'Achterhouden als review.csv het veld email raakt.' },
  { bronBestand: 'boekingen.csv', bronVeld: 'cont_raw', doelTabel: 'domeinrij', doelVeld: 'raw', regel: 'Betekenis van Cont. is niet bewezen. Niet naar aanbetaling_ontvangen.' },
  { bronBestand: 'boekingen.csv', bronVeld: 'totaal_eur', doelTabel: 'boekingen', doelVeld: 'tarief_bedrag', regel: 'Alleen bij een eenduidig bedrag zonder review op totaal of termijnen.' },
  { bronBestand: 'boekingen.csv', bronVeld: 'totaal_raw', doelTabel: 'domeinrij', doelVeld: 'raw', regel: 'Blijft leidend voor audit.' },
  { bronBestand: 'boekingen.csv', bronVeld: 'bijzonderheden_raw', doelTabel: 'boekingen', doelVeld: 'interne_notities', regel: 'Alleen meenemen als de boeking zelf importeerbaar is.' },
  { bronBestand: 'boekingen.csv', bronVeld: 'contract_datum', doelTabel: 'domeinrij', doelVeld: 'raw', regel: 'Geen contractdatumkolom op boekingen.' },
  { bronBestand: 'boekingen.csv', bronVeld: 'bronbestand', doelTabel: 'domeinrij', doelVeld: 'migration_source_file', regel: 'Herkomst.' },
  { bronBestand: 'boekingen.csv', bronVeld: 'bronregel', doelTabel: 'domeinrij', doelVeld: 'migration_source_row', regel: 'Herkomst.' },
  { bronBestand: 'boekingen.csv', bronVeld: 'review_status', doelTabel: '(poort)', doelVeld: '(geen)', regel: 'REVIEW_NEEDED blokkeert de hele boeking.' },

  { bronBestand: 'betalingen.csv', bronVeld: 'betaling_id', doelTabel: 'domeinrij', doelVeld: 'migration_external_id', regel: 'Uniek per broncel.' },
  { bronBestand: 'betalingen.csv', bronVeld: 'boeking_id', doelTabel: 'betalingen', doelVeld: 'boeking_id', regel: 'Alleen als de boeking importeerbaar is.' },
  { bronBestand: 'betalingen.csv', bronVeld: 'soort', doelTabel: 'betalingen', doelVeld: 'soort', regel: 'termijn_1→aanbetaling, termijn_2→restant. historisch_* past niet in de huidige check en wacht op schema.' },
  { bronBestand: 'betalingen.csv', bronVeld: 'bedrag_eur_eerste_waarde', doelTabel: 'betalingen', doelVeld: 'bedrag', regel: 'Niet schrijven bij een lege waarde, meerdere bedragen in de cel, of parse_status=REVIEW_NEEDED.' },
  { bronBestand: 'betalingen.csv', bronVeld: 'status', doelTabel: 'betalingen', doelVeld: 'status', regel: 'betaald→ontvangen, openstaand→open. onbekend en gemengd blijven review.' },
  { bronBestand: 'betalingen.csv', bronVeld: 'betaaldatum', doelTabel: 'betalingen', doelVeld: 'ontvangen_op', regel: 'Alleen een geldige datum bij status ontvangen, en niet als review de datum afkeurt.' },
  { bronBestand: 'betalingen.csv', bronVeld: 'vervaldatum', doelTabel: 'betalingen', doelVeld: 'vervaldatum', regel: 'Alleen een geldige datum zonder datumreview.' },
  { bronBestand: 'betalingen.csv', bronVeld: 'raw', doelTabel: 'domeinrij', doelVeld: 'raw', regel: 'Altijd bewaren. Niet als financiële waarheid gebruiken.' },
  { bronBestand: 'betalingen.csv', bronVeld: 'parse_status', doelTabel: '(poort)', doelVeld: '(geen)', regel: 'REVIEW_NEEDED blokkeert de betaalregel.' },

  { bronBestand: 'gastbegeleider_toewijzingen.csv', bronVeld: 'toewijzing_id', doelTabel: 'domeinrij', doelVeld: 'migration_external_id', regel: 'Nieuwe tabel; past niet in één gastheer_relatie_id.' },
  { bronBestand: 'gastbegeleider_toewijzingen.csv', bronVeld: 'boeking_id', doelTabel: 'gastbegeleider_toewijzingen', doelVeld: 'boeking_id', regel: 'Boeking moet importeerbaar zijn.' },
  { bronBestand: 'gastbegeleider_toewijzingen.csv', bronVeld: 'gastbegeleider_relatie_id', doelTabel: 'gastbegeleider_toewijzingen', doelVeld: 'relatie_id', regel: 'Relatie moet importeerbaar zijn.' },
  { bronBestand: 'gastbegeleider_toewijzingen.csv', bronVeld: 'type', doelTabel: 'gastbegeleider_toewijzingen', doelVeld: 'type', regel: 'dienst en assist. x wordt niet geïmporteerd.' },
  { bronBestand: 'gastbegeleider_toewijzingen.csv', bronVeld: 'bronwaarde', doelTabel: 'gastbegeleider_toewijzingen', doelVeld: 'bronwaarde', regel: 'dienst, ASSIST of x. x heeft advies NIET_IMPORTEREN.' },
  { bronBestand: 'gastbegeleider_toewijzingen.csv', bronVeld: 'match_confidence', doelTabel: '(poort)', doelVeld: '(geen)', regel: 'low blokkeert, ook als import_advies IMPORT is.' },
  { bronBestand: 'gastbegeleider_toewijzingen.csv', bronVeld: 'gastbegeleider_kolom', doelTabel: 'domeinrij', doelVeld: 'raw', regel: 'Datumslot-context.' },

  { bronBestand: 'kalender_blokkades.csv', bronVeld: 'blokkade_id', doelTabel: 'domeinrij', doelVeld: 'migration_external_id', regel: 'Ook interne_activiteiten.legacy_id met legacy_source=consolidatie.' },
  { bronBestand: 'kalender_blokkades.csv', bronVeld: 'datum_start', doelTabel: 'interne_activiteiten', doelVeld: 'start_datum', regel: 'Alleen bij date_parse_status=high.' },
  { bronBestand: 'kalender_blokkades.csv', bronVeld: 'datum_eind', doelTabel: 'interne_activiteiten', doelVeld: 'eind_datum', regel: 'Alleen bij date_parse_status=high.' },
  { bronBestand: 'kalender_blokkades.csv', bronVeld: 'reden', doelTabel: 'interne_activiteiten', doelVeld: 'titel', regel: 'winterstop wordt de titel Winterstop. Geen nep-huurder.' },
  { bronBestand: 'kalender_blokkades.csv', bronVeld: 'reden', doelTabel: 'interne_activiteiten', doelVeld: 'blokkeert_verhuurkalender', regel: 'true voor winterstop.' },

  { bronBestand: 'review.csv', bronVeld: 'severity=high', doelTabel: '(poort)', doelVeld: '(geen)', regel: 'Onopgeloste high blokkeert het doelrecord.' },
  { bronBestand: 'bronregels.csv', bronVeld: 'raw_json', doelTabel: 'domeinrij', doelVeld: 'raw', regel: 'Auditlaag. Geen extra domeinrecords.' },
  { bronBestand: 'bronregister.csv', bronVeld: 'sha256', doelTabel: 'domeinrij', doelVeld: 'raw', regel: 'Bronbestand-hash, geen domeinrecord.' },
];

export const HERKOMST_KEUZE = 'A' as const;

export const HERKOMST_TOELICHTING =
  'Optie A: migratiekolommen op de domeinrij. De bestaande importer zoekt en upsert op legacy_id op de rij zelf, niet via een join. Een polymorfe migratie_herkomst-tabel komt in deze codebase niet voor.';

const HERKOMST_KOLOMMEN = `add column if not exists migration_external_id text,
  add column if not exists migration_source_file text,
  add column if not exists migration_source_row text,
  add column if not exists migration_batch_id text,
  add column if not exists migration_raw jsonb`;

export const SCHEMA_WIJZIGINGEN: readonly SchemaWijziging[] = [
  {
    id: 'migratiekolommen',
    nodigVoor: 'Herkomst op de domeinrij, naast legacy_id. legacy_id blijft voor Sanity en is uniek zonder bronnaam.',
    voorstel: `alter table public.relaties ${HERKOMST_KOLOMMEN};
alter table public.relatie_rollen ${HERKOMST_KOLOMMEN};
alter table public.boekingen ${HERKOMST_KOLOMMEN};
alter table public.betalingen ${HERKOMST_KOLOMMEN};
alter table public.interne_activiteiten ${HERKOMST_KOLOMMEN};
create unique index if not exists relaties_migratie_external_id_uniek on public.relaties (migration_external_id) where migration_external_id is not null;
create unique index if not exists relatie_rollen_migratie_external_id_uniek on public.relatie_rollen (migration_external_id) where migration_external_id is not null;
create unique index if not exists boekingen_migratie_external_id_uniek on public.boekingen (migration_external_id) where migration_external_id is not null;
create unique index if not exists betalingen_migratie_external_id_uniek on public.betalingen (migration_external_id) where migration_external_id is not null;
create unique index if not exists interne_activiteiten_migratie_external_id_uniek on public.interne_activiteiten (migration_external_id) where migration_external_id is not null;`,
  },
  {
    id: 'gastbegeleider_toewijzingen',
    nodigVoor: 'Meerdere diensten per boeking, plus assist, per datumslot. gastheer_relatie_id en boeking_ontvangers dekken dat niet.',
    voorstel: `create table if not exists public.gastbegeleider_toewijzingen (
  id bigint generated always as identity primary key,
  boeking_id bigint not null references public.boekingen (id),
  relatie_id bigint not null references public.relaties (id),
  type text not null check (type in ('dienst', 'assist')),
  bronwaarde text not null,
  migration_external_id text,
  migration_source_file text,
  migration_source_row text,
  migration_batch_id text,
  migration_raw jsonb,
  unique (boeking_id, relatie_id, type)
);
create unique index if not exists gastbegeleider_migratie_external_id_uniek
  on public.gastbegeleider_toewijzingen (migration_external_id)
  where migration_external_id is not null;
alter table public.gastbegeleider_toewijzingen enable row level security;`,
  },
  {
    id: 'betalingen_historisch',
    nodigVoor: 'Bronsoort historisch_2021 en historisch_2026 valt buiten de check (aanbetaling, restant, correctie, restitutie).',
    voorstel: `alter table public.betalingen drop constraint if exists betalingen_soort_bekend;
alter table public.betalingen add constraint betalingen_soort_bekend
  check (soort in ('aanbetaling', 'restant', 'correctie', 'restitutie', 'historisch'));`,
  },
  {
    id: 'relaties_geboortedatum',
    nodigVoor: 'Geldige geboortedatums uit De Persingenlijst hebben geen kolom. Ongeldige waarden blijven buiten de kolom.',
    voorstel: `alter table public.relaties add column if not exists geboortedatum date;`,
  },
];

export const SCHEMA_SQL = SCHEMA_WIJZIGINGEN.map((wijziging) => `-- ${wijziging.id}\n${wijziging.voorstel}`).join('\n\n');
