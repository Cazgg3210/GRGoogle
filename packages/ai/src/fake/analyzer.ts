import type {
  AiMeetingAnalyzer,
  AiResponse,
  AiUsage,
  AnalyzeMeetingInput,
  MeetingAnalysisResult,
  ReconcileInput,
  ReconcileResult,
  WeeklyDigestInput,
  WeeklyDigestResult,
} from '@smlxl/domain'
import { AI_SCHEMA_VERSION, MeetingAnalysisResultSchema } from '@smlxl/contracts'
import { metrics, MetricNames } from '@smlxl/observability'
import { PROMPT_VERSION } from '../prompts/v1/index.js'
import { FAKE_SCENARIOS, findScenario, type FakeScenario } from './scenarios.js'
import { heuristicAnalysis } from './heuristics.js'

export interface FakeAnalyzerOptions {
  scenarios?: FakeScenario[]
  /** Latencia simulada (ms) reportada en usage; no duerme. */
  latencyMs?: number
  /** Para tests: fuerza una salida concreta. */
  override?: Partial<MeetingAnalysisResult>
}

/**
 * Analizador determinístico sin red (§45.17). Escenarios por título; de lo
 * contrario, extracción heurística. Siempre valida su propia salida con el
 * schema de contratos para no divergir del contrato del modelo real.
 */
export class FakeMeetingAnalyzer implements AiMeetingAnalyzer {
  readonly providerName = 'fake'
  readonly calls: Array<{ kind: 'analyze' | 'reconcile' | 'digest'; input: unknown }> = []
  private readonly scenarios: FakeScenario[]

  constructor(private readonly options: FakeAnalyzerOptions = {}) {
    this.scenarios = options.scenarios ?? FAKE_SCENARIOS
  }

  private usage(inputChars: number, outputChars: number): AiUsage {
    return {
      provider: this.providerName,
      model: 'fake-deterministic-v1',
      promptVersion: PROMPT_VERSION,
      schemaVersion: AI_SCHEMA_VERSION,
      temperature: 0,
      inputTokens: Math.ceil(inputChars / 4),
      outputTokens: Math.ceil(outputChars / 4),
      cachedTokens: 0,
      estimatedCostUsd: 0,
      latencyMs: this.options.latencyMs ?? 5,
    }
  }

  async analyzeMeeting(input: AnalyzeMeetingInput): Promise<AiResponse<MeetingAnalysisResult>> {
    this.calls.push({ kind: 'analyze', input })
    metrics.increment(MetricNames.AI_RUNS, 1, { provider: this.providerName, kind: 'analyze' })
    const scenario = findScenario(input.meeting.title, this.scenarios)
    const base = scenario ? scenario.build(input) : heuristicAnalysis(input)
    const merged: MeetingAnalysisResult = { ...base, ...this.options.override }
    const validated = MeetingAnalysisResultSchema.parse(merged)
    const inputChars = input.segments.reduce((n, s) => n + s.text.length, 0) + (input.smartNotesText?.length ?? 0)
    return { result: validated, usage: this.usage(inputChars, JSON.stringify(validated).length) }
  }

  async reconcileActionItems(input: ReconcileInput): Promise<AiResponse<ReconcileResult>> {
    this.calls.push({ kind: 'reconcile', input })
    metrics.increment(MetricNames.AI_RUNS, 1, { provider: this.providerName, kind: 'reconcile' })
    const best = [...input.candidates].sort((a, b) => b.preScore - a.preScore)[0] ?? null
    let result: ReconcileResult
    if (!best) {
      result = { decision: 'CREATE_NEW', matchedActionItemId: null, confidence: 0.9, rationale: 'No hay candidatos en el backlog.' }
    } else if (input.extracted.statusHint === 'DONE' && best.preScore >= 0.6) {
      result = {
        decision: 'MARK_DONE_CANDIDATE',
        matchedActionItemId: best.actionItemId,
        confidence: Math.min(0.95, best.preScore + 0.1),
        rationale: `En la reunión se afirma que "${best.title}" ya se completó.`,
      }
    } else if (best.preScore >= 0.8) {
      const update = input.extracted.statusHint === 'UPDATE' || input.extracted.statusHint === 'BLOCKED' || input.extracted.dueDate !== null
      result = {
        decision: update ? 'UPDATE_EXISTING' : 'LINK_EXISTING',
        matchedActionItemId: best.actionItemId,
        confidence: Math.min(0.95, best.preScore + 0.1),
        rationale: `Coincide con ${best.externalKey} (${best.title}) por título y responsable.`,
      }
    } else if (best.preScore >= 0.6) {
      result = {
        decision: 'REQUIRES_HUMAN_REVIEW',
        matchedActionItemId: best.actionItemId,
        confidence: best.preScore,
        rationale: `Posible duplicado de ${best.externalKey}, pero la similitud es parcial.`,
      }
    } else {
      result = { decision: 'CREATE_NEW', matchedActionItemId: null, confidence: 0.85, rationale: 'Ningún candidato supera la similitud mínima.' }
    }
    return { result, usage: this.usage(JSON.stringify(input).length, JSON.stringify(result).length) }
  }

  async generateWeeklyDigest(input: WeeklyDigestInput): Promise<AiResponse<WeeklyDigestResult>> {
    this.calls.push({ kind: 'digest', input })
    metrics.increment(MetricNames.AI_RUNS, 1, { provider: this.providerName, kind: 'digest' })
    const s = input.stats
    const n = (k: string): number => s[k] ?? 0
    const result: WeeklyDigestResult = {
      executiveNarrative: [
        `Durante la semana ${input.weekLabel} se detectaron ${n('meetingsDetected')} reuniones, de las cuales ${n('meetingsProcessed')} se procesaron correctamente${n('meetingsWithoutArtifacts') > 0 ? ` y ${n('meetingsWithoutArtifacts')} no generaron artefactos` : ''}.`,
        `Se registraron ${n('newActionItems')} compromisos nuevos y se aprobaron ${n('approvedCompletions')} cierres. Quedan ${n('pendingProposals')} propuestas de cierre esperando aprobación.`,
        `Al cierre de la semana hay ${n('overdue')} tareas vencidas, ${n('noDueDate')} sin fecha y ${n('blocked')} bloqueadas.`,
      ],
      highlights: [
        ...input.newItems.slice(0, 5).map((i) => `Nuevo: ${i.title} (${i.owner ?? 'sin responsable'}${i.dueDate ? `, vence ${i.dueDate}` : ''}).`),
        ...input.proposals.slice(0, 3).map((p) => `Propuesta de cierre pendiente: ${p.title}.`),
      ].slice(0, 8),
      risksNarrative: [
        ...input.overdueItems.slice(0, 5).map((i) => `${i.title} lleva ${i.daysOverdue} día(s) vencida (${i.owner ?? 'sin responsable'}).`),
        ...input.captureIssues.slice(0, 3).map((c) => `${c.meetingTitle}: ${c.issue}.`),
      ].slice(0, 8),
    }
    return { result, usage: this.usage(JSON.stringify(input).length, JSON.stringify(result).length) }
  }
}
