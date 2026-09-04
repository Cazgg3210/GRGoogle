# ADR-003 — PostgreSQL como fuente de verdad

**Estado:** Aceptada (2026-09-03)
**Referencias:** §6.4, §9, §16.1, §16.5, §16.6, §16.9, §44.19, §45.16, §53

## Contexto

Hoy el seguimiento vive en el workbook `01_SMLXL_Maestro_de_Tareas_AGOSTO 2026.xlsx` con problemas de calidad conocidos (§16.4): IDs repetidos, doble control `Status + Completada`, `Vencido?` manual sin fecha compromiso, variantes ortográficas, recurrentes tratadas como únicas. Se necesita historial, auditoría, reconciliación IA y consultas transversales.

## Decisión

**PostgreSQL 16 + Prisma** es la única fuente maestra. El workbook es fuente de migración y contrato funcional; Google Sheets es una proyección de salida (ADR-008). Modelo: UUID como PK, `timestamptz`, enums canónicos espejo del dominio, auditoría independiente (`audit_logs`), soft delete sólo donde tenga sentido (no se usa para auditar). `isOverdue` y la semana ISO se **derivan** (`rules/dates.ts`), nunca se persisten como verdad manual. `legacyId` se conserva sin unicidad; la trazabilidad de migración va en `legacy_import_references`.

## Consecuencias

- Full-text de PostgreSQL (`tsvector`, diccionario `spanish`) para búsqueda fase 1; pgvector opcional en fase 2 sin cambiar de motor.
- pg-boss reutiliza la misma base como cola (sin Redis en MVP).
- Migraciones versionadas en `prisma/migrations`; nunca destructivas automáticas (§41).
- Backups diarios a S3-compatible con prueba de restauración (§42).
- Los usuarios dejan de editar el Excel como maestro; cambios de hábito gestionados con la proyección a Sheets y la sesión de depuración pre go-live (P0-6).

## Alternativas consideradas

- **Google Sheets como base de datos**: prohibido (§45.16); sin transacciones, auditoría ni concurrencia.
- **Sincronización bidireccional con el Sheet**: sólo si se confirma la opción C de P0-5; requeriría ADR nuevo.
- **MongoDB/NoSQL**: descartado; el modelo es relacional y el estándar del propietario es Prisma/PostgreSQL.
