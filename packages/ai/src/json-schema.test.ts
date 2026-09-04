import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  ExtractedActionItemSchema,
  MeetingAnalysisResultSchema,
  ReconcileResultSchema,
} from '@smlxl/contracts'
import { zodToGeminiSchema, zodToJsonSchema } from './json-schema.js'

describe('zodToJsonSchema', () => {
  it('convierte objetos, opcionales, nullables, enums, arrays y números', () => {
    const schema = z.object({
      title: z.string().min(3).max(10).describe('Título'),
      count: z.number().int().min(0).max(5),
      tags: z.array(z.string()).max(3),
      kind: z.enum(['A', 'B']),
      maybe: z.string().nullable(),
      opt: z.boolean().optional(),
    })
    const js = zodToJsonSchema(schema)
    expect(js.type).toBe('object')
    expect(js.required).toEqual(['title', 'count', 'tags', 'kind', 'maybe'])
    expect(js.properties?.['title']).toEqual({
      type: 'string',
      minLength: 3,
      maxLength: 10,
      description: 'Título',
    })
    expect(js.properties?.['count']).toEqual({ type: 'integer', minimum: 0, maximum: 5 })
    expect(js.properties?.['tags']).toEqual({
      type: 'array',
      items: { type: 'string' },
      maxItems: 3,
    })
    expect(js.properties?.['kind']).toEqual({ type: 'string', enum: ['A', 'B'] })
    expect(js.properties?.['maybe']).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] })
    expect(js.properties?.['opt']).toEqual({ type: 'boolean' })
    expect(js.additionalProperties).toBe(false)
  })

  it('convierte los schemas de contratos sin lanzar y sin pattern/minLength en la variante Gemini', () => {
    for (const s of [
      MeetingAnalysisResultSchema,
      ExtractedActionItemSchema,
      ReconcileResultSchema,
    ]) {
      const full = zodToJsonSchema(s)
      expect(full.type).toBe('object')
      const gemini = JSON.stringify(zodToGeminiSchema(s))
      expect(gemini).not.toContain('"pattern"')
      expect(gemini).not.toContain('"minLength"')
    }
    const analysis = zodToJsonSchema(MeetingAnalysisResultSchema)
    expect(analysis.properties?.['actionItems']?.items?.properties?.['statusHint']?.enum).toEqual([
      'NEW',
      'UPDATE',
      'DONE',
      'BLOCKED',
      'UNKNOWN',
    ])
    expect(analysis.properties?.['actionItems']?.items?.properties?.['owner']?.anyOf?.[1]).toEqual({
      type: 'null',
    })
    expect(analysis.properties?.['actionItems']?.items?.required).not.toContain('description')
  })
})
