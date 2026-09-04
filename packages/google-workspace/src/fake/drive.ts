import type { DrivePort } from '@smlxl/domain'
import { loadDefaultFixtures, type FakeGoogleFixtures } from './fixtures.js'

/** Fake de Drive/Docs: devuelve el texto de `fixtures.documents[documentId]`. */
export class FakeDriveAdapter implements DrivePort {
  readonly documents: Record<string, string>

  constructor(fixtures?: FakeGoogleFixtures | Record<string, string>) {
    if (!fixtures) this.documents = loadDefaultFixtures().documents
    else if ('documents' in fixtures && typeof fixtures.documents === 'object')
      this.documents = (fixtures as FakeGoogleFixtures).documents
    else this.documents = fixtures as Record<string, string>
  }

  async exportDocumentText(documentId: string, _asUser?: string): Promise<string | null> {
    return this.documents[documentId] ?? null
  }
}
