import { describe, expect, it } from 'vitest'
import { SignJWT, decodeJwt } from 'jose'
import {
  API_TOKEN_AUDIENCE,
  API_TOKEN_ISSUER,
  ApiTokenError,
  apiTokenSecondsLeft,
  mintApiToken,
  verifyApiToken,
} from './api-token.js'

const SECRET = 'test-secret-with-enough-length-1234'
const input = {
  sub: '4d1f8a3e-9f0d-4c8f-9a2f-3b8f1e2a6c11',
  email: 'gestora@smlxl.mx',
  role: 'ADMIN' as const,
  name: 'Gestora SMLXL',
}

describe('api-token', () => {
  it('emite y verifica un token HS256 con issuer/audience', async () => {
    const token = await mintApiToken(input, SECRET)
    const claims = await verifyApiToken(token, SECRET)
    expect(claims.sub).toBe(input.sub)
    expect(claims.email).toBe(input.email)
    expect(claims.role).toBe('ADMIN')
    expect(claims.name).toBe(input.name)
    expect(claims.iss).toBe(API_TOKEN_ISSUER)
    expect(claims.aud).toBe(API_TOKEN_AUDIENCE)
    expect(claims.exp - claims.iat).toBe(3600)
    expect(decodeJwt(token).iss).toBe('smlxl-web')
  })

  it('respeta el ttl indicado', async () => {
    const token = await mintApiToken(input, SECRET, 120)
    const claims = await verifyApiToken(token, SECRET)
    expect(claims.exp - claims.iat).toBe(120)
    expect(apiTokenSecondsLeft(claims)).toBeLessThanOrEqual(120)
    expect(apiTokenSecondsLeft(claims)).toBeGreaterThan(100)
  })

  it('rechaza tokens firmados con otro secreto', async () => {
    const token = await mintApiToken(input, SECRET)
    await expect(verifyApiToken(token, 'another-secret-xxxxxxxx')).rejects.toBeInstanceOf(
      ApiTokenError,
    )
  })

  it('rechaza tokens expirados con reason EXPIRED', async () => {
    const token = await mintApiToken(input, SECRET, -10)
    const err = await verifyApiToken(token, SECRET).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiTokenError)
    expect((err as ApiTokenError).reason).toBe('EXPIRED')
  })

  it('rechaza roles desconocidos al emitir', async () => {
    await expect(
      mintApiToken({ ...input, role: 'ROOT' as unknown as 'ADMIN' }, SECRET),
    ).rejects.toThrow(/Rol desconocido/)
  })

  it('rechaza tokens de otro issuer', async () => {
    const foreign = await new SignJWT({ email: input.email, role: 'ADMIN', name: 'x' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(input.sub)
      .setIssuer('someone-else')
      .setAudience(API_TOKEN_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET))
    await expect(verifyApiToken(foreign, SECRET)).rejects.toBeInstanceOf(ApiTokenError)
  })

  it('rechaza claims malformados (sin role)', async () => {
    const bad = await new SignJWT({ email: input.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(input.sub)
      .setIssuer(API_TOKEN_ISSUER)
      .setAudience(API_TOKEN_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET))
    const err = await verifyApiToken(bad, SECRET).catch((e: unknown) => e)
    expect((err as ApiTokenError).reason).toBe('MALFORMED_CLAIMS')
  })
})
