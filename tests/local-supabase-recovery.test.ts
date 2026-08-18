import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'

const mocks = vi.hoisted(() => ({ execFileSync: vi.fn() }))

vi.mock('node:child_process', () => ({
  default: { execFileSync: mocks.execFileSync },
  execFileSync: mocks.execFileSync,
}))

type FunctionState = { canonical: boolean; temporary: boolean }

const localStatus = [
  'API_URL="http://127.0.0.1:54321"',
  'ANON_KEY="local-anon"',
  'SERVICE_ROLE_KEY="local-service"',
].join('\n')

function mockDatabase(state: FunctionState, sqlFailure?: Error) {
  mocks.execFileSync.mockImplementation((command: string, _args: string[], options?: { input?: string }) => {
    if (command === 'npx') return localStatus
    if (sqlFailure) throw sqlFailure
    if (state.canonical === state.temporary) {
      throw new Error(state.canonical ? 'ambiguous image persistence function state' : 'missing image persistence function')
    }
    if (state.temporary) {
      state.canonical = true
      state.temporary = false
    }
    return options?.input
  })
}

async function loadFixture() {
  return import('./e2e/fixtures/local-supabase')
}

function writeOwner(path: string, pid: number) {
  mkdirSync(path, { recursive: true })
  const createdAt = pid === process.pid ? statSync('/proc/self').ctimeMs : Date.now()
  writeFileSync(`${path}/owner.json`, JSON.stringify({ version: 1, pid, createdAt }))
}

describe('local Supabase image persistence recovery', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.execFileSync.mockReset()
  })

  it('fails before Docker when another live process owns the lease', async () => {
    mockDatabase({ canonical: false, temporary: true })
    const { imagePersistenceLeasePath, recoverImagePersistenceFunction } = await loadFixture()
    writeOwner(imagePersistenceLeasePath, process.pid)
    expect(() => recoverImagePersistenceFunction()).toThrow('image persistence lease is held')
    expect(mocks.execFileSync.mock.calls.map(([command]) => command)).toEqual(['npx'])
    rmSync(imagePersistenceLeasePath, { recursive: true, force: true })
  })

  it('fails closed for malformed lease ownership', async () => {
    mockDatabase({ canonical: true, temporary: false }); const { imagePersistenceLeasePath, recoverImagePersistenceFunction } = await loadFixture()
    writeOwner(imagePersistenceLeasePath, process.pid)
    writeFileSync(`${imagePersistenceLeasePath}/owner.json`, '{}')
    expect(() => recoverImagePersistenceFunction()).toThrow('malformed image persistence lease owner')
    expect(mocks.execFileSync.mock.calls.map(([command]) => command)).toEqual(['npx'])
    rmSync(imagePersistenceLeasePath, { recursive: true, force: true })
  })

  it('reclaims a dead owner and repairs the function', async () => {
    const state = { canonical: false, temporary: true }
    mockDatabase(state)
    const { imagePersistenceLeasePath, recoverImagePersistenceFunction } = await loadFixture()
    writeOwner(imagePersistenceLeasePath, 2_147_483_647)
    recoverImagePersistenceFunction()
    expect(state).toEqual({ canonical: true, temporary: false })
    expect(() => mkdirSync(imagePersistenceLeasePath)).not.toThrow()
    rmSync(imagePersistenceLeasePath, { recursive: true, force: true })
  })

  it('reclaims a SIGKILL-like lease left without release', async () => {
    mockDatabase({ canonical: true, temporary: false })
    const fixture = await loadFixture()
    const lease = fixture.acquireImagePersistenceLease()
    writeFileSync(`${fixture.imagePersistenceLeasePath}/owner.json`, JSON.stringify({ version: 1, pid: 2_147_483_647, createdAt: Date.now() }))

    fixture.recoverImagePersistenceFunction()

    expect(() => fixture.releaseImagePersistenceLease(lease)).toThrow()
    expect(() => mkdirSync(fixture.imagePersistenceLeasePath)).not.toThrow()
    rmSync(fixture.imagePersistenceLeasePath, { recursive: true, force: true })
  })

  it('allows exactly one owner in a concurrent acquisition race', async () => {
    mockDatabase({ canonical: true, temporary: false })
    const fixture = await loadFixture()
    const attempts = await Promise.allSettled([
      Promise.resolve().then(() => fixture.acquireImagePersistenceLease()),
      Promise.resolve().then(() => fixture.acquireImagePersistenceLease()),
    ])
    expect(attempts.map(({ status }) => status).sort()).toEqual(['fulfilled', 'rejected'])
    const lease = attempts.find((result) => result.status === 'fulfilled')
    if (lease?.status === 'fulfilled') fixture.releaseImagePersistenceLease(lease.value)
  })

  it('passes the local safety gate before Docker and sends one atomic recovery block', async () => {
    mockDatabase({ canonical: true, temporary: false })
    const { recoverImagePersistenceFunction } = await loadFixture()

    recoverImagePersistenceFunction()

    expect(mocks.execFileSync.mock.calls.map(([command]) => command)).toEqual(['npx', 'docker'])
    const sql = mocks.execFileSync.mock.calls[1][2].input as string
    expect(sql).toMatch(/^DO \$\$/)
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain("to_regprocedure('public.substituir_imagem_produto(uuid,integer,text,text)')")
    expect(sql).toContain("to_regprocedure('public.substituir_imagem_produto_e2e_disabled(uuid,integer,text,text)')")
    expect(sql).toContain('ALTER FUNCTION public.substituir_imagem_produto_e2e_disabled(uuid,integer,text,text)')
  })

  it('rejects a non-local target without invoking Docker', async () => {
    mocks.execFileSync.mockReturnValue('API_URL="https://example.test"\nANON_KEY="anon"\nSERVICE_ROLE_KEY="service"')
    const { recoverImagePersistenceFunction } = await loadFixture()

    expect(() => recoverImagePersistenceFunction()).toThrow('E2E safety gate rejected a non-local Supabase target')
    expect(mocks.execFileSync).toHaveBeenCalledOnce()
    expect(mocks.execFileSync).not.toHaveBeenCalledWith('docker', expect.anything(), expect.anything())
  })

  it('leaves the healthy canonical-only state unchanged', async () => {
    const state = { canonical: true, temporary: false }
    mockDatabase(state)
    const { recoverImagePersistenceFunction } = await loadFixture()

    recoverImagePersistenceFunction()

    expect(state).toEqual({ canonical: true, temporary: false })
  })

  it('restores the temporary-only state to canonical', async () => {
    const state = { canonical: false, temporary: true }
    mockDatabase(state)
    const { recoverImagePersistenceFunction } = await loadFixture()

    recoverImagePersistenceFunction()

    expect(state).toEqual({ canonical: true, temporary: false })
  })

  it.each([
    [{ canonical: true, temporary: true }, 'ambiguous'],
    [{ canonical: false, temporary: false }, 'missing'],
  ] as const)('fails closed for %s state', async (state, message) => {
    mockDatabase({ ...state })
    const { recoverImagePersistenceFunction } = await loadFixture()

    expect(() => recoverImagePersistenceFunction()).toThrow(message)
  })

  it('propagates SQL failures unchanged', async () => {
    const sqlFailure = new Error('psql failed')
    mockDatabase({ canonical: true, temporary: false }, sqlFailure)
    const { recoverImagePersistenceFunction } = await loadFixture()

    expect(() => recoverImagePersistenceFunction()).toThrow(sqlFailure)
  })

  it('is idempotent across repeated healthy startup', async () => {
    const state = { canonical: true, temporary: false }
    mockDatabase(state)
    const { recoverImagePersistenceFunction } = await loadFixture()

    recoverImagePersistenceFunction()
    recoverImagePersistenceFunction()

    expect(state).toEqual({ canonical: true, temporary: false })
    expect(mocks.execFileSync.mock.calls.filter(([command]) => command === 'docker')).toHaveLength(2)
  })
})
