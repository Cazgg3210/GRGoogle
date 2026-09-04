import { describe, expect, it } from 'vitest'
import { aiMode, featureFlagsFromEnv, googleMode, loadEnv } from './index.js'

describe('config', () => {
  const base = { DATABASE_URL: 'postgresql://x' }
  it('carga defaults seguros', () => {
    const env = loadEnv(base)
    expect(env.COMPANY_TIMEZONE).toBe('America/Mexico_City')
    expect(featureFlagsFromEnv(env).GOOGLE_INTEGRATION_ENABLED).toBe(false)
    expect(googleMode(env)).toBe('FAKE')
    expect(aiMode(env)).toBe('FAKE')
  })
  it('parsea booleanos de env', () => {
    const env = loadEnv({ ...base, AI_PROCESSING_ENABLED: 'true', GEMINI_API_KEY: 'k' })
    expect(aiMode(env)).toBe('GEMINI')
  })
  it('rechaza bypass en producción', () => {
    expect(() =>
      loadEnv({
        ...base,
        NODE_ENV: 'production',
        AUTH_DEV_BYPASS: 'true',
        AUTH_SECRET: 'x'.repeat(32),
      }),
    ).toThrow()
  })
})
