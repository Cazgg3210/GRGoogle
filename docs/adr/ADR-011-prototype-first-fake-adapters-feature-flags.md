# ADR-011 — Prototipo primero con adapters fake y feature flags

**Estado:** Aceptada (2026-09-03)
**Referencias:** §37, §43 (Fase 0 bloqueada por tenant), §45.13, §45.17, §49, §50, §51
**Código:** `packages/config/src/index.ts` (`googleMode`, `aiMode`, `featureFlagsFromEnv`), `packages/domain/src/entities.ts` (`FeatureFlags`), `PlatformSetting.featureFlags`

## Contexto

La Fase 0 (spike con el tenant real) no puede ejecutarse desde este entorno: requiere Super Admin, proyecto GCP con facturación y credenciales que no deben existir en el repositorio. Sin embargo, §50 pide un prototipo demostrable de punta a punta y §49 indica no bloquear el desarrollo por P1/P2. Todas las integraciones externas deben poder deshabilitarse (§45.13) y mantener adapters fake (§45.17).

## Decisión

1. **Todo acceso a Google y Gemini está detrás de puertos del dominio** (`MeetingCapturePort`, `WorkspaceEventsPort`, `CalendarPort`, `DirectoryPort`, `DrivePort`, `MailPort`, `SheetsPort`, `AiMeetingAnalyzer`).
2. Cada puerto tiene un **adapter fake determinístico** alimentado por fixtures anonimizadas (`tests/fixtures/`) y un adapter real.
3. La selección se hace al arrancar cada proceso: `GOOGLE_INTEGRATION_ENABLED=false` → fakes Google; `AI_PROCESSING_ENABLED=false` → `FakeAiAnalyzer`. Con flag en `true` pero sin credenciales también se usa fake (`googleMode()`/`aiMode()`), evitando fallos en dev.
4. Los siete flags de §51 existen como env y pueden sobreescribirse en BD desde Administración; los casos de uso los consultan en cada ejecución (`SettingsRepository`) y lanzan `FEATURE_DISABLED` cuando corresponde.
5. El seed (§37) y el endpoint `POST /integrations/simulate/meeting-ended` permiten recorrer la demo completa de §50 sin Google.
6. La transición a producción es incremental: activar `GOOGLE_INTEGRATION_ENABLED` → `GOOGLE_MEET_EVENTS_ENABLED` → `AI_PROCESSING_ENABLED` → `GMAIL_NOTIFICATIONS_ENABLED` → `SHEETS_SYNC_ENABLED`, validando cada paso con la pantalla Integraciones.

## Consecuencias

- El equipo puede construir UI, casos de uso, pruebas y demo ahora; la Fase 0 se ejecuta después como runbook (`docs/google-spike-results.md`) y sólo ajusta adapters reales/scopes.
- Riesgo: los fakes pueden divergir del comportamiento real de Google (latencias, campos, errores). Mitigación: fixtures basadas en la documentación oficial, pruebas de contrato contra schemas Zod, y actualización de fixtures con respuestas reales anonimizadas del spike.
- Doble implementación por puerto; aceptable dado el tamaño acotado de cada interfaz.
- Las pruebas de integración corren siempre con fakes; las pruebas contra Google real quedan fuera de CI (manuales/spike).

## Alternativas consideradas

- **Esperar al spike antes de construir**: rechazado; bloquearía el prototipo y la validación UX.
- **Mocks sólo en tests, sin fakes en runtime**: rechazado; la demo debe funcionar sin credenciales (§37).
- **Flags únicamente en env**: insuficiente; §45.13 requiere apagar automatizaciones sin redeploy.
