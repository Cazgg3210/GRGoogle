/**
 * Importador legado (§16.8). Planifica en memoria y, sólo en modo `commit`,
 * escribe dentro de una única transacción (PrismaUnitOfWork). En `dry-run`
 * no se invoca ningún método de escritura: únicamente lecturas de catálogos.
 */
import {
  ActionItemPriority,
  ActionItemStatus,
  ActionItemType,
  AiAnalysisStatus,
  ArtifactStatus,
  CompletionProposalStatus,
  ConfidentialityLevel,
  MeetingProcessingStatus,
  MeetingSource,
  MeetingStatus,
  MigrationTrust,
  ProposedByType,
  RelationType,
  normalizeText,
  parseLocalDate,
  type ActionItem,
  type Area,
  type ExternalAssignee,
  type LegacyImportReference,
  type Meeting,
  type Project,
} from '@smlxl/domain'
import {
  PrismaUnitOfWork,
  UuidGenerator,
  createRepositories,
  type PrismaClient,
  type PrismaRepositories,
  type RepositoryDefaults,
} from '@smlxl/database'
import {
  findDuplicateIds,
  findSemanticDuplicates,
  normalizeRow,
  type NormalizedRow,
} from './normalize.js'
import type { SourceSheet, WorkbookReadResult } from './reader.js'
import {
  compareWithBaseline,
  type BaselineMetrics,
  type ImportReport,
  type SheetStats,
} from './report.js'

export type ImportMode = 'dry-run' | 'commit'

export interface ImportOptions {
  mode: ImportMode
  now?: Date
  /** Etiqueta de `sourceFile` en legacy_import_references (por defecto, nombre del archivo). */
  sourceFile?: string
  /** Usuario que ejecuta la importación (para auditoría); null = CLI sin sesión. */
  actorUserId?: string | null
  /** Umbral Jaccard para duplicados semánticos. */
  duplicateThreshold?: number
}

export interface ImportCreated {
  batchId: string | null
  actionItemIds: string[]
  meetingIds: string[]
  projectIds: string[]
  externalAssigneeIds: string[]
  areaIds: string[]
}

export interface ImportResult {
  report: ImportReport
  created: ImportCreated
}

interface PlannedProject {
  id: string
  name: string
  alias: string
  isNew: boolean
  count: number
}

interface PlannedExternal {
  id: string
  name: string
  company: string | null
  isNew: boolean
  count: number
  sheets: Set<string>
}

interface PlannedArea {
  id: string
  name: string
  isExternalCategory: boolean
  isNew: boolean
}

interface PlannedMeeting {
  id: string
  sheet: SourceSheet
  areaId: string
  date: string
  title: string
  startAt: Date
  isNew: boolean
  rows: number
}

interface PlannedRow {
  row: NormalizedRow
  actionItemId: string
  areaId: string
  ownerUserId: string | null
  externalKey: string | null
  projectKey: string | null
  meetingKey: string | null
}

const LEGACY_TAG = 'legado'

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1
}

export async function runLegacyImport(
  client: PrismaClient,
  defaults: RepositoryDefaults,
  workbook: WorkbookReadResult,
  options: ImportOptions,
): Promise<ImportResult> {
  const now = options.now ?? new Date()
  const tz = defaults.companyTimezone
  const sourceFile = options.sourceFile ?? workbook.file
  const ids = new UuidGenerator()
  const repos = createRepositories(client, defaults)
  const errors: string[] = []

  // --- 1. Normalización -------------------------------------------------------
  const rows: NormalizedRow[] = []
  const sheetStats = new Map<string, SheetStats>()
  for (const sheet of workbook.sheets) {
    sheetStats.set(sheet.sheet, {
      sheet: sheet.sheet,
      sheetOriginal: sheet.sheetOriginal,
      headerRow: sheet.headerRow,
      rowsRead: sheet.rows.length,
      blankRowsSkipped: sheet.blankRowsSkipped,
      alreadyImported: 0,
      skippedNoTitle: 0,
      imported: 0,
      warnings: sheet.warnings,
    })
    for (const raw of sheet.rows) rows.push(normalizeRow(raw))
  }

  // --- 2. Catálogos (sólo lectura) --------------------------------------------
  const areas = await repos.areas.list()
  const areaByName = new Map<string, Area>(areas.map((a) => [normalizeText(a.name), a]))
  const externalArea = areas.find((a) => a.isExternalCategory) ?? null
  const users = await repos.users.list({ active: true })
  const userAliases = await repos.users.listAliases()
  const userIndex = new Map<string, string>()
  for (const u of users) {
    userIndex.set(normalizeText(u.displayName), u.id)
    const local = u.email.split('@')[0]
    if (local) userIndex.set(normalizeText(local), u.id)
  }
  for (const a of userAliases)
    if (!userIndex.has(a.aliasNormalized)) userIndex.set(a.aliasNormalized, a.userId)
  const projects = await repos.projects.list()
  const projectAliases = await repos.projects.listAliases()
  const projectIndex = new Map<string, string>()
  for (const p of projects) projectIndex.set(normalizeText(p.canonicalName), p.id)
  for (const a of projectAliases)
    if (!projectIndex.has(a.aliasNormalized)) projectIndex.set(a.aliasNormalized, a.projectId)
  const externals = await repos.externalAssignees.list()
  const externalIndex = new Map<string, ExternalAssignee>(
    externals.map((e) => [normalizeText(e.displayName), e]),
  )
  const importedKeys = await repos.legacyImports.listImportedKeys(sourceFile)

  // --- 3. Planificación ---------------------------------------------------------
  const plannedAreas = new Map<string, PlannedArea>()
  const plannedProjects = new Map<string, PlannedProject>()
  const plannedExternals = new Map<string, PlannedExternal>()
  const plannedMeetings = new Map<string, PlannedMeeting>()
  const plannedRows: PlannedRow[] = []
  const existingMeetingCache = new Map<string, Meeting | null>()

  const resolveArea = async (row: NormalizedRow): Promise<PlannedArea> => {
    const key = row.isExternalSheet ? '__external__' : normalizeText(row.sheet)
    const cached = plannedAreas.get(key)
    if (cached) return cached
    const existing = row.isExternalSheet ? externalArea : (areaByName.get(key) ?? null)
    const planned: PlannedArea = existing
      ? {
          id: existing.id,
          name: existing.name,
          isExternalCategory: existing.isExternalCategory,
          isNew: false,
        }
      : { id: ids.next(), name: row.sheet, isExternalCategory: row.isExternalSheet, isNew: true }
    plannedAreas.set(key, planned)
    return planned
  }

  const findExistingMeeting = async (title: string): Promise<Meeting | null> => {
    if (existingMeetingCache.has(title)) return existingMeetingCache.get(title) ?? null
    const page = await repos.meetings.list({ search: title }, { page: 1, pageSize: 10 })
    const found =
      page.items.find((m) => m.title === title && m.source === MeetingSource.LEGACY_IMPORT) ?? null
    existingMeetingCache.set(title, found)
    return found
  }

  for (const row of rows) {
    const stats = sheetStats.get(row.sheet)
    if (!stats) continue
    if (row.issues.some((i) => i.code === 'MISSING_TITLE')) {
      stats.skippedNoTitle++
      continue
    }
    if (importedKeys.has(`${row.sheet}#${row.sourceRow}`)) {
      stats.alreadyImported++
      continue
    }

    const area = await resolveArea(row)

    // Responsable: usuario interno por nombre/alias; si no, tercero (ExternalAssignee).
    let ownerUserId: string | null = null
    let externalKey: string | null = null
    if (row.ownerNormalized !== '') {
      const userId = row.isExternalSheet ? undefined : userIndex.get(row.ownerNormalized)
      if (userId) {
        ownerUserId = userId
      } else {
        externalKey = row.ownerNormalized
        let planned = plannedExternals.get(externalKey)
        if (!planned) {
          const existing = externalIndex.get(externalKey)
          planned = existing
            ? {
                id: existing.id,
                name: existing.displayName,
                company: existing.company,
                isNew: false,
                count: 0,
                sheets: new Set(),
              }
            : {
                id: ids.next(),
                name: row.ownerText ?? row.ownerNormalized,
                company: row.company,
                isNew: true,
                count: 0,
                sheets: new Set(),
              }
          plannedExternals.set(externalKey, planned)
        }
        planned.count++
        planned.sheets.add(row.sheet)
      }
    }

    // Proyecto: alias o nombre canónico normalizado; nuevo si no existe.
    let projectKey: string | null = null
    if (row.projectNormalized !== '') {
      projectKey = row.projectNormalized
      let planned = plannedProjects.get(projectKey)
      if (!planned) {
        const existingId = projectIndex.get(projectKey)
        planned = existingId
          ? {
              id: existingId,
              name: row.projectText ?? projectKey,
              alias: projectKey,
              isNew: false,
              count: 0,
            }
          : {
              id: ids.next(),
              name: row.projectText ?? projectKey,
              alias: projectKey,
              isNew: true,
              count: 0,
            }
        plannedProjects.set(projectKey, planned)
      }
      planned.count++
    }

    // Reunión: una por (hoja, fecha de la junta).
    let meetingKey: string | null = null
    if (row.meetingDate) {
      meetingKey = `${row.sheet}|${row.meetingDate}`
      let planned = plannedMeetings.get(meetingKey)
      if (!planned) {
        const title = `Junta ${area.name} ${row.meetingDate}`
        const existing = await findExistingMeeting(title)
        const midnight = parseLocalDate(row.meetingDate, tz) ?? now
        planned = {
          id: existing?.id ?? ids.next(),
          sheet: row.sheet,
          areaId: area.id,
          date: row.meetingDate,
          title,
          startAt: existing?.startAt ?? new Date(midnight.getTime() + 9 * 3600_000),
          isNew: !existing,
          rows: 0,
        }
        plannedMeetings.set(meetingKey, planned)
      }
      planned.rows++
    }

    plannedRows.push({
      row,
      actionItemId: ids.next(),
      areaId: area.id,
      ownerUserId,
      externalKey,
      projectKey,
      meetingKey,
    })
    stats.imported++
  }

  // --- 4. Reporte (antes de escribir, para guardarlo en el lote) -------------
  const titledRows = rows.filter((r) => !r.issues.some((i) => i.code === 'MISSING_TITLE'))
  const internalRows = titledRows.filter((r) => !r.isExternalSheet)
  const externalRows = titledRows.filter((r) => r.isExternalSheet)
  const completedFlag = internalRows.filter((r) => r.completedFlag === true).length
  const observed: BaselineMetrics = {
    internalRows: internalRows.length,
    externalRows: externalRows.length,
    completedFlag,
    enProceso: internalRows.filter(
      (r) => r.statusNormalized === 'en proceso' || r.statusNormalized === 'en progreso',
    ).length,
    pendiente: internalRows.filter((r) => r.statusNormalized === 'pendiente').length,
    overdue: titledRows.filter((r) => r.overdueFlag === true).length,
    progressPct:
      internalRows.length === 0
        ? 0
        : Number(((completedFlag / internalRows.length) * 100).toFixed(1)),
  }
  const statusDistribution: Record<string, number> = {}
  const priorityDistribution: Record<string, number> = {}
  for (const p of plannedRows) {
    bump(statusDistribution, p.row.status)
    bump(priorityDistribution, p.row.priority ?? `${ActionItemPriority.MEDIUM} (default)`)
  }
  const legacyStatusDistribution: Record<string, number> = {}
  for (const r of titledRows) bump(legacyStatusDistribution, r.statusNormalized || '(vacío)')
  const blankFields: Record<string, number> = {}
  for (const r of titledRows)
    for (const i of r.issues) if (i.code === 'BLANK_FIELD' && i.field) bump(blankFields, i.field)
  const contradictions = titledRows
    .filter((r) => r.issues.some((i) => i.code === 'CONTRADICTION_COMPLETED_FLAG'))
    .map((r) => ({
      sheet: r.sheet,
      row: r.sourceRow,
      legacyId: r.legacyId,
      title: r.title,
      statusRaw: r.statusRaw,
      completedFlag: r.completedFlag,
      resolvedStatus: r.status,
    }))
  const semanticDuplicates = findSemanticDuplicates(titledRows, options.duplicateThreshold ?? 0.8)
  const duplicateIds = findDuplicateIds(titledRows)
  const recurring = titledRows
    .filter((r) => r.recurrence)
    .map((r) => ({
      sheet: r.sheet,
      row: r.sourceRow,
      title: r.title,
      frequency: r.recurrence?.frequency ?? '',
      hint: r.recurrence?.textOriginal ?? '',
    }))
  const issueRows = (
    code: NormalizedRow['issues'][number]['code'],
  ): Array<{ sheet: string; row: number; value: string }> =>
    titledRows.flatMap((r) =>
      r.issues
        .filter((i) => i.code === code)
        .map((i) => ({ sheet: r.sheet, row: r.sourceRow, value: i.detail })),
    )
  const unresolvedOwners = Array.from(plannedExternals.values()).map((e) => ({
    owner: e.name,
    count: e.count,
    sheets: Array.from(e.sheets),
    externalAssignee: e.isNew ? ('new' as const) : ('existing' as const),
  }))
  const newProjects = Array.from(plannedProjects.values())
    .filter((p) => p.isNew)
    .map((p) => ({ name: p.name, alias: p.alias, count: p.count }))
  const newExternalAssignees = Array.from(plannedExternals.values())
    .filter((e) => e.isNew)
    .map((e) => e.name)
  const newAreas = Array.from(plannedAreas.values())
    .filter((a) => a.isNew)
    .map((a) => a.name)
  const proposalsPlanned = plannedRows.filter(
    (p) => p.row.status === ActionItemStatus.COMPLETION_PROPOSED,
  ).length
  const commentsPlanned = plannedRows.filter((p) => p.row.comments).length
  const totalsBase = {
    rowsRead: rows.length,
    internalRows: internalRows.length,
    externalRows: externalRows.length,
    alreadyImported: Array.from(sheetStats.values()).reduce((n, s) => n + s.alreadyImported, 0),
    skippedNoTitle: Array.from(sheetStats.values()).reduce((n, s) => n + s.skippedNoTitle, 0),
    imported: plannedRows.length,
    actionItems: plannedRows.length,
    meetings: Array.from(plannedMeetings.values()).filter((m) => m.isNew).length,
    newProjects: newProjects.length,
    newExternalAssignees: newExternalAssignees.length,
    newAreas: newAreas.length,
    completionProposals: proposalsPlanned,
    comments: commentsPlanned,
  }
  const blankRowsSkipped = Array.from(sheetStats.values()).reduce(
    (n, s) => n + s.blankRowsSkipped,
    0,
  )

  const report: ImportReport = {
    file: sourceFile,
    mode: options.mode,
    batchId: null,
    startedAt: now.toISOString(),
    finishedAt: now.toISOString(),
    sheetsFound: workbook.sheetsFound,
    sheetsIgnored: workbook.sheetsIgnored,
    sheetsMissing: workbook.sheetsMissing,
    sheets: Array.from(sheetStats.values()),
    totals: totalsBase,
    statusDistribution,
    legacyStatusDistribution,
    priorityDistribution,
    unresolvedOwners,
    newProjects,
    newExternalAssignees,
    newAreas,
    meetings: Array.from(plannedMeetings.values()).map((m) => ({
      sheet: m.sheet,
      date: m.date,
      title: m.title,
      rows: m.rows,
      existing: !m.isNew,
    })),
    contradictions,
    semanticDuplicates,
    duplicateIds,
    recurring,
    blankFields,
    invalidDates: issueRows('INVALID_DATE'),
    unrecognizedStatuses: issueRows('UNRECOGNIZED_STATUS'),
    unrecognizedPriorities: issueRows('UNRECOGNIZED_PRIORITY'),
    rowsWithoutMeetingDate: plannedRows.filter((p) => !p.meetingKey).length,
    overdueFlagged: observed.overdue,
    baseline: compareWithBaseline(observed, {
      contradictions: contradictions.length,
      duplicateIds: duplicateIds.length,
      semanticDuplicates: semanticDuplicates.length,
      blankRowsSkipped,
      skippedNoTitle: totalsBase.skippedNoTitle,
      alreadyImported: totalsBase.alreadyImported,
    }),
    errors,
  }

  const created: ImportCreated = {
    batchId: null,
    actionItemIds: [],
    meetingIds: [],
    projectIds: [],
    externalAssigneeIds: [],
    areaIds: [],
  }

  // --- 5. Escritura (sólo commit y sólo si hay algo que importar) --------------
  if (options.mode === 'commit' && plannedRows.length > 0) {
    const batchId = ids.next()
    const uow = new PrismaUnitOfWork(client, defaults, { maxWait: 15_000, timeout: 120_000 })
    await uow.runWithPrisma(async (tx: PrismaRepositories) => {
      await tx.legacyImports.createBatch({
        id: batchId,
        sourceFile,
        mode: options.mode,
        startedAt: now,
      })

      for (const a of plannedAreas.values()) {
        if (!a.isNew) continue
        await tx.areas.save({
          id: a.id,
          name: a.name,
          code: null,
          isExternalCategory: a.isExternalCategory,
          active: true,
          sortOrder: 99,
        })
        created.areaIds.push(a.id)
      }
      for (const p of plannedProjects.values()) {
        if (!p.isNew) continue
        const project: Project = {
          id: p.id,
          canonicalName: p.name,
          code: null,
          active: true,
          areaId: null,
        }
        await tx.projects.save(project)
        await tx.projects.addAlias({
          projectId: p.id,
          aliasNormalized: p.alias,
          source: 'LEGACY_IMPORT',
        })
        const canonical = normalizeText(p.name)
        if (canonical !== p.alias)
          await tx.projects.addAlias({
            projectId: p.id,
            aliasNormalized: canonical,
            source: 'LEGACY_IMPORT',
          })
        created.projectIds.push(p.id)
      }
      for (const e of plannedExternals.values()) {
        if (!e.isNew) continue
        await tx.externalAssignees.save({
          id: e.id,
          displayName: e.name,
          company: e.company,
          email: null,
          phone: null,
          source: 'LEGACY_IMPORT',
          active: true,
        })
        created.externalAssigneeIds.push(e.id)
      }
      for (const m of plannedMeetings.values()) {
        if (!m.isNew) continue
        const meeting: Meeting = {
          id: m.id,
          googleConferenceRecordId: null,
          googleMeetingSpaceId: null,
          googleMeetingCode: null,
          googleCalendarEventId: null,
          title: m.title,
          organizerUserId: null,
          organizerEmail: null,
          isExternalHost: false,
          startAt: m.startAt,
          endAt: null,
          durationSeconds: null,
          status: MeetingStatus.ENDED,
          source: MeetingSource.LEGACY_IMPORT,
          processingStatus: MeetingProcessingStatus.COMPLETED,
          transcriptStatus: ArtifactStatus.NOT_REQUESTED,
          smartNotesStatus: ArtifactStatus.NOT_REQUESTED,
          aiAnalysisStatus: AiAnalysisStatus.SKIPPED,
          confidentialityLevel: ConfidentialityLevel.NORMAL,
          excludedFromAi: false,
          reportedLanguageCode: null,
          detectedLanguageCode: null,
          mixedLanguageDetected: false,
          lastErrorCode: null,
          lastErrorAt: null,
          areaId: m.areaId,
          projectId: null,
          createdAt: now,
          updatedAt: now,
        }
        await tx.meetings.save(meeting)
        created.meetingIds.push(m.id)
      }

      const refs: LegacyImportReference[] = []
      for (const p of plannedRows) {
        const r = p.row
        const meeting = p.meetingKey ? (plannedMeetings.get(p.meetingKey) ?? null) : null
        const meetingDate = r.meetingDate ? parseLocalDate(r.meetingDate, tz) : null
        const createdAt = meetingDate ?? now
        const item: ActionItem = {
          id: p.actionItemId,
          externalKey: '',
          title: r.title,
          description: null,
          type: r.recurrence ? ActionItemType.RECURRING : ActionItemType.ONE_OFF,
          ownerUserId: p.ownerUserId,
          externalAssigneeId: p.externalKey
            ? (plannedExternals.get(p.externalKey)?.id ?? null)
            : null,
          ownerTextOriginal: r.ownerText,
          collaboratorUserIds: [],
          areaId: p.areaId,
          projectId: p.projectKey ? (plannedProjects.get(p.projectKey)?.id ?? null) : null,
          createdFromMeetingId: meeting?.id ?? null,
          latestMeetingId: meeting?.id ?? null,
          status: r.status,
          priority: r.priority ?? ActionItemPriority.MEDIUM,
          dueDate: null,
          dueDateTextOriginal: null,
          dateConfidence: null,
          startDate: null,
          completedAt: r.status === ActionItemStatus.COMPLETED ? (meetingDate ?? now) : null,
          cancelledAt: r.status === ActionItemStatus.CANCELLED ? (meetingDate ?? now) : null,
          confidence: null,
          requiresReview: false,
          sourceEvidence: [],
          recurrence: r.recurrence,
          parentActionItemId: null,
          blocker:
            r.status === ActionItemStatus.BLOCKED
              ? (r.comments ?? 'Bloqueada según el legado')
              : null,
          tags: [LEGACY_TAG],
          migrationTrust: MigrationTrust.LEGACY,
          legacyId: r.legacyId,
          lastMentionedAt: null,
          createdAt,
          updatedAt: now,
        }
        const saved = await tx.actionItems.save(item)
        created.actionItemIds.push(saved.id)

        await tx.actionItems.addStatusHistory({
          id: ids.next(),
          actionItemId: saved.id,
          fromStatus: null,
          toStatus: r.status,
          changedByUserId: null,
          changedBySystem: true,
          reason: `Migración legado: Status "${r.statusRaw ?? '(vacío)'}"${r.completedFlag !== null ? `, Completada=${r.completedFlag ? 1 : 0}` : ''}`,
          meetingId: meeting?.id ?? null,
          changedAt: createdAt,
        })
        if (meeting) {
          await tx.actionItems.addLink({
            id: ids.next(),
            actionItemId: saved.id,
            meetingId: meeting.id,
            relationType: RelationType.CREATED,
            evidence: [],
            previousStatus: null,
            detectedStatus: null,
            detectedDueDate: null,
            createdAt,
          })
        }
        if (r.comments) {
          await tx.actionItems.addComment({
            id: ids.next(),
            actionItemId: saved.id,
            authorUserId: null,
            body: r.comments,
            source: 'LEGACY_IMPORT',
            createdAt,
          })
        }
        if (r.status === ActionItemStatus.COMPLETION_PROPOSED) {
          await tx.completionProposals.save({
            id: ids.next(),
            actionItemId: saved.id,
            proposedByType: ProposedByType.USER,
            proposedByUserId: null,
            proposedFromMeetingId: meeting?.id ?? null,
            reason: 'Migración legado: estado Entregado',
            evidenceSegmentIds: [],
            evidence: [],
            confidence: 1,
            status: CompletionProposalStatus.PENDING,
            reviewedByUserId: null,
            reviewedAt: null,
            reviewComment: null,
            createdAt: now,
          })
        }
        refs.push({
          id: ids.next(),
          entityType: 'ActionItem',
          entityId: saved.id,
          sourceFile,
          sourceSheet: r.sheet,
          sourceRow: r.sourceRow,
          legacyId: r.legacyId,
          rawPayload: {
            ...r.rawPayload,
            __sheetOriginal: r.sheetOriginal,
            __issues: r.issues.map((i) => i.code),
          },
          importBatchId: batchId,
          importedAt: now,
        })
        await tx.audit.append({
          id: ids.next(),
          actorUserId: options.actorUserId ?? null,
          actorType: 'IMPORT',
          action: 'LEGACY_IMPORT_ACTION_ITEM_CREATED',
          entity: 'ActionItem',
          entityId: saved.id,
          before: null,
          after: {
            externalKey: saved.externalKey,
            legacyId: r.legacyId,
            sheet: r.sheet,
            row: r.sourceRow,
            status: r.status,
          },
          source: 'legacy-import',
          correlationId: batchId,
          timestamp: now,
        })
      }
      await tx.legacyImports.saveMany(refs)
      report.batchId = batchId
      report.finishedAt = new Date().toISOString()
      await tx.audit.append({
        id: ids.next(),
        actorUserId: options.actorUserId ?? null,
        actorType: 'IMPORT',
        action: 'LEGACY_IMPORT_COMMITTED',
        entity: 'LegacyImportBatch',
        entityId: batchId,
        before: null,
        after: {
          sourceFile,
          imported: plannedRows.length,
          meetings: created.meetingIds.length,
          newProjects: created.projectIds.length,
        },
        source: 'legacy-import',
        correlationId: batchId,
        timestamp: new Date(),
      })
      await tx.legacyImports.finishBatch(batchId, report, new Date())
    })
    created.batchId = batchId
  } else {
    report.finishedAt = new Date().toISOString()
  }

  return { report, created }
}
