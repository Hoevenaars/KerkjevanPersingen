#!/usr/bin/env bash
# Lokale afhankelijkheid voor sql-migraties en mutatie-rpc. Geen productielogica.
# Nodig op de machine die deze suite draait:
# - PostgreSQL
# - OS-gebruiker postgres
# - database kerkje_test
# - psql beschikbaar voor die gebruiker
# - sudo -u postgres zonder wachtwoord
# De runner leegt kerkje_test en speelt een deel van de migraties plus tests/sql/*.sql af.
set -euo pipefail
cd "$(dirname "$0")/../.."
if ! id postgres >/dev/null 2>&1; then
  echo "sql-migraties en mutatie-rpc mist een lokale Postgres-gebruiker." >&2
  echo "Vereist: OS-gebruiker postgres, database kerkje_test, psql, en sudo -u postgres zonder wachtwoord." >&2
  echo "Dit is een lokale testomgeving. Productielogica blijft ongewijzigd." >&2
  exit 1
fi
sudo -u postgres psql -d kerkje_test -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS app CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS storage CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;"
sudo -u postgres psql -d kerkje_test -v ON_ERROR_STOP=1 -f tests/sql/bootstrap.sql >/dev/null
sudo -u postgres psql -d kerkje_test -v ON_ERROR_STOP=1 -f supabase/migrations/20260901120000_init_beheerplatform.sql >/dev/null
sudo -u postgres psql -d kerkje_test -v ON_ERROR_STOP=1 -f supabase/migrations/20260921120000_beheer_gebruikersaccounts.sql >/dev/null
sudo -u postgres psql -d kerkje_test -v ON_ERROR_STOP=1 -f supabase/migrations/20260929143000_continuiteit_schema.sql >/dev/null
sudo -u postgres psql -d kerkje_test -v ON_ERROR_STOP=1 -f supabase/migrations/20260929143100_continuiteit_mutaties.sql >/dev/null
sudo -u postgres psql -d kerkje_test -v ON_ERROR_STOP=1 -f supabase/migrations/20260929150000_sanity_import.sql >/dev/null
sudo -u postgres psql -d kerkje_test -v ON_ERROR_STOP=1 -f supabase/migrations/20260929160000_website_analytics.sql >/dev/null
sudo -u postgres psql -d kerkje_test -v ON_ERROR_STOP=1 -f supabase/migrations/20260929161000_beheer_login_rls.sql >/dev/null
sudo -u postgres psql -d kerkje_test -v ON_ERROR_STOP=1 -f tests/sql/continuiteit.sql >/dev/null
sudo -u postgres psql -d kerkje_test -v ON_ERROR_STOP=1 -f tests/sql/import.sql >/dev/null
sudo -u postgres psql -d kerkje_test -v ON_ERROR_STOP=1 -f tests/sql/analytics.sql >/dev/null
echo sql-ok
