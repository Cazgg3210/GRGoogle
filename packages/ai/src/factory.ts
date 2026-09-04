import { GoogleGenAI } from '@google/genai'
import { aiMode, type Env } from '@smlxl/config'
import type { AiMeetingAnalyzer } from '@smlxl/domain'
import type { Logger } from '@smlxl/observability'
import { FakeMeetingAnalyzer, type FakeAnalyzerOptions } from './fake/analyzer.js'
import {
  GeminiMeetingAnalyzer,
  type GenAiClientLike,
  type GeminiAnalyzerOptions,
} from './gemini/analyzer.js'

export interface CreateAiAnalyzerDeps {
  logger?: Logger
  /** Inyectable para tests/integración; por defecto GoogleGenAI real. */
  client?: GenAiClientLike
  gemini?: Partial<Omit<GeminiAnalyzerOptions, 'client' | 'model'>>
  fake?: FakeAnalyzerOptions
}

export function createGeminiClient(env: Env): GenAiClientLike {
  if (env.GOOGLE_GENAI_USE_VERTEXAI) {
    return new GoogleGenAI({
      vertexai: true,
      project: env.GOOGLE_CLOUD_PROJECT_ID,
      location: env.GOOGLE_CLOUD_LOCATION,
    }) as unknown as GenAiClientLike
  }
  return new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }) as unknown as GenAiClientLike
}

/** Fábrica según `aiMode(env)` (§51): FAKE sin red; GEMINI con Gen AI SDK (API key o Vertex). */
export function createAiAnalyzer(env: Env, deps: CreateAiAnalyzerDeps = {}): AiMeetingAnalyzer {
  if (aiMode(env) === 'GEMINI') {
    return new GeminiMeetingAnalyzer({
      client: deps.client ?? createGeminiClient(env),
      model: env.GEMINI_MODEL,
      logger: deps.logger,
      ...deps.gemini,
    })
  }
  return new FakeMeetingAnalyzer(deps.fake)
}
