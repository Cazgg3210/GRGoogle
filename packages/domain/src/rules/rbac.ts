import { ConfidentialityLevel, UserRole } from '../enums.js'
import type { ActionItem, Meeting, User } from '../entities.js'

/**
 * RBAC (§25). Siempre server-side. Estas funciones son la única fuente de
 * verdad de permisos; la UI sólo las usa para ocultar controles.
 */
export const Permission = {
  MEETING_READ: 'MEETING_READ',
  MEETING_READ_TRANSCRIPT: 'MEETING_READ_TRANSCRIPT',
  MEETING_REPROCESS: 'MEETING_REPROCESS',
  MEETING_EXCLUDE: 'MEETING_EXCLUDE',
  MEETING_SET_CONFIDENTIALITY: 'MEETING_SET_CONFIDENTIALITY',
  ACTION_ITEM_READ: 'ACTION_ITEM_READ',
  ACTION_ITEM_CREATE: 'ACTION_ITEM_CREATE',
  ACTION_ITEM_UPDATE: 'ACTION_ITEM_UPDATE',
  ACTION_ITEM_REASSIGN: 'ACTION_ITEM_REASSIGN',
  ACTION_ITEM_APPROVE_COMPLETION: 'ACTION_ITEM_APPROVE_COMPLETION',
  ACTION_ITEM_CANCEL: 'ACTION_ITEM_CANCEL',
  AI_REVIEW_RESOLVE: 'AI_REVIEW_RESOLVE',
  REPORT_GLOBAL: 'REPORT_GLOBAL',
  REPORT_AREA: 'REPORT_AREA',
  DIGEST_GENERATE: 'DIGEST_GENERATE',
  DIGEST_SEND: 'DIGEST_SEND',
  INTEGRATION_MANAGE: 'INTEGRATION_MANAGE',
  SHEETS_SYNC: 'SHEETS_SYNC',
  USER_MANAGE: 'USER_MANAGE',
  CATALOG_MANAGE: 'CATALOG_MANAGE',
  CONFIG_MANAGE: 'CONFIG_MANAGE',
  AUDIT_READ: 'AUDIT_READ',
} as const
export type Permission = (typeof Permission)[keyof typeof Permission]

const ALL: readonly Permission[] = Object.values(Permission)

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  ADMIN: ALL,
  DIRECTOR: [
    Permission.MEETING_READ,
    Permission.MEETING_READ_TRANSCRIPT,
    Permission.MEETING_REPROCESS,
    Permission.MEETING_EXCLUDE,
    Permission.MEETING_SET_CONFIDENTIALITY,
    Permission.ACTION_ITEM_READ,
    Permission.ACTION_ITEM_CREATE,
    Permission.ACTION_ITEM_UPDATE,
    Permission.ACTION_ITEM_REASSIGN,
    Permission.ACTION_ITEM_APPROVE_COMPLETION,
    Permission.ACTION_ITEM_CANCEL,
    Permission.AI_REVIEW_RESOLVE,
    Permission.REPORT_GLOBAL,
    Permission.REPORT_AREA,
    Permission.DIGEST_GENERATE,
    Permission.DIGEST_SEND,
    Permission.SHEETS_SYNC,
    Permission.AUDIT_READ,
  ],
  MANAGER: [
    Permission.MEETING_READ,
    Permission.MEETING_READ_TRANSCRIPT,
    Permission.ACTION_ITEM_READ,
    Permission.ACTION_ITEM_CREATE,
    Permission.ACTION_ITEM_UPDATE,
    Permission.ACTION_ITEM_REASSIGN,
    Permission.ACTION_ITEM_APPROVE_COMPLETION,
    Permission.ACTION_ITEM_CANCEL,
    Permission.AI_REVIEW_RESOLVE,
    Permission.REPORT_AREA,
  ],
  MEMBER: [
    Permission.MEETING_READ,
    Permission.MEETING_READ_TRANSCRIPT,
    Permission.ACTION_ITEM_READ,
    Permission.ACTION_ITEM_CREATE,
    Permission.ACTION_ITEM_UPDATE,
  ],
  AUDITOR: [
    Permission.MEETING_READ,
    Permission.ACTION_ITEM_READ,
    Permission.REPORT_GLOBAL,
    Permission.REPORT_AREA,
    Permission.AUDIT_READ,
  ],
}

export type Principal = Pick<User, 'id' | 'role' | 'areaId' | 'email'> & {
  /** Áreas que gestiona (para MANAGER); incluye su propia área por defecto. */
  managedAreaIds?: string[]
  /** Ids de usuarios que le reportan (para MANAGER). */
  teamUserIds?: string[]
}

export function hasPermission(principal: Principal, permission: Permission): boolean {
  return ROLE_PERMISSIONS[principal.role].includes(permission)
}

export function permissionsFor(role: UserRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role]
}

type MeetingAccessView = Pick<Meeting, 'organizerUserId' | 'confidentialityLevel' | 'areaId'> & {
  participantUserIds: string[]
}

/**
 * Alcance de reunión: ADMIN/DIRECTOR ven todas las permitidas; MANAGER las de
 * su área/equipo; MEMBER sólo aquellas donde participó/organizó. Las reuniones
 * LEGAL/EXECUTIVE requieren participación directa o rol DIRECTOR/ADMIN.
 */
export function canAccessMeeting(principal: Principal, meeting: MeetingAccessView): boolean {
  if (!hasPermission(principal, Permission.MEETING_READ)) return false
  const isParticipant =
    meeting.organizerUserId === principal.id || meeting.participantUserIds.includes(principal.id)
  const restricted =
    meeting.confidentialityLevel === ConfidentialityLevel.LEGAL ||
    meeting.confidentialityLevel === ConfidentialityLevel.EXECUTIVE
  if (principal.role === UserRole.ADMIN) return true
  if (principal.role === UserRole.DIRECTOR) return true
  if (principal.role === UserRole.AUDITOR) return !restricted || isParticipant
  if (isParticipant) return true
  if (restricted) return false
  if (meeting.confidentialityLevel === ConfidentialityLevel.RESTRICTED) return false
  if (principal.role === UserRole.MANAGER) {
    const areas = principal.managedAreaIds ?? (principal.areaId ? [principal.areaId] : [])
    if (meeting.areaId && areas.includes(meeting.areaId)) return true
    const team = principal.teamUserIds ?? []
    if (meeting.organizerUserId && team.includes(meeting.organizerUserId)) return true
    return meeting.participantUserIds.some((id) => team.includes(id))
  }
  return false
}

type ActionItemAccessView = Pick<ActionItem, 'ownerUserId' | 'collaboratorUserIds' | 'areaId'>

export function canAccessActionItem(principal: Principal, item: ActionItemAccessView): boolean {
  if (!hasPermission(principal, Permission.ACTION_ITEM_READ)) return false
  if (
    principal.role === UserRole.ADMIN ||
    principal.role === UserRole.DIRECTOR ||
    principal.role === UserRole.AUDITOR
  )
    return true
  if (item.ownerUserId === principal.id || item.collaboratorUserIds.includes(principal.id))
    return true
  if (principal.role === UserRole.MANAGER) {
    const areas = principal.managedAreaIds ?? (principal.areaId ? [principal.areaId] : [])
    if (item.areaId && areas.includes(item.areaId)) return true
    const team = principal.teamUserIds ?? []
    if (item.ownerUserId && team.includes(item.ownerUserId)) return true
  }
  return false
}

export function canUpdateActionItem(principal: Principal, item: ActionItemAccessView): boolean {
  if (!hasPermission(principal, Permission.ACTION_ITEM_UPDATE)) return false
  return canAccessActionItem(principal, item)
}

/**
 * Quién aprueba COMPLETION_PROPOSED (P1-8 pendiente): por defecto ADMIN,
 * DIRECTOR o MANAGER con alcance sobre la tarea. El responsable NO aprueba su
 * propio cierre salvo que tenga rol con permiso.
 */
export function canApproveCompletion(principal: Principal, item: ActionItemAccessView): boolean {
  if (!hasPermission(principal, Permission.ACTION_ITEM_APPROVE_COMPLETION)) return false
  return canAccessActionItem(principal, item)
}
