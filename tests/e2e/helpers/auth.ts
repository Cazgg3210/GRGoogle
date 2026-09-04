import { expect, type Page } from '@playwright/test'

/**
 * Usuarios seed (prisma/seed/catalogs.ts, §37). Los correos son ficticios; el
 * rol se resuelve en BD. Ninguno se hardcodea en la aplicación (§45.15).
 */
export const DemoUsers = {
  gestora: 'gestora@smlxl.mx', // ADMIN: aprueba cierres, genera digest, integraciones
  director: 'direccion@smlxl.mx', // DIRECTOR (Dirección General)
  andres: 'andres@smlxl.mx', // MANAGER (área Operaciones y Proyectos)
  juridico: 'juridico@smlxl.mx', // MANAGER (área Jurídico)
  operaciones: 'operaciones@smlxl.mx', // MEMBER (área Operaciones y Proyectos)
} as const

/**
 * Login en modo desarrollo (AUTH_DEV_BYPASS=true): /login muestra
 * "Entrar como usuario de prueba" con un selector por correo.
 */
export async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByRole('button', { name: /usuario de prueba/i }).click()
  const selector = page.getByRole('combobox', { name: /usuario|correo/i })
  if (await selector.count()) {
    await selector.selectOption({ value: email })
  } else {
    await page.getByLabel(/correo/i).fill(email)
  }
  await page.getByRole('button', { name: /^entrar$/i }).click()
  await expect(page).toHaveURL(/\/inicio/)
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: /perfil|cuenta/i }).click()
  await page.getByRole('menuitem', { name: /cerrar sesión/i }).click()
  await expect(page).toHaveURL(/\/login/)
}
