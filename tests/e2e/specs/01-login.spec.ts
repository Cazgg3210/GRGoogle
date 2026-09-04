import { expect, test } from '@playwright/test'
import { DemoUsers, loginAs } from '../helpers/auth'

/** Escenario §36.1 — login SMLXL (smoke; siempre activo). */
test.describe('Login', () => {
  test('la pantalla de login ofrece Google y el acceso de prueba en desarrollo', async ({
    page,
  }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /iniciar sesión/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /continuar con google/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /usuario de prueba/i })).toBeVisible()
  })

  test('un usuario seed entra con el bypass de desarrollo y ve Inicio', async ({ page }) => {
    await loginAs(page, DemoUsers.gestora)
    await expect(page.getByRole('heading', { name: /inicio/i })).toBeVisible()
    await expect(page.getByRole('navigation')).toContainText(/reuniones/i)
    await expect(page.getByRole('navigation')).toContainText(/pendientes/i)
    await expect(page.getByRole('navigation')).toContainText(/revisión ia/i)
  })

  test('rutas protegidas redirigen a /login sin sesión', async ({ page }) => {
    await page.goto('/pendientes')
    await expect(page).toHaveURL(/\/login/)
  })
})
