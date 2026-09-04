import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  normalizeText,
  type Area,
  type ExternalAssignee,
  type NotificationPreferences,
  type Project,
  type ProjectAlias,
  type User,
  type UserAlias,
} from '@smlxl/domain'
import type {
  Area as AreaRow,
  ExternalAssignee as ExternalAssigneeRow,
  Prisma,
  Project as ProjectRow,
  ProjectAlias as ProjectAliasRow,
  User as UserRow,
  UserAlias as UserAliasRow,
} from '../generated/client/index.js'
import { asRecord, jsonSafe } from './common.js'

// Area -----------------------------------------------------------------------

export function toArea(row: AreaRow): Area {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    isExternalCategory: row.isExternalCategory,
    active: row.active,
    sortOrder: row.sortOrder,
  }
}

export function areaToDb(area: Area): Prisma.AreaUncheckedCreateInput {
  return {
    id: area.id,
    name: area.name,
    code: area.code,
    isExternalCategory: area.isExternalCategory,
    active: area.active,
    sortOrder: area.sortOrder,
  }
}

// Project --------------------------------------------------------------------

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    canonicalName: row.canonicalName,
    code: row.code,
    active: row.active,
    areaId: row.areaId,
  }
}

export function projectToDb(project: Project): Prisma.ProjectUncheckedCreateInput {
  return {
    id: project.id,
    canonicalName: project.canonicalName,
    code: project.code,
    active: project.active,
    areaId: project.areaId,
  }
}

export function toProjectAlias(row: ProjectAliasRow): ProjectAlias {
  return {
    id: row.id,
    projectId: row.projectId,
    aliasNormalized: row.aliasNormalized,
    source: row.source,
  }
}

// User -----------------------------------------------------------------------

export function toNotificationPreferences(value: unknown): NotificationPreferences {
  const rec = asRecord(value)
  const out: NotificationPreferences = { ...DEFAULT_NOTIFICATION_PREFERENCES }
  for (const key of Object.keys(
    DEFAULT_NOTIFICATION_PREFERENCES,
  ) as (keyof NotificationPreferences)[]) {
    const v = rec[key]
    if (key === 'dueSoonDays') {
      if (typeof v === 'number' && Number.isFinite(v)) out.dueSoonDays = v
    } else if (typeof v === 'boolean') {
      out[key] = v
    }
  }
  return out
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    googleUserId: row.googleUserId,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    areaId: row.areaId,
    managerId: row.managerId,
    active: row.active,
    monitored: row.monitored,
    notificationPreferences: toNotificationPreferences(row.notificationPreferences),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function userToDb(user: User): Prisma.UserUncheckedCreateInput {
  return {
    id: user.id,
    googleUserId: user.googleUserId,
    email: user.email.trim().toLowerCase(),
    displayName: user.displayName,
    role: user.role,
    areaId: user.areaId,
    managerId: user.managerId,
    active: user.active,
    monitored: user.monitored,
    notificationPreferences: jsonSafe(user.notificationPreferences),
  }
}

export function toUserAlias(row: UserAliasRow): UserAlias {
  return {
    id: row.id,
    userId: row.userId,
    aliasNormalized: row.aliasNormalized,
    source: row.source,
  }
}

// ExternalAssignee -----------------------------------------------------------

export function toExternalAssignee(row: ExternalAssigneeRow): ExternalAssignee {
  return {
    id: row.id,
    displayName: row.displayName,
    company: row.company,
    email: row.email,
    phone: row.phone,
    source: row.source,
    active: row.active,
  }
}

export function externalAssigneeToDb(
  a: ExternalAssignee,
): Prisma.ExternalAssigneeUncheckedCreateInput {
  return {
    id: a.id,
    displayName: a.displayName,
    nameNormalized: normalizeText(a.displayName),
    company: a.company,
    email: a.email,
    phone: a.phone,
    source: a.source,
    active: a.active,
  }
}
