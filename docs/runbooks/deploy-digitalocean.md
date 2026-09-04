# Runbook — Despliegue en un droplet de DigitalOcean (Ubuntu 24.04)

Aplica a un droplet tipo `s-2vcpu-4gb` o superior. La plataforma corre como cuatro contenedores
(`postgres`, `api`, `worker`, `web`) definidos en `docker-compose.yml`; encima se puede usar un panel
(Dokploy o EasyPanel) que aporte HTTPS automático, despliegue desde GitHub y gestión de secretos.

## 1. Elegir panel: Dokploy vs EasyPanel

| Criterio | Dokploy | EasyPanel |
|---|---|---|
| Licencia | Open source (Apache 2.0), sin límite de proyectos | Propietario; plan gratuito limitado a 3 proyectos |
| Base | Docker Swarm + Traefik | Docker + Traefik |
| Docker Compose | Soporta el `docker-compose.yml` del repo tal cual | Lo soporta, pero su flujo natural es "un servicio por app" |
| Build | Nixpacks, Dockerfile o Compose; build en el servidor | Igual |
| Backups de BD | Programados a S3-compatible (DO Spaces) desde la UI | Igual |
| Consumo en reposo | ~500 MB RAM | ~300 MB RAM |
| Madurez | Más joven, comunidad activa | Más tiempo en mercado |

**Recomendación:** Dokploy. Este repo ya trae `docker-compose.yml` con los cuatro servicios y Dokploy lo
despliega directamente como "Compose" con Traefik delante; además es open source y los backups a
DigitalOcean Spaces cubren la sección 42 de la especificación. EasyPanel sigue siendo válido (es lo que
menciona la sección 6.6 del documento) y los pasos de las secciones 3 a 6 son idénticos.

## 2. Preparar el droplet

```bash
# como root, una sola vez
apt update && apt upgrade -y
# swap de 4 GB: el build de Next.js puede exceder 4 GB de RAM
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
# firewall: solo SSH, HTTP y HTTPS. PostgreSQL nunca se expone.
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
```

Apunta un dominio (por ejemplo `reuniones.smlxl.mx`) al IPv4 del droplet antes de continuar; Traefik
emite el certificado Let's Encrypt en el primer despliegue.

## 3. Instalar Dokploy

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

Abre `http://<ip>:3000`, crea el usuario administrador y, en Settings → Server, configura el dominio
del panel con HTTPS. Después cierra el acceso directo al 3000 si el panel ya responde por 443.

Alternativa EasyPanel: `curl -sSL https://get.easypanel.io | sh` y el panel queda en `http://<ip>:3000`.

## 4. Crear el proyecto

1. Projects → Create → nombre `smlxl-meetings`.
2. Add service → **Compose** → Provider GitHub (autoriza el repo privado) → rama `main`, Compose Path
   `docker-compose.dokploy.yml` (archivo completo para producción: conecta `api` y `web` a la red de
   Traefik y no publica puertos al host).
3. En **Environment** pega el `.env` de producción (sección 5).
4. En **Domains** asigna `reuniones.smlxl.mx` al servicio `web` (puerto 3000) y
   `api.reuniones.smlxl.mx` al servicio `api` (puerto 4000), ambos con HTTPS. Si prefieres un solo dominio,
   publica solo `web` y deja `api` interno: la web llama a la API por la red de Docker (`API_URL=http://api:4000`)
   y el navegador pasa por el proxy `/api/proxy`. El webhook de Pub/Sub y el redirect de OAuth sí
   necesitan que la API o la web sean públicas por HTTPS.
5. Deploy. El primer build tarda entre 8 y 15 minutos en 2 vCPU.

## 5. `.env` de producción (valores de ejemplo, nunca al repositorio)

```env
NODE_ENV=production
APP_URL=https://reuniones.smlxl.mx
API_URL=http://api:4000
NEXT_PUBLIC_API_URL=https://reuniones.smlxl.mx
PORT_API=4000
PORT_WEB=3000
LOG_LEVEL=info
COMPANY_TIMEZONE=America/Mexico_City

POSTGRES_USER=smlxl
POSTGRES_PASSWORD=<generar: openssl rand -hex 24>
POSTGRES_DB=smlxl
# DATABASE_URL la construye docker-compose a partir de las tres variables anteriores

AUTH_SECRET=<generar: openssl rand -base64 32>
AUTH_DEV_BYPASS=false
AUTH_URL=https://reuniones.smlxl.mx
GOOGLE_OAUTH_CLIENT_ID=<del proyecto GCP, runbook google-auth.md>
GOOGLE_OAUTH_CLIENT_SECRET=<idem>
GOOGLE_WORKSPACE_DOMAIN=smlxl.mx

# Fase 2/3: mientras estén en false la plataforma corre con adapters fake
GOOGLE_INTEGRATION_ENABLED=false
GOOGLE_MEET_EVENTS_ENABLED=false
AI_PROCESSING_ENABLED=false
AI_COMPLETION_PROPOSALS_ENABLED=true
GMAIL_NOTIFICATIONS_ENABLED=false
SHEETS_SYNC_ENABLED=false
WEEKLY_DIGEST_ENABLED=true
GOOGLE_PUBSUB_PUSH_TOKEN=<generar: openssl rand -hex 32>
```

La configuración valida al arrancar que en producción `AUTH_DEV_BYPASS` sea `false` y que `AUTH_SECRET`
no sea el valor por defecto. Sin OAuth de Google configurado no hay forma de iniciar sesión en producción,
así que el cliente OAuth (runbook `google-auth.md`) es requisito para el primer acceso.

## 6. Primer arranque: migraciones y datos iniciales

Desde la terminal del panel (o `docker exec`) en el contenedor `api`:

```bash
cd packages/database && npx prisma migrate deploy
```

Después carga el catálogo inicial. Para producción NO uses el seed demo; usa el importador legado:

```bash
# copia el workbook al contenedor o móntalo en ./imports y ejecuta
pnpm legacy:import --file ./imports/01_SMLXL_Maestro_de_Tareas_AGOSTO_2026.xlsx --dry-run
pnpm legacy:import --file ./imports/01_SMLXL_Maestro_de_Tareas_AGOSTO_2026.xlsx --commit
```

Los 10 usuarios reales se crean al primer login con Google o desde Administración → Usuarios; marca
`monitorizado` en cada uno para que el worker cree su suscripción de Workspace Events (Fase 2).

## 7. Backups (sección 42)

En Dokploy: servicio `postgres` → Backups → destino S3 (DigitalOcean Spaces, endpoint
`https://nyc3.digitaloceanspaces.com`), programación diaria a las 03:00 America/Mexico_City, retención
30 días. Prueba una restauración al mes en un contenedor temporal.

## 8. Operación

- Logs: cada servicio en el panel; son JSON estructurados con `correlationId` (sección 33).
- Salud: `https://api.../health` devuelve `db: up`; Traefik lo usa como healthcheck.
- Actualizaciones: push a `main` → Dokploy reconstruye y reemplaza los contenedores (sección 41).
- Escalado: si el worker se queda corto, sube el droplet a 4 vCPU / 8 GB; el worker y la API son
  stateless y toleran reinicios porque los jobs viven en PostgreSQL (pg-boss).
