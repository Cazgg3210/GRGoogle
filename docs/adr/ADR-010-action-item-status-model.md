# ADR-010 — Modelo unificado de estados de ActionItem

**Estado:** Aceptada (2026-09-03)
**Referencias:** §9.7, §9.7.1, §16.5, §16.7, §22 (Kanban), §44.12–13, §47 P1-5
**Código:** `packages/domain/src/enums.ts` (`ActionItemStatus`), `packages/domain/src/rules/action-item-state-machine.ts`, `prisma/schema.prisma`

## Contexto

La especificación define dos conjuntos de estados: §9.7 (`PROPOSED, OPEN, IN_PROGRESS, BLOCKED, WAITING, DONE, CANCELLED`) y §16.5 (`PENDING, IN_PROGRESS, BLOCKED, COMPLETION_PROPOSED, COMPLETED, CANCELLED`) con la regla inmutable de §9.7.1: una `CompletionProposal` aprobada es la única ruta IA hacia `COMPLETED`. El Kanban de §22 menciona además "Propuesto" y "Esperando". Se requiere un único enum coherente en dominio, Prisma, contratos y UI.

## Decisión

Un solo enum `ActionItemStatus`:

```text
PROPOSED              creada por IA con confianza media/baja; pendiente de aceptación humana (§9.7)
PENDING               abierta y aceptada (= OPEN de §9.7, = Pendiente del legado, §16.5)
IN_PROGRESS
BLOCKED
WAITING               esperando a un tercero/dependencia (§9.7, §22)
COMPLETION_PROPOSED   cierre propuesto por IA o usuario; requiere aprobación (§16.5)
COMPLETED             (= DONE de §9.7)
CANCELLED
```

Transiciones (`canTransition(from, to, ctx)`):

- Humanas: `PROPOSED → PENDING | IN_PROGRESS | CANCELLED`; entre `PENDING / IN_PROGRESS / BLOCKED / WAITING` libremente y hacia `COMPLETION_PROPOSED` o `CANCELLED`; `COMPLETION_PROPOSED → COMPLETED` (sólo con `viaApprovedCompletionProposal=true` y actor `USER`) o `→ PENDING | IN_PROGRESS | CANCELLED` (rechazo); `COMPLETED → IN_PROGRESS` (reapertura auditada); `CANCELLED → PENDING`.
- IA: únicamente `PENDING / IN_PROGRESS / BLOCKED / WAITING → COMPLETION_PROPOSED` (creando la `CompletionProposal`); la IA crea tareas nuevas directamente en `PROPOSED` (o `PENDING` vía confidence gate) sin transición.
- IMPORT: ninguna transición; fija el estado inicial con `initialStatusFromLegacy`.
- Un humano tampoco salta a `COMPLETED`: el caso de uso "Completar" crea una `CompletionProposal` (USER) y el aprobador la aprueba; si quien completa tiene permiso de aprobación, ambos pasos ocurren en la misma transacción dejando la traza.

Mapeo del legado (§16.5): `Pendiente → PENDING`, `En proceso → IN_PROGRESS`, `Completo/completo → COMPLETED` con `migrationTrust=LEGACY`, `Entregado → COMPLETION_PROPOSED`, `Bloqueado/En pausa → BLOCKED`, `Cancelado → CANCELLED`, vacío/desconocido → `PENDING` con `recognized=false` (reporte).

Estados abiertos (`OPEN_ACTION_ITEM_STATUSES`): todos salvo `COMPLETED` y `CANCELLED`. `isOverdue` sólo aplica a abiertos. Recurrentes (`type=RECURRING`) usan instancias hijas (`parentActionItemId`); completar una instancia no cierra la regla.

## Consecuencias

- Prisma, Zod (`ActionItemStatusSchema`), UI (etiquetas en español) y Sheets usan el mismo enum.
- La API rechaza `PATCH status=COMPLETED` con `ACTION_ITEM_COMPLETION_REQUIRES_APPROVAL` (422).
- Kanban de §22 mapea columnas: Propuesto=`PROPOSED`, Abierto=`PENDING`, En progreso, Bloqueado, Esperando=`WAITING`, Cierre propuesto, Completado.
- Los KPIs "Pendientes" del dashboard cuentan `PENDING` (+ `PROPOSED` en vista de revisión), "Propuestas de cierre" cuentan `COMPLETION_PROPOSED`.

## Alternativas consideradas

- **Mantener dos enums (dominio vs legado)**: rechazado; duplicaría reglas y confundiría la UI.
- **`DONE` como sinónimo de `COMPLETED`**: rechazado; un solo nombre.
- **Permitir a MEMBER completar directamente su tarea**: rechazado; contradice §5.1.10 y §44.12.
