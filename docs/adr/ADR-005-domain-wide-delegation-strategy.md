# ADR-005 — Estrategia de Domain-Wide Delegation

**Estado:** Aceptada (2026-09-03); set de scopes pendiente de Fase 0
**Referencias:** §5.2, §6.5, §13.4, §27, §43 (0.2), §45.6, `docs/security/google-oauth-scopes.md`

## Contexto

Meet REST API, Calendar, Workspace Events, Gmail y Sheets requieren autenticación de usuario. La plataforma debe operar sin intervención humana sobre las 10 cuentas del dominio. SMLXL dispone de Super Admin. §27 exige mínimo privilegio, inventario de scopes y secretos fuera del repositorio.

## Decisión

- Una **service account dedicada** por entorno con **Domain-Wide Delegation** autorizada por el Super Admin para un conjunto explícito de scopes oficiales (candidatos en `scopes.ts`; definitivos tras el spike).
- **Impersonación por recurso**: cada llamada se hace `asUser` del dueño (organizador para Meet, cada usuario monitoreado para Calendar/Events, la cuenta funcional para Gmail/Sheets). El adapter rechaza usuarios fuera de `GOOGLE_WORKSPACE_DOMAIN` o no monitoreados. No existe cuenta omnipotente.
- **Scopes por grupo de adapter** (`scopesFor('meet')`, `scopesFor('calendar')`…), nunca un superconjunto único.
- **Login de usuarios separado**: cliente OAuth web con `openid email profile`, tipo interno, validación de `hd`; sin scopes de datos.
- Credenciales sólo en secretos del despliegue; preferir Workload Identity cuando la infraestructura lo permita; rotación ≥ cada 90 días.

## Consecuencias

- Requiere pasos manuales del Super Admin (runbook `google-auth.md`) y no puede validarse fuera del tenant real (Fase 0).
- Cualquier scope nuevo implica actualizar la delegación en Admin Console y este inventario.
- La impersonación por usuario aumenta el número de tokens en caché (uno por usuario y grupo de scopes); se gestiona con `google-auth-library` y TTL.
- Errores `GOOGLE_PERMISSION_DENIED` diferenciados de `GOOGLE_CAPABILITY_BLOCKED` para diagnosticar DWD vs políticas de Meet.

## Alternativas consideradas

- **OAuth por usuario (cada persona autoriza la app)**: descartado; requiere consentimiento y re-autorización de 10 personas, no cubre cuentas funcionales ni procesos sin sesión.
- **Cuenta de servicio con roles de administrador amplios**: prohibido por §13.4.
- **API keys**: no aplican a APIs de Workspace con datos de usuario.
