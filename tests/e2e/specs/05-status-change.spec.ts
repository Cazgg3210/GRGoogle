import { expect, test } from '@playwright/test'
import { DemoUsers, loginAs } from '../helpers/auth'

/** Escenario §36.5 — cambio de estado desde Pendientes; nunca a Completada de forma directa. */
test.describe('Cambio de estado', () => {
  // activar cuando UI final esté disponible
  test.fixme()

  test('cambiar Pendiente → En progreso desde acciones rápidas', async ({ page }) => {
    await loginAs(page, DemoUsers.andres)
    await page.goto('/pendientes?view=mine')
    const row = page
      .getByRole('row')
      .filter({ hasText: /^.*pendiente.*$/i })
      .first()
    await row.getByRole('button', { name: /cambiar estado/i }).click()
    await page.getByRole('menuitem', { name: /en progreso/i }).click()
    await expect(row).toContainText(/en progreso/i)
  })

  test('el menú de estado no ofrece "Completada"; ofrece "Completar" que crea una propuesta', async ({
    page,
  }) => {
    await loginAs(page, DemoUsers.andres)
    await page.goto('/pendientes?view=mine')
    const row = page
      .getByRole('row')
      .filter({ hasText: /en progreso/i })
      .first()
    await row.getByRole('button', { name: /cambiar estado/i }).click()
    await expect(page.getByRole('menuitem', { name: /^completada$/i })).toHaveCount(0)
    await page.keyboard.press('Escape')

    await row.getByRole('button', { name: /completar/i }).click()
    await page.getByLabel(/motivo/i).fill('Entregado al cliente el día de hoy')
    await page.getByRole('button', { name: /proponer cierre/i }).click()
    await expect(row).toContainText(/cierre propuesto/i)
  })

  test('marcar bloqueado exige un motivo y se refleja en el detalle', async ({ page }) => {
    await loginAs(page, DemoUsers.andres)
    await page.goto('/pendientes?view=mine')
    const row = page
      .getByRole('row')
      .filter({ hasText: /pendiente|en progreso/i })
      .first()
    await row.getByRole('button', { name: /marcar bloqueado/i }).click()
    await page.getByRole('button', { name: /guardar/i }).click()
    await expect(page.getByText(/el motivo es obligatorio/i)).toBeVisible()
    await page.getByLabel(/motivo/i).fill('Esperando firma del proveedor')
    await page.getByRole('button', { name: /guardar/i }).click()
    await expect(row).toContainText(/bloqueada/i)
  })
})
