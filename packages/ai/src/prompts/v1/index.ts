import type { AnalyzeMeetingInput, ReconcileInput, WeeklyDigestInput } from '@smlxl/domain'
import { AI_SCHEMA_VERSION } from '@smlxl/contracts'

/**
 * Prompts v1 (§10.4). Cualquier cambio de semántica exige nueva versión;
 * `ProcessingRun.promptVersion` permite reprocesar sin perder análisis previos.
 */
export const PROMPT_VERSION = 'v1'

const OUTPUT_RULES = `REGLAS DE SALIDA
- Responde ÚNICAMENTE con un objeto JSON válido que cumpla el schema indicado. Sin texto adicional, sin markdown, sin comentarios.
- Todos los textos en español neutro (México). No traduzcas nombres propios ni citas.
- Nunca inventes información. Si algo no está en la transcripción, usa null o una lista vacía.
- Las citas de evidencia ("evidence.text") deben ser fragmentos VERBATIM de la transcripción (copiados tal cual, máximo 300 caracteres), con el "speaker" si se conoce.`

export const ANALYZE_SYSTEM_PROMPT = `Eres un analista de reuniones corporativas de SMLXL. Recibes la transcripción estructurada de una reunión de Google Meet (segmentos con hablante), opcionalmente las notas automáticas ("Smart Notes"), la lista de participantes y un contexto compacto de compromisos abiertos relacionados.

Tu trabajo es producir un análisis estructurado y conservador:
1. Idioma: detecta el idioma principal (código BCP-47, p. ej. "es-MX") y si hubo mezcla de idiomas.
2. Temas y subtemas tratados; proyecto/cliente/asunto probable ("projectHint"); sensibilidad (NORMAL, RESTRICTED, LEGAL, EXECUTIVE) según el contenido (temas legales/contractuales sensibles → LEGAL; decisiones de dirección/compensaciones → EXECUTIVE).
3. Resumen ejecutivo de 3 a 7 viñetas, resumen detallado, puntos que requieren atención, riesgos y preguntas abiertas.
4. Decisiones: SOLO decisiones explícitas o altamente probables ("se acordó", "quedamos en", "decidimos"). Cada una con evidencia verbatim, quién la tomó si se identifica, fecha efectiva si se menciona y confianza 0-1.
5. Compromisos (action items): SOLO compromisos explícitos donde alguien se compromete a hacer algo o se asigna una tarea. No conviertas comentarios, ideas o preguntas en tareas.

REGLAS PARA COMPROMISOS
- "title": verbo en infinitivo + objeto, máximo 120 caracteres (ej. "Enviar carta de intención firmada").
- "owner": la persona responsable. Usa el nombre tal como aparece en participantes y el email si lo conoces. Si el responsable es un área ("Jurídico") y no una persona, usa el nombre del área. Si no es claro, owner = null. Incluye "evidence" con la frase verbatim que lo sustenta.
- "dueDate": fecha absoluta YYYY-MM-DD. Resuelve fechas relativas ("mañana", "el próximo martes", "para el viernes", "fin de mes", "en dos semanas") usando referenceDate y timezone del contexto: "el viernes"/"para el viernes" = el siguiente viernes posterior a referenceDate; "fin de mes" = último día del mes de referenceDate. Si no se menciona fecha, dueDate = null. Conserva el texto original en "dueDateTextOriginal".
- "priority": URGENT si se dice "urgente"/"crítico"; HIGH si "prioridad"/"importante"/"cuanto antes"; de lo contrario null.
- "statusHint":
  * NEW: compromiso nuevo que no aparece en el contexto de acciones abiertas.
  * UPDATE: se refiere a un compromiso ya existente del contexto (nueva fecha, avance, cambio de responsable). Indica su clave en "relatedOpenActionKey".
  * DONE: en la reunión se afirma que la tarea YA se completó ("ya quedó", "ya lo envié", "está listo").
  * BLOCKED: la tarea está detenida esperando a un tercero o dependencia.
  * UNKNOWN: no se puede determinar.
- "relatedOpenActionKey": la clave (ej. ACT-000291) del compromiso abierto del contexto al que se refiere, o null.
- "recurringHint": true si es una actividad recurrente ("seguimiento diario", "cada semana").
- "confidence": 0-1. Alta (>=0.9) sólo si responsable, acción y contexto son inequívocos; media (0.7-0.89) si falta fecha o el responsable se infiere; baja (<0.7) si es ambiguo.
- "extractionConfidence": calidad global de la extracción considerando claridad de la transcripción.

${OUTPUT_RULES}
schemaVersion debe ser exactamente "${AI_SCHEMA_VERSION}".`

function formatParticipants(input: AnalyzeMeetingInput): string {
  if (input.participants.length === 0) return '(sin lista de participantes)'
  return input.participants
    .map(
      (p) =>
        `- ${p.displayName}${p.email ? ` <${p.email}>` : ''} (${p.isInternal ? 'interno' : 'externo'})`,
    )
    .join('\n')
}

function formatOpenActions(input: AnalyzeMeetingInput): string {
  if (input.openActions.length === 0) return '(sin compromisos abiertos relacionados)'
  return input.openActions
    .map(
      (a) =>
        `- ${a.externalKey} | ${a.title} | responsable: ${a.ownerName ?? 'sin asignar'} | estado: ${a.status} | vence: ${a.dueDate ?? 'sin fecha'}${a.projectName ? ` | proyecto: ${a.projectName}` : ''}`,
    )
    .join('\n')
}

export function formatSegments(segments: AnalyzeMeetingInput['segments']): string {
  return segments
    .map(
      (s) =>
        `[${s.sequence}] ${s.startTime ? `(${s.startTime}) ` : ''}${s.speakerLabel}: ${s.text}`,
    )
    .join('\n')
}

export function buildAnalyzeUserPrompt(
  input: AnalyzeMeetingInput,
  options: { chunk?: { index: number; total: number } } = {},
): string {
  const chunkNote = options.chunk
    ? `\nNOTA: esta es la parte ${options.chunk.index + 1} de ${options.chunk.total} de una transcripción larga. Analiza sólo lo que aparece aquí; se consolidará después.\n`
    : ''
  return `CONTEXTO
- Reunión: ${input.meeting.title}
- Inicio: ${input.meeting.startAt}${input.meeting.endAt ? ` | Fin: ${input.meeting.endAt}` : ''}
- Organizador: ${input.meeting.organizerEmail ?? 'desconocido'}
- Dominio interno: ${input.companyDomain}
- referenceDate: ${input.referenceDate} | timezone: ${input.timezone}
- Idioma reportado por Google: ${input.meeting.reportedLanguageCode ?? 'desconocido'}
${chunkNote}
PARTICIPANTES
${formatParticipants(input)}

COMPROMISOS ABIERTOS RELACIONADOS (contexto, no los repitas como nuevos)
${formatOpenActions(input)}

${input.smartNotesText ? `NOTAS AUTOMÁTICAS (Smart Notes)\n${input.smartNotesText}\n\n` : ''}TRANSCRIPCIÓN (formato: [secuencia] (hora) Hablante: texto)
${formatSegments(input.segments)}

Devuelve el análisis JSON conforme al schema.`
}

export const CONSOLIDATE_SYSTEM_PROMPT = `Eres un analista de reuniones de SMLXL. Recibirás varios análisis parciales (JSON) de fragmentos consecutivos de UNA misma reunión. Consolídalos en un único análisis:
- Une temas y resúmenes sin repetir; el resumen ejecutivo debe tener 3-7 viñetas.
- Fusiona compromisos duplicados (misma acción y responsable) conservando la evidencia más clara, la fecha más específica y la confianza más alta.
- Fusiona decisiones duplicadas.
- No inventes nada que no esté en los parciales.
${OUTPUT_RULES}
schemaVersion debe ser exactamente "${AI_SCHEMA_VERSION}".`

export function buildConsolidateUserPrompt(
  partials: unknown[],
  input: AnalyzeMeetingInput,
): string {
  return `Reunión: ${input.meeting.title} | referenceDate: ${input.referenceDate} | timezone: ${input.timezone}

ANÁLISIS PARCIALES (en orden):
${partials.map((p, i) => `--- PARTE ${i + 1} ---\n${JSON.stringify(p)}`).join('\n')}

Devuelve el análisis consolidado JSON conforme al schema.`
}

export const RECONCILE_SYSTEM_PROMPT = `Eres el juez de reconciliación de compromisos de SMLXL. Recibes un compromiso extraído de una reunión y hasta 5 compromisos abiertos candidatos del backlog, cada uno con un puntaje determinístico previo ("preScore").

Decide UNA de las opciones:
- LINK_EXISTING: el compromiso extraído es el mismo que un candidato y sólo se volvió a mencionar (sin cambios relevantes).
- UPDATE_EXISTING: es el mismo que un candidato y aporta cambios (nueva fecha, avance, bloqueo, responsable).
- MARK_DONE_CANDIDATE: es el mismo que un candidato y en la reunión se afirma que ya se completó.
- REOPEN_CANDIDATE: coincide con un candidato ya completado pero se habla de él como pendiente.
- CREATE_NEW: no corresponde a ningún candidato.
- REQUIRES_HUMAN_REVIEW: hay ambigüedad real entre dos o más candidatos o no puedes decidir.

Reglas: no fusiones compromisos distintos aunque compartan responsable; dos tareas del mismo proyecto con acciones diferentes son distintas. "matchedActionItemId" debe ser el id de un candidato o null. "confidence" 0-1 refleja tu seguridad. "rationale" en español, máximo 2 frases.
${OUTPUT_RULES}`

export function buildReconcileUserPrompt(input: ReconcileInput): string {
  const e = input.extracted
  return `REUNIÓN: ${input.meetingTitle} | referenceDate: ${input.referenceDate}

COMPROMISO EXTRAÍDO
- título: ${e.title}
- descripción: ${e.description ?? '(ninguna)'}
- responsable: ${e.owner?.name ?? e.owner?.email ?? 'sin asignar'}
- fecha: ${e.dueDate ?? 'sin fecha'} (${e.dueDateTextOriginal ?? ''})
- statusHint: ${e.statusHint}
- relatedOpenActionKey: ${e.relatedOpenActionKey ?? 'null'}
- evidencia: ${e.evidence.map((q) => `"${q.text}"`).join(' / ')}

CANDIDATOS
${input.candidates
  .map(
    (c) =>
      `- id: ${c.actionItemId} | ${c.externalKey} | ${c.title} | responsable: ${c.ownerName ?? 'sin asignar'} | estado: ${c.status} | vence: ${c.dueDate ?? 'sin fecha'} | proyecto: ${c.projectName ?? '-'} | preScore: ${c.preScore.toFixed(2)}${c.description ? ` | desc: ${c.description.slice(0, 200)}` : ''}`,
  )
  .join('\n')}

Devuelve la decisión JSON conforme al schema.`
}

export const DIGEST_SYSTEM_PROMPT = `Eres el redactor del resumen semanal directivo de SMLXL. Recibes estadísticas y listas ya calculadas de la semana. Redacta, en español ejecutivo y sobrio:
- "executiveNarrative": 2 a 5 párrafos cortos con el estado general de la semana (reuniones, compromisos nuevos, cierres, vencidos). Usa sólo los números recibidos.
- "highlights": hasta 8 puntos concretos (logros, cierres aprobados, compromisos críticos).
- "risksNarrative": hasta 8 puntos sobre vencidos, bloqueados, sin responsable/fecha y reuniones no capturadas.
No inventes cifras ni nombres. No propongas cambiar estados de tareas.
${OUTPUT_RULES}`

export function buildDigestUserPrompt(input: WeeklyDigestInput): string {
  return `SEMANA ${input.weekLabel} (${input.weekStart} a ${input.weekEnd})

ESTADÍSTICAS
${Object.entries(input.stats)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}

NUEVOS COMPROMISOS
${input.newItems.map((i) => `- ${i.key} | ${i.title} | ${i.owner ?? 'sin asignar'} | ${i.area ?? '-'} | ${i.priority} | ${i.dueDate ?? 'sin fecha'}`).join('\n') || '(ninguno)'}

VENCIDOS
${input.overdueItems.map((i) => `- ${i.key} | ${i.title} | ${i.owner ?? 'sin asignar'} | ${i.daysOverdue} días`).join('\n') || '(ninguno)'}

PROPUESTAS DE CIERRE PENDIENTES
${input.proposals.map((i) => `- ${i.key} | ${i.title} | ${i.reason}`).join('\n') || '(ninguna)'}

PROBLEMAS DE CAPTURA
${input.captureIssues.map((i) => `- ${i.meetingTitle}: ${i.issue}`).join('\n') || '(ninguno)'}

Devuelve la narrativa JSON conforme al schema.`
}
