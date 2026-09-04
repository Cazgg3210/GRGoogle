import { z } from 'zod'
import type {
  ExtractedActionItem,
  ExtractedDecision,
  MeetingAnalysisResult,
  ReconcileResult,
  WeeklyDigestResult,
} from '@smlxl/domain'

/**
 * Structured output obligatorio (§10.3): toda respuesta IA que modifique datos
 * se valida contra estos schemas. Nunca se parsea texto libre con regex.
 */
export const AI_SCHEMA_VERSION = '1.0.0'

export const EvidenceQuoteSchema = z.object({
  text: z.string().min(1).max(2000),
  speaker: z.string().max(200).optional(),
  startTime: z.string().max(40).optional(),
  endTime: z.string().max(40).optional(),
  segmentId: z.string().optional(),
})

const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha en formato YYYY-MM-DD')

export const ExtractedActionItemSchema = z.object({
  title: z.string().min(3).max(300),
  description: z.string().max(4000).optional(),
  owner: z
    .object({
      name: z.string().max(200).optional(),
      email: z.string().email().optional(),
      evidence: z.string().max(2000),
    })
    .nullable(),
  dueDate: IsoDateSchema.nullable(),
  dueDateTextOriginal: z.string().max(200).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).nullable(),
  statusHint: z.enum(['NEW', 'UPDATE', 'DONE', 'BLOCKED', 'UNKNOWN']),
  evidence: z.array(EvidenceQuoteSchema).min(1).max(10),
  confidence: z.number().min(0).max(1),
  relatedOpenActionKey: z.string().max(40).nullable().optional(),
  recurringHint: z.boolean().optional(),
  projectHint: z.string().max(200).nullable().optional(),
}) satisfies z.ZodType<ExtractedActionItem>

export const ExtractedDecisionSchema = z.object({
  description: z.string().min(3).max(2000),
  decidedBy: z.string().max(200).nullable(),
  effectiveDate: IsoDateSchema.nullable(),
  evidence: z.array(EvidenceQuoteSchema).min(1).max(10),
  confidence: z.number().min(0).max(1),
}) satisfies z.ZodType<ExtractedDecision>

export const MeetingAnalysisResultSchema = z.object({
  schemaVersion: z.string(),
  language: z.object({
    detectedLanguageCode: z.string().min(2).max(10),
    mixedLanguageDetected: z.boolean(),
  }),
  topics: z.array(z.object({ title: z.string().max(200), subtopics: z.array(z.string().max(200)).max(20) })).max(30),
  projectHint: z.string().max(200).nullable(),
  sensitivityHint: z.enum(['NORMAL', 'RESTRICTED', 'LEGAL', 'EXECUTIVE']),
  summary: z.object({
    executive: z.array(z.string().max(500)).min(1).max(7),
    detailed: z.string().max(20000),
    attentionPoints: z.array(z.string().max(500)).max(20),
    risks: z.array(z.string().max(500)).max(20),
    openQuestions: z.array(z.string().max(500)).max(20),
  }),
  decisions: z.array(ExtractedDecisionSchema).max(50),
  actionItems: z.array(ExtractedActionItemSchema).max(100),
  extractionConfidence: z.number().min(0).max(1),
}) satisfies z.ZodType<MeetingAnalysisResult>

export const ReconcileResultSchema = z.object({
  decision: z.enum([
    'CREATE_NEW',
    'LINK_EXISTING',
    'UPDATE_EXISTING',
    'MARK_DONE_CANDIDATE',
    'REOPEN_CANDIDATE',
    'REQUIRES_HUMAN_REVIEW',
  ]),
  matchedActionItemId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(2000),
}) satisfies z.ZodType<ReconcileResult>

export const WeeklyDigestResultSchema = z.object({
  executiveNarrative: z.array(z.string().max(1000)).max(10),
  highlights: z.array(z.string().max(500)).max(20),
  risksNarrative: z.array(z.string().max(500)).max(20),
}) satisfies z.ZodType<WeeklyDigestResult>

export type ExtractedActionItemDto = z.infer<typeof ExtractedActionItemSchema>
export type MeetingAnalysisResultDto = z.infer<typeof MeetingAnalysisResultSchema>
