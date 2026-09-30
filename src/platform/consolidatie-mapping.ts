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
  { bronBestand: 'relaties.csv', bronVeld: 'geboortedatum', doelTabel: '(niet)', doelVeld: '(geen)', regel: 'De app beheert geboortedatum nergens. Kolom niet toegevoegd. 23 juli 195. wordt niet gecorrigeerd en niet opgeslagen.' },
  { bronBestand: 'relaties.csv', bronVeld: 'geboortedatum_raw', doelTabel: '(niet)', doelVeld: '(geen)', regel: 'Blijft in het migratiebestand. Geen migration_raw op de domeinrij.' },
  { bronBestand: 'relaties.csv', bronVeld: 'naam_bronwaarden', doelTabel: '(niet)', doelVeld: '(geen)', regel: 'Blijft in het bronbestand. Geen fuzzy merge en geen kopie op de domeinrij.' },
  { bronBestand: 'relaties.csv', bronVeld: 'email_bronwaarden', doelTabel: '(niet)', doelVeld: '(geen)', regel: 'Blijft in het bronbestand.' },
  { bronBestand: 'relaties.csv', bronVeld: 'telefoon_bronwaarden', doelTabel: '(niet)', doelVeld: '(geen)', regel: 'Blijft in het bronbestand.' },
  { bronBestand: 'relaties.csv', bronVeld: 'bronreferenties', doelTabel: '(niet)', doelVeld: '(geen)', regel: 'Koppelt reviewregels in de dry-run. Wordt niet als persoonsgegeven op de domeinrij gekopieerd.' },
  { bronBestand: 'relaties.csv', bronVeld: 'review_status', doelTabel: '(poort)', doelVeld: '(geen)', regel: 'Alleen OK mag automatisch. REVIEW_NEEDED blokkeert de rij.' },

  { bronBestand: 'rollen.csv', bronVeld: 'rol_id', doelTabel: 'domeinrij', doelVeld: 'migration_external_id', regel: 'Junction blijft relatie_rollen, niet beheer_rollen.' },
  { bronBestand: 'rollen.csv', bronVeld: 'relatie_id', doelTabel: 'relatie_rollen', doelVeld: 'relatie_id', regel: 'Bestaande relatie, pas na de relatiepoort.' },
  { bronBestand: 'rollen.csv', bronVeld: 'rol', doelTabel: 'relatie_rollen', doelVeld: 'rol', regel: 'Eén rij per rol. rol_raw wordt niet in één tekstveld geplakt.' },
  { bronBestand: 'rollen.csv', bronVeld: 'rol_raw', doelTabel: '(niet)', doelVeld: '(geen)', regel: 'Blijft in het bronbestand. De genormaliseerde rol staat op relatie_rollen.rol.' },
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
  { bronBestand: 'boekingen.csv', bronVeld: 'cont_raw', doelTabel: 'domeinrij', doelVeld: '(geen)', regel: 'Betekenis van Cont. is niet bewezen. Niet naar aanbetaling_ontvangen en niet naar migration_raw.' },
  { bronBestand: 'boekingen.csv', bronVeld: 'totaal_eur', doelTabel: 'boekingen', doelVeld: 'tarief_bedrag', regel: 'Alleen bij een eenduidig bedrag zonder review op totaal of termijnen.' },
  { bronBestand: 'boekingen.csv', bronVeld: 'totaal_raw', doelTabel: '(niet)', doelVeld: '(geen)', regel: 'Blijft in het bronbestand. Alleen een eenduidig bedrag gaat naar tarief_bedrag.' },
  { bronBestand: 'boekingen.csv', bronVeld: 'bijzonderheden_raw', doelTabel: 'boekingen', doelVeld: 'interne_notities', regel: 'Alleen meenemen als de boeking zelf importeerbaar is.' },
  { bronBestand: 'boekingen.csv', bronVeld: 'contract_datum', doelTabel: '(niet)', doelVeld: '(geen)', regel: 'Geen contractdatumkolom op boekingen.' },
  { bronBestand: 'boekingen.csv', bronVeld: 'bronbestand', doelTabel: 'domeinrij', doelVeld: 'migration_source_file', regel: 'Herkomst.' },
  { bronBestand: 'boekingen.csv', bronVeld: 'bronregel', doelTabel: 'domeinrij', doelVeld: 'migration_source_row', regel: 'Herkomst.' },
  { bronBestand: 'boekingen.csv', bronVeld: 'review_status', doelTabel: '(poort)', doelVeld: '(geen)', regel: 'REVIEW_NEEDED blokkeert de hele boeking.' },

  { bronBestand: 'betalingen.csv', bronVeld: 'betaling_id', doelTabel: 'domeinrij', doelVeld: 'migration_external_id', regel: 'Uniek per broncel.' },
  { bronBestand: 'betalingen.csv', bronVeld: 'boeking_id', doelTabel: 'betalingen', doelVeld: 'boeking_id', regel: 'Alleen als de boeking importeerbaar is.' },
  { bronBestand: 'betalingen.csv', bronVeld: 'soort', doelTabel: 'betalingen', doelVeld: 'soort', regel: 'termijn_1→aanbetaling, termijn_2→restant. historisch_*→historisch. Maximaal één aanbetaling per boeking.' },
  { bronBestand: 'betalingen.csv', bronVeld: 'bedrag_eur_eerste_waarde', doelTabel: 'betalingen', doelVeld: 'bedrag', regel: 'Niet schrijven bij een lege waarde, meerdere bedragen in de cel, of parse_status=REVIEW_NEEDED.' },
  { bronBestand: 'betalingen.csv', bronVeld: 'status', doelTabel: 'betalingen', doelVeld: 'status', regel: 'betaald→ontvangen, openstaand→open. onbekend en gemengd blijven review.' },
  { bronBestand: 'betalingen.csv', bronVeld: 'betaaldatum', doelTabel: 'betalingen', doelVeld: 'ontvangen_op', regel: 'Alleen een geldige datum bij status ontvangen, en niet als review de datum afkeurt.' },
  { bronBestand: 'betalingen.csv', bronVeld: 'vervaldatum', doelTabel: 'betalingen', doelVeld: 'vervaldatum', regel: 'Alleen een geldige datum zonder datumreview.' },
  { bronBestand: 'betalingen.csv', bronVeld: 'raw', doelTabel: '(niet)', doelVeld: '(geen)', regel: 'Blijft in het bronbestand. Niet als financiële waarheid en niet als migration_raw.' },
  { bronBestand: 'betalingen.csv', bronVeld: 'parse_status', doelTabel: '(poort)', doelVeld: '(geen)', regel: 'REVIEW_NEEDED blokkeert de betaalregel.' },

  { bronBestand: 'gastbegeleider_toewijzingen.csv', bronVeld: 'toewijzing_id', doelTabel: 'domeinrij', doelVeld: 'migration_external_id', regel: 'Nieuwe tabel; past niet in één gastheer_relatie_id.' },
  { bronBestand: 'gastbegeleider_toewijzingen.csv', bronVeld: 'boeking_id', doelTabel: 'gastbegeleider_toewijzingen', doelVeld: 'boeking_id', regel: 'Boeking moet importeerbaar zijn.' },
  { bronBestand: 'gastbegeleider_toewijzingen.csv', bronVeld: 'gastbegeleider_relatie_id', doelTabel: 'gastbegeleider_toewijzingen', doelVeld: 'relatie_id', regel: 'Relatie moet importeerbaar zijn.' },
  { bronBestand: 'gastbegeleider_toewijzingen.csv', bronVeld: 'type', doelTabel: 'gastbegeleider_toewijzingen', doelVeld: 'type', regel: 'Alleen dienst of assist. x wordt niet opgeslagen.' },
  { bronBestand: 'gastbegeleider_toewijzingen.csv', bronVeld: 'bronwaarde', doelTabel: '(niet)', doelVeld: '(geen)', regel: 'x wordt nergens als dienst bewaard. dienst en assist staan in type.' },
  { bronBestand: 'gastbegeleider_toewijzingen.csv', bronVeld: 'match_confidence', doelTabel: '(poort)', doelVeld: '(geen)', regel: 'low blokkeert, ook als import_advies IMPORT is.' },
  { bronBestand: 'gastbegeleider_toewijzingen.csv', bronVeld: 'gastbegeleider_kolom', doelTabel: 'gastbegeleider_toewijzingen', doelVeld: 'datum', regel: 'Het slot is een datum. De kolom zelf is geen ISO-datum en wordt niet als dienst opgeslagen.' },

  { bronBestand: 'kalender_blokkades.csv', bronVeld: 'blokkade_id', doelTabel: 'domeinrij', doelVeld: 'migration_external_id', regel: 'Ook interne_activiteiten.legacy_id met legacy_source=consolidatie.' },
  { bronBestand: 'kalender_blokkades.csv', bronVeld: 'datum_start', doelTabel: 'interne_activiteiten', doelVeld: 'start_datum', regel: 'Alleen bij date_parse_status=high.' },
  { bronBestand: 'kalender_blokkades.csv', bronVeld: 'datum_eind', doelTabel: 'interne_activiteiten', doelVeld: 'eind_datum', regel: 'Alleen bij date_parse_status=high.' },
  { bronBestand: 'kalender_blokkades.csv', bronVeld: 'reden', doelTabel: 'interne_activiteiten', doelVeld: 'titel', regel: 'winterstop wordt de titel Winterstop. Geen nep-huurder.' },
  { bronBestand: 'kalender_blokkades.csv', bronVeld: 'reden', doelTabel: 'interne_activiteiten', doelVeld: 'blokkeert_verhuurkalender', regel: 'true voor winterstop.' },

  { bronBestand: 'review.csv', bronVeld: 'severity=high', doelTabel: '(poort)', doelVeld: '(geen)', regel: 'Onopgeloste high blokkeert het doelrecord.' },
  { bronBestand: 'bronregels.csv', bronVeld: 'raw_json', doelTabel: '(niet)', doelVeld: '(geen)', regel: 'Blijft in het migratiebestand. Geen kopie op de domeinrij.' },
  { bronBestand: 'bronregister.csv', bronVeld: 'sha256', doelTabel: '(niet)', doelVeld: '(geen)', regel: 'Bronbestand-hash, geen domeinrecord.' },
];

export const HERKOMST_KEUZE = 'A' as const;

export const HERKOMST_TOELICHTING =
  'Optie A: migratiekolommen op de domeinrij. De bestaande importer zoekt en upsert op legacy_id op de rij zelf, niet via een join. Een polymorfe migratie_herkomst-tabel komt in deze codebase niet voor.';

const HERKOMST_KOLOMMEN = `migration_source text,
  migration_external_id text,
  migration_source_file text,
  migration_source_row text,
  migration_batch_id text`;

export const SCHEMA_WIJZIGINGEN: readonly SchemaWijziging[] = [
  {
    id: 'migratiekolommen',
    nodigVoor: 'Herkomst op de domeinrij, naast legacy_id. legacy_id en raw_sanity blijven Sanity. Externe id is uniek per migration_source, niet wereldwijd.',
    voorstel: `kolommen op relaties, relatie_rollen, boekingen, betalingen, interne_activiteiten en gastbegeleider_toewijzingen:
  ${HERKOMST_KOLOMMEN},
  unique (migration_source, migration_external_id).
Geen migration_raw: de bron blijft in de migratiebestanden.`,
  },
  {
    id: 'gastbegeleider_toewijzingen',
    nodigVoor: 'Meerdere diensten per boeking, plus assist, per datumslot. gastheer_relatie_id blijft alleen voor precies één gastheer.',
    voorstel: `create table public.gastbegeleider_toewijzingen (
  id, boeking_id, relatie_id, datum date not null, type check (type in ('dienst', 'assist')),
  migratiekolommen,
  unique (boeking_id, relatie_id, datum, type),
  unique (migration_source, migration_external_id)
);`,
  },
  {
    id: 'betalingen_historisch',
    nodigVoor: 'Bronsoort historisch_* naast aanbetaling en restant. Eén aanbetaling per boeking blijft uniek.',
    voorstel: `check (soort in ('aanbetaling', 'restant', 'correctie', 'restitutie', 'historisch'));
unique index betalingen_aanbetaling_uniek on (boeking_id) where soort = 'aanbetaling';`,
  },
];

export const SCHEMA_SQL = SCHEMA_WIJZIGINGEN.map((wijziging) => `-- ${wijziging.id}\n${wijziging.voorstel}`).join('\n\n');
