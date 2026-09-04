import type {
  ActionItem,
  AuditLogEntry,
  Clock,
  Id,
  IdGenerator,
  Meeting,
  MeetingProcessingStatus,
  Principal,
  Repositories,
  User,
} from '@smlxl/domain'
import {
  DomainError,
  DomainErrorCode,
  canTransitionProcessing,
  isInternalEmail,
  normalizeText,
  toLocalDateString,
  trigramSimilarity,
} from '@smlxl/domain'
import type { AppContext } from './context.js'

/** Dependencias mínimas para escribir auditoría/ids/fechas dentro de una transacción. */
export type TxDeps = Pick<AppContext, 'ids' | 'clock'>

export interface AuditInput {
  actorType: AuditLogEntry['actorType']
  actorUserId?: Id | null
  action: string
  entity: string
  entityId: Id
  before?: unknown
  after?: unknown
  source?: string
  correlationId?: string | null
}

/** Toda mutación sensible se audita (§45.10). */
export async function audit(repos: Repositories, deps: TxDeps, input: AuditInput): Promise<void> {
  await repos.audit.append({
    id: deps.ids.next(),
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorType,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    before: input.before ?? null,
    after: input.after ?? null,
    source: input.source ?? 'application',
    correlationId: input.correlationId ?? null,
    timestamp: deps.clock.now(),
  })
}

/** Aplica una transición de procesamiento validada (§32); idempotente si ya está en el destino. */
export async function setProcessingStatus(
  repos: Repositories,
  meeting: Meeting,
  to: MeetingProcessingStatus,
  extra: Parameters<Repositories['meetings']['updateProcessing']>[1] = {},
): Promise<Meeting> {
  if (meeting.processingStatus === to) {
    return Object.keys(extra).length > 0 ? repos.meetings.updateProcessing(meeting.id, extra) : meeting
  }
  if (!canTransitionProcessing(meeting.processingStatus, to)) {
    throw new DomainError(DomainErrorCode.CONFLICT, `Transición de procesamiento no permitida: ${meeting.processingStatus} -> ${to}`, {
      details: { meetingId: meeting.id, from: meeting.processingStatus, to },
    })
  }
  return repos.meetings.updateProcessing(meeting.id, { ...extra, processingStatus: to })
}

export function requireMeeting(meeting: Meeting | null, id: Id): Meeting {
  if (!meeting) throw DomainError.notFound('Meeting', id)
  return meeting
}

export function requireActionItem(item: ActionItem | null, id: Id): ActionItem {
  if (!item) throw DomainError.notFound('ActionItem', id)
  return item
}

export function isoDate(date: Date | null | undefined, timeZone: string): string | null {
  return date ? toLocalDateString(date, timeZone) : null
}

export function isoDateTime(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null
}

export function toDateTime(date: Date): string {
  return date.toISOString()
}

export function principalFromUser(user: User, extras: { managedAreaIds?: string[]; teamUserIds?: string[] } = {}): Principal {
  return { id: user.id, role: user.role, areaId: user.areaId, email: user.email, ...extras }
}

/** Construye un Principal completo (equipo/áreas) para MANAGER a partir del repositorio. */
export async function buildPrincipal(repos: Repositories, user: User): Promise<Principal> {
  const p = principalFromUser(user)
  if (user.role === 'MANAGER') {
    p.teamUserIds = await repos.users.listTeamUserIds(user.id)
    p.managedAreaIds = user.areaId ? [user.areaId] : []
  }
  return p
}

export function displayNameOf(users: Map<Id, User>, id: Id | null): string | null {
  return id ? (users.get(id)?.displayName ?? null) : null
}

export async function userMap(repos: Repositories): Promise<Map<Id, User>> {
  const users = await repos.users.list()
  return new Map(users.map((u) => [u.id, u]))
}

/** Resuelve un usuario interno por email o por nombre (alias/normalizado/trigrama ≥ 0.85). */
export async function resolveUserByNameOrEmail(
  repos: Repositories,
  input: { email?: string | null; name?: string | null },
  cache?: { users?: User[]; aliases?: Array<{ userId: Id; aliasNormalized: string }> },
): Promise<{ user: User | null; confidence: number }> {
  if (input.email) {
    const byEmail = await repos.users.findByEmail(input.email.toLowerCase())
    if (byEmail) return { user: byEmail, confidence: 1 }
  }
  const name = normalizeText(input.name)
  if (!name) return { user: null, confidence: 0 }
  const users = cache?.users ?? (await repos.users.list())
  const aliases = cache?.aliases ?? (await repos.users.listAliases())
  const alias = aliases.find((a) => a.aliasNormalized === name)
  if (alias) {
    const u = users.find((x) => x.id === alias.userId) ?? (await repos.users.findById(alias.userId))
    if (u) return { user: u, confidence: 0.95 }
  }
  let best: { user: User; score: number } | null = null
  for (const u of users) {
    const full = normalizeText(u.displayName)
    if (full === name) return { user: u, confidence: 1 }
    const score = trigramSimilarity(full, name)
    if (!best || score > best.score) best = { user: u, score }
  }
  if (best && best.score >= 0.85) return { user: best.user, confidence: Math.round(best.score * 100) / 100 }
  // Nombre de pila único entre los usuarios → coincidencia razonable.
  const firstName = name.split(' ')[0] ?? ''
  const byFirst = users.filter((u) => normalizeText(u.displayName).split(' ')[0] === firstName)
  if (firstName.length > 2 && byFirst.length === 1 && name.split(' ').length === 1) return { user: byFirst[0] as User, confidence: 0.8 }
  return { user: null, confidence: best?.score ?? 0 }
}

export function isInternal(email: string | null | undefined, domain: string): boolean {
  return isInternalEmail(email, domain)
}

export function clampPage(page: number, pageSize: number): { page: number; pageSize: number } {
  return { page: Math.max(1, Math.floor(page || 1)), pageSize: Math.min(200, Math.max(1, Math.floor(pageSize || 25))) }
}

export function paginate<T>(items: T[], page: number, pageSize: number): { items: T[]; total: number; page: number; pageSize: number } {
  const p = clampPage(page, pageSize)
  const start = (p.page - 1) * p.pageSize
  return { items: items.slice(start, start + p.pageSize), total: items.length, page: p.page, pageSize: p.pageSize }
}

export function sha256(input: string): string {
  // Import diferido para mantener el módulo libre de side effects en entornos sin crypto.
  return createHashHex(input)
}

import { createHash } from 'node:crypto'
function createHashHex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

export function clockOf(ctx: Pick<AppContext, 'clock'>): Clock {
  return ctx.clock
}

export function idsOf(ctx: Pick<AppContext, 'ids'>): IdGenerator {
  return ctx.ids
}
