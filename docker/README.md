# Imágenes Docker

Referencias: §6.6, §41, `.github/workflows/deploy.md`, ADR-001, ADR-012.

| Archivo             | Servicio                        | Puerto | Healthcheck                                  | Comando                   |
| ------------------- | ------------------------------- | ------ | -------------------------------------------- | ------------------------- |
| `api.Dockerfile`    | `apps/api` (Fastify)            | 4000   | `GET /health`                                | `node dist/main.js`       |
| `worker.Dockerfile` | `apps/worker` (pg-boss)         | —      | por logs/métricas y `GET /api/v1/admin/jobs` | `node dist/main.js`       |
| `web.Dockerfile`    | `apps/web` (Next.js standalone) | 3000   | `GET /login`                                 | `node apps/web/server.js` |

Todas: `node:20-alpine`, `corepack` + `pnpm 9.12.0`, multi-stage (`base → deps → build → runtime`), usuario `node` (no root), sin `.env` dentro de la imagen (ver `.dockerignore`), secretos inyectados en runtime por EasyPanel/Compose.

## Construir

Siempre desde la **raíz** del monorepo (contexto = `.`):

```bash
docker build -f docker/api.Dockerfile    -t smlxl/api:local    .
docker build -f docker/worker.Dockerfile -t smlxl/worker:local .
docker build -f docker/web.Dockerfile    -t smlxl/web:local    --build-arg NEXT_PUBLIC_API_URL=https://api.reuniones.smlxl.mx .
```

O con Compose (perfil completo): `docker compose --profile full up -d --build`.

## Cómo funcionan las etapas

1. **deps**: copia sólo `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `package.json` y ejecuta `pnpm fetch` (cacheable con `--mount=type=cache`), luego copia el repo e instala con filtro de workspace (`@smlxl/api...` = la app y todas sus dependencias internas).
2. **build**: `pnpm --filter @smlxl/database generate` (cliente Prisma en `packages/database/src/generated`, schema en `prisma/schema.prisma`), después `run build` de la app y sus dependencias en orden topológico; finalmente reinstala con `--prod` para eliminar devDependencies y borra directorios no necesarios.
3. **runtime**: copia el árbol pruned (`/app`) preservando los enlaces del workspace de pnpm, o, para web, la salida `standalone` de Next.

## Supuestos a confirmar cuando existan las apps

- `apps/api` y `apps/worker` tienen script `build` que produce `dist/main.js` (bundle ESM con esbuild o `tsc`), con dependencias de terceros externas y el cliente Prisma resuelto desde `packages/database/src/generated`.
- `apps/web/next.config.*` declara `output: 'standalone'` y `outputFileTracingRoot` en la raíz del monorepo.
- Los paquetes internos exponen `src/index.ts` (sin build propio); el bundler de cada app los compila.
- Si alguna app cambia el nombre del bundle o el puerto, ajustar `CMD`, `EXPOSE` y `HEALTHCHECK`.

## Migraciones

No se ejecutan dentro de la imagen. Antes de arrancar `api` en cada despliegue:

```bash
pnpm --filter @smlxl/database deploy   # prisma migrate deploy
```

EasyPanel: configurarlo como comando previo al arranque del servicio `api` (o un job one-shot con la misma imagen y `CMD` sobreescrito: `sh -c "cd /app/packages/database && pnpm exec prisma migrate deploy --schema ../../prisma/schema.prisma"`).

## Variables en runtime

Las definidas en `.env.example`; `DATABASE_URL` apunta al servicio `postgres` de la red interna (`postgresql://…@postgres:5432/…`). `API_URL` de la web = `http://api:4000` (interno); `NEXT_PUBLIC_API_URL` = URL pública de la API (fijada en build).

## Seguridad de la imagen

- Usuario `node` sin privilegios; sin shell interactivo necesario.
- `apk add openssl libc6-compat` sólo por los motores de Prisma.
- Escaneo recomendado en CI/EasyPanel (Trivy o equivalente) antes de promover a producción.
- Nunca `COPY .env`; `.dockerignore` excluye `.env*`, `imports/*.xlsx`, `tests/`, `docs/`, `node_modules/`.
