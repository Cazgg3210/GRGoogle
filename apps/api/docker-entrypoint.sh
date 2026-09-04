#!/bin/sh
# Arranque de la API en contenedor: aplica migraciones pendientes y luego inicia el servidor.
# `prisma migrate deploy` es idempotente: si no hay migraciones nuevas no hace nada.
set -e

echo "[api] aplicando migraciones de base de datos..."
cd /app/packages/database
./node_modules/.bin/prisma migrate deploy

echo "[api] iniciando servidor..."
cd /app/apps/api
exec ./node_modules/.bin/tsx src/main.ts
