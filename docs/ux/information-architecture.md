# Arquitectura de información y UX

Referencias: §19–§24, §26, §32, §34, §50. Rutas de `apps/web` (App Router). Todos los textos visibles en español.

## Principios (§19)

Claridad, control, trazabilidad, mínima carga administrativa. No parecer una hoja de cálculo. En menos de 30 segundos el usuario entiende: qué pasó, qué es nuevo, qué está atrasado, qué necesita su intervención.

## Layout

**Sidebar** (orden fijo; visibilidad por permisos de `SessionDto.permissions`, pero el control real es server-side):

| Ítem           | Ruta              | Permiso mínimo                                                  |
| -------------- | ----------------- | --------------------------------------------------------------- |
| Inicio         | `/inicio`         | autenticado                                                     |
| Reuniones      | `/reuniones`      | `MEETING_READ`                                                  |
| Pendientes     | `/pendientes`     | `ACTION_ITEM_READ`                                              |
| Revisión IA    | `/revision-ia`    | `AI_REVIEW_RESOLVE` (badge con pendientes)                      |
| Reportes       | `/reportes`       | `REPORT_GLOBAL` o `REPORT_AREA`                                 |
| Equipo         | `/equipo`         | autenticado                                                     |
| Integraciones  | `/integraciones`  | `INTEGRATION_MANAGE`                                            |
| Configuración  | `/configuracion`  | autenticado (preferencias propias)                              |
| Administración | `/administracion` | `USER_MANAGE`, `CATALOG_MANAGE`, `CONFIG_MANAGE` o `AUDIT_READ` |

**Header**: buscador global (`/buscar?q=`), selector de periodo (esta semana, últimas 4 semanas, mes, rango), notificaciones, perfil (nombre, rol, cerrar sesión).

**Login** `/login`: botón "Continuar con Google". Con `AUTH_DEV_BYPASS` muestra además "Entrar como usuario de prueba" con selector por correo (seed).

## Pantallas

### Inicio — Dashboard (§20)

Propósito: visión ejecutiva y operativa en una pantalla, familiar respecto al `Dashboard` legado.

- **KPIs superiores**: Total abiertos · Completadas en el periodo · En proceso · Pendientes · Propuestas de cierre · % avance · Vencidas · Sin fecha · Reuniones procesadas / detectadas.
- **KPI por área** (tabla; áreas del catálogo, `Externos` como categoría especial): Total, Completadas, En proceso, Pendientes, Propuestas de cierre, Vencidas, % avance.
- **KPI por persona**: Total, Completadas, En proceso, Pendientes, Vencidas, % avance; filtros por área/proyecto/periodo.
- **Tendencia semanal** (Recharts): nuevas, completadas aprobadas, pendientes al fin de semana, vencidas, tasa de cierre; semanas ISO derivadas.
- **Necesitan atención**: lista ordenada por `attentionScore` con chips de razón (_Vencida y prioridad alta_, _Cierre por aprobar_, _Sin responsable_, _Sin fecha_, _Repetida sin avance_, _Bloqueada_, _Baja confianza IA_).
- **Calidad de captura** (§20.6): detectadas, con transcripción, con Smart Notes, sólo transcripción, sin artefacto, host externo/no accesible, errores de API. Cada cifra enlaza a Reuniones filtradas.

### Reuniones `/reuniones` (§21)

Tabla (TanStack Table): fecha, título, organizador, participantes, duración, estado transcripción, estado IA, acciones extraídas, nivel de confianza, estado de revisión. Filtros: rango de fechas, organizador, área, participante, procesada/no procesada, con tareas, confidencialidad. Badges: _Host externo_, _Excluida_, nivel de confidencialidad.

**Detalle** `/reuniones/[id]` con tabs:

1. **Resumen**: resumen ejecutivo (bullets), detallado, temas, riesgos, preguntas abiertas, idioma detectado, `extractionConfidence`, estado de procesamiento (§32) con explicación.
2. **Compromisos**: tarjetas por tarea (título, responsable, fecha, estado, confianza) con **Ver evidencia** y acceso a la tarea.
3. **Decisiones**: descripción, quién decidió, fecha efectiva, confianza, evidencia.
4. **Transcripción**: segmentos por speaker con timestamps (requiere `MEETING_READ_TRANSCRIPT`), búsqueda dentro del texto.
5. **Participantes**: internos/externos, tiempos.
6. **Historial IA**: corridas (`ProcessingRun`) con modelo, prompt, tokens, costo estimado, latencia; botón **Reprocesar** (`MEETING_REPROCESS`).
7. **Auditoría**: entradas de `AuditLog` de la reunión.

Acciones de cabecera: cambiar confidencialidad, excluir/incluir del análisis, reprocesar.

**Drawer "Ver evidencia"** (crítico para la confianza, §21): speaker, frase citada, timestamp, contexto anterior/posterior (±2 segmentos), enlace "Ir a la transcripción". Disponible en Compromisos, Decisiones, Revisión IA y en el detalle de tarea.

### Pendientes `/pendientes` (§22)

Herramienta operativa principal. Vistas (tabs/segmented): Todos · Mis pendientes · Mi equipo · Vencidos · Esta semana · Sin fecha · Sin responsable · Bloqueados · Completados (mapeadas a `view=` de la API). Columnas configurables (persistidas por usuario). Búsqueda y filtros por área, proyecto, prioridad, responsable.

Acciones rápidas por fila (según `canUpdateActionItem`): cambiar estado, cambiar responsable, cambiar fecha, prioridad, marcar bloqueado (con motivo), **Completar** (crea propuesta de cierre), abrir reunión origen.

**Detalle** `/pendientes/[id]`: campos editables, evidencia de origen, reuniones vinculadas (relación y evidencia), historial de estados, comentarios, propuestas de cierre con **Aprobar / Rechazar** (sólo si `canApproveCompletion`), reabrir (auditado), badge _Migrada_ con `legacyId`.

**Vista Kanban** (opcional, toggle): columnas Propuesto · Pendiente · En progreso · Bloqueado · Esperando · Cierre propuesto · Completado. Arrastrar aplica la misma máquina de estados; soltar en _Completado_ abre "Aprobar propuesta" en lugar de mover directamente.

### Revisión IA `/revision-ia` (§23)

Sólo elementos con confianza baja, responsable ambiguo, fecha ambigua, posible duplicado, posible tarea completada o conflicto con dato existente. Tarjeta:

```text
IA detectó:
"Carlos enviará la carta el próximo martes."          [Ver evidencia]

Responsable sugerido: Carlos Martínez (82 %)
Fecha sugerida: 2026-09-08 (94 %)
Coincide con pendiente existente: ACT-000291 (78 %)

[Actualizar existente]  [Crear nuevo]  [Descartar]
```

- **Actualizar existente** → `POST /ai-review/:id/merge` (vincula/actualiza la tarea candidata; permite editar responsable/fecha antes de confirmar).
- **Crear nuevo** → `POST /ai-review/:id/approve` (crea/acepta la tarea con los campos corregidos).
- **Descartar** → `POST /ai-review/:id/reject` con nota opcional.
- Propuestas de cierre (`POSSIBLE_COMPLETION`) muestran **Aprobar cierre / Rechazar** y llevan a la tarea.

Filtros por reunión y razón; contador en el sidebar.

### Reportes `/reportes` (§18)

- Lista de digests generados (semana, audiencia, generado, enviado, versión).
- **Generar digest semanal** (`DIGEST_GENERATE`) para la semana actual o anterior; vista con secciones A–G; **Vista previa de correo** (HTML); **Enviar** (`DIGEST_SEND`).
- Configuración del digest (`CONFIG_MANAGE`): habilitado, día (viernes/sábado…), hora, zona horaria, destinatarios (usuarios), áreas incluidas, incluir externos, adjuntar hoja, enviar por correo; muestra `nextRunAt`.

### Equipo `/equipo`

Usuarios, áreas y proyectos (lectura). Por persona: tareas abiertas/vencidas y reuniones recientes.

### Integraciones `/integraciones`

- **Estado Google**: modo (FAKE/REAL), flags activos, prueba por API/scope, suscripciones por usuario (expira, estado, último error), cursores de Calendar, últimos eventos entrantes.
- Botones: **Sincronizar suscripciones**, **Sincronizar calendario**, **Sincronizar Sheets (dry-run / real)** con vista previa de `Pendientes` y `Reuniones`.
- **Simular reunión terminada** (sólo modo FAKE): dispara el pipeline con fixtures.
- **Uso de IA**: corridas, tokens, costo estimado del periodo.
- **Jobs**: colas con creados/activos/completados/fallidos.

### Configuración `/configuracion`

Preferencias propias de notificación (§17) y `dueSoonDays`; idioma/zona horaria de visualización.

### Administración `/administracion`

Usuarios (rol, área, manager, activo, monitoreado), áreas, proyectos y aliases, ajustes de plataforma (feature flags, umbrales de confianza, auto-captura, retención, dominio), auditoría global (filtros por entidad/actor/fecha).

### Búsqueda `/buscar` (§24)

Fase 1: estructurada y full-text sobre reuniones, tareas y decisiones, con filtros. Resultados agrupados y siempre con la reunión fuente. Preparada para RAG con citas en fase 2.

## Flujo de aprobación (§9.7.1, ADR-010)

```text
Responsable pulsa "Completar" → se abre diálogo "Proponer cierre" (motivo, evidencia opcional)
→ tarea pasa a "Cierre propuesto" → aparece en Necesitan atención, Revisión IA (si es IA) y digest
→ aprobador (ADMIN/DIRECTOR/MANAGER con alcance) pulsa "Aprobar" → "Completada" (auditado)
   o "Rechazar" (comentario obligatorio) → vuelve a "Pendiente"/"En progreso"
```

La UI nunca ofrece un cambio directo a _Completada_.

## Estados de error en UI (§34)

Los `DomainErrorCode` se traducen en un diccionario central (`apps/web/lib/errors.ts`), p. ej. `GOOGLE_MEET_ARTIFACT_NOT_AVAILABLE` → "Google aún no generó la transcripción de esta reunión". Los estados de procesamiento muestran tooltip con la explicación y el siguiente paso.

## Etiquetas en español de los enums

| Enum                       | Valor                                                                        | Etiqueta                                                                         |
| -------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `ActionItemStatus`         | `PROPOSED`                                                                   | Propuesta                                                                        |
|                            | `PENDING`                                                                    | Pendiente                                                                        |
|                            | `IN_PROGRESS`                                                                | En progreso                                                                      |
|                            | `BLOCKED`                                                                    | Bloqueada                                                                        |
|                            | `WAITING`                                                                    | Esperando                                                                        |
|                            | `COMPLETION_PROPOSED`                                                        | Cierre propuesto                                                                 |
|                            | `COMPLETED`                                                                  | Completada                                                                       |
|                            | `CANCELLED`                                                                  | Cancelada                                                                        |
| `ActionItemPriority`       | `LOW` / `MEDIUM` / `HIGH` / `URGENT`                                         | Baja / Media / Alta / Urgente                                                    |
| `ActionItemType`           | `ONE_OFF` / `RECURRING`                                                      | Única / Recurrente                                                               |
| `MeetingProcessingStatus`  | `DISCOVERED`                                                                 | Detectada                                                                        |
|                            | `WAITING_FOR_ARTIFACTS`                                                      | Esperando artefactos                                                             |
|                            | `ARTIFACTS_AVAILABLE`                                                        | Artefactos disponibles                                                           |
|                            | `INGESTING` / `INGESTED`                                                     | Ingiriendo / Ingerida                                                            |
|                            | `ANALYZING` / `ANALYZED`                                                     | Analizando / Analizada                                                           |
|                            | `REVIEW_REQUIRED`                                                            | Requiere revisión                                                                |
|                            | `COMPLETED`                                                                  | Procesada                                                                        |
|                            | `FAILED`                                                                     | Con error                                                                        |
|                            | `EXCLUDED`                                                                   | Excluida                                                                         |
| `ArtifactStatus`           | `NOT_REQUESTED`                                                              | No solicitado                                                                    |
|                            | `PENDING`                                                                    | Pendiente                                                                        |
|                            | `AVAILABLE`                                                                  | Disponible                                                                       |
|                            | `INGESTED`                                                                   | Ingerido                                                                         |
|                            | `UNAVAILABLE`                                                                | No disponible                                                                    |
|                            | `UNAVAILABLE_EXTERNAL_HOST`                                                  | No accesible (host externo)                                                      |
|                            | `CAPABILITY_BLOCKED`                                                         | Bloqueado por política                                                           |
|                            | `FAILED`                                                                     | Error                                                                            |
| `AiAnalysisStatus`         | `NOT_STARTED` / `QUEUED` / `RUNNING` / `SUCCEEDED` / `FAILED` / `SKIPPED`    | Sin iniciar / En cola / En ejecución / Correcto / Error / Omitido                |
| `ConfidentialityLevel`     | `NORMAL` / `RESTRICTED` / `LEGAL` / `EXECUTIVE`                              | Normal / Restringida / Jurídica / Directiva                                      |
| `MeetingSource`            | `WORKSPACE_EVENT` / `CALENDAR_DISCOVERY` / `MANUAL_IMPORT` / `LEGACY_IMPORT` | Evento de Meet / Calendario / Manual / Migración                                 |
| `UserRole`                 | `ADMIN` / `DIRECTOR` / `MANAGER` / `MEMBER` / `AUDITOR`                      | Administrador / Director · Directora / Gerente / Integrante / Auditor · Auditora |
| `CompletionProposalStatus` | `PENDING` / `APPROVED` / `REJECTED` / `EXPIRED`                              | Pendiente / Aprobada / Rechazada / Expirada                                      |
| `AiReviewReason`           | `LOW_CONFIDENCE`                                                             | Baja confianza                                                                   |
|                            | `AMBIGUOUS_OWNER`                                                            | Responsable ambiguo                                                              |
|                            | `AMBIGUOUS_DUE_DATE`                                                         | Fecha ambigua                                                                    |
|                            | `POSSIBLE_DUPLICATE`                                                         | Posible duplicado                                                                |
|                            | `POSSIBLE_COMPLETION`                                                        | Posible tarea completada                                                         |
|                            | `CONFLICT_WITH_EXISTING`                                                     | Conflicto con dato existente                                                     |
| `RelationType`             | `CREATED` / `MENTIONED` / `UPDATED` / `BLOCKED` / `COMPLETED` / `REOPENED`   | Creada / Mencionada / Actualizada / Bloqueada / Cierre detectado / Reabierta     |
| `SubscriptionState`        | `ACTIVE` / `SUSPENDED` / `EXPIRED` / `DELETED` / `ERROR`                     | Activa / Suspendida / Expirada / Eliminada / Error                               |
| `AttentionReason`          | ver "Necesitan atención"                                                     | —                                                                                |

Las etiquetas viven en un único módulo (`packages/ui/src/labels.ts`) reutilizado por web, correos y exportación a Sheets.

## Accesibilidad y responsive

Componentes Radix/shadcn con roles ARIA; navegación por teclado en tablas y drawers; contraste AA; layout usable en tablet (sidebar colapsable).
