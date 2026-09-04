# Runbook: importación del Maestro de Tareas legado

Referencias: §16 (16.2–16.8), §37, §44.14–15, §46.2 P0-4/P0-6, §47 P1-5/6. Código: `scripts/legacy-import/`. Script raíz: `pnpm legacy:import`. Entidades: `ActionItem`, `ExternalAssignee`, `Project`/`ProjectAlias`, `UserAlias`, `ActionItemComment`, `LegacyImportBatch`, `LegacyImportReference`.

## Principio

El workbook `01_SMLXL_Maestro_de_Tareas_AGOSTO 2026.xlsx` es **fuente de migración y contrato funcional**, no base de datos (§16.1). Se leen las **hojas fuente** (`Jurídico`, `Ventas y Marketing`, `Operaciones y Proyectos`, `Admin y Finanzas`, `Dirección General`, `Captación de Capital`, `Servicio al Cliente`, `Externos`), nunca `Maestro` ni `Dashboard` (calculados). El archivo no se versiona (`imports/*.xlsx` ignorado).

## Procedimiento

### 1. Preparar

```bash
mkdir -p imports
cp "<ruta>/01_SMLXL_Maestro_de_Tareas_AGOSTO 2026.xlsx" ./imports/01_SMLXL_Maestro_de_Tareas_AGOSTO_2026.xlsx
pnpm db:migrate && pnpm db:seed   # catálogos base (áreas, usuarios) deben existir
```

Los usuarios internos deben estar cargados (seed o Directory) para resolver `Responsable` → `User`; las áreas deben existir con los nombres del legado (§20.2).

### 2. Dry-run

```bash
pnpm legacy:import --file ./imports/01_SMLXL_Maestro_de_Tareas_AGOSTO_2026.xlsx --dry-run
```

No escribe en BD. Genera `imports/report-<timestamp>.json` y un resumen en consola con:

- filas leídas por hoja y total (esperado: **173** = 166 internas + 7 externas, §16.3);
- mapeo de estados y conteo por estado canónico;
- responsables resueltos / no resueltos (candidatos por `normalizeText` y `trigramSimilarity`);
- proyectos/frentes y aliases propuestos;
- lista de **excepciones** (ver §4);
- comparación de KPIs contra baseline.

### 3. Revisar el reporte

Checklist:

- [ ] Total de filas = 173 (o explicar la diferencia: filas vacías, encabezados repetidos).
- [ ] Todos los responsables internos resueltos a un `User`; los no resueltos van a `ownerTextOriginal` y se listan para crear `UserAlias`.
- [ ] Hoja `Externos` → `ExternalAssignee` (no usuarios).
- [ ] Proyectos con variantes de nombre agrupados bajo un `Project` canónico con `ProjectAlias`; confirmar con negocio.
- [ ] Contradicciones `Status` vs `Completada` revisadas (el estado manda; el flag se descarta con nota en comentarios).
- [ ] Duplicados semánticos listados (no se fusionan).
- [ ] Recurrentes detectadas (`diaria`, `semanal`) → `type=RECURRING` con `recurrence` propuesta.
- [ ] KPIs de baseline reconciliados: 166 internas, 99 completadas por flag, 31 en proceso, 41 pendientes, 19 vencidas, avance ≈ 59.6 % (§16.3). Diferencias explicadas en el reporte.

Si hace falta corregir aliases o catálogos, hacerlo en **Administración** (áreas, proyectos, usuarios) y repetir el dry-run.

### 4. Commit

```bash
pnpm legacy:import --file ./imports/01_SMLXL_Maestro_de_Tareas_AGOSTO_2026.xlsx --commit
```

- Crea `LegacyImportBatch` (`mode=commit`, `report`).
- Por fila: UUID nuevo, `externalKey` (`ACT-000123`), `legacyId` (sin UNIQUE), `migrationTrust=LEGACY`, `source=LEGACY_IMPORT`, `LegacyImportReference { sourceFile, sourceSheet, sourceRow, rawPayload }`.
- Idempotente: `(sourceFile, sourceSheet, sourceRow)` es único; una segunda ejecución actualiza en lugar de duplicar.
- Comentarios del legado → `ActionItemComment` con `source=LEGACY_IMPORT`.
- `AuditLog` con `actorType=IMPORT` por entidad creada.
- Reuniones: por cada `Fecha de la junta` distinta por hoja se crea un `Meeting` `LEGACY_IMPORT` mínimo (título "Reunión <área> <fecha>") para conservar `createdFromMeetingId`; sin transcript.

### 5. Verificar

- Dashboard: KPIs por área y persona comparables con el `Dashboard` legado; diferencias documentadas en el reporte (§44.15).
- Pendientes → vista "Todos": tareas con badge _Migrada_.
- `Completo` importadas como `COMPLETED` con `migrationTrust=LEGACY` (no pasaron por aprobación, §16.5).
- `Entregado` como `COMPLETION_PROPOSED`: aparecen en la bandeja de aprobación para que una persona decida (P1-5).

## Mapeo de columnas (§16.2)

| Legado              | Destino                                                    | Regla                                                     |
| ------------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| `ID`                | `ActionItem.legacyId`                                      | no PK, no único                                           |
| `Pendiente`         | `title`                                                    | normalizado; si vacío → excepción                         |
| `Responsable`       | `ownerUserId` / `externalAssigneeId` / `ownerTextOriginal` | resolución por alias normalizado                          |
| `Departamento`      | `areaId`                                                   | catálogo; `Externos` → `Area.isExternalCategory`          |
| `Proyecto / Frente` | `projectId`                                                | catálogo canónico + `ProjectAlias`                        |
| `Fecha de la junta` | `Meeting.startAt` (reunión origen)                         | —                                                         |
| `Semana`            | —                                                          | derivada (`isoWeekOf`), no se importa                     |
| `Prioridad`         | `priority`                                                 | `normalizePriority` (Alta→HIGH, Media→MEDIUM, Baja→LOW)   |
| `Status`            | `status`                                                   | `initialStatusFromLegacy` (§16.5)                         |
| `Completada`        | —                                                          | eliminado; sólo para detectar contradicciones             |
| `Vencido?`          | —                                                          | no se persiste; `isOverdue` se deriva de `dueDate` (P0-4) |
| `Comentarios`       | `ActionItemComment`                                        | texto íntegro                                             |
| (sin columna)       | `dueDate = null`, `dateConfidence = null`                  | mostrar `SIN FECHA`; humano asigna                        |

## Problemas de calidad conocidos (§16.4) y tratamiento

| #   | Problema                                                                                                                                  | Tratamiento                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | `ID` repetidos entre y dentro de hojas                                                                                                    | `legacyId` sin unicidad; trazabilidad por `(sheet,row)`                                           |
| 2   | `Status` vs `Completada` contradictorios                                                                                                  | prevalece `Status`; se agrega comentario `SYSTEM` y la fila va al reporte                         |
| 3   | Variantes de casing/ortografía (`Completo`/`completo`, `Andrés`/`Andres`, `Lisa de la Fuente`/`Lisa de La Fuente`, `Escandón`/`Escandon`) | `normalizeText` (sin acentos, minúsculas) + aliases                                               |
| 4   | Vacíos/`0` en columnas de negocio                                                                                                         | `isBlankLike` → null; título vacío = excepción                                                    |
| 5   | `Vencido?` sin fecha compromiso                                                                                                           | no se importa; pendiente P0-4                                                                     |
| 6   | Comentarios con estados ambiguos en tareas "completas" ("falta…", "por revisar", "en pausa")                                              | se marcan `requiresReview=true` y se listan en el reporte; no se cambia el estado automáticamente |
| 7   | Actividades recurrentes                                                                                                                   | `detectRecurrenceHint` → `type=RECURRING` + `recurrence`; nunca se cierran "para siempre"         |
| 8   | Proyectos equivalentes con nombres distintos                                                                                              | agrupación propuesta por `trigramSimilarity`; confirmación humana antes del commit                |

## Decisiones por defecto adoptadas (ver `docs/decisions-log.md`)

- P0-6: se importan **todas** las tareas; completas como historial, abiertas al backlog; sesión de depuración de duplicados antes del go-live.
- P0-4: `dueDate=null` en migración hasta definir la regla de "Vencido".
- P1-5: `Entregado` → `COMPLETION_PROPOSED`.

## Generar fixture sintética (sin datos reales)

```bash
pnpm legacy:fixture   # crea tests/fixtures/legacy/maestro-sintetico.xlsx con la misma estructura y problemas de calidad simulados
```

Se usa en pruebas de integración del importador.
