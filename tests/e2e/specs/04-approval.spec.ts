import { expect, test } from '@playwright/test'
import { DemoUsers, loginAs } from '../helpers/auth'

/** Escenario §36.4 — aprobación: "Actualizar existente" en Revisión IA y aprobación de cierre. */
test.describe('Aprobación', () => {
  // activar cuando UI final esté disponible
  test.fixme()

  test('"Actualizar existente" vincula la propuesta con la tarea existente', async ({ page }) => {
    await loginAs(page, DemoUsers.gestora)
    await page.goto('/revision-ia')
    const card = page
      .getByRole('article')
      .filter({ hasText: /coincide con pendiente existente/i })
      .first()
    await expect(card).toContainText(/ACT-\d+/)
    await card.getByRole('button', { name: /actualizar existente/i }).click()
    await page.getByRole('button', { name: /confirmar/i }).click()
    await expect(page.getByText(/tarea actualizada/i)).toBeVisible()
  })

  test('una propuesta de cierre sólo se completa al aprobarla un usuario autorizado', async ({
    page,
  }) => {
    await loginAs(page, DemoUsers.gestora)
    await page.goto('/pendientes?view=proposed')
    const row = page
      .getByRole('row')
      .filter({ hasText: /cierre propuesto/i })
      .first()
    await row.getByRole('link').first().click()

    await expect(page.getByRole('heading', { name: /propuesta de cierre/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /aprobar/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /rechazar/i })).toBeVisible()

    await page.getByRole('button', { name: /aprobar/i }).click()
    await page.getByLabel(/comentario/i).fill('Verificado con el cliente')
    await page.getByRole('button', { name: /confirmar/i }).click()

    await expect(page.getByText(/completada/i).first()).toBeVisible()
    await page.getByRole('tab', { name: /historial/i }).click()
    await expect(page.getByText(/cierre propuesto → completada/i)).toBeVisible()
  })

  test('un MEMBER no ve el botón Aprobar en la propuesta de cierre de su propia tarea', async ({
    page,
  }) => {
    await loginAs(page, DemoUsers.andres)
    await page.goto('/pendientes?view=mine')
    const row = page
      .getByRole('row')
      .filter({ hasText: /cierre propuesto/i })
      .first()
    await row.getByRole('link').first().click()
    await expect(page.getByRole('button', { name: /^aprobar$/i })).toHaveCount(0)
  })
})
