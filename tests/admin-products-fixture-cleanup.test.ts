import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  acquireLease: vi.fn(() => ({ owner: 'test' })), releaseLease: vi.fn(),
  createUser: vi.fn(), deleteUser: vi.fn(),
  updateProfile: vi.fn(),
  insertResult: { data: [] as Array<{ id: string; nome: string }>, error: null as Error | null },
  deleteProducts: vi.fn(), listStorage: vi.fn(), removeStorage: vi.fn(),
}))
vi.mock('node:child_process', () => ({
  default: { execFileSync: mocks.execFileSync },
  execFileSync: mocks.execFileSync,
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { admin: { createUser: mocks.createUser, deleteUser: mocks.deleteUser } },
    from: (table: string) => table === 'perfis'
      ? { update: () => ({ eq: mocks.updateProfile }) }
      : {
          insert: () => ({ select: async () => mocks.insertResult }),
          delete: () => ({ like: mocks.deleteProducts }),
        },
    storage: { from: () => ({ list: mocks.listStorage, remove: mocks.removeStorage }) },
  }),
}))
vi.mock('./e2e/fixtures/local-supabase', () => ({
  localSupabaseEnv: () => ({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SERVICE_ROLE_KEY: 'local-test' }),
  runLocalSql: mocks.execFileSync,
  acquireImagePersistenceLease: mocks.acquireLease,
  releaseImagePersistenceLease: mocks.releaseLease,
}))
import { cleanupAdminProducts, seedAdminProducts, withImagePersistenceFailure, type AdminProductsFixture } from './e2e/fixtures/admin-products'
describe('admin products fixture cleanup', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.createUser
      .mockResolvedValueOnce({ data: { user: { id: 'admin-id' } }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: 'vendor-id' } }, error: null })
    mocks.deleteUser.mockResolvedValue({ error: null })
    mocks.updateProfile.mockResolvedValue({ error: null })
    mocks.deleteProducts.mockResolvedValue({ error: null })
  })
  it('returns the callback result when callback and restore succeed', async () => {
    await expect(withImagePersistenceFailure(async () => {
      expect(mocks.acquireLease).toHaveBeenCalledOnce()
      expect(mocks.releaseLease).not.toHaveBeenCalled()
      return 'result'
    })).resolves.toBe('result')
    expect(mocks.execFileSync).toHaveBeenCalledTimes(2)
    expect(mocks.releaseLease).toHaveBeenCalledOnce()
  })
  it('propagates the callback error unchanged when restore succeeds', async () => {
    const callbackError = new Error('callback failed')
    const error = await withImagePersistenceFailure(async () => { throw callbackError }).catch((caught) => caught)
    expect(error).toBe(callbackError)
  })
  it('propagates the restore error when only restore fails', async () => {
    const restoreError = new Error('restore failed')
    mocks.execFileSync.mockImplementationOnce(() => undefined).mockImplementationOnce(() => { throw restoreError })
    const error = await withImagePersistenceFailure(async () => 'result').catch((caught) => caught)
    expect(error).toBe(restoreError)
  })
  it('reports callback then restore errors when both fail', async () => {
    const callbackError = new Error('callback failed')
    const restoreError = new Error('restore failed')
    mocks.execFileSync.mockImplementationOnce(() => undefined).mockImplementationOnce(() => { throw restoreError })
    const error = await withImagePersistenceFailure(async () => { throw callbackError }).catch((caught) => caught)
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.message).toBe('callback failed')
    expect(error.errors).toEqual([callbackError, restoreError])
  })
  it('reports the original failure before a lease release failure', async () => {
    const callbackError = new Error('callback failed'), releaseError = new Error('release failed')
    mocks.releaseLease.mockImplementationOnce(() => { throw releaseError })
    const error = await withImagePersistenceFailure(async () => { throw callbackError }).catch((caught) => caught)
    expect(error.errors).toEqual([callbackError, releaseError])
  })
  it('cleans up a user when the profile update rejects', async () => {
    const profileError = new Error('profile rejected')
    mocks.updateProfile.mockRejectedValue(profileError)
    mocks.deleteUser.mockRejectedValue(new Error('delete rejected'))

    const error = await seedAdminProducts().catch((caught) => caught)

    expect(error).toBeInstanceOf(AggregateError)
    expect(error.errors).toEqual([profileError, expect.objectContaining({ message: 'Local Auth fixture cleanup failed' })])
    expect(mocks.deleteUser.mock.calls.map(([id]) => id)).toEqual(['admin-id'])
  })
  it('rolls back a successful sibling when the next user fixture fails', async () => {
    mocks.updateProfile
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: new Error('profile failed') })

    await expect(seedAdminProducts()).rejects.toThrow('Local profile fixture creation failed')

    expect(mocks.deleteUser.mock.calls.map(([id]) => id)).toEqual(['vendor-id', 'admin-id'])
  })
  it('preserves profile and cleanup errors in order when user deletion fails', async () => {
    mocks.updateProfile.mockResolvedValue({ error: new Error('profile failed') })
    mocks.deleteUser
      .mockResolvedValueOnce({ error: new Error('delete failed') })
      .mockResolvedValueOnce({ error: null })

    const error = await seedAdminProducts().catch((caught) => caught)

    expect(error).toBeInstanceOf(AggregateError)
    expect(error.message).toBe('Local profile fixture creation failed')
    expect(error.errors.map((item: Error) => item.message)).toEqual([
      'Local profile fixture creation failed',
      'Local Auth fixture cleanup failed',
    ])
    expect(mocks.deleteUser.mock.calls.map(([id]) => id)).toEqual(['admin-id'])
  })
  it('removes seeded users and partial products before reporting a product seed failure', async () => {
    mocks.insertResult.error = new Error('insert failed')
    await expect(seedAdminProducts()).rejects.toThrow('Local product fixture creation failed')
    expect(mocks.deleteProducts).toHaveBeenCalledOnce()
    expect(mocks.deleteUser.mock.calls.map(([id]) => id)).toEqual(['admin-id', 'vendor-id'])
  })
  it('reports product seed failure before every rollback failure', async () => {
    mocks.insertResult.error = new Error('insert failed')
    mocks.deleteProducts.mockResolvedValue({ error: new Error('delete failed') })
    mocks.deleteUser.mockResolvedValueOnce({ error: new Error('auth failed') })

    const error = await seedAdminProducts().catch((caught) => caught)

    expect(error).toBeInstanceOf(AggregateError)
    expect(error.message).toBe('Local product fixture creation failed')
    expect(error.errors.map((item: Error) => item.message)).toEqual([
      'Local product fixture creation failed',
      'Local product fixture cleanup failed',
      'Local Auth fixture cleanup failed',
    ])
    expect(mocks.deleteUser.mock.calls.map(([id]) => id)).toEqual(['admin-id', 'vendor-id'])
  })
  it('attempts storage, products, and every user before aggregating teardown failures', async () => {
    mocks.listStorage.mockImplementation(async (path: string) => {
      if (path.includes('alpha')) return { data: null, error: new Error('list failed') }
      if (path.endsWith('/bravo/1')) return { data: [{ name: 'version' }], error: null }
      if (path.includes('bravo')) return { data: [{ name: 'image.webp' }], error: null }
      return { data: [], error: null }
    })
    mocks.removeStorage.mockResolvedValue({ error: new Error('remove failed') })
    mocks.deleteProducts.mockResolvedValue({ error: new Error('delete failed') })
    mocks.deleteUser
      .mockResolvedValueOnce({ error: new Error('auth failed') })
      .mockResolvedValueOnce({ error: null })
    const fixture = {
      prefix: 'E2Etest',
      admin: { id: 'admin-id', email: '', password: '' },
      vendor: { id: 'vendor-id', email: '', password: '' },
      products: { alpha: { id: 'alpha', name: 'alpha' }, bravo: { id: 'bravo', name: 'bravo' }, zero: { id: 'zero', name: 'zero' } },
      productOrder: vi.fn(),
      storagePaths: vi.fn(),
    } satisfies AdminProductsFixture
    const error = await cleanupAdminProducts(fixture).catch((caught) => caught)
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.errors.map((item: Error) => item.message)).toEqual(['Local Storage fixture inspection failed',
      'Local Storage fixture cleanup failed', 'Local product fixture cleanup failed', 'Local Auth fixture cleanup failed'])
    expect(mocks.listStorage.mock.calls.map(([path]) => path)).toContain('produtos/zero/1')
    expect(mocks.deleteUser.mock.calls.map(([id]) => id)).toEqual(['admin-id', 'vendor-id'])
  })
})
