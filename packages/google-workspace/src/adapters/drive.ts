import { google, type docs_v1, type drive_v3 } from 'googleapis'
import type { DrivePort } from '@smlxl/domain'
import { DomainError, DomainErrorCode } from '@smlxl/domain'
import { GOOGLE_SCOPES } from '../scopes.js'
import { withGoogleRetry } from '../http/retry.js'
import type { AuthClient, GoogleAdapterDeps } from './shared.js'

/**
 * Google Docs/Drive (§15): sólo para exportar el texto de Smart Notes cuando
 * Meet API entrega únicamente el `docsDestination`. Preferimos documents.get
 * (estructura) y caemos a files.export text/plain.
 */
export interface DocsApiClient {
  documents: {
    get(params: docs_v1.Params$Resource$Documents$Get, options?: { signal?: AbortSignal }): Promise<{ data: docs_v1.Schema$Document }>
  }
}

export interface DriveApiClient {
  files: {
    export(params: drive_v3.Params$Resource$Files$Export, options?: { signal?: AbortSignal }): Promise<{ data: unknown }>
  }
}

const SCOPES = [GOOGLE_SCOPES.drive.DOCUMENTS_READONLY, GOOGLE_SCOPES.drive.READONLY]

/** Concatena el texto de un documento de Google Docs (párrafos y celdas de tablas). */
export function extractDocumentText(doc: docs_v1.Schema$Document): string {
  const lines: string[] = []
  const walk = (elements: docs_v1.Schema$StructuralElement[] | undefined): void => {
    for (const el of elements ?? []) {
      if (el.paragraph) {
        const text = (el.paragraph.elements ?? [])
          .map((pe) => pe.textRun?.content ?? '')
          .join('')
          .replace(/\n$/, '')
        if (text.trim().length > 0) lines.push(el.paragraph.bullet ? `- ${text}` : text)
      }
      if (el.table) {
        for (const row of el.table.tableRows ?? []) {
          const cells: string[] = []
          for (const cell of row.tableCells ?? []) {
            const before = lines.length
            walk(cell.content)
            cells.push(lines.splice(before).join(' '))
          }
          if (cells.some((c) => c.trim())) lines.push(cells.join(' | '))
        }
      }
    }
  }
  walk(doc.body?.content)
  return lines.join('\n').trim()
}

export interface DriveAdapterDeps extends GoogleAdapterDeps {
  docsFactory?: (auth: AuthClient) => DocsApiClient
  driveFactory?: (auth: AuthClient) => DriveApiClient
}

export class GoogleDriveAdapter implements DrivePort {
  private readonly docsFactory: (auth: AuthClient) => DocsApiClient
  private readonly driveFactory: (auth: AuthClient) => DriveApiClient

  constructor(private readonly deps: DriveAdapterDeps) {
    this.docsFactory = deps.docsFactory ?? ((auth) => google.docs({ version: 'v1', auth }) as unknown as DocsApiClient)
    this.driveFactory = deps.driveFactory ?? ((auth) => google.drive({ version: 'v3', auth }) as unknown as DriveApiClient)
  }

  async exportDocumentText(documentId: string, asUser: string): Promise<string | null> {
    const auth = this.deps.auth.for(asUser, SCOPES)
    try {
      const res = await withGoogleRetry((signal) => this.docsFactory(auth).documents.get({ documentId }, { signal }), {
        ...this.deps.retry,
        operation: 'docs.documents.get',
      })
      const text = extractDocumentText(res.data)
      if (text) return text
    } catch (err) {
      if (err instanceof DomainError && err.code === DomainErrorCode.GOOGLE_NOT_FOUND) return null
      // Cualquier otro error → intentamos el fallback de Drive.
    }
    try {
      const res = await withGoogleRetry(
        (signal) => this.driveFactory(auth).files.export({ fileId: documentId, mimeType: 'text/plain' }, { signal }),
        { ...this.deps.retry, operation: 'drive.files.export' },
      )
      const data = res.data
      if (typeof data === 'string') return data.trim() || null
      if (data instanceof Buffer) return data.toString('utf8').trim() || null
      return null
    } catch (err) {
      if (err instanceof DomainError && err.code === DomainErrorCode.GOOGLE_NOT_FOUND) return null
      throw err
    }
  }
}
