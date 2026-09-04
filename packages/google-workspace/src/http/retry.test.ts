import { describe, expect, it } from 'vitest'
import { DomainErrorCode, isDomainError } from '@smlxl/domain'
import { mapGoogleError, withGoogleRetry } from './retry.js'

function gaxiosError(status: number, message = `HTTP ${status}`): Error & { response: { status: number }; status: number } {
  const err = new Error(message) as Error & { response: { status: number }; status: number }
  err.name = 'GaxiosError'
  err.response = { status }
  err.status = status
  return err
}

const noSleep = { sleep: async () => undefined, random: () => 0.5 }

describe('mapGoogleError', () => {
  it('mapea códigos HTTP a DomainError', () => {
    expect(mapGoogleError(gaxiosError(403)).code).toBe(DomainErrorCode.GOOGLE_PERMISSION_DENIED)
    expect(mapGoogleError(gaxiosError(404)).code).toBe(DomainErrorCode.GOOGLE_NOT_FOUND)
    const rl = mapGoogleError(gaxiosError(429))
    expect(rl.code).toBe(DomainErrorCode.GOOGLE_RATE_LIMIT)
    expect(rl.retryable).toBe(true)
    const un = mapGoogleError(gaxiosError(503))
    expect(un.code).toBe(DomainErrorCode.GOOGLE_UNAVAILABLE)
    expect(un.retryable).toBe(true)
    expect(mapGoogleError(gaxiosError(400)).code).toBe(DomainErrorCode.VALIDATION_ERROR)
  })

  it('mapea timeouts y errores de red', () => {
    const abort = new Error('The operation was aborted')
    abort.name = 'AbortError'
    const t = mapGoogleError(abort, 'op')
    expect(t.code).toBe(DomainErrorCode.GOOGLE_TIMEOUT)
    expect(t.retryable).toBe(true)
    const net = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
    expect(mapGoogleError(net).code).toBe(DomainErrorCode.GOOGLE_UNAVAILABLE)
    expect(mapGoogleError(net).retryable).toBe(true)
  })
})

describe('withGoogleRetry', () => {
  it('reintenta en 429/5xx con backoff y termina con éxito', async () => {
    let calls = 0
    const delays: number[] = []
    const result = await withGoogleRetry(
      async () => {
        calls += 1
        if (calls < 3) throw gaxiosError(calls === 1 ? 429 : 503)
        return 'ok'
      },
      { retries: 3, baseDelayMs: 100, random: () => 0.5, sleep: async (ms) => { delays.push(ms) } },
    )
    expect(result).toBe('ok')
    expect(calls).toBe(3)
    expect(delays).toEqual([100, 200])
  })

  it('no reintenta en 403 y lanza DomainError', async () => {
    let calls = 0
    await expect(
      withGoogleRetry(async () => {
        calls += 1
        throw gaxiosError(403)
      }, { retries: 3, ...noSleep }),
    ).rejects.toSatisfy((e: unknown) => isDomainError(e) && e.code === DomainErrorCode.GOOGLE_PERMISSION_DENIED)
    expect(calls).toBe(1)
  })

  it('agota reintentos y lanza el último error mapeado', async () => {
    let calls = 0
    await expect(
      withGoogleRetry(async () => {
        calls += 1
        throw gaxiosError(500)
      }, { retries: 2, ...noSleep }),
    ).rejects.toSatisfy((e: unknown) => isDomainError(e) && e.code === DomainErrorCode.GOOGLE_UNAVAILABLE)
    expect(calls).toBe(3)
  })

  it('aborta por timeout y mapea a GOOGLE_TIMEOUT', async () => {
    await expect(
      withGoogleRetry(
        (signal) =>
          new Promise((_, reject) => {
            signal.addEventListener('abort', () => {
              const e = new Error('aborted')
              e.name = 'AbortError'
              reject(e)
            })
          }),
        { timeoutMs: 20, retries: 0 },
      ),
    ).rejects.toSatisfy((e: unknown) => isDomainError(e) && e.code === DomainErrorCode.GOOGLE_TIMEOUT)
  })
})
