# Runbook — Despliegue en el droplet de DigitalOcean (Ubuntu 24.04 + Dokploy)

Estado real de la infraestructura al 4 de septiembre de 2026 (fuente: contexto del propietario):

| Elemento | Valor |
|---|---|
| Droplet | `ubuntu-s-2vcpu-4gb-nyc1`, 2 vCPU / 4 GB / 80 GB, NYC1, backups activados |
| **Reserved IP** | **`129.212.197.34`** — la que se usa para DNS, Dokploy y SSH |
| IP nativa | `147.182.219.216` (no usar para DNS; cambia si se reconstruye el droplet) |
| Acceso | `ssh root@129.212.197.34` con llave SSH (o Web Console desde el panel de DigitalOcean) |
| Panel | Dokploy ya instalado (Traefik + Let's Encrypt); comparte el droplet con otras apps (Pórtico San Miguel, etc.) |
| Dominio | Aún no hay dominio propio; puente temporal con sslip.io: `smlxl.129-212-197-34.sslip.io` |
| DNS futuro | Zona en DigitalOcean (Networking → Domains) con wildcard `*` → `129.212.197.34` |

La plataforma corre como cuatro contenedores (`postgres`, `api`, `worker`, `web`) definidos en
`docker-compose.dokploy.yml`. Es una app más dentro de Dokploy: no requiere reinstalar nada ni tocar
las otras aplicaciones del droplet; Traefik enruta por nombre de host.

## 1. Preparación del servidor (una sola vez, compartida por todas las apps)

Ya hecho: Dokploy instalado. Pendiente o por verificar desde `ssh root@129.212.197.34`:

```bash
# reinicio pendiente por actualizaciones del kernel (avisado el 4 sep)
reboot
```

```bash
# swap de 4 GB: el build de Next.js puede exceder 4 GB de RAM
swapon --show | grep -q swapfile || (fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab); free -h
```

Firewall: usar el de DigitalOcean (Networking → Firewalls → crear `web-basico` con inbound TCP 22, 80,
443 y outbound todo; asignarlo al droplet). El puerto 3000 solo mientras el panel no tenga dominio
con HTTPS. Si además se usa `ufw` en el droplet, mantener las mismas reglas.

## 2. Nombre de host de la plataforma

Mientras no exista dominio propio, Dokploy puede emitir certificados para nombres sslip.io, que
resuelven automáticamente a la IP embebida en el nombre:

```text
smlxl.129-212-197-34.sslip.io
```

Cuando se compre el dominio (por ejemplo `tudominio.com`), en la zona DNS de DigitalOcean ya existirá
el wildcard `* → 129.212.197.34`; bastará con cambiar en Dokploy el dominio del servicio `web` a
`reuniones.tudominio.com`, actualizar `APP_URL` y el redirect de OAuth (sección 5) y redesplegar.

Limitación conocida: Let's Encrypt aplica límites de emisión por dominio base y `sslip.io` es
compartido por muchos usuarios. Si el certificado no se emite, activar en Dokploy el proveedor
alternativo o esperar al dominio propio. El login con Google exige HTTPS, así que este punto es
prerequisito del primer acceso.

## 3. Crear el servicio en Dokploy

1. `https://panel...` (o `http://129.212.197.34:3000` mientras no tenga dominio) → **Projects → Create** →
   `smlxl-meetings`.
2. **Create Service → Compose**, nombre `plataforma`. Proveedor **GitHub** (Settings → Git Providers si aún
   no está autorizado el repo `Cazgg3210/GRGoogle`), rama `main`, **Compose Path**
   `docker-compose.dokploy.yml`.
3. **Environment**: pegar las variables de la sección 4.
4. **Domains → Add Domain**: host `smlxl.129-212-197-34.sslip.io` (o el dominio real), service `web`,
   container port `3000`, HTTPS + Let's Encrypt.
5. **Deploy**. Primer build: 10 a 15 minutos en 2 vCPU.

## 4. Variables de entorno de producción (nunca al repositorio)

Generar secretos en la PC: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

```env
APP_URL=https://smlxl.129-212-197-34.sslip.io
POSTGRES_USER=smlxl
POSTGRES_PASSWORD=<secreto 1>
POSTGRES_DB=smlxl
AUTH_SECRET=<secreto 2>
GOOGLE_PUBSUB_PUSH_TOKEN=<secreto 3>
GOOGLE_WORKSPACE_DOMAIN=smlxl.mx
COMPANY_TIMEZONE=America/Mexico_City
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_INTEGRATION_ENABLED=false
GOOGLE_MEET_EVENTS_ENABLED=false
AI_PROCESSING_ENABLED=false
AI_COMPLETION_PROPOSALS_ENABLED=true
GMAIL_NOTIFICATIONS_ENABLED=false
SHEETS_SYNC_ENABLED=false
WEEKLY_DIGEST_ENABLED=true
```

`GOOGLE_WORKSPACE_DOMAIN` es el dominio de las cuentas de los usuarios (`@smlxl.mx`), independiente
del dominio donde se aloja la plataforma. La configuración valida en producción que `AUTH_DEV_BYPASS`
sea `false` (el compose lo fija) y que `AUTH_SECRET` no sea el valor por defecto.

## 5. Login con Google (obligatorio para entrar en producción)

1. Google Cloud Console con la cuenta Super Admin de `@smlxl.mx` → New Project `smlxl-meeting-intelligence`.
2. APIs & Services → OAuth consent screen → **Internal**.
3. Credentials → OAuth client ID → Web application → Authorized redirect URI:
   `https://smlxl.129-212-197-34.sslip.io/api/auth/callback/google` (cambiarla al dominio real después).
4. Copiar Client ID / Secret a Environment en Dokploy → **Redeploy**.
5. La primera cuenta entra como MEMBER; elevarla a ADMIN desde la terminal del contenedor `postgres`:
   `psql -U smlxl -d smlxl -c "UPDATE users SET role='ADMIN' WHERE email='correo@smlxl.mx';"`.

## 6. Primer arranque: migraciones y datos

Terminal del contenedor `api` en Dokploy:

```bash
cd packages/database && npx prisma migrate deploy
```

Datos reales: NO usar el seed demo. Subir el workbook con `scp archivo.xlsx root@129.212.197.34:/root/maestro.xlsx`,
copiarlo al contenedor (`docker cp /root/maestro.xlsx $(docker ps -qf name=api):/app/imports/maestro.xlsx`)
y ejecutar `pnpm legacy:import --file ./imports/maestro.xlsx --dry-run` y luego `--commit`.

## 7. Backups (sección 42 de la especificación)

Además del backup de droplet ya activado en DigitalOcean: Dokploy → servicio → **Backups** → destino S3
(DigitalOcean Spaces `smlxl-backups`, endpoint `https://nyc3.digitaloceanspaces.com`), base `smlxl`,
cron `0 3 * * *`, retención 30 días. Probar una restauración al mes.

## 8. Operación

- Logs JSON con `correlationId` por servicio en Dokploy (sección 33).
- Salud: `wget -qO- http://api:4000/health` desde cualquier contenedor de la red → `"db":"up"`.
- Cada push a `main` en `Cazgg3210/GRGoogle` redespliega automáticamente (sección 41).
- Si el droplet comparte carga con varias apps y el swap se usa de forma constante, subir a 4 vCPU / 8 GB.
- Cuando exista dominio propio: cambiar dominio en Dokploy, `APP_URL`, redirect URI de Google y redesplegar.
