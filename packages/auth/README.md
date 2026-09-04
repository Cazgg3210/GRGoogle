# @smlxl/auth

Autenticación compartida entre `apps/web` (Auth.js v5) y `apps/api` (Fastify).

## Cómo fluye el token web → API

1. El usuario inicia sesión en `apps/web` con Google (dominio `GOOGLE_WORKSPACE_DOMAIN`) o, en desarrollo con `AUTH_DEV_BYPASS=true`, con el proveedor "Acceso de desarrollo" (solo pide el correo corporativo).
2. En `signIn`, la web confirma que el usuario existe y está activo llamando `GET ${API_URL}/api/v1/session` con un token de arranque (`sub = email`, rol `MEMBER`, 120 s). Si la API responde 401/403/404 el acceso se rechaza. Si la API es inalcanzable: se permite solo en modo bypass; en producción se deniega.
3. En el callback `jwt`, la web guarda `userId`, `role` y `name` devueltos por `/session` y **emite `apiToken`** con `mintApiToken({ sub: userId, email, role, name }, AUTH_SECRET, 3600)`. El token se re-emite automáticamente cuando le quedan menos de 5 minutos.
4. Los Server Components y el proxy `app/api/proxy/[...path]` envían `Authorization: Bearer <apiToken>`. En bypass, además se envía `x-dev-user-email`.
5. La API verifica con `verifyApiToken(token, AUTH_SECRET)` (issuer `smlxl-web`, audience `smlxl-api`, HS256) y construye el `Principal` con RBAC server-side.

```ts
// apps/api
import { verifyApiToken, ApiTokenError } from '@smlxl/auth/token'
const claims = await verifyApiToken(bearer, env.AUTH_SECRET) // { sub, email, role, name, iat, exp }
```

Notas para la API:

- `sub` es el `User.id` (uuid). Durante el primer `GET /session` posterior al login `sub` es el **email** (la web aún no conoce el id); resolver el usuario por `email` cuando `sub` no sea uuid.
- `ApiTokenError.reason` distingue `EXPIRED` / `INVALID` / `MALFORMED_CLAIMS` para mapear a `UNAUTHORIZED`.

## Exports

- `@smlxl/auth` y `@smlxl/auth/token`: `mintApiToken`, `verifyApiToken`, `ApiTokenClaims`, `ApiTokenError`, `apiTokenSecondsLeft` (sin dependencias de Next.js).
- `@smlxl/auth/next`: `createAuthConfig(env)`, `getApiToken(session)`, `lookupApiSession`, `DEV_CREDENTIALS_PROVIDER_ID` y la augmentación de tipos de `Session`/`JWT`.
