import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ActionItemStatus, MigrationTrust, normalizeText } from '@smlxl/domain'
import {
  createPrismaClient,
  createRepositories,
  type PrismaClient,
  type RepositoryDefaults,
} from '@smlxl/database'
import { buildFixtureWorkbook } from './generate-fixture.js'
import { runLegacyImport, type ImportCreated } from './importer.js'
import { readWorkbookFromBook, SOURCE_SHEETS } from './reader.js'

const DATABASE_URL = process.env.DATABASE_URL
const TAG = `import-test-${randomUUID().slice(0, 8)}`
const SOURCE_FILE = `${TAG}.xlsx`

const defaults: RepositoryDefaults = {
  featureFlags: {
    GOOGLE_INTEGRATION_ENABLED: false,
    GOOGLE_MEET_EVENTS_ENABLED: false,
    AI_PROCESSING_ENABLED: false,
    AI_COMPLETION_PROPOSALS_ENABLED: true,
    GMAIL_NOTIFICATIONS_ENABLED: false,
    SHEETS_SYNC_ENABLED: false,
    WEEKLY_DIGEST_ENABLED: true,
  },
  companyTimezone: 'America/Mexico_City',
  companyDomain: 'smlxl.mx',
}

describe.skipIf(!DATABASE_URL)('importador legado (integración)', () => {
  let client: PrismaClient
  let repos: ReturnType<typeof createRepositories>
  const createdAreaIds: string[] = []
  const createdByCommit: ImportCreated[] = []
  const workbook = readWorkbookFromBook(buildFixtureWorkbook(), SOURCE_FILE)

  beforeAll(async () => {
    client = createPrismaClient(DATABASE_URL)
    repos = createRepositories(client, defaults)
    // Garantiza las áreas de las hojas fuente (el seed normalmente ya las tiene).
    for (const [i, name] of SOURCE_SHEETS.entries()) {
      const existing = await repos.areas.findByName(name)
      if (existing) continue
      const area = await repos.areas.save({
        id: randomUUID(),
        name,
        code: null,
        isExternalCategory: name === 'Externos',
        active: true,
        sortOrder: 50 + i,
      })
      createdAreaIds.push(area.id)
    }
  })

  afterAll(async () => {
    for (const c of createdByCommit) {
      if (c.actionItemIds.length)
        await client.actionItem.deleteMany({ where: { id: { in: c.actionItemIds } } })
      if (c.meetingIds.length)
        await client.meeting.deleteMany({ where: { id: { in: c.meetingIds } } })
      if (c.projectIds.length)
        await client.project.deleteMany({ where: { id: { in: c.projectIds } } })
      if (c.externalAssigneeIds.length)
        await client.externalAssignee.deleteMany({ where: { id: { in: c.externalAssigneeIds } } })
      if (c.areaIds.length) await client.area.deleteMany({ where: { id: { in: c.areaIds } } })
      if (c.batchId) {
        await client.auditLog.deleteMany({ where: { correlationId: c.batchId } })
        await client.legacyImportBatch.deleteMany({ where: { id: c.batchId } })
      }
    }
    if (createdAreaIds.length)
      await client.area.deleteMany({ where: { id: { in: createdAreaIds } } })
    await client.$disconnect()
  })

  it('dry-run analiza y reporta sin escribir nada', async () => {
    const batchesBefore = await client.legacyImportBatch.count()
    const itemsBefore = await client.actionItem.count()
    const { report, created } = await runLegacyImport(client, defaults, workbook, {
      mode: 'dry-run',
    })
    expect(report.mode).toBe('dry-run')
    expect(report.batchId).toBeNull()
    expect(created.actionItemIds).toEqual([])
    expect(report.totals.rowsRead).toBe(28)
    expect(report.totals.skippedNoTitle).toBe(0)
    expect(report.totals.imported).toBe(28)
    expect(report.totals.internalRows).toBe(25)
    expect(report.totals.externalRows).toBe(3)
    expect(report.sheets.find((s) => s.sheet === 'Operaciones y Proyectos')?.blankRowsSkipped).toBe(
      2,
    )
    expect(report.sheetsIgnored).toEqual(['Dashboard', 'Maestro', 'Listas'])
    expect(report.contradictions.length).toBeGreaterThanOrEqual(2)
    expect(report.duplicateIds.some((d) => d.legacyId === 'ju 01')).toBe(true)
    expect(report.semanticDuplicates.length).toBeGreaterThanOrEqual(1)
    expect(report.recurring.map((r) => r.frequency).sort()).toEqual(['DAILY', 'WEEKLY'])
    // El proyecto "Nuevo Frente Logística" es nuevo salvo que otra corrida (p. ej. el CLI) ya lo haya creado.
    const logistica = await repos.projects.findByAlias(normalizeText('Nuevo Frente Logística'))
    if (logistica)
      expect(report.newProjects.map((p) => p.name)).not.toContain('Nuevo Frente Logística')
    else expect(report.newProjects.map((p) => p.name)).toContain('Nuevo Frente Logística')
    expect(report.statusDistribution[ActionItemStatus.COMPLETION_PROPOSED]).toBe(2)
    expect(report.baseline.differences.length).toBeGreaterThan(0)
    expect(report.baseline.notes.length).toBeGreaterThan(0)
    expect(await client.legacyImportBatch.count()).toBe(batchesBefore)
    expect(await client.actionItem.count()).toBe(itemsBefore)
    expect(await repos.legacyImports.listImportedKeys(SOURCE_FILE)).toEqual(new Set())
  })

  it('commit importa en una transacción y deja trazabilidad', async () => {
    const { report, created } = await runLegacyImport(client, defaults, workbook, {
      mode: 'commit',
    })
    createdByCommit.push(created)
    expect(report.batchId).not.toBeNull()
    expect(created.actionItemIds).toHaveLength(28)
    // Cada reunión planificada se creó o ya existía (una por hoja+fecha, reutilizable entre corridas).
    expect(report.meetings.length).toBeGreaterThan(0)
    expect(created.meetingIds.length + report.meetings.filter((m) => m.existing).length).toBe(
      report.meetings.length,
    )

    const batch = await repos.legacyImports.findBatch(report.batchId as string)
    expect(batch?.finishedAt).not.toBeNull()
    expect(batch?.report).not.toBeNull()
    const refs = await repos.legacyImports.listByBatch(report.batchId as string)
    expect(refs).toHaveLength(28)
    expect(refs.every((r) => r.sourceFile === SOURCE_FILE)).toBe(true)

    // Resolución de responsables: alias/variantes → usuario; desconocidos → tercero.
    const items = await repos.actionItems.listAll({ tags: ['legado'] })
    const mine = items.filter((i) => created.actionItemIds.includes(i.id))
    expect(mine).toHaveLength(28)
    expect(mine.every((i) => i.migrationTrust === MigrationTrust.LEGACY)).toBe(true)
    expect(mine.every((i) => /^ACT-\d{6}$/.test(i.externalKey))).toBe(true)

    const carta = mine.filter((i) => normalizeText(i.title).includes('carta de intencion'))
    expect(carta).toHaveLength(2) // duplicado semántico: se importa, no se fusiona
    const andres = await repos.users.findByEmail('andres@smlxl.mx')
    if (andres) expect(carta.every((i) => i.ownerUserId === andres.id)).toBe(true)

    const mario = mine.find((i) => i.ownerTextOriginal === 'Mario Quintero')
    expect(mario?.ownerUserId).toBeNull()
    expect(mario?.externalAssigneeId).not.toBeNull()
    expect(mario?.priority).toBe('URGENT')

    const entregado = mine.filter((i) => i.status === ActionItemStatus.COMPLETION_PROPOSED)
    expect(entregado).toHaveLength(2)
    for (const e of entregado) {
      const proposal = await repos.completionProposals.findPendingByActionItem(e.id)
      expect(proposal?.reason).toBe('Migración legado: estado Entregado')
      expect(proposal?.proposedByType).toBe('USER')
    }

    const completed = mine.filter((i) => i.status === ActionItemStatus.COMPLETED)
    expect(completed.length).toBeGreaterThanOrEqual(5)
    expect(completed.every((i) => i.completedAt !== null)).toBe(true)

    const recurring = mine.filter((i) => i.type === 'RECURRING')
    expect(recurring).toHaveLength(2)

    const withComment = mine.find(
      (i) => i.legacyId === 'JU-01' && i.title.startsWith('Revisar contrato'),
    )
    expect(withComment).toBeDefined()
    const comments = await repos.actionItems.listComments(withComment?.id as string)
    expect(comments.some((c) => c.source === 'LEGACY_IMPORT')).toBe(true)

    const external = mine.find((i) => i.legacyId === 'EX-01')
    expect(external?.externalAssigneeId).not.toBeNull()
    expect(external?.ownerUserId).toBeNull()

    // Una reunión por (hoja, fecha) con link CREATED.
    const links = await repos.actionItems.listLinks(withComment?.id as string)
    expect(links.map((l) => l.relationType)).toEqual(['CREATED'])
    const meeting = await repos.meetings.findById(links[0]?.meetingId as string)
    expect(meeting?.source).toBe('LEGACY_IMPORT')
    expect(meeting?.title).toBe('Junta Jurídico 2026-08-05')
  })

  it('un segundo commit del mismo archivo omite todas las filas ya importadas', async () => {
    const { report, created } = await runLegacyImport(client, defaults, workbook, {
      mode: 'commit',
    })
    createdByCommit.push(created)
    expect(report.totals.imported).toBe(0)
    expect(report.totals.alreadyImported).toBe(28)
    expect(report.batchId).toBeNull()
    expect(created.actionItemIds).toEqual([])
  })
})
