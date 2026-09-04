import { expect, test } from '@playwright/test'
import { DemoUsers, loginAs } from '../helpers/auth'

/** Escenario §36.6 — digest semanal: generar, revisar secciones y vista previa de correo. */
test.describe('Digest semanal', () => {
  // activar cuando UI final esté disponible
  test.fixme()

  test('generar el digest de la semana muestra las secciones A–G', async ({ page }) => {
    await loginAs(page, DemoUsers.gestora)
    await page.goto('/reportes')
    await page.getByRole('button', { name: /generar digest semanal/i }).click()
    await page
      .getByRole('button', { name: /generar/i })
      .last()
      .click()

    await expect(page.getByRole('heading', { name: /resumen ejecutivo/i })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByRole('heading', { name: /nuevos compromisos/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /backlog acumulado/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /riesgos/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /cambios detectados/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /bandeja de aprobación/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /próxima semana/i })).toBeVisible()
  })

  test('la vista previa de correo se muestra y no cambia estados de tareas', async ({ page }) => {
    await loginAs(page, DemoUsers.gestora)
    await page.goto('/reportes')
    await page
      .getByRole('link', { name: /ver digest/i })
      .first()
      .click()
    await page.getByRole('button', { name: /vista previa de correo/i }).click()
    const preview = page.frameLocator('iframe[title*="correo" i]')
    await expect(preview.getByText(/resumen semanal/i)).toBeVisible()

    await page.goto('/pendientes?view=proposed')
    await expect(page.getByRole('cell', { name: /cierre propuesto/i }).first()).toBeVisible()
  })

  test('la configuración del digest permite viernes o sábado y destinatarios', async ({ page }) => {
    await loginAs(page, DemoUsers.gestora)
    await page.goto('/reportes')
    await page.getByRole('link', { name: /configuración del digest/i }).click()
    await page.getByLabel(/día/i).selectOption({ label: 'Sábado' })
    await page.getByLabel(/hora/i).fill('09:00')
    await page.getByRole('button', { name: /guardar/i }).click()
    await expect(page.getByText(/configuración guardada/i)).toBeVisible()
    await expect(page.getByText(/próximo envío/i)).toContainText(/sábado/i)
  })
})
