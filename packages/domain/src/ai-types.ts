import type { ActionItemPriority, ActionItemStatus, ReconcileDecision } from './enums.js'
import type { EvidenceQuote, Id } from './entities.js'

/**
 * Tipos de entrada/salida del motor IA (§10, §11). El dominio define la forma;
 * `@smlxl/contracts` provee los schemas Zod que validan la salida del modelo.
 */

export interface AnalyzeMeetingParticipant {
  displayName: string
  email: string | null
  isInternal: boolean
  internalUserId: Id | null
}

export interface AnalyzeMeetingSegment {
  id: Id | null
  sequence: number
  speakerLabel: string
  text: string
  startTime: string | null
  endTime: string | null
}

export interface OpenActionContext {
  id: Id
  externalKey: string
  title: string
  ownerName: string | null
  status: ActionItemStatus
  dueDate: string | null
  projectName: string | null
}

export interface AnalyzeMeetingInput {
  meeting: {
    id: Id
    title: string
    startAt: string
    endAt: string | null
    organizerEmail: string | null
    reportedLanguageCode: string | null
  }
  participants: AnalyzeMeetingParticipant[]
  segments: AnalyzeMeetingSegment[]
  smartNotesText: string | null
  /** Contexto compacto de acciones abiertas relacionadas (no todo el backlog — §35). */
  openActions: OpenActionContext[]
  companyDomain: string
  /** Fecha de referencia para resolver fechas relativas ("el próximo martes"). */
  referenceDate: string
  timezone: string
}

export interface ExtractedActionItem {
  title: string
  description?: string
  owner: {
    name?: string
    email?: string
    evidence: string
  } | null
  dueDate: string | null
  dueDateTextOriginal?: string
  priority: ActionItemPriority | null
  statusHint: 'NEW' | 'UPDATE' | 'DONE' | 'BLOCKED' | 'UNKNOWN'
  evidence: EvidenceQuote[]
  confidence: number
  /** Si el modelo detecta que se refiere a una acción abierta del contexto. */
  relatedOpenActionKey?: string | null
  recurringHint?: boolean
  projectHint?: string | null
}

export interface ExtractedDecision {
  description: string
  decidedBy: string | null
  effectiveDate: string | null
  evidence: EvidenceQuote[]
  confidence: number
}

export interface MeetingAnalysisResult {
  schemaVersion: string
  language: {
    detectedLanguageCode: string
    mixedLanguageDetected: boolean
  }
  topics: Array<{ title: string; subtopics: string[] }>
  projectHint: string | null
  sensitivityHint: 'NORMAL' | 'RESTRICTED' | 'LEGAL' | 'EXECUTIVE'
  summary: {
    executive: string[]
    detailed: string
    attentionPoints: string[]
    risks: string[]
    openQuestions: string[]
  }
  decisions: ExtractedDecision[]
  actionItems: ExtractedActionItem[]
  /** Calidad/confianza global de la extracción (§12.5). */
  extractionConfidence: number
}

export interface ReconcileCandidate {
  actionItemId: Id
  externalKey: string
  title: string
  description: string | null
  ownerName: string | null
  status: ActionItemStatus
  dueDate: string | null
  projectName: string | null
  /** Puntaje determinístico previo (full-text + reglas). */
  preScore: number
}

export interface ReconcileInput {
  extracted: ExtractedActionItem
  candidates: ReconcileCandidate[]
  meetingTitle: string
  referenceDate: string
}

export interface ReconcileResult {
  decision: ReconcileDecision
  matchedActionItemId: Id | null
  confidence: number
  rationale: string
}

export interface WeeklyDigestInput {
  weekLabel: string
  weekStart: string
  weekEnd: string
  stats: Record<string, number>
  newItems: Array<{
    key: string
    title: string
    owner: string | null
    area: string | null
    priority: string
    dueDate: string | null
  }>
  overdueItems: Array<{ key: string; title: string; owner: string | null; daysOverdue: number }>
  proposals: Array<{ key: string; title: string; reason: string }>
  captureIssues: Array<{ meetingTitle: string; issue: string }>
}

export interface WeeklyDigestResult {
  executiveNarrative: string[]
  highlights: string[]
  risksNarrative: string[]
}

export interface AiUsage {
  provider: string
  model: string
  promptVersion: string
  schemaVersion: string
  temperature: number | null
  inputTokens: number | null
  outputTokens: number | null
  cachedTokens: number | null
  estimatedCostUsd: number | null
  latencyMs: number
}

export interface AiResponse<T> {
  result: T
  usage: AiUsage
}

/** Interfaz principal del motor IA (§11). Implementaciones: Gemini y Fake. */
export interface AiMeetingAnalyzer {
  readonly providerName: string
  analyzeMeeting(input: AnalyzeMeetingInput): Promise<AiResponse<MeetingAnalysisResult>>
  reconcileActionItems(input: ReconcileInput): Promise<AiResponse<ReconcileResult>>
  generateWeeklyDigest(input: WeeklyDigestInput): Promise<AiResponse<WeeklyDigestResult>>
}
