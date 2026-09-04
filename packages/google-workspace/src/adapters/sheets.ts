import { google, type sheets_v4 } from 'googleapis'
import type { SheetRow, SheetsPort } from '@smlxl/domain'
import { DomainError, DomainErrorCode } from '@smlxl/domain'
import { GOOGLE_SCOPES } from '../scopes.js'
import { withGoogleRetry } from '../http/retry.js'
import type { AuthClient, GoogleAdapterDeps } from './shared.js'

/**
 * Google Sheets v4 (§16.9): proyección de Pendientes/Reuniones. La identidad de
 * cada fila es la columna clave (UUID), NUNCA la posición de fila.
 */
export interface SheetsApiClient {
  spreadsheets: {
    get(
      params: sheets_v4.Params$Resource$Spreadsheets$Get,
      options?: { signal?: AbortSignal },
    ): Promise<{ data: sheets_v4.Schema$Spreadsheet }>
    batchUpdate(
      params: sheets_v4.Params$Resource$Spreadsheets$Batchupdate,
      options?: { signal?: AbortSignal },
    ): Promise<{ data: sheets_v4.Schema$BatchUpdateSpreadsheetResponse }>
    values: {
      get(
        params: sheets_v4.Params$Resource$Spreadsheets$Values$Get,
        options?: { signal?: AbortSignal },
      ): Promise<{ data: sheets_v4.Schema$ValueRange }>
      update(
        params: sheets_v4.Params$Resource$Spreadsheets$Values$Update,
        options?: { signal?: AbortSignal },
      ): Promise<{ data: sheets_v4.Schema$UpdateValuesResponse }>
      append(
        params: sheets_v4.Params$Resource$Spreadsheets$Values$Append,
        options?: { signal?: AbortSignal },
      ): Promise<{ data: sheets_v4.Schema$AppendValuesResponse }>
      batchUpdate(
        params: sheets_v4.Params$Resource$Spreadsheets$Values$Batchupdate,
        options?: { signal?: AbortSignal },
      ): Promise<{ data: sheets_v4.Schema$BatchUpdateValuesResponse }>
    }
  }
}

const SCOPES = [GOOGLE_SCOPES.sheets.SPREADSHEETS]

/** Índice 0 → "A", 25 → "Z", 26 → "AA". */
export function columnLetter(index: number): string {
  let n = index + 1
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

export type CellValue = string | number | boolean | null

/** Plan de escritura por clave: puro y testeable sin API. */
export interface UpsertPlan {
  header: string[]
  headerNeedsWrite: boolean
  updates: Array<{ rowNumber: number; values: CellValue[] }>
  inserts: CellValue[][]
}

export function planUpsert(input: {
  existingHeader: string[]
  /** Filas existentes a partir de la fila 2 (índice 0 = fila 2). */
  existingRows: CellValue[][]
  keyColumn: string
  columns: string[]
  rows: SheetRow[]
}): UpsertPlan {
  const columns = input.columns.includes(input.keyColumn)
    ? input.columns
    : [input.keyColumn, ...input.columns]
  const headerNeedsWrite =
    input.existingHeader.length !== columns.length ||
    columns.some((c, i) => input.existingHeader[i] !== c)
  const keyIdx = (input.existingHeader.length > 0 ? input.existingHeader : columns).indexOf(
    input.keyColumn,
  )
  const rowByKey = new Map<string, number>()
  if (keyIdx >= 0) {
    input.existingRows.forEach((r, i) => {
      const k = r[keyIdx]
      if (k !== null && k !== undefined && String(k).length > 0 && !rowByKey.has(String(k)))
        rowByKey.set(String(k), i + 2)
    })
  }
  const updates: UpsertPlan['updates'] = []
  const inserts: CellValue[][] = []
  for (const row of input.rows) {
    const values = columns.map((c) => (c === input.keyColumn ? row.key : (row.values[c] ?? null)))
    const rowNumber = rowByKey.get(row.key)
    if (rowNumber !== undefined) updates.push({ rowNumber, values })
    else inserts.push(values)
  }
  return { header: columns, headerNeedsWrite, updates, inserts }
}

export interface SheetsAdapterDeps extends GoogleAdapterDeps {
  /** Cuenta que se impersona para escribir (propietaria/editora del sheet). */
  actingUserEmail: string
  clientFactory?: (auth: AuthClient) => SheetsApiClient
}

export class GoogleSheetsAdapter implements SheetsPort {
  private readonly clientFactory: (auth: AuthClient) => SheetsApiClient

  constructor(private readonly deps: SheetsAdapterDeps) {
    this.clientFactory =
      deps.clientFactory ??
      ((auth) => google.sheets({ version: 'v4', auth }) as unknown as SheetsApiClient)
    if (!deps.actingUserEmail) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_ERROR,
        'GoogleSheetsAdapter requiere actingUserEmail',
      )
    }
  }

  private retry(operation: string) {
    return { ...this.deps.retry, operation }
  }

  async upsertRows(input: {
    spreadsheetId: string
    sheetName: string
    keyColumn: string
    columns: string[]
    rows: SheetRow[]
  }): Promise<{ inserted: number; updated: number }> {
    const client = this.clientFactory(this.deps.auth.for(this.deps.actingUserEmail, SCOPES))
    const { spreadsheetId, sheetName } = input
    try {
      await this.ensureSheet(client, spreadsheetId, sheetName)
      const existing = await withGoogleRetry(
        (signal) =>
          client.spreadsheets.values.get(
            { spreadsheetId, range: `'${sheetName}'!A1:ZZ` },
            { signal },
          ),
        this.retry('sheets.values.get'),
      )
      const all = (existing.data.values ?? []) as CellValue[][]
      const existingHeader = (all[0] ?? []).map((v) => String(v ?? ''))
      const existingRows = all.slice(1)
      const plan = planUpsert({
        existingHeader,
        existingRows,
        keyColumn: input.keyColumn,
        columns: input.columns,
        rows: input.rows,
      })
      const lastCol = columnLetter(plan.header.length - 1)
      const data: sheets_v4.Schema$ValueRange[] = []
      if (plan.headerNeedsWrite)
        data.push({ range: `'${sheetName}'!A1:${lastCol}1`, values: [plan.header] })
      for (const u of plan.updates) {
        data.push({
          range: `'${sheetName}'!A${u.rowNumber}:${lastCol}${u.rowNumber}`,
          values: [u.values],
        })
      }
      if (data.length > 0) {
        await withGoogleRetry(
          (signal) =>
            client.spreadsheets.values.batchUpdate(
              { spreadsheetId, requestBody: { valueInputOption: 'RAW', data } },
              { signal },
            ),
          this.retry('sheets.values.batchUpdate'),
        )
      }
      if (plan.inserts.length > 0) {
        await withGoogleRetry(
          (signal) =>
            client.spreadsheets.values.append(
              {
                spreadsheetId,
                range: `'${sheetName}'!A1:${lastCol}`,
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                requestBody: { values: plan.inserts },
              },
              { signal },
            ),
          this.retry('sheets.values.append'),
        )
      }
      return { inserted: plan.inserts.length, updated: plan.updates.length }
    } catch (err) {
      if (err instanceof DomainError && err.code === DomainErrorCode.SHEETS_SYNC_FAILED) throw err
      const cause = err instanceof DomainError ? err : undefined
      throw new DomainError(
        DomainErrorCode.SHEETS_SYNC_FAILED,
        `Sincronización con Sheets falló: ${cause?.message ?? 'error'}`,
        {
          retryable: cause?.retryable ?? false,
          details: { sheetName, googleCode: cause?.code ?? null },
          cause: err,
        },
      )
    }
  }

  private async ensureSheet(
    client: SheetsApiClient,
    spreadsheetId: string,
    sheetName: string,
  ): Promise<void> {
    const meta = await withGoogleRetry(
      (signal) => client.spreadsheets.get({ spreadsheetId }, { signal }),
      this.retry('sheets.get'),
    )
    const exists = (meta.data.sheets ?? []).some((s) => s.properties?.title === sheetName)
    if (exists) return
    await withGoogleRetry(
      (signal) =>
        client.spreadsheets.batchUpdate(
          {
            spreadsheetId,
            requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
          },
          { signal },
        ),
      this.retry('sheets.batchUpdate.addSheet'),
    )
  }
}
