import { expect, test } from '@playwright/test'
import { DemoUsers, loginAs } from '../helpers/auth'

/** Escenario §36.2 — reunión nueva procesada (pipeline completo con adapters fake). */
test.describe('Reunión nueva procesada', () => {
  // activar cuando UI final esté disponible
  test.fixme()

  test('Simular reunión terminada genera una reunión procesada con resumen y compromisos', async ({
    page,
  }) => {
    await loginAs(page, DemoUsers.gestora)

    await page.goto('/integraciones')
    await page.getByRole('button', { name: /simular reunión terminada/i }).click()
    await expect(page.getByText(/reunión encolada|procesamiento iniciado/i)).toBeVisible()

    await page.goto('/reuniones')
    const row = page
      .getByRole('row')
      .filter({ hasText: /simulada|reunión de prueba/i })
      .first()
    await expect(row).toBeVisible()
    await expect(row).toContainText(/procesada|requiere revisión/i, { timeout: 30_000 })

    await row.getByRole('link').first().click()
    await expect(page).toHaveURL(/\/reuniones\/[0-9a-f-]+/)
    await page.getByRole('tab', { name: /resumen/i }).click()
    await expect(page.getByRole('heading', { name: /resumen ejecutivo/i })).toBeVisible()
    await page.getByRole('tab', { name: /compromisos/i }).click()
    await expect(page.getByRole('button', { name: /ver evidencia/i }).first()).toBeVisible()
  })

  test('la reunión demo "Seguimiento contrato Cliente Alfa" muestra evidencia con speaker y timestamp', async ({
    page,
  }) => {
    await loginAs(page, DemoUsers.gestora)
    await page.goto('/reuniones')
    await page.getByRole('link', { name: /seguimiento contrato cliente alfa/i }).click()
    await page.getByRole('tab', { name: /compromisos/i }).click()
    await page
      .getByRole('button', { name: /ver evidencia/i })
      .first()
      .click()
    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()
    await expect(drawer).toContainText(/speaker|participante/i)
    await expect(drawer).toContainText(/\d{1,2}:\d{2}/)
  })
})
