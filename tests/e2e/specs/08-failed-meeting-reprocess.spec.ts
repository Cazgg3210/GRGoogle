import { expect, test } from '@playwright/test'
import { DemoUsers, loginAs } from '../helpers/auth'

/** Escenario §36.8 — reunión con fallo y reproceso (§32, §34, runbook reprocess-meeting). */
test.describe('Reunión con fallo y reproceso', () => {
  // activar cuando UI final esté disponible
  test.fixme()

  test('una reunión en estado "Con error" muestra el código traducido y permite reprocesar', async ({
    page,
  }) => {
    await loginAs(page, DemoUsers.gestora)
    await page.goto('/reuniones?processingStatus=FAILED')
    const row = page
      .getByRole('row')
      .filter({ hasText: /con error/i })
      .first()
    await expect(row).toBeVisible()
    await row.getByRole('link').first().click()

    await expect(
      page.getByText(/google aún no generó|resultado inválido|transcripción está vacía/i),
    ).toBeVisible()
    await page.getByRole('tab', { name: /historial ia/i }).click()
    await page.getByRole('button', { name: /reprocesar/i }).click()
    await page.getByRole('radio', { name: /solo analizar/i }).check()
    await page.getByRole('button', { name: /confirmar/i }).click()
    await expect(page.getByText(/reproceso encolado/i)).toBeVisible()
    await expect(page.getByText(/procesada|requiere revisión/i).first()).toBeVisible({
      timeout: 30_000,
    })
  })

  test('el reproceso crea una nueva corrida sin borrar la anterior', async ({ page }) => {
    await loginAs(page, DemoUsers.gestora)
    await page.goto('/reuniones')
    await page.getByRole('link', { name: /seguimiento contrato cliente alfa/i }).click()
    await page.getByRole('tab', { name: /historial ia/i }).click()
    const before = await page.getByRole('row').count()
    await page.getByRole('button', { name: /reprocesar/i }).click()
    await page.getByRole('button', { name: /confirmar/i }).click()
    await expect
      .poll(async () => page.getByRole('row').count(), { timeout: 30_000 })
      .toBeGreaterThan(before)
  })

  test('un MEMBER no puede reprocesar', async ({ page }) => {
    await loginAs(page, DemoUsers.andres)
    await page.goto('/reuniones')
    await page
      .getByRole('link')
      .filter({ hasText: /seguimiento contrato cliente alfa/i })
      .click()
    await page.getByRole('tab', { name: /historial ia/i }).click()
    await expect(page.getByRole('button', { name: /reprocesar/i })).toHaveCount(0)
  })
})
