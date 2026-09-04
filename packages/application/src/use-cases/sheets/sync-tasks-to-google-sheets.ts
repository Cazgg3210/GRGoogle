import type { SheetsSyncResultDto } from '@smlxl/contracts'
import {
  DomainError,
  DomainErrorCode,
  Permission,
  RelationType,
  daysOpen,
  hasPermission,
  isOverdue,
  toLocalDateString,
  type Principal,
  type SheetRow,
} from '@smlxl/domain'
import type { AppContext } from '../../context.js'
import { audit } from '../../shared.js'
import { loadLookups } from '../../queries/mappers.js'

/**
 * Proyección a Google Sheets (§16.9): hojas `Pendientes` y `Reuniones` con
 * identidad por UUID (columna clave), nunca por posición de fila.
 */
export const PENDIENTES_COLUMNS = [
  'UUID',
  'Legacy ID',
  'Estado',
  'Prioridad',
  'Actividad',
  'Responsable',
  'Área',
  'Proyecto',
  'Fecha compromiso',
  'Reunión origen',
  'Última mención',
  'Días abierto',
  'Vencido',
] as const

export const REUNIONES_COLUMNS = [
  'UUID',
  'Fecha',
  'Reunión',
  'Organizador',
  'Participantes',
  'Resumen',
  '# Acuerdos',
  '# Tareas nuevas',
  'Link plataforma',
] as const

export const SHEET_NAMES = { pendientes: 'Pendientes', reuniones: 'Reuniones' } as const
const KEY_COLUMN = 'UUID'

export async function buildSheetProjections(
  ctx: AppContext,
): Promise<{ pendientes: SheetRow[]; reuniones: SheetRow[] }> {
  const settings = await ctx.getSettings()
  const tz = settings.companyTimezone
  const now = ctx.clock.now()
  const lk = await loadLookups(ctx.repos, settings, now)
  const items = await ctx.repos.actionItems.listAll({})
  const externals = new Map((await ctx.repos.externalAssignees.list()).map((e) => [e.id, e]))
  const meetingTitle = async (id: string | null): Promise<string> => {
    if (!id) return ''
    const m = lk.meetings.get(id) ?? (await ctx.repos.meetings.findById(id))
    if (m) lk.meetings.set(id, m)
    return m ? `${toLocalDateString(m.startAt, tz)} · ${m.title}` : ''
  }
  const pendientes: SheetRow[] = []
  for (const i of items) {
    pendientes.push({
      key: i.id,
      values: {
        'Legacy ID': i.legacyId,
        Estado: i.status,
        Prioridad: i.priority,
        Actividad: i.title,
        Responsable: i.ownerUserId
          ? (lk.users.get(i.ownerUserId)?.displayName ?? '')
          : i.externalAssigneeId
            ? (externals.get(i.externalAssigneeId)?.displayName ?? '')
            : (i.ownerTextOriginal ?? ''),
        Área: i.areaId ? (lk.areas.get(i.areaId)?.name ?? '') : '',
        Proyecto: i.projectId ? (lk.projects.get(i.projectId)?.canonicalName ?? '') : '',
        'Fecha compromiso': i.dueDate ? toLocalDateString(i.dueDate, tz) : '',
        'Reunión origen': await meetingTitle(i.createdFromMeetingId),
        'Última mención': i.lastMentionedAt ? toLocalDateString(i.lastMentionedAt, tz) : '',
        'Días abierto': daysOpen(i.createdAt, now, i.completedAt),
        Vencido: isOverdue({ dueDate: i.dueDate, status: i.status }, now, tz) ? 'Sí' : 'No',
      },
    })
  }
  const meetings = await ctx.repos.meetings.listRecent(500)
  const reuniones: SheetRow[] = []
  for (const m of meetings) {
    const [participants, summary, decisions, links] = await Promise.all([
      ctx.repos.meetings.listParticipants(m.id),
      ctx.repos.summaries.findLatestByMeeting(m.id),
      ctx.repos.decisions.listByMeeting(m.id),
      ctx.repos.actionItems.listLinksByMeeting(m.id),
    ])
    reuniones.push({
      key: m.id,
      values: {
        Fecha: toLocalDateString(m.startAt, tz),
        Reunión: m.title,
        Organizador: m.organizerUserId
          ? (lk.users.get(m.organizerUserId)?.displayName ?? m.organizerEmail ?? '')
          : (m.organizerEmail ?? ''),
        Participantes: participants.map((p) => p.displayName).join(', '),
        Resumen: summary?.executiveSummary.join(' · ') ?? '',
        '# Acuerdos': decisions.length,
        '# Tareas nuevas': links.filter((l) => l.relationType === RelationType.CREATED).length,
        'Link plataforma': `${ctx.env.APP_URL}/reuniones/${m.id}`,
      },
    })
  }
  return { pendientes, reuniones }
}

function preview(
  columns: readonly string[],
  rows: SheetRow[],
): { columns: string[]; rows: Array<Record<string, unknown>> } {
  return {
    columns: [...columns],
    rows: rows.slice(0, 50).map((r) => ({ [KEY_COLUMN]: r.key, ...r.values })),
  }
}

export async function syncTasksToGoogleSheets(
  ctx: AppContext,
  principal: Principal | null,
  options: { dryRun?: boolean } = {},
): Promise<SheetsSyncResultDto> {
  if (principal && !hasPermission(principal, Permission.SHEETS_SYNC))
    throw DomainError.forbidden('No tienes permiso para sincronizar Sheets')
  const settings = await ctx.getSettings()
  const dryRun = options.dryRun ?? false
  if (!dryRun && !settings.featureFlags.SHEETS_SYNC_ENABLED)
    throw DomainError.featureDisabled('SHEETS_SYNC_ENABLED')
  const spreadsheetId = ctx.env.GOOGLE_SHEETS_SPREADSHEET_ID || null
  if (!dryRun && !spreadsheetId)
    throw new DomainError(
      DomainErrorCode.SHEETS_SYNC_FAILED,
      'GOOGLE_SHEETS_SPREADSHEET_ID no configurado',
    )
  const { pendientes, reuniones } = await buildSheetProjections(ctx)
  let pendientesRes = { inserted: 0, updated: 0 }
  let reunionesRes = { inserted: 0, updated: 0 }
  if (!dryRun && spreadsheetId) {
    pendientesRes = await ctx.sheets.upsertRows({
      spreadsheetId,
      sheetName: SHEET_NAMES.pendientes,
      keyColumn: KEY_COLUMN,
      columns: [...PENDIENTES_COLUMNS],
      rows: pendientes,
    })
    reunionesRes = await ctx.sheets.upsertRows({
      spreadsheetId,
      sheetName: SHEET_NAMES.reuniones,
      keyColumn: KEY_COLUMN,
      columns: [...REUNIONES_COLUMNS],
      rows: reuniones,
    })
    await ctx.uow.run(async (repos) => {
      await audit(repos, ctx, {
        actorType: principal ? 'USER' : 'SYSTEM',
        actorUserId: principal?.id ?? null,
        action: 'sheets.synced',
        entity: 'Spreadsheet',
        entityId: spreadsheetId,
        after: { pendientes: pendientesRes, reuniones: reunionesRes },
      })
    })
  }
  return {
    spreadsheetId: dryRun ? spreadsheetId : spreadsheetId,
    pendientes: pendientesRes,
    reuniones: reunionesRes,
    preview: {
      pendientes: preview(PENDIENTES_COLUMNS, pendientes),
      reuniones: preview(REUNIONES_COLUMNS, reuniones),
    },
  }
}
