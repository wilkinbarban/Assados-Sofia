import { expect, test } from '@playwright/test'

test('public login page renders', async ({ page }) => {
  await page.goto('/login')

  await expect(page.getByText('Asados Sofía')).toBeVisible()
  await expect(page.getByLabel('E-mail')).toBeVisible()
  await expect(page.getByLabel('Senha')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
})
