import { describe, expect, it } from 'vitest'
import type { sheets_v4 } from 'googleapis'
import { ImpersonatedAuthFactory } from '../auth/dwd.js'
import { GoogleSheetsAdapter, columnLetter, planUpsert, type SheetsApiClient } from './sheets.js'

const auth = new ImpersonatedAuthFactory({
  credentials: { client_email: 'sa@proj.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----\n' },
  allowedDomain: 'smlxl.mx',
})

describe('columnLetter', () => {
  it('convierte índices a letras', () => {
    expect(columnLetter(0)).toBe('A')
    expect(columnLetter(25)).toBe('Z')
    expect(columnLetter(26)).toBe('AA')
    expect(columnLetter(27)).toBe('AB')
  })
})

describe('planUpsert', () => {
  it('actualiza por clave y agrega nuevas sin depender de la posición', () => {
    const plan = planUpsert({
      existingHeader: ['UUID', 'Estado', 'Actividad'],
      existingRows: [
        ['id-2', 'PENDING', 'Tarea 2'],
        ['id-1', 'PENDING', 'Tarea 1'],
      ],
      keyColumn: 'UUID',
      columns: ['UUID', 'Estado', 'Actividad'],
      rows: [
        { key: 'id-1', values: { Estado: 'COMPLETED', Actividad: 'Tarea 1' } },
        { key: 'id-3', values: { Estado: 'PENDING', Actividad: 'Tarea 3' } },
      ],
    })
    expect(plan.headerNeedsWrite).toBe(false)
    expect(plan.updates).toEqual([{ rowNumber: 3, values: ['id-1', 'COMPLETED', 'Tarea 1'] }])
    expect(plan.inserts).toEqual([['id-3', 'PENDING', 'Tarea 3']])
  })

  it('escribe encabezado cuando la hoja está vacía o cambió', () => {
    const plan = planUpsert({ existingHeader: [], existingRows: [], keyColumn: 'UUID', columns: ['Estado'], rows: [{ key: 'k', values: { Estado: 'X' } }] })
    expect(plan.headerNeedsWrite).toBe(true)
    expect(plan.header).toEqual(['UUID', 'Estado'])
    expect(plan.inserts).toEqual([['k', 'X']])
  })
})

describe('GoogleSheetsAdapter', () => {
  it('crea la hoja si falta, actualiza por clave y agrega nuevas', async () => {
    const calls: string[] = []
    const batch: sheets_v4.Schema$ValueRange[] = []
    let appended: unknown[][] = []
    const client: SheetsApiClient = {
      spreadsheets: {
        get: async () => { calls.push('get'); return { data: { sheets: [{ properties: { title: 'Otra' } }] } } },
        batchUpdate: async (p) => { calls.push(`addSheet:${p.requestBody?.requests?.[0]?.addSheet?.properties?.title}`); return { data: {} } },
        values: {
          get: async () => { calls.push('values.get'); return { data: { values: [['UUID', 'Estado'], ['id-1', 'PENDING']] } } },
          update: async () => ({ data: {} }),
          append: async (p) => { calls.push('append'); appended = (p.requestBody?.values ?? []) as unknown[][]; return { data: {} } },
          batchUpdate: async (p) => { calls.push('values.batchUpdate'); batch.push(...(p.requestBody?.data ?? [])); return { data: {} } },
        },
      },
    }
    const adapter = new GoogleSheetsAdapter({ auth, actingUserEmail: 'seguimiento@smlxl.mx', clientFactory: () => client })
    const res = await adapter.upsertRows({
      spreadsheetId: 'sheet-1',
      sheetName: 'Pendientes',
      keyColumn: 'UUID',
      columns: ['UUID', 'Estado'],
      rows: [
        { key: 'id-1', values: { Estado: 'COMPLETED' } },
        { key: 'id-9', values: { Estado: 'PENDING' } },
      ],
    })
    expect(res).toEqual({ inserted: 1, updated: 1 })
    expect(calls).toEqual(['get', 'addSheet:Pendientes', 'values.get', 'values.batchUpdate', 'append'])
    expect(batch).toEqual([{ range: "'Pendientes'!A2:B2", values: [['id-1', 'COMPLETED']] }])
    expect(appended).toEqual([['id-9', 'PENDING']])
  })

  it('mapea errores a SHEETS_SYNC_FAILED', async () => {
    const client: SheetsApiClient = {
      spreadsheets: {
        get: async () => { const e = new Error('nope') as Error & { response: { status: number } }; e.response = { status: 403 }; throw e },
        batchUpdate: async () => ({ data: {} }),
        values: { get: async () => ({ data: {} }), update: async () => ({ data: {} }), append: async () => ({ data: {} }), batchUpdate: async () => ({ data: {} }) },
      },
    }
    const adapter = new GoogleSheetsAdapter({ auth, actingUserEmail: 'seguimiento@smlxl.mx', clientFactory: () => client, retry: { retries: 0 } })
    await expect(adapter.upsertRows({ spreadsheetId: 's', sheetName: 'P', keyColumn: 'UUID', columns: [], rows: [] })).rejects.toMatchObject({ code: 'SHEETS_SYNC_FAILED' })
  })
})
