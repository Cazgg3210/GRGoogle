import {
  ActionItemStatus,
  CLOSED_ACTION_ITEM_STATUSES,
  OPEN_ACTION_ITEM_STATUSES,
  formatExternalKey,
  type ActionItem,
  type ActionItemComment,
  type ActionItemFilter,
  type ActionItemMeetingLink,
  type ActionItemRepository,
  type ActionItemStatusHistory,
  type Id,
  type Page,
  type PageRequest,
} from '@smlxl/domain'
import { Prisma } from '../generated/client/index.js'
import {
  ACTION_ITEM_INCLUDE,
  actionItemScalarsToDb,
  commentToDb,
  linkToDb,
  statusHistoryToDb,
  toActionItem,
  toComment,
  toLink,
  toStatusHistory,
} from '../mappers/action-items.js'
import { todayDb } from '../mappers/common.js'
import { BaseRepository, pageSkip } from './base.js'

export class PrismaActionItemRepository extends BaseRepository implements ActionItemRepository {
  async findById(id: Id): Promise<ActionItem | null> {
    const row = await this.db.actionItem.findUnique({ where: { id }, include: ACTION_ITEM_INCLUDE })
    return row ? toActionItem(row, this.ctx) : null
  }

  async findByExternalKey(key: string): Promise<ActionItem | null> {
    const row = await this.db.actionItem.findUnique({
      where: { externalKey: key.trim().toUpperCase() },
      include: ACTION_ITEM_INCLUDE,
    })
    return row ? toActionItem(row, this.ctx) : null
  }

  /**
   * Traduce ActionItemFilter a `where` de Prisma.
   *
   * - `overdueOnly`: dueDate < hoy (fecha calendario en la zona de la empresa) y
   *   estado abierto. Equivale a `isOverdue` del dominio evaluado al inicio del día.
   * - `visibleToUserId` (mejor esfuerzo): responsable, colaborador o participante
   *   interno de la reunión de origen. El alcance de MANAGER por área/equipo se
   *   resuelve en la capa de aplicación con `canAccessActionItem`.
   * - `search`: ILIKE sobre título, descripción y externalKey (para búsqueda
   *   semántica usar `searchFullText`).
   */
  private buildWhere(filter: ActionItemFilter, now = new Date()): Prisma.ActionItemWhereInput {
    const and: Prisma.ActionItemWhereInput[] = []
    if (filter.status && filter.status.length > 0) and.push({ status: { in: filter.status } })
    if (filter.ownerUserId) and.push({ ownerUserId: filter.ownerUserId })
    if (filter.ownerUserIds && filter.ownerUserIds.length > 0)
      and.push({ ownerUserId: { in: filter.ownerUserIds } })
    if (filter.externalAssigneeId) and.push({ externalAssigneeId: filter.externalAssigneeId })
    if (filter.areaId) and.push({ areaId: filter.areaId })
    if (filter.projectId) and.push({ projectId: filter.projectId })
    if (filter.meetingId)
      and.push({
        OR: [
          { createdFromMeetingId: filter.meetingId },
          { meetingLinks: { some: { meetingId: filter.meetingId } } },
        ],
      })
    if (filter.overdueOnly)
      and.push({
        dueDate: { lt: todayDb(now, this.ctx) },
        status: { in: [...OPEN_ACTION_ITEM_STATUSES] },
      })
    if (filter.dueFrom) and.push({ dueDate: { gte: todayDb(filter.dueFrom, this.ctx) } })
    if (filter.dueTo) and.push({ dueDate: { lte: todayDb(filter.dueTo, this.ctx) } })
    if (filter.noDueDate) and.push({ dueDate: null })
    if (filter.noOwner) and.push({ ownerUserId: null, externalAssigneeId: null })
    if (filter.requiresReview !== undefined) and.push({ requiresReview: filter.requiresReview })
    if (filter.search && filter.search.trim() !== '') {
      const q = filter.search.trim()
      and.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { externalKey: { contains: q, mode: 'insensitive' } },
        ],
      })
    }
    if (filter.createdFrom) and.push({ createdAt: { gte: filter.createdFrom } })
    if (filter.createdTo) and.push({ createdAt: { lte: filter.createdTo } })
    if (filter.completedFrom) and.push({ completedAt: { gte: filter.completedFrom } })
    if (filter.completedTo) and.push({ completedAt: { lte: filter.completedTo } })
    if (filter.tags && filter.tags.length > 0) and.push({ tags: { hasSome: filter.tags } })
    if (filter.visibleToUserId) {
      const uid = filter.visibleToUserId
      and.push({
        OR: [
          { ownerUserId: uid },
          { collaborators: { some: { userId: uid } } },
          { createdFrom: { participants: { some: { internalUserId: uid } } } },
        ],
      })
    }
    return and.length ? { AND: and } : {}
  }

  async list(filter: ActionItemFilter, page: PageRequest): Promise<Page<ActionItem>> {
    const where = this.buildWhere(filter)
    const { skip, take } = pageSkip(page)
    const [rows, total] = await Promise.all([
      this.db.actionItem.findMany({
        where,
        include: ACTION_ITEM_INCLUDE,
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      this.db.actionItem.count({ where }),
    ])
    return {
      items: rows.map((r) => toActionItem(r, this.ctx)),
      total,
      page: Math.max(1, page.page),
      pageSize: take,
    }
  }

  async listAll(filter: ActionItemFilter): Promise<ActionItem[]> {
    const rows = await this.db.actionItem.findMany({
      where: this.buildWhere(filter),
      include: ACTION_ITEM_INCLUDE,
      orderBy: [{ sequence: 'asc' }],
    })
    return rows.map((r) => toActionItem(r, this.ctx))
  }

  /** Full-text en español (título + descripción) con ranking `ts_rank`. */
  async searchFullText(
    query: string,
    options: { openOnly: boolean; limit: number },
  ): Promise<ActionItem[]> {
    const q = query.trim()
    if (q === '') return []
    const limit = Math.max(1, Math.min(options.limit, 200))
    const closed = [...CLOSED_ACTION_ITEM_STATUSES]
    const statusFilter = options.openOnly
      ? Prisma.sql`AND "status"::text NOT IN (${Prisma.join(closed)})`
      : Prisma.empty
    const ranked = await this.db.$queryRaw<{ id: string; rank: number }[]>`
      SELECT "id",
             ts_rank(
               to_tsvector('spanish', "title" || ' ' || coalesce("description", '')),
               plainto_tsquery('spanish', ${q})
             ) AS rank
      FROM "action_items"
      WHERE to_tsvector('spanish', "title" || ' ' || coalesce("description", ''))
            @@ plainto_tsquery('spanish', ${q})
      ${statusFilter}
      ORDER BY rank DESC, "sequence" ASC
      LIMIT ${limit}
    `
    if (ranked.length === 0) return []
    const ids = ranked.map((r) => r.id)
    const rows = await this.db.actionItem.findMany({
      where: { id: { in: ids } },
      include: ACTION_ITEM_INCLUDE,
    })
    const byId = new Map(rows.map((r) => [r.id, r]))
    const out: ActionItem[] = []
    for (const id of ids) {
      const row = byId.get(id)
      if (row) out.push(toActionItem(row, this.ctx))
    }
    return out
  }

  async nextSequence(): Promise<number> {
    const rows = await this.db.$queryRaw<{ seq: bigint | number }[]>`
      SELECT nextval(pg_get_serial_sequence('action_items', 'sequence')) AS seq
    `
    const value = rows[0]?.seq
    if (value === undefined) throw new Error('No se pudo obtener la secuencia de action_items')
    return Number(value)
  }

  /**
   * Upsert. Al crear fija `sequence` y `externalKey` (ACT-000123). Si el item
   * ya trae externalKey (p. ej. seed determinístico) se respeta; si no, se
   * toma de la secuencia. Los colaboradores se sincronizan en la tabla puente.
   */
  async save(item: ActionItem): Promise<ActionItem> {
    const scalars = actionItemScalarsToDb(item, this.ctx)
    const existing = await this.db.actionItem.findUnique({ where: { id: item.id }, select: { id: true } })
    if (existing) {
      await this.db.actionItem.update({ where: { id: item.id }, data: scalars })
    } else {
      let sequence: number | null = null
      let externalKey = item.externalKey?.trim() ?? ''
      const m = /^ACT-(\d+)$/i.exec(externalKey)
      if (m) {
        sequence = Number(m[1])
        externalKey = formatExternalKey(sequence)
      } else {
        sequence = await this.nextSequence()
        externalKey = formatExternalKey(sequence)
      }
      await this.db.actionItem.create({
        data: { id: item.id, sequence, externalKey, ...scalars },
      })
    }
    await this.syncCollaborators(item.id, item.collaboratorUserIds)
    const row = await this.db.actionItem.findUniqueOrThrow({
      where: { id: item.id },
      include: ACTION_ITEM_INCLUDE,
    })
    return toActionItem(row, this.ctx)
  }

  private async syncCollaborators(actionItemId: Id, userIds: Id[]): Promise<void> {
    const wanted = Array.from(new Set(userIds))
    await this.db.actionItemCollaborator.deleteMany({
      where: { actionItemId, ...(wanted.length ? { userId: { notIn: wanted } } : {}) },
    })
    if (wanted.length === 0) return
    await this.db.actionItemCollaborator.createMany({
      data: wanted.map((userId) => ({ actionItemId, userId })),
      skipDuplicates: true,
    })
  }

  async addLink(link: ActionItemMeetingLink): Promise<ActionItemMeetingLink> {
    const { id, ...rest } = linkToDb(link, this.ctx)
    const row = await this.db.actionItemMeetingLink.upsert({
      where: { id: link.id },
      create: { id, ...rest },
      update: rest,
    })
    // Mantener derivados: última reunión y última mención.
    await this.db.actionItem.update({
      where: { id: link.actionItemId },
      data: { latestMeetingId: link.meetingId, lastMentionedAt: link.createdAt },
    })
    return toLink(row, this.ctx)
  }

  async listLinks(actionItemId: Id): Promise<ActionItemMeetingLink[]> {
    const rows = await this.db.actionItemMeetingLink.findMany({
      where: { actionItemId },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map((r) => toLink(r, this.ctx))
  }

  async listLinksByMeeting(meetingId: Id): Promise<ActionItemMeetingLink[]> {
    const rows = await this.db.actionItemMeetingLink.findMany({
      where: { meetingId },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map((r) => toLink(r, this.ctx))
  }

  async addStatusHistory(entry: ActionItemStatusHistory): Promise<void> {
    const { id, ...rest } = statusHistoryToDb(entry)
    await this.db.actionItemStatusHistory.upsert({
      where: { id: entry.id },
      create: { id, ...rest },
      update: rest,
    })
  }

  async listStatusHistory(actionItemId: Id): Promise<ActionItemStatusHistory[]> {
    const rows = await this.db.actionItemStatusHistory.findMany({
      where: { actionItemId },
      orderBy: { changedAt: 'asc' },
    })
    return rows.map(toStatusHistory)
  }

  async addComment(comment: ActionItemComment): Promise<ActionItemComment> {
    const { id, ...rest } = commentToDb(comment)
    const row = await this.db.actionItemComment.upsert({
      where: { id: comment.id },
      create: { id, ...rest },
      update: rest,
    })
    return toComment(row)
  }

  async listComments(actionItemId: Id): Promise<ActionItemComment[]> {
    const rows = await this.db.actionItemComment.findMany({
      where: { actionItemId },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(toComment)
  }

  /**
   * "Repetida sin avance" (§18.3 D): menciones (MENTIONED) posteriores al
   * último cambio de estado registrado. Si no hay historial, cuentan todas.
   */
  async countMentionsWithoutProgress(actionItemId: Id): Promise<number> {
    const last = await this.db.actionItemStatusHistory.findFirst({
      where: { actionItemId },
      orderBy: { changedAt: 'desc' },
      select: { changedAt: true },
    })
    return this.db.actionItemMeetingLink.count({
      where: {
        actionItemId,
        relationType: 'MENTIONED',
        ...(last ? { createdAt: { gt: last.changedAt } } : {}),
      },
    })
  }
}

/** Reexport útil para consumidores que filtran por estado abierto. */
export const OPEN_STATUSES: readonly ActionItemStatus[] = OPEN_ACTION_ITEM_STATUSES
