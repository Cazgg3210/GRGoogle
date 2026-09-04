import { ArtifactStatus, MeetingProcessingStatus } from '../enums.js'
import { DomainError, DomainErrorCode } from '../errors.js'

/** Transiciones válidas del estado de procesamiento de reunión (§32). */
const TRANSITIONS: Record<MeetingProcessingStatus, readonly MeetingProcessingStatus[]> = {
  DISCOVERED: [
    MeetingProcessingStatus.WAITING_FOR_ARTIFACTS,
    MeetingProcessingStatus.ARTIFACTS_AVAILABLE,
    MeetingProcessingStatus.EXCLUDED,
    MeetingProcessingStatus.FAILED,
  ],
  WAITING_FOR_ARTIFACTS: [
    MeetingProcessingStatus.ARTIFACTS_AVAILABLE,
    MeetingProcessingStatus.EXCLUDED,
    MeetingProcessingStatus.FAILED,
    MeetingProcessingStatus.COMPLETED, // sin artefactos alcanzables: cerrado como no capturable
  ],
  ARTIFACTS_AVAILABLE: [
    MeetingProcessingStatus.INGESTING,
    MeetingProcessingStatus.EXCLUDED,
    MeetingProcessingStatus.FAILED,
  ],
  INGESTING: [MeetingProcessingStatus.INGESTED, MeetingProcessingStatus.FAILED],
  INGESTED: [
    MeetingProcessingStatus.ANALYZING,
    MeetingProcessingStatus.EXCLUDED,
    MeetingProcessingStatus.COMPLETED,
    MeetingProcessingStatus.FAILED,
  ],
  ANALYZING: [MeetingProcessingStatus.ANALYZED, MeetingProcessingStatus.FAILED],
  ANALYZED: [
    MeetingProcessingStatus.REVIEW_REQUIRED,
    MeetingProcessingStatus.COMPLETED,
    MeetingProcessingStatus.ANALYZING, // reproceso
  ],
  REVIEW_REQUIRED: [MeetingProcessingStatus.COMPLETED, MeetingProcessingStatus.ANALYZING],
  COMPLETED: [MeetingProcessingStatus.ANALYZING, MeetingProcessingStatus.EXCLUDED],
  FAILED: [
    MeetingProcessingStatus.ARTIFACTS_AVAILABLE,
    MeetingProcessingStatus.INGESTING,
    MeetingProcessingStatus.ANALYZING,
    MeetingProcessingStatus.EXCLUDED,
    MeetingProcessingStatus.WAITING_FOR_ARTIFACTS,
  ],
  EXCLUDED: [MeetingProcessingStatus.DISCOVERED],
}

export function canTransitionProcessing(
  from: MeetingProcessingStatus,
  to: MeetingProcessingStatus,
): boolean {
  return from !== to && TRANSITIONS[from].includes(to)
}

export function assertProcessingTransition(
  from: MeetingProcessingStatus,
  to: MeetingProcessingStatus,
): void {
  if (!canTransitionProcessing(from, to)) {
    throw new DomainError(
      DomainErrorCode.CONFLICT,
      `Transición de procesamiento no permitida: ${from} -> ${to}`,
      { details: { from, to } },
    )
  }
}

export function artifactIsUsable(status: ArtifactStatus): boolean {
  return status === ArtifactStatus.AVAILABLE || status === ArtifactStatus.INGESTED
}

/** Categorías de "Calidad de captura" (§20.6). */
export const CaptureQualityBucket = {
  WITH_TRANSCRIPT: 'WITH_TRANSCRIPT',
  WITH_SMART_NOTES: 'WITH_SMART_NOTES',
  TRANSCRIPT_ONLY: 'TRANSCRIPT_ONLY',
  NO_ARTIFACT: 'NO_ARTIFACT',
  EXTERNAL_HOST_UNAVAILABLE: 'EXTERNAL_HOST_UNAVAILABLE',
  API_ERROR: 'API_ERROR',
} as const
export type CaptureQualityBucket = (typeof CaptureQualityBucket)[keyof typeof CaptureQualityBucket]

export function captureQualityBuckets(m: {
  transcriptStatus: ArtifactStatus
  smartNotesStatus: ArtifactStatus
  processingStatus: MeetingProcessingStatus
  isExternalHost: boolean
}): CaptureQualityBucket[] {
  const out: CaptureQualityBucket[] = []
  const t = artifactIsUsable(m.transcriptStatus)
  const s = artifactIsUsable(m.smartNotesStatus)
  if (t) out.push(CaptureQualityBucket.WITH_TRANSCRIPT)
  if (s) out.push(CaptureQualityBucket.WITH_SMART_NOTES)
  if (t && !s) out.push(CaptureQualityBucket.TRANSCRIPT_ONLY)
  if (
    m.transcriptStatus === ArtifactStatus.UNAVAILABLE_EXTERNAL_HOST ||
    m.smartNotesStatus === ArtifactStatus.UNAVAILABLE_EXTERNAL_HOST
  )
    out.push(CaptureQualityBucket.EXTERNAL_HOST_UNAVAILABLE)
  else if (!t && !s) out.push(CaptureQualityBucket.NO_ARTIFACT)
  if (
    m.processingStatus === MeetingProcessingStatus.FAILED ||
    m.transcriptStatus === ArtifactStatus.FAILED ||
    m.smartNotesStatus === ArtifactStatus.FAILED
  )
    out.push(CaptureQualityBucket.API_ERROR)
  return out
}
