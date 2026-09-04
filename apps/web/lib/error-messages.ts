import { isApiError } from './api'

/** Traducción de códigos de dominio (§34) a mensajes comprensibles. */
export const ERROR_MESSAGES: Record<string, { title: string; message: string }> = {
  GOOGLE_MEET_ARTIFACT_NOT_AVAILABLE: {
    title: 'Artefacto de Meet no disponible',
    message:
      'Google aún no publica la transcripción o las notas de esta reunión. Puede tardar hasta varias horas después de terminar.',
  },
  GOOGLE_PERMISSION_DENIED: {
    title: 'Permiso denegado por Google',
    message:
      'La cuenta de servicio no tiene acceso a este recurso. Revisa la delegación a nivel de dominio y los scopes configurados.',
  },
  GOOGLE_SUBSCRIPTION_EXPIRED: {
    title: 'Suscripción de eventos expirada',
    message:
      'La suscripción de Workspace Events venció. Sincroniza las suscripciones desde Integraciones.',
  },
  GOOGLE_RATE_LIMIT: {
    title: 'Límite de Google alcanzado',
    message: 'Google limitó temporalmente las llamadas. El sistema reintentará automáticamente.',
  },
  GOOGLE_NOT_FOUND: {
    title: 'Recurso de Google no encontrado',
    message: 'El recurso ya no existe en Google Workspace.',
  },
  GOOGLE_TIMEOUT: {
    title: 'Google no respondió a tiempo',
    message: 'La llamada a Google excedió el tiempo de espera. Se reintentará.',
  },
  GOOGLE_UNAVAILABLE: {
    title: 'Google no disponible',
    message: 'El servicio de Google no está disponible en este momento.',
  },
  GOOGLE_CAPABILITY_BLOCKED: {
    title: 'Bloqueado por política de Google',
    message:
      'Google rechazó la configuración automática de transcripción/notas por política o privilegios del organizador.',
  },
  TRANSCRIPT_EMPTY: {
    title: 'Transcripción vacía',
    message: 'La reunión no tiene contenido transcrito; no se puede analizar.',
  },
  AI_INVALID_OUTPUT: {
    title: 'Respuesta de IA inválida',
    message: 'La IA devolvió un resultado que no cumple el esquema. No se modificaron datos.',
  },
  AI_LOW_CONFIDENCE: {
    title: 'Confianza IA insuficiente',
    message: 'La IA no alcanzó el umbral de confianza; el elemento quedó para revisión humana.',
  },
  AI_PROVIDER_ERROR: {
    title: 'Error del proveedor de IA',
    message: 'Gemini devolvió un error. Se reintentará o se puede reprocesar manualmente.',
  },
  AI_DISABLED: {
    title: 'Procesamiento IA deshabilitado',
    message: 'El flag AI_PROCESSING_ENABLED está apagado.',
  },
  ACTION_ITEM_AMBIGUOUS_OWNER: {
    title: 'Responsable ambiguo',
    message: 'No se pudo determinar el responsable con certeza. Asígnalo manualmente.',
  },
  ACTION_ITEM_DUPLICATE_CANDIDATE: {
    title: 'Posible duplicado',
    message: 'Ya existe un pendiente muy similar. Revisa antes de crear otro.',
  },
  ACTION_ITEM_INVALID_TRANSITION: {
    title: 'Cambio de estado no permitido',
    message: 'La transición solicitada no es válida desde el estado actual.',
  },
  ACTION_ITEM_COMPLETION_REQUIRES_APPROVAL: {
    title: 'El cierre requiere aprobación',
    message: 'Un pendiente sólo se marca como completado aprobando una propuesta de cierre.',
  },
  COMPLETION_PROPOSAL_NOT_PENDING: {
    title: 'Propuesta ya resuelta',
    message: 'Esta propuesta de cierre ya fue aprobada, rechazada o expiró.',
  },
  SHEETS_SYNC_FAILED: {
    title: 'Sincronización a Sheets falló',
    message:
      'No se pudo escribir en la hoja de seguimiento. Revisa el ID y permisos del documento.',
  },
  EMAIL_SEND_FAILED: {
    title: 'Envío de correo falló',
    message: 'Gmail no pudo enviar el mensaje. Revisa la cuenta remitente y sus permisos.',
  },
  NOT_FOUND: {
    title: 'No encontrado',
    message: 'El elemento solicitado no existe o fue eliminado.',
  },
  FORBIDDEN: {
    title: 'Sin permiso',
    message: 'Tu rol no permite realizar esta acción o ver este elemento.',
  },
  UNAUTHORIZED: {
    title: 'Sesión inválida',
    message: 'Tu sesión expiró o no es válida. Vuelve a iniciar sesión.',
  },
  VALIDATION_ERROR: {
    title: 'Datos inválidos',
    message: 'Revisa los campos marcados e inténtalo de nuevo.',
  },
  CONFLICT: {
    title: 'Conflicto',
    message: 'El elemento cambió mientras lo editabas. Recarga e inténtalo de nuevo.',
  },
  FEATURE_DISABLED: {
    title: 'Funcionalidad deshabilitada',
    message: 'Esta funcionalidad está apagada por un feature flag. Actívala en Configuración.',
  },
  MEETING_EXCLUDED: {
    title: 'Reunión excluida',
    message: 'Esta reunión está excluida del análisis IA.',
  },
  INTERNAL_ERROR: {
    title: 'Error interno',
    message: 'Ocurrió un error inesperado. Si persiste, comparte la referencia con soporte.',
  },
  NETWORK_ERROR: {
    title: 'Servicio no disponible',
    message:
      'No se pudo conectar con la API de la plataforma. Verifica que el servicio esté en ejecución.',
  },
}

export interface DescribedError {
  title: string
  message: string
  code?: string
  correlationId?: string
  status?: number
}

export function describeError(err: unknown): DescribedError {
  if (isApiError(err)) {
    const known = ERROR_MESSAGES[err.code]
    return {
      title: known?.title ?? 'Error',
      message: known?.message ?? err.message,
      code: err.code,
      correlationId: err.correlationId,
      status: err.status,
    }
  }
  if (err instanceof Error) {
    return { title: 'Error', message: err.message }
  }
  return { title: 'Error', message: 'Ocurrió un error inesperado.' }
}
