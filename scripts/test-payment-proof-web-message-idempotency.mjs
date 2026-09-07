import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

const root = new URL('../', import.meta.url).pathname.replace(/\/$/, '')
const env = Object.fromEntries(readFileSync(`${root}/ops/supabase/.env`, 'utf8')
  .split(/\r?\n/).filter((line) => line && !line.startsWith('#') && line.includes('='))
  .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
const suffix = `${process.pid}_${Date.now()}`
const database = `asados_postgrest_test_${suffix}`
const container = `asados-postgrest-test-${suffix}`
const network = 'asados-supabase-private'
const password = env.POSTGRES_PASSWORD
const serviceKey = env.SERVICE_ROLE_KEY
if (!password || !serviceKey) throw new Error('Missing disposable self-host credentials')

function docker(...args) {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}
function psql(sql) {
  return docker('exec', 'asados-supabase-db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', database, '-Atqc', sql)
}

let vite
try {
  docker('exec', 'asados-supabase-db', 'createdb', '-U', 'postgres', database)
  docker('exec', 'asados-supabase-db', 'sh', '-c', `pg_dump -U supabase_admin --format=custom --exclude-schema=realtime postgres | pg_restore -U supabase_admin -d '${database}' --exit-on-error`)
  docker('cp', `${root}/supabase/migrations/20260906190000_payment_proof_web_message_idempotency.sql`, `asados-supabase-db:/tmp/web-message-idempotency-${suffix}.sql`)
  docker('exec', 'asados-supabase-db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', database, '-f', `/tmp/web-message-idempotency-${suffix}.sql`)

  const customerId = randomUUID()
  const conversationId = randomUUID()
  const otherCustomerId = randomUUID()
  const otherConversationId = randomUUID()
  psql(`insert into public.clientes(id,nome,telefone) values ('${customerId}','PostgREST fixture','5541999999901'),('${otherCustomerId}','Other fixture','5541999999902'); insert into public.conversas(id,cliente_id,status,ia_ativa) values ('${conversationId}','${customerId}','aberta',false),('${otherConversationId}','${otherCustomerId}','aberta',false);`)

  docker('run', '-d', '--name', container, '--network', network, '-p', '127.0.0.1::3000',
    '-e', `PGRST_DB_URI=postgres://authenticator:${encodeURIComponent(password)}@asados-supabase-db:5432/${database}`,
    '-e', 'PGRST_DB_SCHEMAS=public,storage,graphql_public', '-e', 'PGRST_DB_EXTRA_SEARCH_PATH=public,extensions',
    '-e', 'PGRST_DB_ANON_ROLE=anon', '-e', `PGRST_JWT_SECRET=${env.JWT_JWKS || env.JWT_SECRET}`,
    'postgrest/postgrest:v14.12')
  const port = docker('port', container, '3000/tcp').split(':').at(-1)
  const postgrestUrl = `http://127.0.0.1:${port}`
  for (let attempt = 0; attempt < 30; attempt++) {
    try { if ((await fetch(`${postgrestUrl}/`)).ok) break } catch { /* startup */ }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  vite = await createServer({
    root,
    resolve: { alias: { '@': `${root}/apps/web/src` } },
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  })
  const { dispatchPaymentProofOutbox } = await vite.ssrLoadModule('/apps/web/src/lib/payment-proofs/outbox-dispatch.ts')
  const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' }
  const db = { from(table) {
    return {
      async upsert(row, options) {
        const response = await fetch(`${postgrestUrl}/${table}?on_conflict=${encodeURIComponent(options.onConflict)}`, {
          method: 'POST', headers: { ...headers, prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify(row),
        })
        return { error: response.ok ? null : { message: await response.text() } }
      },
      select(columns) {
        return { eq(column, value) {
          return { async maybeSingle() {
            const response = await fetch(`${postgrestUrl}/${table}?select=${encodeURIComponent(columns)}&${column}=eq.${encodeURIComponent(value)}`, {
              headers: { ...headers, accept: 'application/vnd.pgrst.object+json' },
            })
            return response.ok
              ? { data: await response.json(), error: null }
              : { data: null, error: { message: await response.text() } }
          } }
        } }
      },
    }
  } }
  const externalId = `payment-proof:web:${randomUUID()}`
  const dispatch = (conversationId, message) => dispatchPaymentProofOutbox({
    channel: 'web', conversationId, message, deliveryKey: externalId, db,
  })

  const first = await dispatch(conversationId, 'original')
  if (first.status !== 'success') throw new Error(`First dispatcher insert failed (${first.status})`)
  const exactDuplicate = await dispatch(conversationId, 'original')
  if (exactDuplicate.status !== 'success') throw new Error(`Exact duplicate was not acknowledged (${exactDuplicate.status})`)
  const divergent = await dispatch(otherConversationId, 'replacement')
  if (divergent.status !== 'permanent' || divergent.error !== 'delivery_conflict') {
    throw new Error(`Divergent collision was falsely acknowledged (${divergent.status})`)
  }

  const persisted = JSON.parse(psql(`select json_build_object('count',count(*),'conversation',min(conversa_id::text),'sender',min(remetente),'content',min(conteudo),'attachment',min(url_anexo)) from public.mensagens where external_id='${externalId}'`))
  if (persisted.count !== 1 || persisted.conversation !== conversationId || persisted.sender !== 'operador' || persisted.content !== 'original' || persisted.attachment !== null) {
    throw new Error('Dispatcher collision changed immutable message binding')
  }
  console.log('PostgREST dispatcher semantics: first insert and exact duplicate acknowledged; divergent collision rejected; original binding preserved')
} finally {
  try { await vite?.close() } catch { /* absent */ }
  try { docker('rm', '-f', container) } catch { /* absent */ }
  try { docker('exec', 'asados-supabase-db', 'dropdb', '-U', 'supabase_admin', '--if-exists', '--force', database) } catch { /* best effort */ }
  try { docker('exec', 'asados-supabase-db', 'rm', '-f', `/tmp/web-message-idempotency-${suffix}.sql`) } catch { /* best effort */ }
}
