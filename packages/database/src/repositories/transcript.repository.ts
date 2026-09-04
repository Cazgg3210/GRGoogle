import type { Id, Transcript, TranscriptRepository, TranscriptSegment } from '@smlxl/domain'
import { segmentToDb, toSegment, toTranscript, transcriptToDb } from '../mappers/meetings.js'
import { BaseRepository } from './base.js'

export class PrismaTranscriptRepository extends BaseRepository implements TranscriptRepository {
  async findByMeeting(meetingId: Id): Promise<Transcript[]> {
    const rows = await this.db.transcript.findMany({ where: { meetingId }, orderBy: { createdAt: 'asc' } })
    return rows.map(toTranscript)
  }

  async findByChecksum(meetingId: Id, checksum: string): Promise<Transcript | null> {
    const row = await this.db.transcript.findUnique({
      where: { meetingId_ingestionChecksum: { meetingId, ingestionChecksum: checksum } },
    })
    return row ? toTranscript(row) : null
  }

  /** Upsert del transcript y reemplazo completo de sus segmentos. */
  async save(transcript: Transcript, segments: TranscriptSegment[]): Promise<Transcript> {
    const { id, ...rest } = transcriptToDb(transcript)
    const row = await this.db.transcript.upsert({
      where: { id: transcript.id },
      create: { id, ...rest },
      update: rest,
    })
    await this.db.transcriptSegment.deleteMany({ where: { transcriptId: transcript.id } })
    if (segments.length > 0) {
      await this.db.transcriptSegment.createMany({
        data: segments.map((s) => segmentToDb({ ...s, transcriptId: transcript.id })),
      })
    }
    return toTranscript(row)
  }

  async listSegments(transcriptId: Id): Promise<TranscriptSegment[]> {
    const rows = await this.db.transcriptSegment.findMany({
      where: { transcriptId },
      orderBy: { sequence: 'asc' },
    })
    return rows.map(toSegment)
  }

  async findSegments(ids: Id[]): Promise<TranscriptSegment[]> {
    if (ids.length === 0) return []
    const rows = await this.db.transcriptSegment.findMany({
      where: { id: { in: ids } },
      orderBy: [{ transcriptId: 'asc' }, { sequence: 'asc' }],
    })
    return rows.map(toSegment)
  }

  /**
   * Retención (§28): elimina transcripts (y por cascada sus segmentos) cuyo
   * `retainedUntil` venció antes de `date`. Devuelve cuántos borró.
   */
  async deleteRawOlderThan(date: Date): Promise<number> {
    const result = await this.db.transcript.deleteMany({
      where: { retainedUntil: { not: null, lt: date } },
    })
    return result.count
  }
}
