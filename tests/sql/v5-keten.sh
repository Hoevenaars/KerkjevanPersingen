#!/bin/bash
# Ketentest tegen de lokale database. Niet tegen productie.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="${KETEN_DB:-kerkje_v5_migraties}"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB")

"${PSQL[@]}" -f supabase/migrations/20261118200000_betaalherinnering_uit.sql
"${PSQL[@]}" -f supabase/migrations/20261118210000_betalingscommunicatie_uit.sql
"${PSQL[@]}" -f tests/sql/v5-keten.sql

status=$("${PSQL[@]}" -tA -c "select status from public.automatiseringen where sleutel='betaalherinnering'")
poort=$("${PSQL[@]}" -tA -c "select status from public.automatiseringen where sleutel='betalingscommunicatie'")
if [[ "$status" != "uit" || "$poort" != "uit" ]]; then
  echo "betalingscommunicatie=$poort betaalherinnering=$status" >&2
  exit 1
fi
overig=$("${PSQL[@]}" -tA -c "select count(*) from public.automatiseringen where sleutel in ('workflow','aanvraag_bevestiging','statusmail_huurder','content_herinnering','herinnering','gastheer_mail','nazorg') and status <> 'actief'")
if [[ "$overig" != "0" ]]; then
  echo "een andere verhuurschakelaar is mee veranderd" >&2
  exit 1
fi

dubbel=$("${PSQL[@]}" -tA -c "select id from public.aanvragen where email='v5-keten-dubbel@example.com'")
"${PSQL[@]}" -c "select public.keur_aanvraag_en_reserveer($dubbel)" > /tmp/v5-dubbel-a.txt &
pid_a=$!
"${PSQL[@]}" -c "select public.keur_aanvraag_en_reserveer($dubbel)" > /tmp/v5-dubbel-b.txt &
pid_b=$!
wait "$pid_a" "$pid_b"
boekingen=$("${PSQL[@]}" -tA -c "select count(*) from public.boekingen b join public.aanvragen a on a.boeking_id=b.id where a.email='v5-keten-dubbel@example.com'")
if [[ "$boekingen" != "1" ]]; then
  echo "gelijktijdige Ja maakte $boekingen boekingen" >&2
  exit 1
fi

overlap_a=$("${PSQL[@]}" -tA -c "select id from public.aanvragen where email='v5-keten-overlap-a@example.com'")
overlap_b=$("${PSQL[@]}" -tA -c "select id from public.aanvragen where email='v5-keten-overlap-b@example.com'")
"${PSQL[@]}" -c "select public.keur_aanvraag_en_reserveer($overlap_a)" > /tmp/v5-overlap-a.txt &
pid_a=$!
"${PSQL[@]}" -c "select public.keur_aanvraag_en_reserveer($overlap_b)" > /tmp/v5-overlap-b.txt &
pid_b=$!
set +e
wait "$pid_a"
wait "$pid_b"
set -e
overlap_boekingen=$("${PSQL[@]}" -tA -c "select count(*) from public.boekingen where status in ('optie','definitief') and daterange(start_datum, eind_datum, '[]') && daterange('2098-10-01','2098-10-04','[]')")
if [[ "$overlap_boekingen" != "0" && "$overlap_boekingen" != "1" ]]; then
  echo "overlappende Ja leverde $overlap_boekingen boekingen" >&2
  exit 1
fi

"${PSQL[@]}" -c "
select a.email, a.status as aanvraag, b.status as boeking, b.nummer,
       (select count(*) from public.facturen f where f.boeking_id=b.id) as facturen,
       (select count(*) from public.contract_verzendingen z where z.boeking_id=b.id and z.status='bezig') as bezig,
       (select count(*) from public.contract_verzendingen z where z.boeking_id=b.id and z.status='verzonden') as verzonden
  from public.aanvragen a
  left join public.boekingen b on b.id=a.boeking_id
 where a.email like 'v5-keten-%@example.com'
 order by a.email;
select sleutel, status from public.automatiseringen where sleutel in ('betaalherinnering','workflow') order by 1;
"

echo "keten-ok"
