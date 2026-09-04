import type {
  ActionItemPriority,
  ActionItemStatus,
  AiAnalysisStatus,
  AiReviewReason,
  ArtifactStatus,
  AttentionReason,
  CaptureQualityBucket,
  ConfidentialityLevel,
  MeetingProcessingStatus,
  ReconcileDecision,
  RelationType,
  UserRole,
} from '@smlxl/domain'

/**
 * Etiquetas en español para enums de dominio. Es la única fuente de textos de
 * estado en la UI; nunca se muestran los valores crudos del enum al usuario.
 */

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'ai' | 'signal'

export interface LabelMeta {
  label: string
  tone: Tone
  description?: string
}

export const ACTION_ITEM_STATUS_LABELS: Record<ActionItemStatus, LabelMeta> = {
  PROPOSED: {
    label: 'Propuesto',
    tone: 'ai',
    description: 'Creado por IA; requiere aceptación humana.',
  },
  PENDING: { label: 'Pendiente', tone: 'info', description: 'Abierto y aceptado.' },
  IN_PROGRESS: { label: 'En progreso', tone: 'info' },
  BLOCKED: { label: 'Bloqueado', tone: 'danger' },
  WAITING: { label: 'Esperando', tone: 'warning', description: 'Depende de un tercero.' },
  COMPLETION_PROPOSED: {
    label: 'Cierre propuesto',
    tone: 'signal',
    description: 'Requiere aprobación humana.',
  },
  COMPLETED: { label: 'Completado', tone: 'success' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral' },
}

export const ACTION_ITEM_STATUS_ORDER: ActionItemStatus[] = [
  'PROPOSED',
  'PENDING',
  'IN_PROGRESS',
  'BLOCKED',
  'WAITING',
  'COMPLETION_PROPOSED',
  'COMPLETED',
  'CANCELLED',
]

export const PRIORITY_LABELS: Record<ActionItemPriority, LabelMeta> = {
  LOW: { label: 'Baja', tone: 'neutral' },
  MEDIUM: { label: 'Media', tone: 'info' },
  HIGH: { label: 'Alta', tone: 'warning' },
  URGENT: { label: 'Urgente', tone: 'danger' },
}

export const PROCESSING_STATUS_LABELS: Record<MeetingProcessingStatus, LabelMeta> = {
  DISCOVERED: {
    label: 'Detectada',
    tone: 'neutral',
    description: 'La reunión fue descubierta; aún sin artefactos.',
  },
  WAITING_FOR_ARTIFACTS: {
    label: 'Esperando artefactos',
    tone: 'warning',
    description: 'Google aún no publica transcript/notas.',
  },
  ARTIFACTS_AVAILABLE: { label: 'Artefactos disponibles', tone: 'info' },
  INGESTING: { label: 'Ingiriendo', tone: 'info' },
  INGESTED: { label: 'Ingerida', tone: 'info' },
  ANALYZING: { label: 'Analizando', tone: 'ai' },
  ANALYZED: { label: 'Analizada', tone: 'ai' },
  REVIEW_REQUIRED: {
    label: 'Requiere revisión',
    tone: 'signal',
    description: 'La IA dejó elementos para revisión humana.',
  },
  COMPLETED: { label: 'Procesada', tone: 'success' },
  FAILED: { label: 'Error', tone: 'danger' },
  EXCLUDED: { label: 'Excluida', tone: 'neutral', description: 'Excluida del análisis IA.' },
}

export const ARTIFACT_STATUS_LABELS: Record<ArtifactStatus, LabelMeta> = {
  NOT_REQUESTED: { label: 'No solicitado', tone: 'neutral' },
  PENDING: { label: 'Pendiente', tone: 'warning' },
  AVAILABLE: { label: 'Disponible', tone: 'info' },
  INGESTED: { label: 'Ingerido', tone: 'success' },
  UNAVAILABLE: { label: 'No disponible', tone: 'neutral' },
  UNAVAILABLE_EXTERNAL_HOST: {
    label: 'Host externo',
    tone: 'warning',
    description: 'Organizador externo: Google no garantiza el artefacto.',
  },
  CAPABILITY_BLOCKED: {
    label: 'Bloqueado por política',
    tone: 'danger',
    description: 'Google rechazó la configuración automática.',
  },
  FAILED: { label: 'Falló', tone: 'danger' },
}

export const AI_ANALYSIS_STATUS_LABELS: Record<AiAnalysisStatus | string, LabelMeta> = {
  NOT_STARTED: { label: 'Sin iniciar', tone: 'neutral' },
  QUEUED: { label: 'En cola', tone: 'info' },
  RUNNING: { label: 'En ejecución', tone: 'ai' },
  SUCCEEDED: { label: 'Completado', tone: 'success' },
  FAILED: { label: 'Falló', tone: 'danger' },
  SKIPPED: { label: 'Omitido', tone: 'neutral' },
}

export const CONFIDENTIALITY_LABELS: Record<ConfidentialityLevel, LabelMeta> = {
  NORMAL: { label: 'Normal', tone: 'neutral' },
  RESTRICTED: { label: 'Restringida', tone: 'warning' },
  LEGAL: { label: 'Jurídica', tone: 'danger' },
  EXECUTIVE: { label: 'Ejecutiva', tone: 'signal' },
}

export const ROLE_LABELS: Record<UserRole, LabelMeta> = {
  ADMIN: { label: 'Administrador', tone: 'signal' },
  DIRECTOR: { label: 'Director', tone: 'info' },
  MANAGER: { label: 'Gerente', tone: 'info' },
  MEMBER: { label: 'Miembro', tone: 'neutral' },
  AUDITOR: { label: 'Auditor', tone: 'neutral' },
}

export const CAPTURE_QUALITY_LABELS: Record<CaptureQualityBucket, LabelMeta> = {
  WITH_TRANSCRIPT: { label: 'Con transcript', tone: 'success' },
  WITH_SMART_NOTES: { label: 'Con Smart Notes', tone: 'success' },
  TRANSCRIPT_ONLY: { label: 'Solo transcript', tone: 'info' },
  NO_ARTIFACT: { label: 'Sin artefacto', tone: 'warning' },
  EXTERNAL_HOST_UNAVAILABLE: { label: 'Host externo', tone: 'warning' },
  API_ERROR: { label: 'Error de API', tone: 'danger' },
}

export const ATTENTION_REASON_LABELS: Record<AttentionReason, LabelMeta> = {
  OVERDUE_HIGH_PRIORITY: {
    label: 'Vencida y prioridad alta',
    tone: 'danger',
    description: 'Pasó su fecha compromiso y es de prioridad alta o urgente.',
  },
  OVERDUE: { label: 'Vencida', tone: 'danger', description: 'Pasó su fecha compromiso.' },
  COMPLETION_PROPOSED: {
    label: 'Cierre por aprobar',
    tone: 'signal',
    description: 'Hay una propuesta de cierre esperando decisión humana.',
  },
  NO_OWNER: {
    label: 'Sin responsable',
    tone: 'warning',
    description: 'Nadie tiene asignada esta tarea.',
  },
  NO_DUE_DATE: { label: 'Sin fecha', tone: 'warning', description: 'No tiene fecha compromiso.' },
  REPEATED_WITHOUT_PROGRESS: {
    label: 'Repetida sin avance',
    tone: 'warning',
    description: 'Se ha mencionado en varias reuniones sin cambiar de estado.',
  },
  BLOCKED: { label: 'Bloqueada', tone: 'danger', description: 'Marcada como bloqueada.' },
  LOW_AI_CONFIDENCE: {
    label: 'Baja confianza IA',
    tone: 'ai',
    description: 'La IA la extrajo con confianza por debajo del umbral.',
  },
}

export const AI_REVIEW_REASON_LABELS: Record<AiReviewReason, LabelMeta> = {
  LOW_CONFIDENCE: { label: 'Confianza baja', tone: 'ai' },
  AMBIGUOUS_OWNER: { label: 'Responsable ambiguo', tone: 'warning' },
  AMBIGUOUS_DUE_DATE: { label: 'Fecha ambigua', tone: 'warning' },
  POSSIBLE_DUPLICATE: { label: 'Posible duplicado', tone: 'info' },
  POSSIBLE_COMPLETION: { label: 'Posible tarea completada', tone: 'success' },
  CONFLICT_WITH_EXISTING: { label: 'Conflicto con dato existente', tone: 'danger' },
}

export const RECONCILE_DECISION_LABELS: Record<ReconcileDecision, string> = {
  CREATE_NEW: 'Crear nuevo',
  LINK_EXISTING: 'Vincular a existente',
  UPDATE_EXISTING: 'Actualizar existente',
  MARK_DONE_CANDIDATE: 'Candidata a cierre',
  REOPEN_CANDIDATE: 'Candidata a reapertura',
  REQUIRES_HUMAN_REVIEW: 'Requiere revisión humana',
}

export const RELATION_TYPE_LABELS: Record<RelationType, string> = {
  CREATED: 'Creada en',
  MENTIONED: 'Mencionada en',
  UPDATED: 'Actualizada en',
  BLOCKED: 'Bloqueada en',
  COMPLETED: 'Cierre propuesto en',
  REOPENED: 'Reabierta en',
}

export const PROPOSAL_STATUS_LABELS: Record<
  'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED',
  LabelMeta
> = {
  PENDING: { label: 'Pendiente de decisión', tone: 'signal' },
  APPROVED: { label: 'Aprobada', tone: 'success' },
  REJECTED: { label: 'Rechazada', tone: 'danger' },
  EXPIRED: { label: 'Expirada', tone: 'neutral' },
}

export const SUBSCRIPTION_STATE_LABELS: Record<string, LabelMeta> = {
  ACTIVE: { label: 'Activa', tone: 'success' },
  SUSPENDED: { label: 'Suspendida', tone: 'warning' },
  EXPIRED: { label: 'Expirada', tone: 'danger' },
  DELETED: { label: 'Eliminada', tone: 'neutral' },
  ERROR: { label: 'Error', tone: 'danger' },
}

export const INBOUND_EVENT_STATUS_LABELS: Record<string, LabelMeta> = {
  RECEIVED: { label: 'Recibido', tone: 'neutral' },
  QUEUED: { label: 'En cola', tone: 'info' },
  PROCESSED: { label: 'Procesado', tone: 'success' },
  IGNORED: { label: 'Ignorado', tone: 'neutral' },
  FAILED: { label: 'Falló', tone: 'danger' },
}

export const MEETING_SOURCE_LABELS: Record<string, string> = {
  WORKSPACE_EVENT: 'Evento de Workspace',
  CALENDAR_DISCOVERY: 'Descubierta en Calendar',
  MANUAL_IMPORT: 'Importación manual',
  LEGACY_IMPORT: 'Importación legado',
}

export const FEATURE_FLAG_META: Record<string, { label: string; description: string }> = {
  GOOGLE_INTEGRATION_ENABLED: {
    label: 'Integración Google',
    description:
      'Habilita llamadas reales a Google Workspace (Meet, Calendar, Drive). Apagado = adapters fake.',
  },
  GOOGLE_MEET_EVENTS_ENABLED: {
    label: 'Eventos de Meet (Workspace Events)',
    description:
      'Suscripciones Pub/Sub por usuario monitoreado para detectar reuniones y artefactos.',
  },
  AI_PROCESSING_ENABLED: {
    label: 'Procesamiento IA',
    description:
      'Resumen, decisiones y compromisos con Gemini. Apagado = análisis fake determinista.',
  },
  AI_COMPLETION_PROPOSALS_ENABLED: {
    label: 'Propuestas de cierre por IA',
    description: 'La IA puede proponer cierres; nunca marca COMPLETED sin aprobación humana.',
  },
  GMAIL_NOTIFICATIONS_ENABLED: {
    label: 'Notificaciones por Gmail',
    description: 'Envío de resúmenes post-reunión, asignaciones y recordatorios.',
  },
  SHEETS_SYNC_ENABLED: {
    label: 'Sincronización a Google Sheets',
    description:
      'Exporta pendientes y reuniones a la hoja de seguimiento (sin usar la fila como id).',
  },
  WEEKLY_DIGEST_ENABLED: {
    label: 'Digest semanal',
    description: 'Genera y envía el resumen ejecutivo semanal según configuración.',
  },
}

export const ACTION_ITEM_VIEW_LABELS: Record<string, string> = {
  all: 'Todos',
  mine: 'Mis pendientes',
  team: 'Mi equipo',
  overdue: 'Vencidos',
  thisWeek: 'Esta semana',
  noDueDate: 'Sin fecha',
  noOwner: 'Sin responsable',
  blocked: 'Bloqueados',
  completed: 'Completados',
  proposed: 'Propuestos',
}

export function labelFor<K extends string>(
  map: Record<K, LabelMeta>,
  key: K | string | null | undefined,
): LabelMeta {
  if (!key) return { label: '—', tone: 'neutral' }
  return (map as Record<string, LabelMeta>)[key] ?? { label: key, tone: 'neutral' }
}
