#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
here="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
migrations="$root/supabase/migrations"
cd "$here"

# Parse the SQL as a byte-oriented lexical stream. This is deliberately a
# conservative repository contract, not a complete PostgreSQL parser. Besides
# psql commands and transaction control, inline COPY data and psql variables are
# unsupported. E-prefixed escape strings and U& strings/identifiers are rejected
# rather than attempting their additional lexical semantics. Ordinary strings
# with doubled quotes, quoted identifiers, dollar bodies, and comments remain
# supported.
validate_sql() {
  LC_ALL=C awk '
  function unsafe(message) {
    print message > "/dev/stderr"
    bad = 1
    exit 1
  }
  function ident_start(c) { return c ~ /[A-Za-z_]/ }
  function ident_part(c) { return c ~ /[A-Za-z_0-9$]/ }
  function token(word, upper) {
    upper = toupper(word)
    if (statement_start) {
      transaction_prefix = upper
      if (upper == "BEGIN" || upper == "COMMIT" || upper == "END" ||
          upper == "ABORT" || upper == "ROLLBACK" || upper == "SAVEPOINT" ||
          upper == "RELEASE")
        unsafe("Migration contains unsupported transaction or session control")
      if (upper == "COPY") copy_statement = 1
      statement_start = 0
    } else if (transaction_prefix != "") {
      transaction_prefix = transaction_prefix " " upper
      if (transaction_prefix == "START TRANSACTION" ||
          transaction_prefix == "PREPARE TRANSACTION" ||
          transaction_prefix == "SET TRANSACTION" ||
          transaction_prefix == "SET SESSION CHARACTERISTICS AS TRANSACTION")
        unsafe("Migration contains unsupported transaction or session control")
      if (transaction_prefix != "START" && transaction_prefix != "PREPARE" &&
          transaction_prefix != "SET" && transaction_prefix != "SET SESSION" &&
          transaction_prefix != "SET SESSION CHARACTERISTICS" &&
          transaction_prefix != "SET SESSION CHARACTERISTICS AS")
        transaction_prefix = ""
    }
    if (copy_statement) {
      if (upper == "FROM") copy_from = 1
      else if (copy_from && upper == "STDIN")
        unsafe("Migration contains unsupported COPY FROM STDIN")
    }
  }
  BEGIN {
    state = "normal"
    statement_start = 1
    transaction_prefix = ""
    block_depth = 0
    bom = sprintf("%c%c%c", 239, 187, 191)
  }
  {
    text = $0 "\n"
    if (NR == 1 && substr(text, 1, 3) == bom) text = substr(text, 4)
    i = 1
    while (i <= length(text)) {
      c = substr(text, i, 1)
      n = substr(text, i + 1, 1)

      if (state == "line_comment") {
        if (c == "\n") state = "normal"
        i++
        continue
      }
      if (state == "block_comment") {
        if (c == "/" && n == "*") { block_depth++; i += 2; continue }
        if (c == "*" && n == "/") {
          block_depth--; i += 2
          if (block_depth == 0) state = "normal"
          continue
        }
        i++
        continue
      }
      if (state == "single_quote") {
        if (c == "\047" && n == "\047") { i += 2; continue }
        if (c == "\047") state = "normal"
        i++
        continue
      }
      if (state == "double_quote") {
        if (c == "\"" && n == "\"") { i += 2; continue }
        if (c == "\"") state = "normal"
        i++
        continue
      }
      if (state == "dollar_quote") {
        if (substr(text, i, length(dollar_delimiter)) == dollar_delimiter) {
          i += length(dollar_delimiter)
          state = "normal"
        } else i++
        continue
      }

      if (c == "-" && n == "-") { state = "line_comment"; i += 2; continue }
      if (c == "/" && n == "*") { state = "block_comment"; block_depth = 1; i += 2; continue }
      if (c == "\047") { state = "single_quote"; statement_start = 0; transaction_prefix = ""; i++; continue }
      if (c == "\"") { state = "double_quote"; statement_start = 0; transaction_prefix = ""; i++; continue }
      if (c == "\\") unsafe("Migration contains unsupported psql metacommand")
      if (c == ":") {
        if (n == ":") { i += 2; continue }
        unsafe("Migration contains unsupported unquoted colon syntax")
      }
      if ((c == "E" || c == "e") && n == "\047")
        unsafe("Migration contains unsupported E-prefixed string")
      if ((c == "U" || c == "u") && n == "&" &&
          (substr(text, i + 2, 1) == "\047" || substr(text, i + 2, 1) == "\""))
        unsafe("Migration contains unsupported U& quoted construct")
      if (c == ";") {
        statement_start = 1
        transaction_prefix = ""
        copy_statement = 0
        copy_from = 0
        i++
        continue
      }

      if (c == "$") {
        j = i + 1
        if (substr(text, j, 1) == "$") {
          dollar_delimiter = "$$"
          state = "dollar_quote"
          statement_start = 0
          transaction_prefix = ""
          i = j + 1
          continue
        }
        if (ident_start(substr(text, j, 1))) {
          j++
          while (ident_part(substr(text, j, 1))) j++
          if (substr(text, j, 1) == "$") {
            dollar_delimiter = substr(text, i, j - i + 1)
            state = "dollar_quote"
            statement_start = 0
            transaction_prefix = ""
            i = j + 1
            continue
          }
        }
      }

      if (ident_start(c)) {
        j = i + 1
        while (ident_part(substr(text, j, 1))) j++
        token(substr(text, i, j - i))
        i = j
        continue
      }
      if (c !~ /[[:space:]]/) {
        transaction_prefix = ""
        statement_start = 0
      }
      i++
    }
  }
  END {
    if (!bad && (state == "block_comment" || state == "single_quote" || state == "double_quote" || state == "dollar_quote")) {
      print "Migration contains unterminated SQL construct" > "/dev/stderr"
      exit 1
    }
  }
  ' "$1"
}

# Validate every filename, host path, and SQL file before Docker can open a DB
# connection. The restricted names also make generated psql commands inert.
canonical_migrations="$(CDPATH= cd -- "$migrations" && pwd -P)"
manifest=''
source_inventory=''
migration_count=0
for migration in "$migrations"/*.sql; do
  if [ "$migration" = "$migrations/*.sql" ] && [ ! -e "$migration" ] && [ ! -L "$migration" ]; then continue; fi
  if [ -L "$migration" ] || [ ! -f "$migration" ]; then
    echo "Invalid migration path: regular non-symlink files are required" >&2
    exit 1
  fi
  filename="$(basename "$migration" .sql)"
  version="${filename%%_*}"
  name="${filename#*_}"

  case "$filename" in *_*) ;; *) echo "Invalid migration filename" >&2; exit 1 ;; esac
  case "$version" in ''|*[!0-9]*) echo "Invalid migration filename" >&2; exit 1 ;; esac
  case "$name" in ''|*[!A-Za-z0-9_]*) echo "Invalid migration filename" >&2; exit 1 ;; esac
  case "$migration" in *[!A-Za-z0-9_./-]*) echo "Invalid migration path" >&2; exit 1 ;; esac
  canonical_file="$(readlink -f -- "$migration")"
  case "$canonical_file" in "$canonical_migrations"/*) ;; *) echo "Invalid migration path" >&2; exit 1 ;; esac
  [ "$(dirname -- "$canonical_file")" = "$canonical_migrations" ] || { echo "Invalid migration path" >&2; exit 1; }

  # Hash before and after lexical validation. The container verifies this exact
  # inventory both before and after copying it to its private ephemeral snapshot.
  before="$(sha256sum "$migration")"
  before="${before%% *}"
  validate_sql "$migration"
  after="$(sha256sum "$migration")"
  after="${after%% *}"
  [ "$before" = "$after" ] || { echo "Migration changed during validation" >&2; exit 1; }
  manifest="${manifest}${before}  ${filename}.sql
"
  source_inventory="${source_inventory}${filename}.sql ${before} $(stat -Lc '%d:%i:%f:%s:%Y' -- "$migration")
"
  migration_count=$((migration_count + 1))
done

# Re-read the complete host inventory immediately before Docker. This catches
# replacements (including same-content inode swaps), metadata changes, and any
# symlink introduced after lexical validation.
verified_inventory=''
verified_count=0
for migration in "$migrations"/*.sql; do
  if [ "$migration" = "$migrations/*.sql" ] && [ ! -e "$migration" ] && [ ! -L "$migration" ]; then continue; fi
  if [ -L "$migration" ] || [ ! -f "$migration" ]; then
    echo "Migration inventory changed before Docker" >&2
    exit 1
  fi
  filename="$(basename "$migration")"
  canonical_file="$(readlink -f -- "$migration")"
  case "$canonical_file" in "$canonical_migrations"/*) ;; *) echo "Migration inventory changed before Docker" >&2; exit 1 ;; esac
  [ "$(dirname -- "$canonical_file")" = "$canonical_migrations" ] || { echo "Migration inventory changed before Docker" >&2; exit 1; }
  checksum="$(sha256sum "$migration")"
  checksum="${checksum%% *}"
  verified_inventory="${verified_inventory}${filename} ${checksum} $(stat -Lc '%d:%i:%f:%s:%Y' -- "$migration")
"
  verified_count=$((verified_count + 1))
done
[ "$verified_count" -eq "$migration_count" ] && [ "$verified_inventory" = "$source_inventory" ] || {
  echo "Migration inventory changed before Docker" >&2
  exit 1
}

# docker compose run provides a client process on the Compose network. Its shell
# verifies the complete read-only mount, copies it to a private ephemeral path,
# verifies the copy, and only then execs psql. One psql session owns the session
# advisory lock for the entire run and includes each snapshotted file natively,
# preserving psql/PostgreSQL semantics without raw-streaming migration SQL.
{
  cat <<'SQL'
\set ON_ERROR_STOP on
select pg_advisory_lock(hashtextextended('asados:supabase:migrate', 0));
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
SQL

  for migration in "$migrations"/*.sql; do
    [ -f "$migration" ] || continue
    filename="$(basename "$migration")"
    stem="${filename%.sql}"
    version="${stem%%_*}"
    name="${stem#*_}"

    cat <<SQL
\set version '$version'
\set name '$name'
select exists (
  select 1 from supabase_migrations.schema_migrations where version = :'version'
) as applied \gset
\if :applied
\echo migration :version already applied
\else
BEGIN;
\i /tmp/asados-migrations/$filename
insert into supabase_migrations.schema_migrations(version, name, statements)
values (:'version', :'name', '{}');
COMMIT;
\endif
SQL
  done
} | docker compose run --rm -T --no-deps \
  -v "$migrations:/migration-source:ro" \
  -e PGHOST=db \
  -e "MIGRATION_COUNT=$migration_count" \
  -e "MIGRATION_MANIFEST=$manifest" \
  --entrypoint sh db -eu -c '
    snapshot=/tmp/asados-migrations
    mkdir -m 700 "$snapshot"
    set -- /migration-source/*.sql
    if [ "$1" = "/migration-source/*.sql" ] && [ ! -e "$1" ] && [ ! -L "$1" ]; then set --; fi
    for migration do
      [ -f "$migration" ] && [ ! -L "$migration" ] || {
        echo "Migration inventory contains a non-regular file or symlink" >&2
        exit 1
      }
    done
    [ "$#" -eq "$MIGRATION_COUNT" ] || {
      echo "Migration inventory changed before snapshot" >&2
      exit 1
    }
    printf "%s" "$MIGRATION_MANIFEST" |
      (cd /migration-source && sha256sum -c -) >/dev/null
    if [ "$MIGRATION_COUNT" -gt 0 ]; then cp /migration-source/*.sql "$snapshot"/; fi
    printf "%s" "$MIGRATION_MANIFEST" |
      (cd "$snapshot" && sha256sum -c -) >/dev/null
    exec psql -U postgres -d postgres -v ON_ERROR_STOP=1
  '

echo "Application migrations applied; data was not reseeded"
