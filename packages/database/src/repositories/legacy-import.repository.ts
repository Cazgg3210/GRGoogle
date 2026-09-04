import type { Id, LegacyImportReference, LegacyImportRepository } from '@smlxl/domain'
import { jsonSafe } from '../mappers/common.js'
import { legacyRefToDb, toLegacyRef } from '../mappers/system.js'
import { BaseRepository } from './base.js'

export interface LegacyImportBatch {
  id: Id
  sourceFile: string
  mode: string
  startedAt: Date
  finishedAt: Date | null
  report: unknown | null
}

/**
 * Implementa el puerto de dominio y añade el manejo de lotes
 * (`legacy_import_batches`), que es un detalle del importador y no forma
 * parte del puerto.
 */
export class PrismaLegacyImportRepository extends BaseRepository implements LegacyImportRepository {
  async saveMany(refs: LegacyImportReference[]): Promise<void> {
    if (refs.length === 0) return
    await this.db.legacyImportReference.createMany({
      data: refs.map(legacyRefToDb),
      skipDuplicates: true,
    })
  }

  async findByLegacyKey(
    sourceSheet: string,
    sourceRow: number,
    sourceFile: string,
  ): Promise<LegacyImportReference | null> {
    const row = await this.db.legacyImportReference.findUnique({
      where: { sourceFile_sourceSheet_sourceRow: { sourceFile, sourceSheet, sourceRow } },
    })
    return row ? toLegacyRef(row) : null
  }

  async listByBatch(batchId: Id): Promise<LegacyImportReference[]> {
    const rows = await this.db.legacyImportReference.findMany({
      where: { importBatchId: batchId },
      orderBy: [{ sourceSheet: 'asc' }, { sourceRow: 'asc' }],
    })
    return rows.map(toLegacyRef)
  }

  /** Claves (sheet, row) ya importadas para un archivo; evita N consultas por fila. */
  async listImportedKeys(sourceFile: string): Promise<Set<string>> {
    const rows = await this.db.legacyImportReference.findMany({
      where: { sourceFile },
      select: { sourceSheet: true, sourceRow: true },
    })
    return new Set(rows.map((r) => `${r.sourceSheet}#${r.sourceRow}`))
  }

  // --- Lotes ---------------------------------------------------------------

  async createBatch(input: { id: Id; sourceFile: string; mode: string; startedAt: Date }): Promise<LegacyImportBatch> {
    const row = await this.db.legacyImportBatch.create({
      data: { id: input.id, sourceFile: input.sourceFile, mode: input.mode, startedAt: input.startedAt },
    })
    return { ...row, report: row.report ?? null }
  }

  async finishBatch(id: Id, report: unknown, finishedAt: Date): Promise<LegacyImportBatch> {
    const row = await this.db.legacyImportBatch.update({
      where: { id },
      data: { finishedAt, report: jsonSafe(report) },
    })
    return { ...row, report: row.report ?? null }
  }

  async findBatch(id: Id): Promise<LegacyImportBatch | null> {
    const row = await this.db.legacyImportBatch.findUnique({ where: { id } })
    return row ? { ...row, report: row.report ?? null } : null
  }

  async deleteBatch(id: Id): Promise<void> {
    await this.db.legacyImportBatch.deleteMany({ where: { id } })
  }
}
