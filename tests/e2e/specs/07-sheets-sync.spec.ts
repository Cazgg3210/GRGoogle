import { expect, test } from '@playwright/test'
import { DemoUsers, loginAs } from '../helpers/auth'

/** Escenario §36.7 — sincronización con Google Sheets (modo fake: vista previa). */
test.describe('Google Sheets sync', () => {
  // activar cuando UI final esté disponible
  test.fixme()

  test('el dry-run muestra las hojas Pendientes y Reuniones con UUID como primera columna', async ({
    page,
  }) => {
    await loginAs(page, DemoUsers.gestora)
    await page.goto('/integraciones')
    await page.getByRole('button', { name: /sincronizar sheets/i }).click()
    await page.getByRole('menuitem', { name: /dry-run|vista previa/i }).click()

    await expect(page.getByRole('tab', { name: /pendientes/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /reuniones/i })).toBeVisible()

    const table = page.getByRole('table').first()
    const firstHeader = table.getByRole('columnheader').first()
    await expect(firstHeader).toHaveText(/uuid/i)
    await expect(table.getByRole('columnheader', { name: /fecha compromiso/i })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: /vencido/i })).toBeVisible()
    await expect(page.getByText(/insertadas|actualizadas/i)).toBeVisible()
  })

  test('sin el flag SHEETS_SYNC_ENABLED la sincronización real está deshabilitada', async ({
    page,
  }) => {
    await loginAs(page, DemoUsers.gestora)
    await page.goto('/integraciones')
    await page.getByRole('button', { name: /sincronizar sheets/i }).click()
    const real = page.getByRole('menuitem', { name: /sincronizar ahora/i })
    await expect(real).toBeDisabled()
  })
})
