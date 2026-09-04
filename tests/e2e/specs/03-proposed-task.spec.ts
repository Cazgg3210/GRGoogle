import { expect, test } from '@playwright/test'
import { DemoUsers, loginAs } from '../helpers/auth'

/** Escenario §36.3 — tarea propuesta por IA visible en Revisión IA y en Pendientes. */
test.describe('Tarea propuesta', () => {
  // activar cuando UI final esté disponible
  test.fixme()

  test('Revisión IA muestra una tarjeta con responsable, fecha y coincidencia sugeridas', async ({
    page,
  }) => {
    await loginAs(page, DemoUsers.gestora)
    await page.goto('/revision-ia')
    const card = page.getByRole('article').first()
    await expect(card).toContainText(/ia detectó/i)
    await expect(card).toContainText(/responsable sugerido/i)
    await expect(card).toContainText(/fecha sugerida|sin fecha/i)
    await expect(card.getByRole('button', { name: /crear nuevo/i })).toBeVisible()
    await expect(card.getByRole('button', { name: /descartar/i })).toBeVisible()
  })

  test('una tarea propuesta aparece en Pendientes con estado "Propuesta"', async ({ page }) => {
    await loginAs(page, DemoUsers.gestora)
    await page.goto('/pendientes?view=proposed')
    await expect(page.getByRole('cell', { name: /propuesta/i }).first()).toBeVisible()
  })

  test('"Crear nuevo" convierte la propuesta en tarea Pendiente y queda auditado', async ({
    page,
  }) => {
    await loginAs(page, DemoUsers.gestora)
    await page.goto('/revision-ia')
    const card = page
      .getByRole('article')
      .filter({ hasText: /crear nuevo/i })
      .first()
    const title = (await card.getByRole('heading').first().textContent()) ?? ''
    await card.getByRole('button', { name: /crear nuevo/i }).click()
    await page.getByRole('button', { name: /confirmar/i }).click()
    await expect(page.getByText(/tarea creada/i)).toBeVisible()

    await page.goto('/pendientes')
    const row = page
      .getByRole('row')
      .filter({ hasText: title.slice(0, 20) })
      .first()
    await expect(row).toContainText(/pendiente/i)
    await row.getByRole('link').first().click()
    await expect(page.getByRole('heading', { name: /historial/i })).toBeVisible()
    await expect(page.getByText(/creada desde revisión ia/i)).toBeVisible()
  })
})
