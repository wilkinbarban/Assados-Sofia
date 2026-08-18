import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const LOCAL_URL = 'http://127.0.0.1:54321'
const PROTECTED_PROJECT = 'xvzdxoktwnzmxsfizkxo'
const SELFHOST_URL = 'http://127.0.0.1:8000'
let cachedEnv: ReturnType<typeof readLocalSupabaseEnv> | undefined
type LeaseOwner = { version: 1; pid: number; createdAt: number }
export type ImagePersistenceLease = { owner: LeaseOwner; stalePath?: string }
const leaseScope = createHash('sha256').update(process.cwd()).digest('hex').slice(0, 16)
export const imagePersistenceLeasePath = join(tmpdir(), `asados-image-persistence-${leaseScope}.lock`)

function statusValue(status: string, name: string) {
  return new RegExp(`^${name}="?([^"\\n]+)"?$`, 'm').exec(status)?.[1]
}

function readLocalSupabaseEnv() {
  if (process.env.SELFHOST_E2E === 'true') {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (url !== SELFHOST_URL || !anonKey || !serviceKey) {
      throw new Error('E2E safety gate rejected invalid self-hosted credentials')
    }
    return {
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    }
  }

  const status = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const url = statusValue(status, 'API_URL')
  const anonKey = statusValue(status, 'ANON_KEY')
  const serviceKey = statusValue(status, 'SERVICE_ROLE_KEY')

  if (url !== LOCAL_URL || status.includes(PROTECTED_PROJECT) || !anonKey || !serviceKey) {
    throw new Error('E2E safety gate rejected a non-local Supabase target')
  }

  return {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  }
}

export function localSupabaseEnv() {
  return cachedEnv ??= readLocalSupabaseEnv()
}

export function runLocalSql(sql: string) {
  localSupabaseEnv()
  const container = process.env.SELFHOST_E2E === 'true' ? 'asados-supabase-db' : 'supabase_db_Asados'
  execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'], {
    input: sql,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

function readLeaseOwner(path = imagePersistenceLeasePath): LeaseOwner {
  const value: unknown = JSON.parse(readFileSync(join(path, 'owner.json'), 'utf8'))
  if (!value || typeof value !== 'object') throw new Error('malformed image persistence lease owner')
  const owner = value as Record<string, unknown>
  if (owner.version !== 1 || !Number.isInteger(owner.pid) || Number(owner.pid) <= 0
    || !Number.isFinite(owner.createdAt) || Object.keys(owner).sort().join() !== 'createdAt,pid,version') {
    throw new Error('malformed image persistence lease owner')
  }
  return owner as LeaseOwner
}

function ownerIsLive(owner: LeaseOwner) {
  try {
    return statSync(`/proc/${owner.pid}`).ctimeMs === owner.createdAt
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw new Error('image persistence lease owner is ambiguous')
  }
}

export function acquireImagePersistenceLease(): ImagePersistenceLease {
  localSupabaseEnv()
  let stalePath: string | undefined
  try {
    mkdirSync(imagePersistenceLeasePath, { mode: 0o700 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const stale = readLeaseOwner()
    if (ownerIsLive(stale)) throw new Error('image persistence lease is held by a live owner')
    stalePath = `${imagePersistenceLeasePath}.stale-${stale.pid}-${stale.createdAt}`
    renameSync(imagePersistenceLeasePath, stalePath)
    mkdirSync(imagePersistenceLeasePath, { mode: 0o700 })
  }
  const owner: LeaseOwner = { version: 1, pid: process.pid, createdAt: statSync('/proc/self').ctimeMs }
  try {
    writeFileSync(join(imagePersistenceLeasePath, 'owner.json'), JSON.stringify(owner), { flag: 'wx', mode: 0o600 })
  } catch (error) {
    rmSync(imagePersistenceLeasePath, { recursive: true, force: true })
    throw error
  }
  return { owner, stalePath }
}

export function releaseImagePersistenceLease(lease: ImagePersistenceLease) {
  const owner = readLeaseOwner()
  if (owner.pid !== lease.owner.pid || owner.createdAt !== lease.owner.createdAt) {
    throw new Error('image persistence lease ownership changed')
  }
  rmSync(imagePersistenceLeasePath, { recursive: true })
  if (lease.stalePath) rmSync(lease.stalePath, { recursive: true })
}

const recoverImagePersistenceSql = `DO $$
DECLARE
  canonical regprocedure;
  temporary regprocedure;
BEGIN
  PERFORM pg_advisory_xact_lock(21072026, 1);
  canonical := to_regprocedure('public.substituir_imagem_produto(uuid,integer,text,text)');
  temporary := to_regprocedure('public.substituir_imagem_produto_e2e_disabled(uuid,integer,text,text)');

  IF canonical IS NOT NULL AND temporary IS NULL THEN
    RETURN;
  ELSIF canonical IS NULL AND temporary IS NOT NULL THEN
    ALTER FUNCTION public.substituir_imagem_produto_e2e_disabled(uuid,integer,text,text)
      RENAME TO substituir_imagem_produto;
  ELSIF canonical IS NOT NULL AND temporary IS NOT NULL THEN
    RAISE EXCEPTION 'ambiguous image persistence function state';
  ELSE
    RAISE EXCEPTION 'missing image persistence function';
  END IF;
END
$$;`

export function recoverImagePersistenceFunction() {
  const lease = acquireImagePersistenceLease()
  try {
    runLocalSql(recoverImagePersistenceSql)
  } catch (error) {
    try {
      releaseImagePersistenceLease(lease)
    } catch (releaseError) {
      throw new AggregateError([error, releaseError], error instanceof Error ? error.message : 'Local image persistence recovery failed')
    }
    throw error
  }
  releaseImagePersistenceLease(lease)
}
