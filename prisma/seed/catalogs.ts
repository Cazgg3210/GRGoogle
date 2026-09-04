import { DEFAULT_NOTIFICATION_PREFERENCES, UserRole, normalizeText } from '@smlxl/domain'
import type { PrismaClient } from '../../packages/database/src/index.js'
import { stableId } from './helpers.js'

export type AreaKey = 'DG' | 'AF' | 'VM' | 'JU' | 'OP' | 'CC' | 'SC' | 'EX'
export type UserKey =
  | 'direccion'
  | 'gestora'
  | 'andres'
  | 'juridico'
  | 'operaciones'
  | 'ventas'
  | 'finanzas'
  | 'capital'
  | 'servicio'
  | 'auditoria'
export type ProjectKey = 'alfa' | 'beta' | 'gamma' | 'norte' | 'fiscal' | 'portal' | 'campana'
export type ExternalKey = 'ruiz' | 'nube' | 'notaria'

export interface Catalogs {
  areas: Record<AreaKey, string>
  areaNames: Record<AreaKey, string>
  users: Record<UserKey, string>
  userEmails: Record<UserKey, string>
  userNames: Record<UserKey, string>
  projects: Record<ProjectKey, string>
  projectNames: Record<ProjectKey, string>
  externals: Record<ExternalKey, string>
  externalNames: Record<ExternalKey, string>
}

/** Áreas del legado (§20.2). "Externos" es categoría especial. */
export const AREAS: Array<{ key: AreaKey; name: string; code: string; external?: boolean }> = [
  { key: 'DG', name: 'Dirección General', code: 'DG' },
  { key: 'AF', name: 'Admin y Finanzas', code: 'AF' },
  { key: 'VM', name: 'Ventas y Marketing', code: 'VM' },
  { key: 'JU', name: 'Jurídico', code: 'JU' },
  { key: 'OP', name: 'Operaciones y Proyectos', code: 'OP' },
  { key: 'CC', name: 'Captación de Capital', code: 'CC' },
  { key: 'SC', name: 'Servicio al Cliente', code: 'SC' },
  { key: 'EX', name: 'Externos', code: 'EX', external: true },
]

export const PROJECTS: Array<{ key: ProjectKey; name: string; code: string; area: AreaKey; aliases: string[] }> = [
  { key: 'alfa', name: 'Contrato Cliente Alfa', code: 'ALFA', area: 'OP', aliases: ['cliente alfa', 'alfa', 'contrato alfa'] },
  { key: 'beta', name: 'Plataforma Beta', code: 'BETA', area: 'OP', aliases: ['beta', 'plataforma beta', 'proyecto beta'] },
  { key: 'gamma', name: 'Fondo Gamma', code: 'GAMMA', area: 'CC', aliases: ['gamma', 'fondo gamma', 'levantamiento gamma'] },
  { key: 'norte', name: 'Expansión Norte', code: 'NORTE', area: 'DG', aliases: ['expansion norte', 'norte', 'monterrey'] },
  { key: 'fiscal', name: 'Cierre Fiscal 2026', code: 'FISCAL26', area: 'AF', aliases: ['cierre fiscal', 'cierre fiscal 2026', 'fiscal 2026'] },
  { key: 'portal', name: 'Portal de Clientes', code: 'PORTAL', area: 'SC', aliases: ['portal de clientes', 'portal clientes', 'portal'] },
  { key: 'campana', name: 'Campaña Digital Q4', code: 'CAMPQ4', area: 'VM', aliases: ['campana digital q4', 'campana q4', 'campana digital'] },
]

/** Cuentas ficticias del tenant (10). Ningún dato real. */
export const USERS: Array<{
  key: UserKey
  email: string
  name: string
  role: UserRole
  area: AreaKey | null
  manager: UserKey | null
  aliases: string[]
}> = [
  { key: 'direccion', email: 'direccion@smlxl.mx', name: 'Lucía Ferrer', role: UserRole.DIRECTOR, area: 'DG', manager: null, aliases: ['lucia', 'lucia ferrer', 'direccion'] },
  { key: 'gestora', email: 'gestora@smlxl.mx', name: 'Mariana Solís', role: UserRole.ADMIN, area: 'DG', manager: 'direccion', aliases: ['mariana', 'mariana solis', 'gestora'] },
  { key: 'andres', email: 'andres@smlxl.mx', name: 'Andrés Escandón', role: UserRole.MANAGER, area: 'OP', manager: 'direccion', aliases: ['andres', 'andres escandon', 'andres e', 'escandon'] },
  { key: 'juridico', email: 'juridico@smlxl.mx', name: 'Lisa de la Fuente', role: UserRole.MANAGER, area: 'JU', manager: 'direccion', aliases: ['lisa', 'lisa fuente', 'lisa de la fuente'] },
  { key: 'operaciones', email: 'operaciones@smlxl.mx', name: 'Rodrigo Navarro', role: UserRole.MEMBER, area: 'OP', manager: 'andres', aliases: ['rodrigo', 'rodrigo navarro', 'operaciones'] },
  { key: 'ventas', email: 'ventas@smlxl.mx', name: 'Paola Mendieta', role: UserRole.MANAGER, area: 'VM', manager: 'direccion', aliases: ['paola', 'paola mendieta', 'ventas'] },
  { key: 'finanzas', email: 'finanzas@smlxl.mx', name: 'Héctor Salgado', role: UserRole.MEMBER, area: 'AF', manager: 'gestora', aliases: ['hector', 'hector salgado', 'finanzas'] },
  { key: 'capital', email: 'capital@smlxl.mx', name: 'Daniela Ortiz', role: UserRole.MEMBER, area: 'CC', manager: 'direccion', aliases: ['daniela', 'daniela ortiz', 'capital'] },
  { key: 'servicio', email: 'servicio@smlxl.mx', name: 'Iván Robles', role: UserRole.MEMBER, area: 'SC', manager: 'andres', aliases: ['ivan', 'ivan robles', 'servicio'] },
  { key: 'auditoria', email: 'auditoria@smlxl.mx', name: 'Sofía Carrillo', role: UserRole.AUDITOR, area: null, manager: 'direccion', aliases: ['sofia', 'sofia carrillo', 'auditoria'] },
]

export const EXTERNALS: Array<{ key: ExternalKey; name: string; company: string; email: string | null }> = [
  { key: 'ruiz', name: 'Despacho Contable Ruiz', company: 'Ruiz y Asociados, S.C.', email: 'contacto@despachoruiz.example' },
  { key: 'nube', name: 'Proveedor TI Nube MX', company: 'Nube MX', email: 'soporte@nubemx.example' },
  { key: 'notaria', name: 'Notaría 27', company: 'Notaría Pública 27', email: null },
]

export const MONITORED_EMAILS = USERS.map((u) => u.email)

export async function seedCatalogs(db: PrismaClient): Promise<Catalogs> {
  const areas = {} as Record<AreaKey, string>
  const areaNames = {} as Record<AreaKey, string>
  for (const [i, a] of AREAS.entries()) {
    const id = stableId(`area:${a.name}`)
    await db.area.upsert({
      where: { id },
      create: { id, name: a.name, code: a.code, isExternalCategory: a.external ?? false, active: true, sortOrder: i },
      update: { name: a.name, code: a.code, isExternalCategory: a.external ?? false, active: true, sortOrder: i },
    })
    areas[a.key] = id
    areaNames[a.key] = a.name
  }

  const projects = {} as Record<ProjectKey, string>
  const projectNames = {} as Record<ProjectKey, string>
  for (const p of PROJECTS) {
    const id = stableId(`project:${p.name}`)
    await db.project.upsert({
      where: { id },
      create: { id, canonicalName: p.name, code: p.code, active: true, areaId: areas[p.area] },
      update: { canonicalName: p.name, code: p.code, active: true, areaId: areas[p.area] },
    })
    projects[p.key] = id
    projectNames[p.key] = p.name
    const aliasSet = new Set([normalizeText(p.name), ...p.aliases.map((a) => normalizeText(a))])
    for (const alias of aliasSet) {
      await db.projectAlias.upsert({
        where: { aliasNormalized: alias },
        create: { id: stableId(`project-alias:${alias}`), projectId: id, aliasNormalized: alias, source: 'SEED' },
        update: { projectId: id },
      })
    }
  }

  const users = {} as Record<UserKey, string>
  const userEmails = {} as Record<UserKey, string>
  const userNames = {} as Record<UserKey, string>
  for (const u of USERS) users[u.key] = stableId(`user:${u.email}`)
  // Primera pasada sin manager (evita dependencia de orden); segunda pasada fija managerId.
  for (const u of USERS) {
    const id = users[u.key]
    const data = {
      email: u.email,
      displayName: u.name,
      role: u.role,
      areaId: u.area ? areas[u.area] : null,
      active: true,
      monitored: true,
      googleUserId: `fake-google-${u.key}`,
      notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, postMeetingSummary: u.key === 'gestora' },
    }
    await db.user.upsert({ where: { id }, create: { id, ...data }, update: data })
    userEmails[u.key] = u.email
    userNames[u.key] = u.name
  }
  for (const u of USERS) {
    await db.user.update({ where: { id: users[u.key] }, data: { managerId: u.manager ? users[u.manager] : null } })
    const aliasSet = new Set([normalizeText(u.name), ...u.aliases.map((a) => normalizeText(a))])
    for (const alias of aliasSet) {
      await db.userAlias.upsert({
        where: { aliasNormalized: alias },
        create: { id: stableId(`user-alias:${alias}`), userId: users[u.key], aliasNormalized: alias, source: 'SEED' },
        update: { userId: users[u.key] },
      })
    }
  }

  const externals = {} as Record<ExternalKey, string>
  const externalNames = {} as Record<ExternalKey, string>
  for (const e of EXTERNALS) {
    const id = stableId(`external:${e.name}`)
    const data = {
      displayName: e.name,
      nameNormalized: normalizeText(e.name),
      company: e.company,
      email: e.email,
      phone: null,
      source: 'SEED',
      active: true,
    }
    await db.externalAssignee.upsert({ where: { id }, create: { id, ...data }, update: data })
    externals[e.key] = id
    externalNames[e.key] = e.name
  }

  return { areas, areaNames, users, userEmails, userNames, projects, projectNames, externals, externalNames }
}
