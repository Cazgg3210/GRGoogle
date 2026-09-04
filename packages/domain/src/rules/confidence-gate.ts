/**
 * Confidence gate (§10.2 paso 7). Umbrales configurables; valores iniciales del documento.
 */
export interface ConfidenceThresholds {
  /** >= autoAccept: autoaceptar campos no críticos. */
  autoAccept: number
  /** >= proposal y < autoAccept: crear como propuesta con indicador. */
  proposal: number
}

export const DEFAULT_CONFIDENCE_THRESHOLDS: ConfidenceThresholds = {
  autoAccept: 0.9,
  proposal: 0.7,
}

export const ConfidenceBand = {
  AUTO_ACCEPT: 'AUTO_ACCEPT',
  PROPOSAL: 'PROPOSAL',
  REVIEW: 'REVIEW',
} as const
export type ConfidenceBand = (typeof ConfidenceBand)[keyof typeof ConfidenceBand]

export function confidenceBand(
  confidence: number,
  thresholds: ConfidenceThresholds = DEFAULT_CONFIDENCE_THRESHOLDS,
): ConfidenceBand {
  if (!Number.isFinite(confidence)) return ConfidenceBand.REVIEW
  if (confidence >= thresholds.autoAccept) return ConfidenceBand.AUTO_ACCEPT
  if (confidence >= thresholds.proposal) return ConfidenceBand.PROPOSAL
  return ConfidenceBand.REVIEW
}

export function validateThresholds(t: ConfidenceThresholds): string[] {
  const errors: string[] = []
  if (t.autoAccept <= 0 || t.autoAccept > 1) errors.push('autoAccept debe estar en (0, 1]')
  if (t.proposal <= 0 || t.proposal > 1) errors.push('proposal debe estar en (0, 1]')
  if (t.proposal >= t.autoAccept) errors.push('proposal debe ser menor que autoAccept')
  return errors
}
