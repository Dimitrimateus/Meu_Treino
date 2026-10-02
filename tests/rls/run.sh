#!/usr/bin/env bash
# Testes de RLS/Storage/triggers num Postgres local (sem Docker).
# Uso: npm run test:rls
#   Variáveis opcionais: PGHOST, PGPORT, PGUSER (padrão: socket local, usuário postgres)
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=treinos_rls_test
if [ "$(id -un)" = "root" ] && [ -z "${PGUSER:-}" ]; then
  RUN() { su postgres -c "psql -v ON_ERROR_STOP=1 -q -X $*"; }
else
  RUN() { psql -v ON_ERROR_STOP=1 -q -X "$@"; }
fi

# Cadastro público desativado (config da CLI); conferir também no painel.
grep -q '^enable_signup = false' supabase/config.toml || { echo "FALHA: enable_signup deve ser false"; exit 1; }

RUN "-d postgres -c 'drop database if exists $DB'"
RUN "-d postgres -c 'create database $DB'"
RUN "-d $DB -f $(pwd)/tests/rls/stub_supabase.sql"
for f in 0001_schema 0002_triggers 0003_rls 0005_seed_opcional 0006_extras; do
  RUN "-d $DB -f $(pwd)/supabase/migrations/$f.sql"
done
OUT=$(mktemp)
if ! RUN "-d $DB -f $(pwd)/tests/rls/rls_test.sql" >"$OUT" 2>&1; then
  grep -E "ok -|FALHOU|ERROR" "$OUT" | sed 's/^psql:[^ ]* //'; echo "RLS: FALHOU"; exit 1
fi
grep -E "ok -" "$OUT" | sed 's/^psql:[^ ]* //'; rm -f "$OUT"
echo "RLS: todos os testes passaram."
