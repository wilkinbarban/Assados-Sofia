import { randomUUID } from 'node:crypto'
import { test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { acquireImagePersistenceLease, localSupabaseEnv, releaseImagePersistenceLease, runLocalSql } from './local-supabase'

export { test }

type User = { id: string; email: string; password: string }
type Product = { id: string; name: string }
export type AdminProductsFixture = {
  prefix: string
  admin: User
  vendor: User
  products: { alpha: Product; bravo: Product; zero: Product }
  productOrder(productId: string): Promise<number | null>
  storagePaths(productId: string): Promise<string[]>
}

function adminClient() {
  const env = localSupabaseEnv()
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function compensateUsers(
  client: ReturnType<typeof adminClient>,
  users: Array<{ id: string }>,
  failure: unknown,
): Promise<never> {
  const errors: Error[] = failure instanceof AggregateError
    ? failure.errors.map((error) => error instanceof Error ? error : new Error('Local Auth fixture creation failed'))
    : [failure instanceof Error ? failure : new Error('Local Auth fixture creation failed')]
  for (const user of users) {
    try {
      const result = await client.auth.admin.deleteUser(user.id)
      if (result.error) throw result.error
    } catch {
      errors.push(new Error('Local Auth fixture cleanup failed'))
    }
  }
  if (errors.length > 1) throw new AggregateError(errors, errors[0].message)
  throw errors[0]
}

async function createUser(role: 'admin' | 'vendedor', prefix: string): Promise<User> {
  const client = adminClient()
  const email = `${prefix.toLowerCase()}-${role}@example.test`
  const password = `Local-${randomUUID()}`
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nome: `${prefix} ${role}` },
  })
  if (error || !data.user) {
    throw new Error(`Local Auth fixture creation failed${error ? `: ${error.message}` : ''}`)
  }
  try {
    const profile = await client.from('perfis').update({ funcao: role, ativo: true }).eq('id', data.user.id)
    if (profile.error) throw new Error('Local profile fixture creation failed')
  } catch (error) {
    await compensateUsers(client, [data.user], error)
  }
  return { id: data.user.id, email, password }
}

async function storagePaths(client: ReturnType<typeof adminClient>, productId: string) {
  const storage = client.storage.from('produto-imagens')
  const root = `produtos/${productId}/1`
  const { data: versions, error } = await storage.list(root)
  if (error) throw new Error('Local Storage fixture inspection failed')
  const paths: string[] = []
  for (const version of versions) {
    const { data: objects, error: listError } = await storage.list(`${root}/${version.name}`)
    if (listError) throw new Error('Local Storage fixture inspection failed')
    paths.push(...objects.map((object) => `${root}/${version.name}/${object.name}`))
  }
  return paths.sort()
}

async function productOrder(client: ReturnType<typeof adminClient>, productId: string) {
  const { data, error } = await client
    .from('produtos')
    .select('ordem_exibicao')
    .eq('id', productId)
    .single()
  if (error) throw new Error('Local product order inspection failed')
  return data.ordem_exibicao
}

export async function seedAdminProducts(): Promise<AdminProductsFixture> {
  const client = adminClient()
  const prefix = `E2E${randomUUID().slice(0, 8)}`
  const users: User[] = []
  try {
    users.push(await createUser('admin', prefix))
    users.push(await createUser('vendedor', prefix))
  } catch (error) {
    await compensateUsers(client, users, error)
  }
  const [admin, vendor] = users
  const rows = [
    { nome: `${prefix} Alpha`, quantidade_estoque: 5, ordem_exibicao: 9001, ativo: true },
    { nome: `${prefix} Bravo`, quantidade_estoque: 3, ordem_exibicao: 9002, ativo: true },
    { nome: `${prefix} Zero`, quantidade_estoque: 0, ordem_exibicao: 9003, ativo: false },
  ].map((row) => ({ ...row, preco_centavos: 1000, estoque_minimo: 1, controlar_estoque: true }))
  let data: Array<{ id: string; nome: string }>
  try {
    const result = await client.from('produtos').insert(rows).select('id,nome')
    if (result.error || result.data.length !== 3) throw new Error('Local product fixture creation failed')
    data = result.data
  } catch (error) {
    try {
      await cleanupResources(client, prefix, [admin, vendor], [])
    } catch (cleanupError) {
      const cleanupErrors = cleanupError instanceof AggregateError ? cleanupError.errors : [cleanupError]
      const message = error instanceof Error ? error.message : 'Local product fixture creation failed'
      throw new AggregateError([error, ...cleanupErrors], message)
    }
    throw error
  }
  const product = (index: number): Product => ({ id: data[index].id, name: data[index].nome })
  return {
    prefix,
    admin,
    vendor,
    products: { alpha: product(0), bravo: product(1), zero: product(2) },
    productOrder: (productId) => productOrder(client, productId),
    storagePaths: (productId) => storagePaths(client, productId),
  }
}

async function cleanupResources(client: ReturnType<typeof adminClient>, prefix: string, users: User[], products: Product[]) {
  const errors: Error[] = []
  for (const product of products) {
    try {
      const paths = await storagePaths(client, product.id)
      if (paths.length) {
        const removal = await client.storage.from('produto-imagens').remove(paths)
        if (removal.error) throw new Error('Local Storage fixture cleanup failed')
      }
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error('Local Storage fixture cleanup failed'))
    }
  }
  try {
    const result = await client.from('produtos').delete().like('nome', `${prefix}%`)
    if (result.error) throw new Error('Local product fixture cleanup failed')
  } catch {
    errors.push(new Error('Local product fixture cleanup failed'))
  }
  for (const user of users) {
    try {
      const result = await client.auth.admin.deleteUser(user.id)
      if (result.error) throw result.error
    } catch {
      errors.push(new Error('Local Auth fixture cleanup failed'))
    }
  }
  if (errors.length) throw new AggregateError(errors, 'Local admin products fixture cleanup failed')
}

export async function cleanupAdminProducts(fixture?: AdminProductsFixture) {
  if (!fixture) return
  await cleanupResources(adminClient(), fixture.prefix, [fixture.admin, fixture.vendor], Object.values(fixture.products))
}

const disablePersistence = `BEGIN; SELECT pg_advisory_xact_lock(21072026, 1); ALTER FUNCTION public.substituir_imagem_produto(uuid,integer,text,text) RENAME TO substituir_imagem_produto_e2e_disabled; COMMIT;`
const restorePersistence = `BEGIN; SELECT pg_advisory_xact_lock(21072026, 1); ALTER FUNCTION public.substituir_imagem_produto_e2e_disabled(uuid,integer,text,text) RENAME TO substituir_imagem_produto; COMMIT;`

export async function withImagePersistenceFailure<T>(run: () => Promise<T>): Promise<T> {
  const lease = acquireImagePersistenceLease()
  let result: T
  try {
    runLocalSql(disablePersistence)
    try {
      result = await run()
    } catch (error) {
      try {
        runLocalSql(restorePersistence)
      } catch (restoreError) {
        const message = error instanceof Error ? error.message : 'Local image persistence callback failed'
        throw new AggregateError([error, restoreError], message)
      }
      throw error
    }
    runLocalSql(restorePersistence)
  } catch (error) {
    try {
      releaseImagePersistenceLease(lease)
    } catch (releaseError) {
      const message = error instanceof Error ? error.message : 'Local image persistence callback failed'
      throw new AggregateError([error, releaseError], message)
    }
    throw error
  }
  releaseImagePersistenceLease(lease)
  return result
}
