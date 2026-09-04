import type { WeeklyDigestResult } from '@smlxl/domain'

/** Payload persistido del digest semanal (§18.3, secciones A–G). */
export interface DigestItem {
  id: string
  key: string
  title: string
  owner: string | null
  area: string | null
  project: string | null
  priority: string
  status: string
  dueDate: string | null
  url: string
}

export interface DigestGroup {
  label: string
  items: DigestItem[]
}

export interface WeeklyDigestPayload {
  version: 1
  weekLabel: string
  weekStart: string
  weekEnd: string
  generatedAt: string
  timezone: string
  /** A. Resumen ejecutivo */
  summary: {
    meetingsDetected: number
    meetingsProcessed: number
    meetingsWithoutArtifacts: number
    meetingsWithError: number
    newActionItems: number
    pendingProposals: number
    approvedCompletions: number
    overdue: number
    noDueDate: number
    blocked: number
  }
  /** B. Nuevos compromisos de la semana */
  newCommitments: { items: DigestItem[]; byOwner: DigestGroup[]; byArea: DigestGroup[]; byPriority: DigestGroup[] }
  /** C. Backlog acumulado (abiertos anteriores a la semana) */
  backlog: Array<DigestItem & { daysOpen: number; lastMentionedAt: string | null; lastProgressAt: string | null }>
  /** D. Riesgos */
  risks: {
    overdue: Array<DigestItem & { daysOverdue: number }>
    noOwner: DigestItem[]
    noDueDate: DigestItem[]
    blocked: DigestItem[]
    repeatedWithoutProgress: Array<DigestItem & { mentions: number }>
    captureIssues: Array<{ meetingId: string; title: string; startAt: string; issue: string; url: string }>
  }
  /** E. Cambios detectados */
  changes: Array<{ actionItemId: string; key: string; title: string; type: 'DUE_DATE' | 'OWNER' | 'PRIORITY' | 'POSSIBLE_COMPLETION' | 'REOPENED' | 'POSSIBLE_DUPLICATE'; detail: string; at: string; url: string }>
  /** F. Bandeja de aprobación */
  approvalInbox: Array<DigestItem & { proposalId: string; proposedBy: string; reason: string }>
  /** G. Próxima semana */
  nextWeek: { dueSoon: DigestItem[]; recurring: DigestItem[]; highPriority: DigestItem[] }
  narrative: WeeklyDigestResult | null
}
