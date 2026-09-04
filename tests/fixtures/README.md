# Fixtures

Referencias: §36 ("fixtures realistas anonimizados"), §37, §45.17, ADR-011. Las fixtures alimentan los **adapters fake** en runtime (demo) y las pruebas de integración/contrato.

## Regla de oro

**Nunca datos reales de SMLXL.** Nombres, correos, clientes, proyectos y frases de transcripción son ficticios (`usuario1@smlxl.mx`, "Cliente Alfa", "Proyecto Beta"). Cuando la Fase 0 produzca respuestas reales de Google, se guardan aquí **sólo después de anonimizarlas** (sin IDs reales de usuario, sin correos, sin texto identificable) y con la misma forma que la API oficial.

## Estructura

```text
tests/fixtures/
├── google/
│   ├── meet/          spaces, conferenceRecords, participants, transcripts + entries, smartNotes
│   ├── events/        CloudEvents de Workspace Events (8 tipos §13.1) y envelopes Pub/Sub
│   ├── calendar/      events.list con syncToken; reuniones internas y con host externo
│   ├── directory/     users.list del dominio (10 cuentas ficticias)
│   ├── gmail/         mensajes enviados esperados (snapshot HTML/texto)
│   └── sheets/        hojas Pendientes/Reuniones esperadas tras un sync
├── ai/
│   ├── analyze/       MeetingAnalysisResult por reunión demo (válidos contra MeetingAnalysisResultSchema)
│   ├── reconcile/     ReconcileResult por caso (CREATE_NEW, LINK_EXISTING, MARK_DONE_CANDIDATE, REQUIRES_HUMAN_REVIEW…)
│   └── digest/        WeeklyDigestResult
├── legacy/
│   └── maestro-sintetico.xlsx   workbook sintético con la estructura y problemas de calidad de §16.4 (generado con `pnpm legacy:fixture`)
└── README.md
```

## Convenciones

- Un archivo JSON por recurso o por escenario, nombrado por su clave estable: `conferenceRecords__demo-cliente-alfa.json`, `events__transcript-fileGenerated__demo-cliente-alfa.json`.
- Los identificadores siguen el formato de Google (`spaces/abc-defg-hij`, `conferenceRecords/…`, `//cloudidentity.googleapis.com/users/1000000000000000001`) pero son sintéticos.
- Fechas en ISO 8601 con zona; las fixtures de calendario usan `America/Mexico_City`.
- Los fakes indexan por meeting code / resource name; escenarios especiales se activan con códigos reservados documentados en cada adapter fake (p. ej. `ext-host-0001` → host externo, `blocked-0001` → `CAPABILITY_BLOCKED`, `empty-0001` → `TRANSCRIPT_EMPTY`).
- Toda fixture de IA debe validar contra los schemas de `@smlxl/contracts`; hay una prueba de contrato que lo verifica.
- Toda fixture Google debe validar contra los schemas de `@smlxl/contracts/google.ts` o los tipos de `ports.ts`.

## Reunión demo principal (§50)

`Seguimiento contrato Cliente Alfa`: transcript en español con ~40 segmentos, 3 compromisos (uno coincide con una tarea existente `ACT-000291`), 2 decisiones, Smart Notes resumidas. Es la base de la demostración y de varios escenarios E2E.

## Actualizar fixtures tras el spike

1. Guardar la respuesta real redactada en el subdirectorio correspondiente.
2. Ejecutar las pruebas de contrato: si la forma cambió, ajustar el adapter real y el fake.
3. Anotar en `docs/google-spike-results.md` qué fixture proviene de qué prueba.
