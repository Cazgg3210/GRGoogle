import type { AreaDto, PlatformSettingsDto, ProjectDto, UserDto } from '@smlxl/contracts'
import {
  DomainError,
  DomainErrorCode,
  Permission,
  hasPermission,
  normalizeText,
  validateThresholds,
  type Area,
  type PlatformSettings,
  type Principal,
  type Project,
  type User,
  type UserRole,
} from '@smlxl/domain'
import type { AppContext } from '../../context.js'
import { audit } from '../../shared.js'
import { loadLookups, toAreaDto, toProjectDto, toUserDto } from '../../queries/mappers.js'

/** Administración (§25 ADMIN): usuarios, catálogos y configuración de plataforma. */
export interface UpdateUserInput {
  role?: UserRole
  areaId?: string | null
  managerId?: string | null
  active?: boolean
  monitored?: boolean
  displayName?: string
}

export async function updateUser(
  ctx: AppContext,
  principal: Principal,
  userId: string,
  input: UpdateUserInput,
): Promise<UserDto> {
  if (!hasPermission(principal, Permission.USER_MANAGE))
    throw DomainError.forbidden('No tienes permiso para administrar usuarios')
  const settings = await ctx.getSettings()
  const now = ctx.clock.now()
  const saved = await ctx.uow.run(async (repos) => {
    const user = await repos.users.findById(userId)
    if (!user) throw DomainError.notFound('User', userId)
    const next: User = {
      ...user,
      role: input.role ?? user.role,
      areaId: input.areaId === undefined ? user.areaId : input.areaId,
      managerId: input.managerId === undefined ? user.managerId : input.managerId,
      active: input.active ?? user.active,
      monitored: input.monitored ?? user.monitored,
      displayName: input.displayName ?? user.displayName,
      updatedAt: now,
    }
    const s = await repos.users.save(next)
    if (input.monitored !== undefined) {
      const emails = new Set(settings.monitoredUserEmails.map((e) => e.toLowerCase()))
      if (input.monitored) emails.add(s.email.toLowerCase())
      else emails.delete(s.email.toLowerCase())
      await repos.settings.save({ ...settings, monitoredUserEmails: [...emails] }, principal.id)
    }
    await audit(repos, ctx, {
      actorType: 'USER',
      actorUserId: principal.id,
      action: 'user.updated',
      entity: 'User',
      entityId: userId,
      before: {
        role: user.role,
        areaId: user.areaId,
        active: user.active,
        monitored: user.monitored,
      },
      after: { role: s.role, areaId: s.areaId, active: s.active, monitored: s.monitored },
    })
    return s
  })
  const lk = await loadLookups(ctx.repos, settings, now)
  return toUserDto(saved, lk)
}

export interface UpsertAreaInput {
  name: string
  code?: string | null
  active?: boolean
  sortOrder?: number
}

export async function upsertArea(
  ctx: AppContext,
  principal: Principal,
  input: UpsertAreaInput,
  areaId?: string,
): Promise<AreaDto> {
  if (!hasPermission(principal, Permission.CATALOG_MANAGE))
    throw DomainError.forbidden('No tienes permiso para administrar catálogos')
  return ctx.uow.run(async (repos) => {
    const existing = areaId ? await repos.areas.findById(areaId) : null
    if (areaId && !existing) throw DomainError.notFound('Area', areaId)
    const dup = await repos.areas.findByName(input.name)
    if (dup && dup.id !== existing?.id)
      throw new DomainError(DomainErrorCode.CONFLICT, `Ya existe un área llamada ${input.name}`)
    const area: Area = {
      id: existing?.id ?? ctx.ids.next(),
      name: input.name,
      code: input.code === undefined ? (existing?.code ?? null) : input.code,
      isExternalCategory: existing?.isExternalCategory ?? normalizeText(input.name) === 'externos',
      active: input.active ?? existing?.active ?? true,
      sortOrder: input.sortOrder ?? existing?.sortOrder ?? (await repos.areas.list()).length,
    }
    const saved = await repos.areas.save(area)
    await audit(repos, ctx, {
      actorType: 'USER',
      actorUserId: principal.id,
      action: existing ? 'area.updated' : 'area.created',
      entity: 'Area',
      entityId: saved.id,
      before: existing,
      after: saved,
    })
    return toAreaDto(saved)
  })
}

export interface UpsertProjectInput {
  canonicalName: string
  code?: string | null
  active?: boolean
  areaId?: string | null
  aliases?: string[]
}

export async function upsertProject(
  ctx: AppContext,
  principal: Principal,
  input: UpsertProjectInput,
  projectId?: string,
): Promise<ProjectDto> {
  if (!hasPermission(principal, Permission.CATALOG_MANAGE))
    throw DomainError.forbidden('No tienes permiso para administrar catálogos')
  return ctx.uow.run(async (repos) => {
    const existing = projectId ? await repos.projects.findById(projectId) : null
    if (projectId && !existing) throw DomainError.notFound('Project', projectId)
    const project: Project = {
      id: existing?.id ?? ctx.ids.next(),
      canonicalName: input.canonicalName,
      code: input.code === undefined ? (existing?.code ?? null) : input.code,
      active: input.active ?? existing?.active ?? true,
      areaId: input.areaId === undefined ? (existing?.areaId ?? null) : input.areaId,
    }
    const saved = await repos.projects.save(project)
    const aliases = await repos.projects.listAliases()
    const current = new Set(
      aliases.filter((a) => a.projectId === saved.id).map((a) => a.aliasNormalized),
    )
    for (const alias of [input.canonicalName, ...(input.aliases ?? [])]) {
      const n = normalizeText(alias)
      if (n && !current.has(n)) {
        await repos.projects.addAlias({ projectId: saved.id, aliasNormalized: n, source: 'ADMIN' })
        current.add(n)
      }
    }
    await audit(repos, ctx, {
      actorType: 'USER',
      actorUserId: principal.id,
      action: existing ? 'project.updated' : 'project.created',
      entity: 'Project',
      entityId: saved.id,
      before: existing,
      after: saved,
    })
    return toProjectDto(saved, await repos.projects.listAliases())
  })
}

export function toSettingsDto(s: PlatformSettings): PlatformSettingsDto {
  return {
    featureFlags: s.featureFlags,
    confidenceThresholds: s.confidenceThresholds,
    companyTimezone: s.companyTimezone,
    companyDomain: s.companyDomain,
    rawTranscriptRetentionDays: s.rawTranscriptRetentionDays,
    autoCaptureEnabled: s.autoCaptureEnabled,
    monitoredUserEmails: s.monitoredUserEmails,
  }
}

export async function getPlatformSettings(
  ctx: AppContext,
  principal: Principal,
): Promise<PlatformSettingsDto> {
  if (!hasPermission(principal, Permission.CONFIG_MANAGE))
    throw DomainError.forbidden('No tienes permiso para ver la configuración')
  return toSettingsDto(await ctx.getSettings())
}

export async function updatePlatformSettings(
  ctx: AppContext,
  principal: Principal,
  patch: Partial<PlatformSettingsDto>,
): Promise<PlatformSettingsDto> {
  if (!hasPermission(principal, Permission.CONFIG_MANAGE))
    throw DomainError.forbidden('No tienes permiso para cambiar la configuración')
  const current = await ctx.getSettings()
  const next: PlatformSettings = {
    featureFlags: { ...current.featureFlags, ...(patch.featureFlags ?? {}) },
    confidenceThresholds: {
      ...current.confidenceThresholds,
      ...(patch.confidenceThresholds ?? {}),
    },
    companyTimezone: patch.companyTimezone ?? current.companyTimezone,
    companyDomain: patch.companyDomain ?? current.companyDomain,
    rawTranscriptRetentionDays:
      patch.rawTranscriptRetentionDays === undefined
        ? current.rawTranscriptRetentionDays
        : patch.rawTranscriptRetentionDays,
    autoCaptureEnabled: patch.autoCaptureEnabled ?? current.autoCaptureEnabled,
    monitoredUserEmails: (patch.monitoredUserEmails ?? current.monitoredUserEmails).map((e) =>
      e.toLowerCase(),
    ),
  }
  const errors = validateThresholds(next.confidenceThresholds)
  if (errors.length > 0) throw new DomainError(DomainErrorCode.VALIDATION_ERROR, errors.join('; '))
  const saved = await ctx.uow.run(async (repos) => {
    const s = await repos.settings.save(next, principal.id)
    if (patch.monitoredUserEmails) {
      const monitored = new Set(s.monitoredUserEmails)
      for (const u of await repos.users.list()) {
        const should = monitored.has(u.email.toLowerCase())
        if (u.monitored !== should)
          await repos.users.save({ ...u, monitored: should, updatedAt: ctx.clock.now() })
      }
    }
    await audit(repos, ctx, {
      actorType: 'USER',
      actorUserId: principal.id,
      action: 'settings.updated',
      entity: 'PlatformSettings',
      entityId: 'platform',
      before: current,
      after: s,
    })
    return s
  })
  return toSettingsDto(saved)
}
