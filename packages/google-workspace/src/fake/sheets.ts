import type { SheetRow, SheetsPort } from '@smlxl/domain'

export interface FakeSheetSnapshot {
  columns: string[]
  rows: Array<Record<string, string | number | boolean | null>>
}

/** Fake de Sheets en memoria, con identidad por clave (nunca por posición). */
export class FakeSheetsAdapter implements SheetsPort {
  private readonly sheets = new Map<
    string,
    { columns: string[]; rows: Map<string, Record<string, string | number | boolean | null>> }
  >()

  async upsertRows(input: {
    spreadsheetId: string
    sheetName: string
    keyColumn: string
    columns: string[]
    rows: SheetRow[]
  }): Promise<{ inserted: number; updated: number }> {
    const id = `${input.spreadsheetId}/${input.sheetName}`
    let sheet = this.sheets.get(id)
    const columns = input.columns.includes(input.keyColumn)
      ? input.columns
      : [input.keyColumn, ...input.columns]
    if (!sheet) {
      sheet = { columns, rows: new Map() }
      this.sheets.set(id, sheet)
    } else sheet.columns = columns
    let inserted = 0
    let updated = 0
    for (const row of input.rows) {
      const values: Record<string, string | number | boolean | null> = {
        [input.keyColumn]: row.key,
      }
      for (const c of columns) if (c !== input.keyColumn) values[c] = row.values[c] ?? null
      if (sheet.rows.has(row.key)) updated += 1
      else inserted += 1
      sheet.rows.set(row.key, values)
    }
    return { inserted, updated }
  }

  snapshot(): Record<string, FakeSheetSnapshot> {
    const out: Record<string, FakeSheetSnapshot> = {}
    for (const [id, s] of this.sheets)
      out[id] = { columns: [...s.columns], rows: [...s.rows.values()].map((r) => ({ ...r })) }
    return out
  }

  clear(): void {
    this.sheets.clear()
  }
}
