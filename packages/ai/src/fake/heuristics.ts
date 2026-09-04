import type { AnalyzeMeetingInput, ExtractedActionItem, ExtractedDecision, MeetingAnalysisResult } from '@smlxl/domain'
import { detectRecurrenceHint, normalizeText, tokenJaccard, tokenize } from '@smlxl/domain'
import { AI_SCHEMA_VERSION } from '@smlxl/contracts'
import { foldForMatch, resolveRelativeDate } from './dates.js'

/**
 * Extracción heurística determinística (sin red) para reuniones sin escenario.
 * No pretende igualar al modelo: sirve para desarrollo, demos y tests.
 */
const COMMITMENT_CUES: Array<{ regex: RegExp; strength: number }> = [
  { regex: /\bse compromet[ea]\b/, strength: 0.2 },
  { regex: /\byo (?:me encargo|lo hago|la hago|lo mando|la mando|lo envio|la envio|puedo|voy a|te (?:lo|la) (?:mando|envio|paso))\b/, strength: 0.2 },
  { regex: /\bquedamos en que\b/, strength: 0.15 },
  { regex: /\benviar[ae]?\b|\bmandar[ae]?\b|\bvoy a (?:enviar|mandar|preparar|revisar|coordinar|hacer|llamar|agendar|entregar)\b/, strength: 0.15 },
  { regex: /\bva a (?:enviar|mandar|preparar|revisar|coordinar|hacer|llamar|agendar|entregar)\b/, strength: 0.15 },
  { regex: /\b(?:debe|deben|debes|tiene que|tienen que|tienes que)\b/, strength: 0.1 },
  { regex: /\bhay que\b/, strength: 0.1 },
  { regex: /\bqueda pendiente\b|\bqueda de tarea\b/, strength: 0.15 },
  { regex: /\b(?:para el|antes del|a mas tardar)\b/, strength: 0.05 },
  { regex: /\b(?:revisar|preparar|mandar|enviar|coordinar|entregar|agendar|dar seguimiento|darle seguimiento|dale seguimiento|da seguimiento|doy seguimiento|seguimiento diario|seguimiento semanal)\b/, strength: 0.1 },
]

const DONE_CUES = /\b(?:ya quedo|ya esta listo|ya esta lista|ya quedo lista|ya quedo listo|ya lo mande|ya la mande|ya lo envie|ya la envie|ya esta (?:hecho|hecha|enviado|enviada|terminado|terminada)|terminado|terminada|ya se (?:envio|entrego|hizo))\b/
const BLOCKED_CUES = /\b(?:bloqueado|bloqueada|detenido|detenida|esperando a|en espera de|sigue bloqueado)\b/
const DECISION_CUES = /\b(?:se acordo|acordamos|quedamos en|se decide|se decidio|decidimos|queda acordado)\b/
const QUESTION_CUES = /\?\s*$/
const URGENT_CUES = /\b(?:urgente|critico|critica)\b/
const HIGH_CUES = /\b(?:prioridad|importante|cuanto antes|prioritario)\b/

const ES_STOPWORDS = ['de', 'la', 'el', 'que', 'y', 'en', 'los', 'para', 'con', 'una', 'del', 'las', 'por', 'se', 'no', 'un', 'lo']
const EN_STOPWORDS = ['the', 'and', 'to', 'of', 'that', 'is', 'for', 'with', 'we', 'you', 'this', 'it', 'on', 'in', 'be', 'are']

export function detectLanguage(texts: string[]): { code: string; mixed: boolean } {
  let es = 0
  let en = 0
  for (const t of texts) {
    const tokens = normalizeText(t).split(' ')
    for (const tok of tokens) {
      if (ES_STOPWORDS.includes(tok)) es += 1
      if (EN_STOPWORDS.includes(tok)) en += 1
    }
  }
  const total = es + en || 1
  const code = en > es ? 'en-US' : 'es-MX'
  const minority = Math.min(es, en) / total
  return { code, mixed: minority > 0.2 && Math.min(es, en) >= 5 }
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

interface SpeakerContext {
  displayName: string
  email: string | null
  isInternal: boolean
}

function firstName(name: string): string {
  return normalizeText(name).split(' ')[0] ?? ''
}

/** Busca un participante mencionado en la frase (nombre completo o nombre de pila). */
function mentionedParticipant(sentenceFolded: string, participants: SpeakerContext[], exclude?: string): SpeakerContext | null {
  for (const p of participants) {
    if (exclude && p.displayName === exclude) continue
    const full = normalizeText(p.displayName)
    const fn = firstName(p.displayName)
    if ((full && sentenceFolded.includes(full)) || (fn.length > 2 && new RegExp(`\\b${fn}\\b`).test(sentenceFolded))) return p
  }
  return null
}

const AREA_NAMES = ['juridico', 'ventas', 'marketing', 'operaciones', 'finanzas', 'direccion', 'sistemas', 'administracion', 'servicio al cliente']

function resolveOwner(
  sentence: string,
  folded: string,
  speaker: SpeakerContext | null,
  participants: SpeakerContext[],
): { owner: ExtractedActionItem['owner']; ownerConfidenceBoost: number } {
  const firstPerson = /\byo\b|\bme encargo\b|\byo puedo\b/.test(folded)
  const mentioned = mentionedParticipant(folded, participants, speaker?.displayName)
  if (firstPerson && speaker) {
    return { owner: { name: speaker.displayName, ...(speaker.email ? { email: speaker.email } : {}), evidence: sentence }, ownerConfidenceBoost: 0.1 }
  }
  if (mentioned) {
    return { owner: { name: mentioned.displayName, ...(mentioned.email ? { email: mentioned.email } : {}), evidence: sentence }, ownerConfidenceBoost: 0.1 }
  }
  for (const area of AREA_NAMES) {
    if (new RegExp(`\\b${area}\\b`).test(folded)) return { owner: { name: area.charAt(0).toUpperCase() + area.slice(1), evidence: sentence }, ownerConfidenceBoost: 0.05 }
  }
  if (speaker && /\b(?:voy a|mando|envio|preparo|reviso|hago)\b/.test(folded)) {
    return { owner: { name: speaker.displayName, ...(speaker.email ? { email: speaker.email } : {}), evidence: sentence }, ownerConfidenceBoost: 0.05 }
  }
  return { owner: null, ownerConfidenceBoost: 0 }
}

function buildTitle(sentence: string, dateText: string | null): string {
  let t = sentence
  if (dateText) t = t.replace(dateText, '')
  t = t
    .replace(/^(?:sí|si|claro|perfecto|ok|bueno|entonces|correcto|gracias)[,.]?\s*/i, '')
    .replace(/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+,\s*¿?/, '')
    .replace(/^(?:yo|nosotros)\s+(?:me encargo de|voy a|puedo|la|lo)\s+/i, '')
    .replace(/^(?:hay que|tiene que|tienen que|debe|deben|va a|se compromete a|queda pendiente)\s+/i, '')
    .replace(/^(?:que\s+)/i, '')
    .replace(/[¿?¡!]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[,;:.\s]+$/, '')
    .trim()
  if (t.length > 120) t = `${t.slice(0, 117).trimEnd()}...`
  if (t.length < 3) t = sentence.slice(0, 120)
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function extractActionItems(input: AnalyzeMeetingInput): ExtractedActionItem[] {
  const participants: SpeakerContext[] = input.participants.map((p) => ({ displayName: p.displayName, email: p.email, isInternal: p.isInternal }))
  const bySpeaker = new Map<string, SpeakerContext>()
  for (const p of participants) bySpeaker.set(normalizeText(p.displayName), p)
  const items: ExtractedActionItem[] = []
  for (const seg of input.segments) {
    const speaker = bySpeaker.get(normalizeText(seg.speakerLabel)) ?? (seg.speakerLabel ? { displayName: seg.speakerLabel, email: null, isInternal: false } : null)
    for (const sentence of splitSentences(seg.text)) {
      const folded = foldForMatch(sentence)
      if (QUESTION_CUES.test(sentence) && !/\bpuedes\b|\bpodrias\b/.test(folded)) continue
      const done = DONE_CUES.test(folded)
      const blocked = BLOCKED_CUES.test(folded)
      let strength = 0
      for (const cue of COMMITMENT_CUES) if (cue.regex.test(folded)) strength = Math.max(strength, cue.strength)
      if (strength === 0 && !done && !blocked) continue
      if (DECISION_CUES.test(folded) && strength < 0.15 && !done) continue
      const date = resolveRelativeDate(sentence, input.referenceDate, input.timezone)
      const { owner, ownerConfidenceBoost } = resolveOwner(sentence, folded, speaker, participants)
      let confidence = 0.6 + strength + ownerConfidenceBoost + (date.date ? 0.08 : 0)
      if (done) confidence = Math.max(confidence, 0.75)
      confidence = Math.min(0.95, Math.round(confidence * 100) / 100)
      const priority: ExtractedActionItem['priority'] = URGENT_CUES.test(folded) ? 'URGENT' : HIGH_CUES.test(folded) ? 'HIGH' : null
      const recurring = detectRecurrenceHint(sentence)
      const item: ExtractedActionItem = {
        title: buildTitle(sentence, date.textOriginal),
        owner,
        dueDate: done ? null : date.date,
        ...(date.textOriginal && !done ? { dueDateTextOriginal: date.textOriginal } : {}),
        priority,
        statusHint: done ? 'DONE' : blocked ? 'BLOCKED' : 'NEW',
        evidence: [{ text: sentence.slice(0, 300), speaker: seg.speakerLabel, ...(seg.startTime ? { startTime: seg.startTime } : {}), ...(seg.id ? { segmentId: seg.id } : {}) }],
        confidence,
        relatedOpenActionKey: null,
        recurringHint: recurring !== null,
        projectHint: null,
      }
      const dup = items.find((x) => tokenJaccard(x.title, item.title) >= 0.6)
      if (dup) {
        if (item.confidence > dup.confidence || (!dup.owner && item.owner) || (!dup.dueDate && item.dueDate)) {
          const merged: ExtractedActionItem = {
            ...dup,
            ...item,
            owner: item.owner ?? dup.owner,
            dueDate: item.dueDate ?? dup.dueDate,
            confidence: Math.max(item.confidence, dup.confidence),
            evidence: [...dup.evidence, ...item.evidence].slice(0, 10),
          }
          items[items.indexOf(dup)] = merged
        } else dup.evidence = [...dup.evidence, ...item.evidence].slice(0, 10)
        continue
      }
      items.push(item)
    }
  }
  // Marcar UPDATE cuando coincide fuertemente con una acción abierta del contexto.
  for (const item of items) {
    const related = input.openActions.find((a) => tokenJaccard(a.title, item.title) >= 0.5)
    if (related) {
      item.relatedOpenActionKey = related.externalKey
      if (item.statusHint === 'NEW') item.statusHint = 'UPDATE'
    }
  }
  return items.slice(0, 100)
}

export function extractDecisions(input: AnalyzeMeetingInput): ExtractedDecision[] {
  const out: ExtractedDecision[] = []
  for (const seg of input.segments) {
    for (const sentence of splitSentences(seg.text)) {
      const folded = foldForMatch(sentence)
      if (!DECISION_CUES.test(folded)) continue
      const date = resolveRelativeDate(sentence, input.referenceDate, input.timezone)
      const description = sentence
        .replace(/^(?:y |entonces |bueno,? |perfecto,? |correcto,? )/i, '')
        .replace(/^(?:se acordó|acordamos|quedamos en|se decide|se decidió|decidimos|queda acordado)\s+(?:que\s+)?/i, '')
        .trim()
      if (out.some((d) => tokenJaccard(d.description, description) >= 0.6)) continue
      out.push({
        description: description.charAt(0).toUpperCase() + description.slice(1),
        decidedBy: seg.speakerLabel || null,
        effectiveDate: date.date,
        evidence: [{ text: sentence.slice(0, 300), speaker: seg.speakerLabel }],
        confidence: 0.8,
      })
    }
  }
  return out.slice(0, 50)
}

export function buildSummary(input: AnalyzeMeetingInput): MeetingAnalysisResult['summary'] {
  const longest = [...input.segments].sort((a, b) => b.text.length - a.text.length).slice(0, 5)
  const ordered = longest.sort((a, b) => a.sequence - b.sequence)
  const executive = ordered.map((s) => splitSentences(s.text)[0] ?? s.text).filter((s) => s.length > 0).slice(0, 5)
  const risks: string[] = []
  const openQuestions: string[] = []
  const attention: string[] = []
  for (const seg of input.segments) {
    for (const sentence of splitSentences(seg.text)) {
      const folded = foldForMatch(sentence)
      if (/\briesgo\b/.test(folded)) risks.push(sentence)
      if (/\?\s*$/.test(sentence) && /\bduda\b|\bpregunta\b|\bo esperamos\b/.test(folded)) openQuestions.push(sentence)
      if (/\bpregunta abierta\b/.test(folded)) attention.push(sentence)
      if (BLOCKED_CUES.test(folded) || URGENT_CUES.test(folded)) attention.push(sentence)
    }
  }
  return {
    executive: executive.length > 0 ? executive : ['Reunión sin contenido suficiente para resumir.'],
    detailed: ordered.map((s) => `${s.speakerLabel}: ${s.text}`).join('\n'),
    attentionPoints: attention.slice(0, 10),
    risks: risks.slice(0, 10),
    openQuestions: openQuestions.slice(0, 10),
  }
}

const GENERIC = new Set(['reunion', 'semana', 'gracias', 'todos', 'punto', 'puntos', 'tambien', 'ahora', 'entonces', 'nuestro', 'nuestra', 'perfecto', 'siguiente', 'primero'])

export function extractTopics(input: AnalyzeMeetingInput): MeetingAnalysisResult['topics'] {
  const freq = new Map<string, number>()
  for (const seg of input.segments) {
    for (const tok of tokenize(seg.text)) {
      if (tok.length < 5 || GENERIC.has(tok) || /^\d+$/.test(tok)) continue
      freq.set(tok, (freq.get(tok) ?? 0) + 1)
    }
  }
  return [...freq.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => ({ title: t.charAt(0).toUpperCase() + t.slice(1), subtopics: [] }))
}

export function heuristicAnalysis(input: AnalyzeMeetingInput): MeetingAnalysisResult {
  const texts = input.segments.map((s) => s.text)
  const lang = detectLanguage(texts)
  const actionItems = extractActionItems(input)
  const decisions = extractDecisions(input)
  const topics = extractTopics(input)
  const avg = actionItems.length > 0 ? actionItems.reduce((n, i) => n + i.confidence, 0) / actionItems.length : 0.5
  const totalChars = texts.reduce((n, t) => n + t.length, 0)
  const extractionConfidence = Math.min(0.95, Math.round((totalChars < 200 ? 0.4 : 0.6 + avg * 0.3) * 100) / 100)
  const legal = /\bcontrato\b|\bjuridico\b|\bdemanda\b|\bpenalizaci/.test(foldForMatch(texts.join(' ')))
  return {
    schemaVersion: AI_SCHEMA_VERSION,
    language: { detectedLanguageCode: lang.code, mixedLanguageDetected: lang.mixed },
    topics,
    projectHint: topics[0]?.title ?? null,
    sensitivityHint: legal ? 'RESTRICTED' : 'NORMAL',
    summary: buildSummary(input),
    decisions,
    actionItems,
    extractionConfidence,
  }
}
