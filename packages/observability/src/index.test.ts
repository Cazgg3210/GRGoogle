import { beforeEach, describe, expect, it } from 'vitest'
import { metrics, timed } from './index.js'

describe('metrics', () => {
  beforeEach(() => metrics.reset())
  it('cuenta y etiqueta', () => {
    metrics.increment('ai_runs')
    metrics.increment('ai_runs', 2, { provider: 'fake' })
    const s = metrics.snapshot()
    expect(s.counters['ai_runs']).toBe(1)
    expect(s.counters['ai_runs{provider="fake"}']).toBe(2)
    expect(metrics.toPrometheus()).toContain('ai_runs 1')
  })
  it('mide duraciones', async () => {
    await timed('op_ms', async () => 1)
    expect(metrics.snapshot().histograms['op_ms']?.count).toBe(1)
  })
})
