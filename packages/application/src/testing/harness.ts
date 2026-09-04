import { loadEnv, type Env } from '@smlxl/config'
import { FakeMeetingAnalyzer } from '@smlxl/ai'
import { createFakeGoogleAdapters, type FakeGoogleAdapters, type FakeGoogleFixtures } from '@smlxl/google-workspace'
import {
  CollectingEventPublisher,
  DEFAULT_NOTIFICATION_PREFERENCES,
  UserRole,
  type AiMeetingAnalyzer,
  type Area,
  type PlatformSettings,
  type Principal,
  type User,
} from '@smlxl/domain'
import { createLogger } from '@smlxl/observability'
import type { AppContext } from '../context.js'
import { principalFromUser } from '../shared.js'
import { InMemoryRepositories, InMemoryUnitOfWork, emptyState, type InMemoryState } from './in-memory-repos.js'
import { FixedClock, InMemoryQueue, SequentialIdGenerator } from './infra.js'

/**
 * Contexto de aplicación para tests/demos: repos en memoria, adapters Google
 * fake, analizador IA fake, cola en memoria y publisher de eventos coleccionable.
 */
export interface TestContext extends AppContext {
  clock: FixedClock
  ids: SequentialIdGenerator
  queue: InMemoryQueue
  events: CollectingEventPublisher
  google: FakeGoogleAdapters
  fakeAi: FakeMeetingAnalyzer
  state: InMemoryState
  memoryRepos: InMemoryRepositories
}

export interface TestContextOptions {
  now?: Date | string
  env?: Partial<Record<keyof Env, string | boolean | number>>
  settings?: Partial<PlatformSettings>
  fixtures?: FakeGoogleFixtures
  ai?: AiMeetingAnalyzer
  monitoredUserEmails?: string[]
}

export function createTestContext(options: TestContextOptions = {}): TestContext {
  const clock = new FixedClock(options.now ?? '2026-09-03T18:00:00Z')
  const ids = new SequentialIdGenerator()
  const envSource: Record<string, string> = { DATABASE_URL: 'postgresql://test', NODE_ENV: 'test', LOG_LEVEL: 'silent', AI_PROCESSING_ENABLED: 'true' }
  for (const [k, v] of Object.entries(options.env ?? {})) envSource[k] = String(v)
  const env = loadEnv(envSource)
  const monitored = options.monitoredUserEmails ?? options.settings?.monitoredUserEmails ?? []
  const state = emptyState(clock.now(), { ...options.settings, monitoredUserEmails: monitored })
  const repos = new InMemoryRepositories(state, clock)
  const google = createFakeGoogleAdapters(env, { now: () => clock.now(), fixtures: options.fixtures, monitoredUserEmails: monitored })
  const fakeAi = new FakeMeetingAnalyzer()
  return {
    repos,
    uow: new InMemoryUnitOfWork(repos),
    clock,
    ids,
    ai: options.ai ?? fakeAi,
    meet: google.meet,
    calendar: google.calendar,
    workspaceEvents: google.workspaceEvents,
    directory: google.directory,
    drive: google.drive,
    mail: google.mail,
    sheets: google.sheets,
    queue: new InMemoryQueue(),
    events: new CollectingEventPublisher(),
    logger: createLogger({ service: 'test', level: 'silent', pretty: false }),
    env,
    getSettings: () => repos.settings.get(),
    google,
    fakeAi,
    state,
    memoryRepos: repos,
  }
}

export interface SeededUsers {
  andres: User
  lucia: User
  mariana: User
  admin: User
  areas: { direccion: Area; juridico: Area; operaciones: Area }
}

/** Usuarios y áreas demo coherentes con las fixtures de Google (§37). */
export async function seedDemoUsers(ctx: TestContext): Promise<SeededUsers> {
  const now = ctx.clock.now()
  const mk = async (name: string, code: string, sortOrder: number): Promise<Area> =>
    ctx.repos.areas.save({ id: ctx.ids.next(), name, code, isExternalCategory: false, active: true, sortOrder })
  const direccion = await mk('Dirección General', 'DG', 1)
  const juridico = await mk('Jurídico', 'JUR', 2)
  const operaciones = await mk('Operaciones y Proyectos', 'OPS', 3)
  const user = async (email: string, displayName: string, role: User['role'], areaId: string | null, managerId: string | null = null): Promise<User> =>
    ctx.repos.users.save({
      id: ctx.ids.next(),
      googleUserId: null,
      email,
      displayName,
      role,
      areaId,
      managerId,
      active: true,
      monitored: true,
      notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
      createdAt: now,
      updatedAt: now,
    })
  const andres = await user('andres.escandon@smlxl.mx', 'Andrés Escandón', UserRole.DIRECTOR, direccion.id)
  const lucia = await user('lucia.ferrer@smlxl.mx', 'Lucía Ferrer', UserRole.MANAGER, juridico.id, andres.id)
  const mariana = await user('mariana.solis@smlxl.mx', 'Mariana Solís', UserRole.MEMBER, operaciones.id, lucia.id)
  const admin = await user('admin@smlxl.mx', 'Admin SMLXL', UserRole.ADMIN, direccion.id)
  await ctx.repos.users.save({ ...admin, monitored: false })
  const settings = await ctx.repos.settings.get()
  await ctx.repos.settings.save({ ...settings, monitoredUserEmails: [andres.email, lucia.email, mariana.email] }, null)
  const known = new Set(ctx.google.directory.users.map((d) => d.email))
  ;[andres, lucia, mariana, admin].forEach((u, i) => {
    if (!known.has(u.email)) ctx.google.directory.users.push({ googleUserId: `2000${String(i + 1).padStart(6, '0')}`, email: u.email, displayName: u.displayName, suspended: false })
  })
  const cfg = await ctx.repos.digests.getConfig()
  await ctx.repos.digests.saveConfig({ ...cfg, recipientUserIds: [andres.id, admin.id] })
  return { andres, lucia, mariana, admin, areas: { direccion, juridico, operaciones } }
}

export function principalOf(user: User, extras: { managedAreaIds?: string[]; teamUserIds?: string[] } = {}): Principal {
  return principalFromUser(user, extras)
}
