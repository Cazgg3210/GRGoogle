import { expect, test } from '@playwright/test'
import { DemoUsers, loginAs } from '../helpers/auth'

/** Escenario §36.10 — reunión RESTRICTED/LEGAL (§26): acceso limitado y exclusión del análisis IA. */
test.describe('Reunión RESTRICTED', () => {
  // activar cuando UI final esté disponible
  test.fixme()

  test('un MEMBER que no participó no ve la reunión restringida ni por URL directa', async ({
    page,
  }) => {
    await loginAs(page, DemoUsers.director)
    await page.goto('/reuniones?confidentiality=RESTRICTED')
    const row = page
      .getByRole('row')
      .filter({ hasText: /restringida/i })
      .first()
    const href = await row.getByRole('link').first().getAttribute('href')

    await loginAs(page, DemoUsers.operaciones)
    await page.goto('/reuniones')
    await expect(page.getByRole('row').filter({ hasText: /restringida/i })).toHaveCount(0)
    await page.goto(href ?? '/reuniones')
    await expect(page.getByText(/sin permiso|no autorizado|no encontrada|403|404/i)).toBeVisible()
  })

  test('DIRECTOR puede cambiar la confidencialidad a Jurídica y excluir del análisis IA', async ({
    page,
  }) => {
    await loginAs(page, DemoUsers.director)
    await page.goto('/reuniones')
    await page.getByRole('link', { name: /seguimiento contrato cliente alfa/i }).click()
    await page.getByRole('button', { name: /confidencialidad/i }).click()
    await page.getByRole('menuitem', { name: /jurídica/i }).click()
    await expect(page.getByText(/jurídica/i).first()).toBeVisible()

    await page.getByRole('button', { name: /excluir del análisis/i }).click()
    await page.getByRole('button', { name: /confirmar/i }).click()
    await expect(page.getByText(/excluida/i).first()).toBeVisible()
    await page.getByRole('tab', { name: /auditoría/i }).click()
    await expect(page.getByText(/MEETING_SET_CONFIDENTIALITY|confidencialidad/i)).toBeVisible()
    await expect(page.getByText(/MEETING_EXCLUDE|excluida del análisis/i)).toBeVisible()
  })

  test('el buscador global no devuelve resultados de reuniones restringidas a quien no tiene alcance', async ({
    page,
  }) => {
    await loginAs(page, DemoUsers.operaciones)
    await page.getByRole('searchbox', { name: /buscar/i }).fill('cliente alfa')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/buscar/)
    await expect(
      page.getByRole('link', { name: /seguimiento contrato cliente alfa/i }),
    ).toHaveCount(0)
  })
})
