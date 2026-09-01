#!/usr/bin/env bash
# Volledige ruwe Sanity-export vóór migratie (FO §72).
# Wijzigt niets op de website. Vereist Sanity-inlog / token.
set -euo pipefail
mkdir -p backups
stamp=$(date +%Y%m%d-%H%M)
doel="backups/sanity-production-${stamp}.tar.gz"
echo "Export naar ${doel}"
npx sanity dataset export production "${doel}"
echo "Klaar. Bewaar dit bestand buiten de repo tot de migratie is gecontroleerd."
