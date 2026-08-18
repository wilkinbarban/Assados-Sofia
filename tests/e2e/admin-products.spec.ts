import { expect, type Page } from '@playwright/test'
import { cleanupAdminProducts, seedAdminProducts, test, withImagePersistenceFailure } from './fixtures/admin-products'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
let fixture: Awaited<ReturnType<typeof seedAdminProducts>>

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).not.toHaveURL(/\/login/)
  await expect.poll(async () => (await page.context().cookies()).some((cookie) => cookie.name.startsWith('sb-auth-token'))).toBe(true)
}

test.describe.serial('authenticated admin products', () => {
  test.beforeAll(async () => { fixture = await seedAdminProducts() })
  test.afterAll(async () => { await cleanupAdminProducts(fixture) })

  test('denies missing and unauthorized sessions and redirects the legacy route', async ({ page }) => {
    await page.goto('/atendimento/admin?tab=estoque')
    await expect(page).toHaveURL(/\/login/)

    await signIn(page, fixture.vendor.email, fixture.vendor.password)
    await page.goto('/atendimento/admin?tab=estoque')
    await expect(page).not.toHaveURL(/\/atendimento\/admin/)
    await expect(page.getByRole('heading', { name: 'Estoque' })).toHaveCount(0)

    await page.context().clearCookies()
    await signIn(page, fixture.admin.email, fixture.admin.password)
    await page.goto('/atendimento/produtos')
    await expect(page).toHaveURL(/\/atendimento\/admin\?tab=estoque$/)
    await expect(page.getByRole('heading', { name: 'Estoque' })).toBeVisible()
  })

  test('covers CRUD, filters, global reorder gating, and persisted reload', async ({ page }) => {
    await signIn(page, fixture.admin.email, fixture.admin.password)
    await page.goto('/atendimento/admin?tab=estoque')
    await expect(page.getByText(fixture.products.alpha.name)).toBeVisible()

    const created = `${fixture.prefix} Created`
    await page.getByRole('button', { name: 'Novo Produto' }).click()
    await page.getByPlaceholder('Ex: Picanha Premium').fill(created)
    await page.getByPlaceholder('Descrição do produto...').fill('E2E create')
    await page.getByPlaceholder('0,00').fill('19,90')
    await page.locator('#inventory-product-form input[type=number]').nth(1).fill('4')
    await page.getByRole('button', { name: 'Cadastrar' }).click()
    await expect(page.getByText('Produto criado com sucesso!')).toBeVisible()

    await page.getByRole('button', { name: `Editar ${created}` }).click()
    await page.getByPlaceholder('Descrição do produto...').fill('E2E updated')
    await page.getByRole('button', { name: 'Salvar' }).click()
    await page.waitForTimeout(1_000)
    expect((await page.locator('[role="alert"]').allTextContents()).filter(Boolean)).toEqual([])
    await expect(page.getByText('Produto atualizado com sucesso!')).toBeVisible()

    const search = page.getByPlaceholder('Buscar por nome ou descrição...')
    await search.fill(created)
    await expect(page.getByText(fixture.products.alpha.name)).toHaveCount(0)
    await expect(page.getByRole('button', { name: `Reordenar ${created}` })).toBeDisabled()
    await search.clear()
    await page.getByRole('button', { name: 'Ativos' }).click()
    await expect(page.getByRole('button', { name: `Reordenar ${created}` })).toBeDisabled()
    await page.getByRole('button', { name: 'Todos' }).click()
    await expect(page.getByText(fixture.products.zero.name)).toBeVisible()

    const alphaHandle = page.getByRole('button', { name: `Reordenar ${fixture.products.alpha.name}` })
    await expect(alphaHandle).toBeEnabled()
    await alphaHandle.focus()
    await alphaHandle.press('Enter')
    await expect(alphaHandle).toHaveAttribute('aria-pressed', 'true')
    const namesBeforeMove = await page.getByRole('listitem').locator('h3').allTextContents()
    const alphaIndexBeforeMove = namesBeforeMove.indexOf(fixture.products.alpha.name)
    expect(alphaIndexBeforeMove).toBeGreaterThanOrEqual(0)
    await alphaHandle.press('ArrowDown')
    await expect.poll(async () => {
      const names = await page.getByRole('listitem').locator('h3').allTextContents()
      return names.indexOf(fixture.products.alpha.name)
    }).toBe(alphaIndexBeforeMove + 1)
    await expect(alphaHandle).toHaveAttribute('aria-pressed', 'true')
    await alphaHandle.press('Enter')
    await expect(alphaHandle).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('status')).toContainText('movido para a posição')
    await expect.poll(() => fixture.productOrder(fixture.products.alpha.id)).toBe(alphaIndexBeforeMove + 2)
    await page.reload()
    await expect(page.getByText(fixture.products.alpha.name)).toBeVisible()
    const names = await page.getByRole('listitem').locator('h3').allTextContents()
    expect(names.indexOf(fixture.products.alpha.name)).toBe(alphaIndexBeforeMove + 1)

    await page.getByRole('button', { name: `Excluir ${created}` }).click()
    await page.getByRole('button', { name: 'Excluir', exact: true }).click()
    await expect(page.getByText('Produto excluído com sucesso!')).toBeVisible()
    await expect(page.getByText(created)).toHaveCount(0)
  })

  test('keeps product actions reachable on a small viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page, fixture.admin.email, fixture.admin.password)
    await page.goto('/atendimento/admin?tab=estoque')

    const grid = page.getByRole('list', { name: 'Grade responsiva de produtos, até seis colunas' })
    const card = grid.getByRole('listitem').filter({
      has: page.getByRole('heading', { name: fixture.products.alpha.name }),
    })
    await card.scrollIntoViewIfNeeded()
    await expect(card).toBeInViewport()

    const increase = card.getByRole('button', { name: `Aumentar estoque de ${fixture.products.alpha.name}` })
    const edit = card.getByRole('button', { name: `Editar ${fixture.products.alpha.name}` })
    const remove = card.getByRole('button', { name: `Excluir ${fixture.products.alpha.name}` })
    await expect(increase).toBeVisible()
    await expect(edit).toBeVisible()
    await expect(remove).toBeVisible()
    await expect(increase).toBeInViewport()
    await expect(edit).toBeInViewport()
    await expect(remove).toBeInViewport()

    await increase.click()
    await expect(card.getByText('6', { exact: true })).toBeVisible()
    await edit.click()
    await expect(page.getByRole('heading', { name: 'Editar Produto' })).toBeVisible()
    await expect(page.getByPlaceholder('Ex: Picanha Premium')).toHaveValue(fixture.products.alpha.name)
  })

  test('preserves the previous image and removes new assets after persistence failure', async ({ page }) => {
    await signIn(page, fixture.admin.email, fixture.admin.password)
    await page.goto('/atendimento/admin?tab=estoque')
    await page.getByRole('button', { name: `Editar ${fixture.products.bravo.name}` }).click()
    const upload = page.locator('#inventory-product-form input[type=file]').first()
    await upload.setInputFiles({ name: 'success.png', mimeType: 'image/png', buffer: png })
    await expect(page.getByAltText('Foto 1')).toBeVisible()
    const previousSrc = await page.getByAltText('Foto 1').getAttribute('src')
    const previousPaths = await fixture.storagePaths(fixture.products.bravo.id)
    expect(previousPaths).toHaveLength(2)

    await withImagePersistenceFailure(async () => {
      await upload.setInputFiles({ name: 'failure.png', mimeType: 'image/png', buffer: png })
      await expect(page.getByText(/ERRO_BANCO|Erro ao enviar imagem/)).toBeVisible()
    })

    await expect(page.getByAltText('Foto 1')).toHaveAttribute('src', previousSrc!)
    await expect.poll(() => fixture.storagePaths(fixture.products.bravo.id)).toEqual(previousPaths)
  })
})
