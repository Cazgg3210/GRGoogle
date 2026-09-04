import { describe, expect, it } from 'vitest'
import { ExtractedActionItemSchema, MeetingAnalysisResultSchema } from './ai.js'

describe('AI structured output schemas', () => {
  it('acepta un action item válido', () => {
    const r = ExtractedActionItemSchema.safeParse({
      title: 'Enviar carta al cliente',
      owner: { name: 'Carlos', evidence: 'Carlos enviará la carta' },
      dueDate: '2026-09-08',
      priority: 'HIGH',
      statusHint: 'NEW',
      evidence: [{ text: 'Carlos enviará la carta el próximo martes', speaker: 'Carlos' }],
      confidence: 0.82,
    })
    expect(r.success).toBe(true)
  })

  it('rechaza fechas no ISO y confianza fuera de rango', () => {
    expect(
      ExtractedActionItemSchema.safeParse({
        title: 'X y Z',
        owner: null,
        dueDate: 'martes',
        priority: null,
        statusHint: 'NEW',
        evidence: [{ text: 'algo' }],
        confidence: 1.2,
      }).success,
    ).toBe(false)
  })

  it('exige al menos una evidencia por tarea', () => {
    expect(
      ExtractedActionItemSchema.safeParse({
        title: 'Sin evidencia',
        owner: null,
        dueDate: null,
        priority: null,
        statusHint: 'NEW',
        evidence: [],
        confidence: 0.9,
      }).success,
    ).toBe(false)
  })

  it('rechaza análisis sin resumen ejecutivo', () => {
    expect(
      MeetingAnalysisResultSchema.safeParse({
        schemaVersion: '1.0.0',
        language: { detectedLanguageCode: 'es', mixedLanguageDetected: false },
        topics: [],
        projectHint: null,
        sensitivityHint: 'NORMAL',
        summary: { executive: [], detailed: '', attentionPoints: [], risks: [], openQuestions: [] },
        decisions: [],
        actionItems: [],
        extractionConfidence: 0.5,
      }).success,
    ).toBe(false)
  })
})
