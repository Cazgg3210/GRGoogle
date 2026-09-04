# Despliegue (notas, sin secretos)

Referencias: §6.6, §41, §42, `docker/README.md`. No existe workflow de deploy automático en este repositorio: EasyPanel observa las ramas y construye las imágenes desde los Dockerfiles de `docker/`.

## Ramas y entornos

| Rama                 | Entorno                                 | Disparador                                          |
| -------------------- | --------------------------------------- | --------------------------------------------------- |
| `dev`                | desarrollo (`*.dev.reuniones.smlxl.mx`) | push a `dev` tras CI verde                          |
| `main`               | producción                              | merge de PR `dev → main` tras CI verde y aprobación |
| `feature/*`, `fix/*` | ninguno                                 | sólo CI                                             |

## Servicios en EasyPanel (por entorno)

| Servicio   | Imagen                                                       | Puerto  | Notas                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `postgres` | PostgreSQL 16 gestionado por EasyPanel (o servidor dedicado) | interno | volumen persistente; backups diarios a S3-compatible (§42)                                                                                                                |
| `api`      | `docker/api.Dockerfile`                                      | 4000    | healthcheck `GET /health`; dominio `api.<entorno>` con HTTPS automático; **comando previo al arranque**: `pnpm --filter @smlxl/database deploy` (`prisma migrate deploy`) |
| `worker`   | `docker/worker.Dockerfile`                                   | —       | sin puerto público; 1 réplica (pg-boss coordina; escalar sólo tras validar `singletonKey`)                                                                                |
| `web`      | `docker/web.Dockerfile`                                      | 3000    | dominio `reuniones.<entorno>`; `API_URL=http://api:4000` en red interna; `NEXT_PUBLIC_API_URL` = URL pública de la API                                                    |

## Secretos (EasyPanel → Environment)

Definir exactamente las variables de `.env.example` con valores reales en EasyPanel; nunca en Git. Mínimo en producción: `DATABASE_URL`, `AUTH_SECRET` (≥ 32 bytes aleatorios), `GOOGLE_OAUTH_CLIENT_ID/SECRET`, `GOOGLE_WORKSPACE_DOMAIN`, y, según flags activos, credenciales DWD, Pub/Sub, Gemini/Vertex, `GMAIL_SENDER_EMAIL`, `GOOGLE_SHEETS_SPREADSHEET_ID`. `AUTH_DEV_BYPASS` debe estar ausente o en `false` (la API se niega a arrancar en caso contrario).

## Procedimiento de release

1. PR `feature/* → dev`; CI verde; merge.
2. EasyPanel reconstruye `api`, `worker`, `web` de dev; verificar `/health`, Integraciones y una reunión simulada.
3. PR `dev → main` con changelog; revisión de migraciones (`prisma/migrations/`): prohibidas las destructivas sin estrategia explícita (§41).
4. Merge → EasyPanel construye producción. Orden: `api` (ejecuta `migrate deploy`) → `worker` → `web`.
5. Post-deploy: `/health` en 200, suscripciones activas en Integraciones, digest programado (`nextRunAt`), backups verificados.

## Rollback

- Imágenes: volver a la versión anterior en EasyPanel (tag por commit).
- Base de datos: las migraciones son aditivas; para revertir una migración destructiva se restaura el backup previo (§42) y se documenta el incidente.

## Migraciones

- Generadas en desarrollo con `pnpm db:migrate` y versionadas en el PR.
- CI verifica drift (`prisma migrate diff --exit-code`).
- Producción aplica sólo `prisma migrate deploy`; nunca `db push` ni `migrate reset`.

## Observabilidad

Logs JSON (pino) recogidos por EasyPanel; `LOG_LEVEL=info`. `GET /metrics` accesible sólo desde la red interna o mediante un scraper con autenticación de red.
