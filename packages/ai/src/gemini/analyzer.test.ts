import { describe, expect, it } from 'vitest'
import type { AnalyzeMeetingInput, MeetingAnalysisResult } from '@smlxl/domain'
import { AI_SCHEMA_VERSION } from '@smlxl/contracts'
import { GeminiMeetingAnalyzer, dedupeAnalysis, estimateCostUsd, type GenAiClientLike, type GenAiGenerateParams, type GenAiResponseLike } from './analyzer.js'

const validAnalysis: MeetingAnalysisResult = {
  schemaVersion: AI_SCHEMA_VERSION,
  language: { detectedLanguageCode: 'es-MX', mixedLanguageDetected: false },
  topics: [{ title: 'Contrato', subtopics: [] }],
  projectHint: 'Cliente Alfa',
  sensitivityHint: 'NORMAL',
  summary: { executive: ['Punto 1'], detailed: 'Detalle', attentionPoints: [], risks: [], openQuestions: [] },
  decisions: [],
  actionItems: [
    { title: 'Enviar carta de intención', owner: { name: 'Carlos', evidence: 'yo envío' }, dueDate: '2026-09-08', priority: null, statusHint: 'NEW', evidence: [{ text: 'yo envío la carta' }], confidence: 0.9 },
  ],
  extractionConfidence: 0.85,
}

function input(segmentsText: string[] = ['Hola']): AnalyzeMeetingInput {
  return {
    meeting: { id: 'm1', title: 'Reunión', startAt: '2026-09-03T15:00:00Z', endAt: null, organizerEmail: null, reportedLanguageCode: null },
    participants: [],
    segments: segmentsText.map((t, i) => ({ id: `s${i}`, sequence: i + 1, speakerLabel: 'A', text: t, startTime: null, endTime: null })),
    smartNotesText: null,
    openActions: [],
    companyDomain: 'smlxl.mx',
    referenceDate: '2026-09-03',
    timezone: 'America/Mexico_City',
  }
}

function apiError(status: number, message = `HTTP ${status}`): Error & { status: number } {
  return Object.assign(new Error(message), { status, name: 'ApiError' })
}

function client(handler: (params: GenAiGenerateParams, call: number) => Promise<GenAiResponseLike> | GenAiResponseLike): GenAiClientLike & { calls: GenAiGenerateParams[] } {
  const calls: GenAiGenerateParams[] = []
  return {
    calls,
    models: {
      generateContent: async (params) => {
        calls.push(params)
        return handler(params, calls.length)
      },
    },
  }
}

const usage = { promptTokenCount: 1000, candidatesTokenCount: 200, cachedContentTokenCount: 100 }
const fast = { sleep: async () => undefined, random: () => 0.5, baseDelayMs: 10 }

describe('GeminiMeetingAnalyzer', () => {
  it('llama con structured output, valida y calcula usage/costo', async () => {
    const c = client(() => ({ text: JSON.stringify(validAnalysis), usageMetadata: usage }))
    const ai = new GeminiMeetingAnalyzer({ client: c, model: 'gemini-2.5-flash', ...fast })
    const res = await ai.analyzeMeeting(input())
    expect(res.result.actionItems[0]?.title).toBe('Enviar carta de intención')
    expect(c.calls[0]?.config?.responseMimeType).toBe('application/json')
    expect(c.calls[0]?.config?.responseJsonSchema).toBeDefined()
    expect(c.calls[0]?.config?.systemInstruction).toContain('analista')
    expect(c.calls[0]?.config?.abortSignal).toBeInstanceOf(AbortSignal)
    expect(res.usage).toMatchObject({ provider: 'gemini', model: 'gemini-2.5-flash', inputTokens: 1000, outputTokens: 200, cachedTokens: 100, promptVersion: 'v1', schemaVersion: AI_SCHEMA_VERSION })
    expect(res.usage.estimatedCostUsd).toBeCloseTo(estimateCostUsd('gemini-2.5-flash', { inputTokens: 1000, outputTokens: 200, cachedTokens: 100 }) ?? -1, 8)
    expect(estimateCostUsd('modelo-desconocido', { inputTokens: 1, outputTokens: 1, cachedTokens: 0 })).toBeNull()
  })

  it('reintenta con backoff en 429/503 y respeta el máximo', async () => {
    const delays: number[] = []
    const c = client((_p, call) => {
      if (call === 1) throw apiError(429)
      if (call === 2) throw apiError(503)
      return { text: JSON.stringify(validAnalysis), usageMetadata: usage }
    })
    const ai = new GeminiMeetingAnalyzer({ client: c, model: 'gemini-2.5-flash', maxRetries: 3, baseDelayMs: 100, random: () => 0.5, sleep: async (ms) => { delays.push(ms) } })
    const res = await ai.analyzeMeeting(input())
    expect(res.result.schemaVersion).toBe(AI_SCHEMA_VERSION)
    expect(c.calls).toHaveLength(3)
    expect(delays).toEqual([100, 200])
    const always = client(() => { throw apiError(500) })
    const ai2 = new GeminiMeetingAnalyzer({ client: always, model: 'gemini-2.5-flash', maxRetries: 1, ...fast })
    await expect(ai2.analyzeMeeting(input())).rejects.toMatchObject({ code: 'AI_PROVIDER_ERROR', retryable: true })
    expect(always.calls).toHaveLength(2)
    const rate = client(() => { throw apiError(429) })
    await expect(new GeminiMeetingAnalyzer({ client: rate, model: 'x', maxRetries: 0, ...fast }).analyzeMeeting(input())).rejects.toMatchObject({ code: 'GOOGLE_RATE_LIMIT' })
  })

  it('repara una salida inválida una vez y luego falla con AI_INVALID_OUTPUT', async () => {
    const c = client((params, call) => {
      if (call === 1) return { text: '```json\n{"schemaVersion":"1.0.0","language":{"detectedLanguageCode":"es"}}\n```' }
      expect(params.contents).toHaveLength(3)
      expect(params.contents[2]?.parts[0]?.text).toContain('NO cumple el schema')
      return { text: JSON.stringify(validAnalysis) }
    })
    const ai = new GeminiMeetingAnalyzer({ client: c, model: 'gemini-2.5-flash', ...fast })
    const res = await ai.analyzeMeeting(input())
    expect(res.result.summary.executive).toEqual(['Punto 1'])
    expect(c.calls).toHaveLength(2)
    const bad = client(() => ({ text: 'esto no es json' }))
    await expect(new GeminiMeetingAnalyzer({ client: bad, model: 'x', ...fast }).analyzeMeeting(input())).rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT', retryable: false })
    expect(bad.calls).toHaveLength(2)
  })

  it('mapea timeout (abort) a error de proveedor reintentable', async () => {
    const c = client((params) => new Promise((_, reject) => {
      params.config?.abortSignal?.addEventListener('abort', () => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })))
    }))
    const ai = new GeminiMeetingAnalyzer({ client: c, model: 'x', timeoutMs: 15, maxRetries: 1, ...fast })
    await expect(ai.reconcileActionItems({ extracted: validAnalysis.actionItems[0]!, candidates: [], meetingTitle: 'R', referenceDate: '2026-09-03' })).rejects.toMatchObject({ code: 'AI_PROVIDER_ERROR', retryable: true, details: { reason: 'timeout' } })
    expect(c.calls).toHaveLength(2)
  })

  it('hace chunking + consolidación en transcripciones largas y deduplica', async () => {
    const long = Array.from({ length: 40 }, (_, i) => `Segmento ${i} `.padEnd(2000, 'x'))
    const c = client((params) => {
      const text = params.contents[0]?.parts[0]?.text ?? ''
      if (text.includes('ANÁLISIS PARCIALES')) {
        return { text: JSON.stringify({ ...validAnalysis, actionItems: [validAnalysis.actionItems[0], { ...validAnalysis.actionItems[0], confidence: 0.7 }] }) }
      }
      return { text: JSON.stringify(validAnalysis), usageMetadata: usage }
    })
    const ai = new GeminiMeetingAnalyzer({ client: c, model: 'gemini-2.5-flash', chunkThresholdChars: 30_000, chunkSizeChars: 25_000, ...fast })
    const res = await ai.analyzeMeeting(input(long))
    expect(c.calls.length).toBeGreaterThanOrEqual(4)
    expect(c.calls[0]?.contents[0]?.parts[0]?.text).toContain('parte 1 de')
    expect(res.result.actionItems).toHaveLength(1)
    expect(res.usage.inputTokens).toBe(1000 * (c.calls.length - 1))
  })

  it('reconcile descarta ids que no son candidatos', async () => {
    const c = client(() => ({ text: JSON.stringify({ decision: 'LINK_EXISTING', matchedActionItemId: 'otro', confidence: 0.9, rationale: 'x' }) }))
    const ai = new GeminiMeetingAnalyzer({ client: c, model: 'x', ...fast })
    const res = await ai.reconcileActionItems({ extracted: validAnalysis.actionItems[0]!, candidates: [{ actionItemId: 'a1', externalKey: 'ACT-1', title: 't', description: null, ownerName: null, status: 'PENDING', dueDate: null, projectName: null, preScore: 0.7 }], meetingTitle: 'R', referenceDate: '2026-09-03' })
    expect(res.result).toMatchObject({ decision: 'REQUIRES_HUMAN_REVIEW', matchedActionItemId: null })
  })

  it('dedupeAnalysis fusiona por similitud de título', () => {
    const r = dedupeAnalysis({ ...validAnalysis, actionItems: [validAnalysis.actionItems[0]!, { ...validAnalysis.actionItems[0]!, title: 'Enviar la carta de intención', confidence: 0.95, dueDate: null }], decisions: [] })
    expect(r.actionItems).toHaveLength(1)
    expect(r.actionItems[0]).toMatchObject({ confidence: 0.95, dueDate: '2026-09-08' })
  })
})
