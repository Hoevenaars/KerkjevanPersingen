#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
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
