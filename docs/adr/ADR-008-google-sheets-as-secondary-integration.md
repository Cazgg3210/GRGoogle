# ADR-008 — Google Sheets como integración secundaria

**Estado:** Aceptada (2026-09-03); opción B adoptada por defecto, pendiente confirmación P0-5
**Referencias:** §1, §5.3.5, §16.9, §44.19, §45.16, §46.2 P0-5, §53

## Contexto

El negocio pidió "automatizar la incorporación de información a una hoja de Google Sheets si resulta conveniente" y hoy opera con un workbook. Debe decidirse si el Sheet sigue siendo editable (C), pasa a histórico (A) o se convierte en exportación (B). Un Sheet como maestro reproduciría los problemas de §16.4.

## Decisión

Google Sheets es una **proyección de salida** (opción **B**): la plataforma escribe periódicamente las hojas `Pendientes` y `Reuniones` con `UUID` como clave de upsert. Reglas: nunca posición de fila como identificador, nunca borrado de filas, valores derivados calculados en la plataforma, ediciones manuales sobrescritas en la siguiente sincronización. `SheetsPort` con `FakeSheetsAdapter` (preview) y `GoogleSheetsAdapter`; flag `SHEETS_SYNC_ENABLED`; endpoint manual con `dryRun`.

La sincronización bidireccional (opción C) **no** se implementa; requeriría ADR nuevo, resolución de conflictos y validación de ediciones.

## Consecuencias

- Compatibilidad con hábitos actuales (consultar en Sheets) sin divergencia de datos (§53).
- Scope `spreadsheets` limitado por configuración a un único spreadsheet (candidato — confirmar en spike).
- Si el negocio elige C, se añadirá lectura de cambios con validación por `UUID` y marcas de tiempo.
- El digest puede adjuntar una exportación equivalente sin depender del Sheet.

## Alternativas consideradas

- **A — sólo histórico**: viable; se reduce a apagar `SHEETS_SYNC_ENABLED`.
- **C — bidireccional**: pospuesta hasta confirmar que los usuarios seguirán editando.
- **Sheet como base de datos**: prohibido (§45.16).
