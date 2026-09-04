import type { ZodTypeAny, z } from 'zod'
import {
  DomainError,
  DomainErrorCode,
  isDomainError,
  tokenJaccard,
  type AiMeetingAnalyzer,
  type AiResponse,
  type AiUsage,
  type AnalyzeMeetingInput,
  type MeetingAnalysisResult,
  type ReconcileInput,
  type ReconcileResult,
  type WeeklyDigestInput,
  type WeeklyDigestResult,
} from '@smlxl/domain'
import {
  AI_SCHEMA_VERSION,
  MeetingAnalysisResultSchema,
  ReconcileResultSchema,
  WeeklyDigestResultSchema,
} from '@smlxl/contracts'
import { metrics, MetricNames, type Logger } from '@smlxl/observability'
import { zodToGeminiSchema, type JsonSchema } from '../json-schema.js'
import {
  ANALYZE_SYSTEM_PROMPT,
  CONSOLIDATE_SYSTEM_PROMPT,
  DIGEST_SYSTEM_PROMPT,
  PROMPT_VERSION,
  RECONCILE_SYSTEM_PROMPT,
  buildAnalyzeUserPrompt,
  buildConsolidateUserPrompt,
  buildDigestUserPrompt,
  buildReconcileUserPrompt,
} from '../prompts/v1/index.js'

/**
 * Adapter Gemini (Google Gen AI SDK, §11) con structured output (§10.3),
 * timeout, reintentos con backoff en 429/5xx, reparación ante salida inválida,
 * registro de uso/costo (§35) y chunking para reuniones largas.
 *
 * El cliente se abstrae (`GenAiClientLike`) para poder inyectar un mock en tests;
 * `GoogleGenAI` lo satisface estructuralmente.
 */
export interface GenAiUsageMetadata {
  promptTokenCount?: number
  candidatesTokenCount?: number
  cachedContentTokenCount?: number
  thoughtsTokenCount?: number
  totalTokenCount?: number
}

export interface GenAiResponseLike {
  text?: string | undefined
  usageMetadata?: GenAiUsageMetadata | undefined
  promptFeedback?: { blockReason?: string | undefined; blockReasonMessage?: string | undefined } | undefined
}

export interface GenAiGenerateParams {
  model: string
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>
  config?: {
    systemInstruction?: string
    temperature?: number
    responseMimeType?: string
    responseJsonSchema?: unknown
    abortSignal?: AbortSignal
    httpOptions?: { timeout?: number }
    maxOutputTokens?: number
  }
}

export interface GenAiClientLike {
  models: { generateContent(params: GenAiGenerateParams): Promise<GenAiResponseLike> }
}

export interface ModelPrice {
  inputPer1M: number
  outputPer1M: number
  cachedPer1M: number | null
}

/** Tabla de precios (USD por millón de tokens); aproximada y configurable. Desconocido → costo null. */
export const PRICE_TABLE_USD_PER_1M: Record<string, ModelPrice> = {
  'gemini-2.5-flash': { inputPer1M: 0.3, outputPer1M: 2.5, cachedPer1M: 0.075 },
  'gemini-2.5-flash-lite': { inputPer1M: 0.1, outputPer1M: 0.4, cachedPer1M: 0.025 },
  'gemini-2.5-pro': { inputPer1M: 1.25, outputPer1M: 10, cachedPer1M: 0.31 },
  'gemini-2.0-flash': { inputPer1M: 0.1, outputPer1M: 0.4, cachedPer1M: 0.025 },
}

export function estimateCostUsd(
  model: string,
  usage: { inputTokens: number | null; outputTokens: number | null; cachedTokens: number | null },
  table: Record<string, ModelPrice> = PRICE_TABLE_USD_PER_1M,
): number | null {
  const key = Object.keys(table).find((k) => model === k || model.startsWith(`${k}-`)) ?? null
  if (!key) return null
  const price = table[key]
  if (!price) return null
  const input = usage.inputTokens ?? 0
  const cached = usage.cachedTokens ?? 0
  const output = usage.outputTokens ?? 0
  const billableInput = Math.max(0, input - cached)
  const cost =
    (billableInput / 1_000_000) * price.inputPer1M +
    (cached / 1_000_000) * (price.cachedPer1M ?? price.inputPer1M) +
    (output / 1_000_000) * price.outputPer1M
  return Math.round(cost * 1_000_000) / 1_000_000
}

export interface GeminiAnalyzerOptions {
  client: GenAiClientLike
  model: string
  temperature?: number
  timeoutMs?: number
  maxRetries?: number
  baseDelayMs?: number
  priceTable?: Record<string, ModelPrice>
  /** Umbral de caracteres para activar chunking (§35). */
  chunkThresholdChars?: number
  chunkSizeChars?: number
  logger?: Logger
  sleep?: (ms: number) => Promise<void>
  random?: () => number
}

interface CallUsage {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  latencyMs: number
  calls: number
}

function emptyUsage(): CallUsage {
  return { inputTokens: 0, outputTokens: 0, cachedTokens: 0, latencyMs: 0, calls: 0 }
}

function addUsage(acc: CallUsage, meta: GenAiUsageMetadata | undefined, latencyMs: number): void {
  acc.inputTokens += meta?.promptTokenCount ?? 0
  acc.outputTokens += (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0)
  acc.cachedTokens += meta?.cachedContentTokenCount ?? 0
  acc.latencyMs += latencyMs
  acc.calls += 1
}

function stripFences(text: string): string {
  const trimmed = text.trim()
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  return fence?.[1] ?? trimmed
}

function providerStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null
  const e = err as { status?: unknown; code?: unknown; response?: { status?: unknown } }
  for (const c of [e.status, e.response?.status, e.code]) {
    const n = typeof c === 'string' ? Number(c) : c
    if (typeof n === 'number' && Number.isFinite(n) && n >= 100 && n < 600) return n
  }
  return null
}

function isAbort(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const e = err as { name?: string; message?: string }
  return e.name === 'AbortError' || /abort|timeout|timed out/i.test(e.message ?? '')
}

export function mapGeminiError(err: unknown): DomainError {
  if (isDomainError(err)) return err
  const status = providerStatus(err)
  const message = err instanceof Error ? err.message : 'Error del proveedor IA'
  if (status === 429) {
    return new DomainError(DomainErrorCode.GOOGLE_RATE_LIMIT, 'Límite de cuota de Gemini', { retryable: true, details: { status }, cause: err })
  }
  if (isAbort(err) && status === null) {
    return new DomainError(DomainErrorCode.AI_PROVIDER_ERROR, 'Timeout llamando a Gemini', { retryable: true, details: { reason: 'timeout' }, cause: err })
  }
  if (status !== null && status >= 500) {
    return new DomainError(DomainErrorCode.AI_PROVIDER_ERROR, `Gemini no disponible (${status})`, { retryable: true, details: { status }, cause: err })
  }
  if (status === 401 || status === 403) {
    return new DomainError(DomainErrorCode.AI_PROVIDER_ERROR, 'Credenciales de Gemini rechazadas', { retryable: false, details: { status }, cause: err })
  }
  return new DomainError(DomainErrorCode.AI_PROVIDER_ERROR, `Error de Gemini: ${message}`, { retryable: false, details: { status }, cause: err })
}

export class GeminiMeetingAnalyzer implements AiMeetingAnalyzer {
  readonly providerName = 'gemini'
  private readonly temperature: number
  private readonly timeoutMs: number
  private readonly maxRetries: number
  private readonly baseDelayMs: number
  private readonly chunkThresholdChars: number
  private readonly chunkSizeChars: number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly random: () => number

  constructor(private readonly options: GeminiAnalyzerOptions) {
    this.temperature = options.temperature ?? 0.2
    this.timeoutMs = options.timeoutMs ?? 90_000
    this.maxRetries = options.maxRetries ?? 3
    this.baseDelayMs = options.baseDelayMs ?? 1_000
    this.chunkThresholdChars = options.chunkThresholdChars ?? 60_000
    this.chunkSizeChars = options.chunkSizeChars ?? 45_000
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
    this.random = options.random ?? Math.random
  }

  get model(): string {
    return this.options.model
  }

  private usageOf(acc: CallUsage): AiUsage {
    return {
      provider: this.providerName,
      model: this.options.model,
      promptVersion: PROMPT_VERSION,
      schemaVersion: AI_SCHEMA_VERSION,
      temperature: this.temperature,
      inputTokens: acc.inputTokens,
      outputTokens: acc.outputTokens,
      cachedTokens: acc.cachedTokens,
      estimatedCostUsd: estimateCostUsd(this.options.model, acc, this.options.priceTable),
      latencyMs: acc.latencyMs,
    }
  }

  /** Una llamada con timeout + reintentos en errores transitorios del proveedor. */
  private async generate(params: GenAiGenerateParams, acc: CallUsage, operation: string): Promise<string> {
    let attempt = 0
    for (;;) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(new Error('timeout')), this.timeoutMs)
      const started = Date.now()
      try {
        const res = await this.options.client.models.generateContent({
          ...params,
          config: { ...params.config, abortSignal: controller.signal, httpOptions: { timeout: this.timeoutMs } },
        })
        addUsage(acc, res.usageMetadata, Date.now() - started)
        if (res.promptFeedback?.blockReason) {
          throw new DomainError(DomainErrorCode.AI_INVALID_OUTPUT, `Gemini bloqueó la respuesta: ${res.promptFeedback.blockReason}`, {
            details: { operation, blockReason: res.promptFeedback.blockReason },
          })
        }
        const text = res.text
        if (!text || text.trim().length === 0) {
          throw new DomainError(DomainErrorCode.AI_INVALID_OUTPUT, 'Gemini devolvió una respuesta vacía', { details: { operation } })
        }
        return text
      } catch (err) {
        addUsage(acc, undefined, Date.now() - started)
        const mapped = mapGeminiError(err)
        if (!mapped.retryable || attempt >= this.maxRetries) throw mapped
        attempt += 1
        const delay = Math.round(this.baseDelayMs * 2 ** (attempt - 1) * (0.5 + this.random()))
        this.options.logger?.warn({ operation, attempt, delay, errorCode: mapped.code }, 'Reintentando llamada a Gemini')
        await this.sleep(delay)
      } finally {
        clearTimeout(timer)
      }
    }
  }

  /** Llamada JSON validada con schema; ante salida inválida hace una reparación y luego falla. */
  private async callJson<S extends ZodTypeAny>(
    schema: S,
    jsonSchema: JsonSchema,
    systemPrompt: string,
    userPrompt: string,
    acc: CallUsage,
    operation: string,
  ): Promise<z.infer<S>> {
    const contents: GenAiGenerateParams['contents'] = [{ role: 'user', parts: [{ text: userPrompt }] }]
    const params: GenAiGenerateParams = {
      model: this.options.model,
      contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: this.temperature,
        responseMimeType: 'application/json',
        responseJsonSchema: jsonSchema,
      },
    }
    this.options.logger?.debug({ operation, promptChars: systemPrompt.length + userPrompt.length }, 'Llamando a Gemini')
    let text = await this.generate(params, acc, operation)
    for (let repair = 0; repair < 2; repair++) {
      let parsed: unknown
      let parseError: string | null = null
      try {
        parsed = JSON.parse(stripFences(text))
      } catch (err) {
        parseError = err instanceof Error ? err.message : 'JSON inválido'
      }
      const validation = parseError ? null : schema.safeParse(parsed)
      if (validation?.success) return validation.data as z.infer<S>
      const issues = parseError ?? validation?.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`).slice(0, 25).join('; ') ?? ''
      if (repair === 1) {
        metrics.increment(MetricNames.AI_FAILURES, 1, { reason: 'invalid_output' })
        throw new DomainError(DomainErrorCode.AI_INVALID_OUTPUT, 'La salida de Gemini no cumple el schema', {
          details: { operation, issues: issues.slice(0, 2000) },
        })
      }
      this.options.logger?.warn({ operation, issuesChars: issues.length }, 'Salida IA inválida; solicitando reparación')
      contents.push({ role: 'model', parts: [{ text }] })
      contents.push({
        role: 'user',
        parts: [
          {
            text: `Tu respuesta anterior NO cumple el schema JSON requerido. Problemas detectados:\n${issues}\n\nDevuelve ÚNICAMENTE el JSON corregido, completo y válido.`,
          },
        ],
      })
      text = await this.generate({ ...params, contents }, acc, `${operation}.repair`)
    }
    throw new DomainError(DomainErrorCode.AI_INVALID_OUTPUT, 'La salida de Gemini no cumple el schema', { details: { operation } })
  }

  // ---------------------------------------------------------------------------

  private splitSegments(input: AnalyzeMeetingInput): AnalyzeMeetingInput['segments'][] {
    const chunks: AnalyzeMeetingInput['segments'][] = []
    let current: AnalyzeMeetingInput['segments'] = []
    let size = 0
    for (const seg of input.segments) {
      const len = seg.text.length + seg.speakerLabel.length + 8
      if (size + len > this.chunkSizeChars && current.length > 0) {
        chunks.push(current)
        current = []
        size = 0
      }
      current.push(seg)
      size += len
    }
    if (current.length > 0) chunks.push(current)
    return chunks
  }

  async analyzeMeeting(input: AnalyzeMeetingInput): Promise<AiResponse<MeetingAnalysisResult>> {
    const acc = emptyUsage()
    const jsonSchema = zodToGeminiSchema(MeetingAnalysisResultSchema)
    metrics.increment(MetricNames.AI_RUNS, 1, { provider: this.providerName, kind: 'analyze' })
    const totalChars = input.segments.reduce((n, s) => n + s.text.length, 0)
    let result: MeetingAnalysisResult
    if (totalChars <= this.chunkThresholdChars) {
      result = await this.callJson(MeetingAnalysisResultSchema, jsonSchema, ANALYZE_SYSTEM_PROMPT, buildAnalyzeUserPrompt(input), acc, 'analyze')
    } else {
      const chunks = this.splitSegments(input)
      this.options.logger?.info({ meetingId: input.meeting.id, chunks: chunks.length, totalChars }, 'Transcripción larga: analizando por bloques')
      const partials: MeetingAnalysisResult[] = []
      for (let i = 0; i < chunks.length; i++) {
        const chunkInput: AnalyzeMeetingInput = { ...input, segments: chunks[i] ?? [], smartNotesText: i === 0 ? input.smartNotesText : null }
        partials.push(
          await this.callJson(
            MeetingAnalysisResultSchema,
            jsonSchema,
            ANALYZE_SYSTEM_PROMPT,
            buildAnalyzeUserPrompt(chunkInput, { chunk: { index: i, total: chunks.length } }),
            acc,
            `analyze.chunk${i + 1}`,
          ),
        )
      }
      const consolidated = await this.callJson(
        MeetingAnalysisResultSchema,
        jsonSchema,
        CONSOLIDATE_SYSTEM_PROMPT,
        buildConsolidateUserPrompt(partials, input),
        acc,
        'analyze.consolidate',
      )
      result = dedupeAnalysis(consolidated)
    }
    result.schemaVersion = AI_SCHEMA_VERSION
    return { result, usage: this.usageOf(acc) }
  }

  async reconcileActionItems(input: ReconcileInput): Promise<AiResponse<ReconcileResult>> {
    const acc = emptyUsage()
    metrics.increment(MetricNames.AI_RUNS, 1, { provider: this.providerName, kind: 'reconcile' })
    const result = await this.callJson(
      ReconcileResultSchema,
      zodToGeminiSchema(ReconcileResultSchema),
      RECONCILE_SYSTEM_PROMPT,
      buildReconcileUserPrompt({ ...input, candidates: input.candidates.slice(0, 5) }),
      acc,
      'reconcile',
    )
    if (result.matchedActionItemId && !input.candidates.some((c) => c.actionItemId === result.matchedActionItemId)) {
      // El juez sólo puede elegir entre candidatos; cualquier otro id se descarta.
      return { result: { ...result, decision: 'REQUIRES_HUMAN_REVIEW', matchedActionItemId: null }, usage: this.usageOf(acc) }
    }
    return { result, usage: this.usageOf(acc) }
  }

  async generateWeeklyDigest(input: WeeklyDigestInput): Promise<AiResponse<WeeklyDigestResult>> {
    const acc = emptyUsage()
    metrics.increment(MetricNames.AI_RUNS, 1, { provider: this.providerName, kind: 'digest' })
    const result = await this.callJson(
      WeeklyDigestResultSchema,
      zodToGeminiSchema(WeeklyDigestResultSchema),
      DIGEST_SYSTEM_PROMPT,
      buildDigestUserPrompt(input),
      acc,
      'digest',
    )
    return { result, usage: this.usageOf(acc) }
  }
}

/** Deduplicación determinística post-consolidación (tokenJaccard >= 0.8). */
export function dedupeAnalysis(result: MeetingAnalysisResult): MeetingAnalysisResult {
  const items: MeetingAnalysisResult['actionItems'] = []
  for (const item of result.actionItems) {
    const dup = items.find((x) => tokenJaccard(x.title, item.title) >= 0.8)
    if (!dup) {
      items.push(item)
      continue
    }
    if (item.confidence > dup.confidence) {
      items[items.indexOf(dup)] = { ...item, dueDate: item.dueDate ?? dup.dueDate, owner: item.owner ?? dup.owner }
    } else if (!dup.dueDate && item.dueDate) dup.dueDate = item.dueDate
  }
  const decisions: MeetingAnalysisResult['decisions'] = []
  for (const d of result.decisions) {
    if (!decisions.some((x) => tokenJaccard(x.description, d.description) >= 0.8)) decisions.push(d)
  }
  return { ...result, actionItems: items, decisions }
}
