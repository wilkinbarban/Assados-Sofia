import { expect, type Page } from '@playwright/test'
import { cleanupAdminProducts, seedAdminProducts, test } from './fixtures/admin-products'

let fixture: Awaited<ReturnType<typeof seedAdminProducts>>

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

test.describe.serial('storage orphan reconciliation admin tab', () => {
  test.beforeAll(async () => { fixture = await seedAdminProducts() })
  test.afterAll(async () => { await cleanupAdminProducts(fixture) })

  test('shows the local admin reconciliation empty state without destructive controls', async ({ page }, testInfo) => {
    await signIn(page, fixture.admin.email, fixture.admin.password)

    for (const viewport of [
      { name: 'mobile', width: 390, height: 844 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(viewport)
      await page.goto('/atendimento/admin?tab=storage-orphans')

      await expect(page.getByRole('button', { name: 'Reconciliação de imagens' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Reconciliação de imagens órfãs' })).toBeVisible()
      await expect(page.getByText('Nenhum arquivo é removido automaticamente.')).toBeVisible()
      await expect(page.getByRole('status')).toContainText('Nenhum candidato pendente de reconciliação.')
      await expect(page.getByRole('button', { name: 'Aprovar' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Executar remoção' })).toHaveCount(0)
      await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`storage-orphans-${viewport.name}.png`), fullPage: true })
    }
  })
})
