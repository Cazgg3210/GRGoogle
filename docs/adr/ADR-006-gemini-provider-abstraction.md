# ADR-006 — Abstracción del proveedor Gemini

**Estado:** Aceptada (2026-09-03); elección Vertex vs Gemini API para producción pendiente (P0-2)
**Referencias:** §5.3.3, §10.3, §10.4, §11, §35, §45.4, §45.11

## Contexto

La licencia Gemini incluida en Workspace cubre funciones de usuario (notas en Meet), no cuota de API para un backend propio. El procesamiento IA debe ser reemplazable, versionado, con salida estructurada y sin claves en frontend. La demo debe funcionar sin proveedor real.

## Decisión

- Interfaz de dominio `AiMeetingAnalyzer` (`analyzeMeeting`, `reconcileActionItems`, `generateWeeklyDigest`) en `packages/domain/src/ai-types.ts`, con `AiResponse<T>` que incluye `AiUsage` (§35).
- Implementaciones en `packages/ai`: `GeminiAdapter` sobre **Google Gen AI SDK** (`@google/genai`), configurable para **Gemini API** (prototipo, `GEMINI_API_KEY`) o **Vertex AI** (producción, `GOOGLE_GENAI_USE_VERTEXAI=true` + proyecto/región); y `FakeAiAnalyzer` determinístico.
- `aiMode(env)` en `@smlxl/config` decide la implementación; `AI_PROCESSING_ENABLED=false` fuerza el fake.
- Toda salida se pide como JSON con `responseSchema` y se valida con los schemas Zod de `@smlxl/contracts` (`AI_SCHEMA_VERSION`); fallo → `AI_INVALID_OUTPUT`.
- Prompts versionados en `packages/ai/src/prompts/`; cada corrida persiste `provider`, `model`, `promptVersion`, `schemaVersion`, `temperature`, tokens, costo estimado y latencia en `ProcessingRun`.
- Contexto compacto: Smart Notes primero, chunking para reuniones largas, acciones abiertas relacionadas (no el backlog completo).

## Consecuencias

- Cambiar de modelo o de proveedor (p. ej. otro LLM) sólo requiere un adapter nuevo.
- El proyecto GCP necesita facturación para Gemini/Vertex (P0-2); en producción se recomienda Vertex AI por IAM, residencia de datos y cuotas empresariales.
- Los cambios de prompt/schema son reproducibles y comparables por reunión (reproceso crea corrida nueva).
- El fake debe mantenerse plausible para la demo; se alimenta de fixtures.

## Alternativas consideradas

- **Llamar Gemini desde Next.js**: prohibido (§45.4).
- **Parsear texto libre**: prohibido (§10.3).
- **Usar sólo Smart Notes de Google sin análisis propio**: insuficiente para reconciliación, evidencia y confianza por campo; queda como contexto de entrada.
