import { describe, expect, it } from 'vitest'
import { ActionItemStatus } from '@smlxl/domain'
import { buildFixtureWorkbook, FIXTURE_ROWS } from './generate-fixture.js'
import {
  findDuplicateIds,
  findSemanticDuplicates,
  normalizeRow,
  parseFlag,
  parseLegacyDate,
} from './normalize.js'
import {
  classifyHeader,
  readWorkbookFromBook,
  resolveSourceSheet,
  SOURCE_SHEETS,
} from './reader.js'

const workbook = readWorkbookFromBook(buildFixtureWorkbook(), 'maestro-fixture.xlsx')
const allRows = workbook.sheets.flatMap((s) => s.rows).map(normalizeRow)
const byLegacy = (sheet: string, id: string) =>
  allRows.find((r) => r.sheet === sheet && r.legacyId === id) ??
  (() => {
    throw new Error(`fila ${sheet}/${id} no encontrada`)
  })()

describe('reader (fixture en memoria, sin BD)', () => {
  it('lee sólo las hojas fuente e ignora Dashboard/Maestro/Listas', () => {
    expect(workbook.sheets.map((s) => s.sheet).sort()).toEqual([...SOURCE_SHEETS].sort())
    expect(workbook.sheetsIgnored).toEqual(['Dashboard', 'Maestro', 'Listas'])
    expect(workbook.sheetsMissing).toEqual([])
  })

  it('detecta la fila de encabezado aunque haya filas de título arriba', () => {
    for (const s of workbook.sheets) expect(s.headerRow).toBe(4)
  })

  it('cuenta filas por hoja y omite filas vacías', () => {
    const ops = workbook.sheets.find((s) => s.sheet === 'Operaciones y Proyectos')
    expect(ops?.rows).toHaveLength(5)
    expect(ops?.blankRowsSkipped).toBe(2)
    const juridico = workbook.sheets.find((s) => s.sheet === 'Jurídico')
    expect(juridico?.rows).toHaveLength(FIXTURE_ROWS['Jurídico']?.length ?? -1)
    expect(juridico?.rows[0]?.sourceRow).toBe(5)
  })

  it('mapea columnas distintas en Externos (Empresa/Contacto, sin Departamento)', () => {
    const ext = workbook.sheets.find((s) => s.sheet === 'Externos')
    expect(ext?.columns.company).toBeDefined()
    expect(ext?.columns.contact).toBeDefined()
    expect(ext?.columns.department).toBeUndefined()
    expect(ext?.columns.overdue).toBeUndefined()
  })

  it('clasifica encabezados sin acentos ni mayúsculas', () => {
    expect(classifyHeader('PENDIENTE')).toBe('title')
    expect(classifyHeader('Responsable ')).toBe('owner')
    expect(classifyHeader('Proyecto / Frente')).toBe('project')
    expect(classifyHeader('Vencido?')).toBe('overdue')
    expect(classifyHeader('Fecha de la junta')).toBe('meetingDate')
    expect(resolveSourceSheet('juridico')).toBe('Jurídico')
    expect(resolveSourceSheet('Maestro')).toBeNull()
  })
})

describe('normalize', () => {
  it('parsea fechas en serial de Excel, ISO y texto', () => {
    expect(parseLegacyDate('2026-08-05')).toBe('2026-08-05')
    expect(parseLegacyDate('05/08/2026')).toBe('2026-08-05')
    expect(parseLegacyDate(46239)).toBe('2026-08-05')
    expect(parseLegacyDate('5 de agosto de 2026')).toBe('2026-08-05')
    expect(parseLegacyDate('agosto')).toBeNull()
    expect(parseLegacyDate(0)).toBeNull()
  })

  it('parsea flags 0/1 y Sí/No', () => {
    expect(parseFlag(1)).toBe(true)
    expect(parseFlag('Sí')).toBe(true)
    expect(parseFlag('No')).toBe(false)
    expect(parseFlag(0)).toBe(false)
    expect(parseFlag(null)).toBeNull()
  })

  it('mapea estados legado al modelo canónico (§16.5) incluyendo casing', () => {
    expect(byLegacy('Jurídico', 'JU-02').status).toBe(ActionItemStatus.COMPLETED)
    const lower = allRows.find((r) => r.sheet === 'Jurídico' && r.statusRaw === 'completo')
    expect(lower?.status).toBe(ActionItemStatus.COMPLETED)
    expect(byLegacy('Ventas y Marketing', 'VM-02').status).toBe(
      ActionItemStatus.COMPLETION_PROPOSED,
    )
    expect(byLegacy('Operaciones y Proyectos', 'OP-01').status).toBe(ActionItemStatus.IN_PROGRESS)
    expect(byLegacy('Dirección General', 'DG-02').status).toBe(ActionItemStatus.PENDING)
  })

  it('reporta contradicciones Status vs Completada y confía en Status', () => {
    const ju03 = byLegacy('Jurídico', 'JU-03')
    expect(ju03.completedFlag).toBe(true)
    expect(ju03.status).toBe(ActionItemStatus.PENDING)
    expect(ju03.issues.some((i) => i.code === 'CONTRADICTION_COMPLETED_FLAG')).toBe(true)
    const af03 = byLegacy('Admin y Finanzas', 'AF-03')
    expect(af03.status).toBe(ActionItemStatus.COMPLETED)
    expect(af03.issues.some((i) => i.code === 'CONTRADICTION_COMPLETED_FLAG')).toBe(true)
    expect(af03.issues.some((i) => i.code === 'INVALID_DATE')).toBe(true)
    expect(af03.meetingDate).toBeNull()
  })

  it('trata celdas vacías y 0 como blancos', () => {
    const af04 = byLegacy('Admin y Finanzas', 'AF-04')
    expect(af04.ownerText).toBeNull()
    expect(af04.projectText).toBeNull()
    expect(af04.statusRaw).toBeNull()
    expect(af04.status).toBe(ActionItemStatus.PENDING)
    expect(af04.statusRecognized).toBe(false)
    expect(af04.priority).toBeNull()
    const blank = af04.issues.filter((i) => i.code === 'BLANK_FIELD').map((i) => i.field)
    expect(blank).toEqual(
      expect.arrayContaining([
        'Responsable',
        'Proyecto / Frente',
        'Fecha de la junta',
        'Prioridad',
        'Status',
      ]),
    )
  })

  it('detecta actividades recurrentes', () => {
    expect(byLegacy('Admin y Finanzas', 'AF-01').recurrence?.frequency).toBe('DAILY')
    expect(byLegacy('Operaciones y Proyectos', 'OP-05').recurrence?.frequency).toBe('WEEKLY')
    expect(byLegacy('Jurídico', 'JU-02').recurrence).toBeNull()
  })

  it('normaliza variantes de nombres y proyectos', () => {
    expect(byLegacy('Operaciones y Proyectos', 'OP-02').ownerNormalized).toBe('andres')
    expect(byLegacy('Operaciones y Proyectos', 'OP-03').ownerNormalized).toBe('andres')
    expect(byLegacy('Jurídico', 'JU-02').ownerNormalized).toBe('lisa de la fuente')
    expect(byLegacy('Jurídico', 'JU-03').ownerNormalized).toBe('lisa de la fuente')
    expect(byLegacy('Ventas y Marketing', 'VM-01').projectNormalized).toBe('campana q4')
    expect(byLegacy('Ventas y Marketing', 'VM-01').meetingDate).toBe('2026-08-05')
  })

  it('lee Empresa/Contacto en Externos y marca la hoja externa', () => {
    const ex01 = byLegacy('Externos', 'EX-01')
    expect(ex01.isExternalSheet).toBe(true)
    expect(ex01.company).toBe('Ruiz y Asociados')
    expect(ex01.contact).toBe('Ricardo Ruiz')
  })

  it('encuentra IDs repetidos (dentro y entre hojas) sin bloquear', () => {
    const dups = findDuplicateIds(allRows)
    const ju01 = dups.find((d) => d.legacyId === 'ju 01')
    expect(ju01?.occurrences).toHaveLength(3)
    expect(new Set(ju01?.occurrences.map((o) => o.sheet)).size).toBe(2)
  })

  it('reporta duplicados semánticos dentro de la misma área', () => {
    const dups = findSemanticDuplicates(allRows, 0.8)
    const carta = dups.find((d) => d.sheet === 'Operaciones y Proyectos')
    expect(carta).toBeDefined()
    expect(carta?.score).toBeGreaterThanOrEqual(0.8)
    expect(carta?.titleA).toContain('carta de intenci')
  })
})
