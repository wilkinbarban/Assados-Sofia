#!/bin/sh
set -eu

cd "$(dirname "$0")"

if [ -e .env ]; then
  echo "Refusing to overwrite ops/supabase/.env" >&2
  exit 1
fi

cp .env.example .env
sh utils/generate-keys.sh --update-env >/dev/null

tenant_id="$(openssl rand -hex 8)"
sed -i \
  -e "s/^POOLER_TENANT_ID=.*/POOLER_TENANT_ID=${tenant_id}/" \
  -e 's/^STUDIO_DEFAULT_ORGANIZATION=.*/STUDIO_DEFAULT_ORGANIZATION=Casa de Asados/' \
  -e 's/^STUDIO_DEFAULT_PROJECT=.*/STUDIO_DEFAULT_PROJECT=Asados/' \
  -e 's/^OPENAI_API_KEY=.*/OPENAI_API_KEY=/' \
  .env

chmod 600 .env
echo "Generated ops/supabase/.env with mode 0600"
