# ADR-007 — Confianza de la IA y revisión humana

**Estado:** Aceptada (2026-09-03)
**Referencias:** §5.1.10, §9.7.1, §10.1, §10.2 (pasos 6–7), §18.3.F, §23, §44.12–13, §45.12, §53

## Contexto

El negocio confirmó que una tarea jamás se cierra sólo porque la IA infiera que terminó. Los LLM pueden inventar responsables, fechas o duplicar compromisos. La confianza del usuario depende de la trazabilidad (§53: "usuario pierde confianza en IA").

## Decisión

1. **Evidencia obligatoria**: ninguna tarea, decisión o propuesta de cierre se crea sin al menos una cita (`EvidenceQuote` con speaker/timestamp) enlazable desde la UI ("Ver evidencia").
2. **Confidence gate configurable** (`rules/confidence-gate.ts`, `PlatformSetting.confidenceThresholds`): `>= 0.90` autoacepta campos no críticos; `0.70–0.89` crea `PROPOSED` con indicador; `< 0.70` sólo `AiReviewItem`.
3. **Campos críticos siempre revisables**: responsable ambiguo, fecha ambigua, posible duplicado, posible cierre y conflicto con dato existente generan `AiReviewItem` con razones explícitas; la pantalla Revisión IA ofrece _Actualizar existente / Crear nuevo / Descartar_.
4. **Cierre sólo humano**: la IA crea `CompletionProposal` (si `AI_COMPLETION_PROPOSALS_ENABLED`); `COMPLETED` requiere aprobación de un usuario con `ACTION_ITEM_APPROVE_COMPLETION` (ADR-010).
5. **Reconciliación híbrida**: reglas + full-text + similitud determinística + LLM judge con contexto limitado; nunca fusión automática de duplicados.
6. **Todo auditado**: aceptar, fusionar, descartar, aprobar y rechazar quedan en `AuditLog` con actor y motivo; el job de digest nunca cambia estados.
7. Métrica `ai_review_rate` para calibrar umbrales con datos reales (§55).

## Consecuencias

- Más fricción inicial (bandeja de revisión) a cambio de confianza y datos limpios; el objetivo es < 10 % de propuestas con corrección significativa (§55).
- Los umbrales se ajustan desde Administración sin redeploy.
- La reapertura de tareas por IA también pasa por revisión (`REOPEN_CANDIDATE`).

## Alternativas consideradas

- **Autoaceptar todo con confianza alta, incluido el cierre**: rechazado por el requisito confirmado del negocio.
- **Revisión humana de todo**: rechazado; contradice el objetivo de reducir ≥ 70 % el trabajo manual.
- **Sólo embeddings para duplicados**: rechazado por §10.2.
