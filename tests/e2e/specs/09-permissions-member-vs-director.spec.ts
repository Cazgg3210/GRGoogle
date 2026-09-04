import { expect, test } from '@playwright/test'
import { DemoUsers, loginAs } from '../helpers/auth'

/** Escenario §36.9 — permisos MEMBER vs DIRECTOR (§25, rbac.ts). RBAC server-side: se verifica también por URL directa. */
test.describe('Permisos MEMBER vs DIRECTOR', () => {
  // activar cuando UI final esté disponible
  test.fixme()

  test('DIRECTOR ve Reportes globales, Revisión IA y todas las reuniones', async ({ page }) => {
    await loginAs(page, DemoUsers.director)
    await expect(page.getByRole('navigation')).toContainText(/reportes/i)
    await expect(page.getByRole('navigation')).toContainText(/revisión ia/i)
    await page.goto('/reuniones')
    await expect.poll(async () => page.getByRole('row').count()).toBeGreaterThan(10)
  })

  test('MEMBER no ve Revisión IA, Integraciones ni Administración y sólo sus reuniones', async ({
    page,
  }) => {
    await loginAs(page, DemoUsers.andres)
    await expect(page.getByRole('navigation')).not.toContainText(/revisión ia/i)
    await expect(page.getByRole('navigation')).not.toContainText(/integraciones/i)
    await expect(page.getByRole('navigation')).not.toContainText(/administración/i)

    await page.goto('/revision-ia')
    await expect(page.getByText(/sin permiso|no autorizado|403/i)).toBeVisible()

    await page.goto('/administracion')
    await expect(page.getByText(/sin permiso|no autorizado|403/i)).toBeVisible()
  })

  test('MEMBER no puede reasignar una tarea ajena aunque conozca la URL', async ({
    page,
    request,
  }) => {
    await loginAs(page, DemoUsers.director)
    await page.goto('/pendientes?view=all')
    const row = page
      .getByRole('row')
      .filter({ hasText: /jurídico/i })
      .first()
    const href = await row.getByRole('link').first().getAttribute('href')

    await loginAs(page, DemoUsers.andres)
    await page.goto(href ?? '/pendientes')
    await expect(page.getByText(/sin permiso|no autorizado|403/i)).toBeVisible()

    // Verificación server-side directa con el bypass de desarrollo.
    const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:4000'
    const id = href?.split('/').pop() ?? ''
    const res = await request.patch(`${apiUrl}/api/v1/action-items/${id}`, {
      headers: { 'x-dev-user-email': DemoUsers.andres },
      data: { ownerUserId: null },
    })
    expect(res.status()).toBe(403)
  })
})
