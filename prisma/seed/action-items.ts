import {
  ActionItemPriority,
  ActionItemStatus,
  ActionItemType,
  AiReviewItemStatus,
  AiReviewReason,
  CompletionProposalStatus,
  MigrationTrust,
  ProposedByType,
  ReconcileDecision,
  RelationType,
  formatExternalKey,
  type EvidenceQuote,
  type ExtractedActionItem,
  type RecurrenceRule,
} from '@smlxl/domain'
import { Prisma, jsonSafe, type PrismaClient } from '../../packages/database/src/index.js'
import type { AreaKey, Catalogs, ExternalKey, ProjectKey, UserKey } from './catalogs.js'
import { addMinutes, daysAgo, localDate, nextWeekday, stableId, ymd } from './helpers.js'
import type { MeetingKey, MeetingsResult } from './meetings.js'

type CommentSource = 'USER' | 'LEGACY_IMPORT' | 'SYSTEM'

interface LinkDef {
  meeting: MeetingKey
  relation: RelationType
  evidenceSeq?: number[]
  previousStatus?: ActionItemStatus | null
  detectedStatus?: ActionItemStatus | null
}

interface HistoryDef {
  from: ActionItemStatus | null
  to: ActionItemStatus
  by?: UserKey
  system?: boolean
  ago: number
  reason?: string
  meeting?: MeetingKey
}

interface CommentDef {
  by?: UserKey
  body: string
  source: CommentSource
  ago: number
}

interface ItemDef {
  seq: number
  title: string
  description?: string
  owner?: UserKey
  external?: ExternalKey
  ownerText?: string
  collaborators?: UserKey[]
  area: AreaKey | null
  project?: ProjectKey
  /** Reunión de origen (createdFromMeetingId + link CREATED con evidencia). */
  meeting?: MeetingKey
  evidenceSeq?: number[]
  status: ActionItemStatus
  priority: ActionItemPriority
  /** Offset en días de la fecha compromiso; omitido = sin fecha. */
  due?: number
  /** Alternativa: próximo día de la semana (0=domingo … 6=sábado). */
  dueWeekday?: number
  dueText?: string
  dateConfidence?: number
  completedAgo?: number
  cancelledAgo?: number
  confidence?: number
  requiresReview?: boolean
  recurrence?: RecurrenceRule
  blocker?: string
  tags?: string[]
  legacyId?: string
  createdAgo?: number
  links?: LinkDef[]
  history?: HistoryDef[]
  comments?: CommentDef[]
}

/** Quién aprueba cierres de cada responsable (para el historial de los COMPLETED de plataforma). */
const APPROVER: Record<UserKey, UserKey> = {
  direccion: 'gestora',
  gestora: 'direccion',
  andres: 'direccion',
  juridico: 'direccion',
  operaciones: 'andres',
  ventas: 'direccion',
  finanzas: 'gestora',
  capital: 'direccion',
  servicio: 'andres',
  auditoria: 'direccion',
}

const P = ActionItemPriority
const S = ActionItemStatus

export const ITEMS: ItemDef[] = [
  {
    seq: 1,
    title: 'Enviar carta de intención a Cliente Alfa',
    description: 'Carta de intención firmada por SMLXL para formalizar el inicio del contrato.',
    owner: 'andres',
    area: 'OP',
    project: 'alfa',
    meeting: 'negociacion',
    evidenceSeq: [3],
    status: S.PENDING,
    priority: P.HIGH,
    due: -2,
    confidence: 0.92,
    tags: ['contrato', 'cliente-alfa'],
    links: [
      { meeting: 'legal', relation: RelationType.MENTIONED, evidenceSeq: [6] },
      { meeting: 'comite', relation: RelationType.MENTIONED, evidenceSeq: [4] },
      { meeting: 'alfa', relation: RelationType.MENTIONED, evidenceSeq: [5] },
    ],
    comments: [
      {
        by: 'gestora',
        body: 'Se ha mencionado en tres reuniones sin avance; confirmar con Andrés.',
        source: 'USER',
        ago: 1,
      },
    ],
  },
  {
    seq: 2,
    title: 'Aprobar presupuesto de licencias',
    description: 'Validar el desglose de licencias de Plataforma Beta enviado por el cliente.',
    owner: 'finanzas',
    area: 'AF',
    project: 'beta',
    meeting: 'kickoffBeta',
    evidenceSeq: [6],
    status: S.COMPLETION_PROPOSED,
    priority: P.MEDIUM,
    due: -1,
    confidence: 0.88,
    tags: ['licencias', 'beta'],
    links: [
      {
        meeting: 'alfa',
        relation: RelationType.MENTIONED,
        evidenceSeq: [15],
        previousStatus: S.IN_PROGRESS,
        detectedStatus: S.COMPLETION_PROPOSED,
      },
    ],
    history: [
      { from: null, to: S.PENDING, system: true, ago: 12, reason: 'Creada desde reunión' },
      { from: S.PENDING, to: S.IN_PROGRESS, by: 'finanzas', ago: 8 },
      {
        from: S.IN_PROGRESS,
        to: S.COMPLETION_PROPOSED,
        system: true,
        ago: 3,
        reason: 'Propuesta de cierre generada por IA',
        meeting: 'alfa',
      },
    ],
  },
  {
    seq: 3,
    title: 'Revisar anexo de penalizaciones del contrato Alfa',
    description: 'Cláusulas de retraso por causas del cliente y terminación anticipada.',
    owner: 'juridico',
    collaborators: ['andres'],
    area: 'JU',
    project: 'alfa',
    meeting: 'alfa',
    evidenceSeq: [12],
    status: S.PENDING,
    priority: P.HIGH,
    dueWeekday: 5,
    dueText: 'antes del viernes',
    dateConfidence: 0.95,
    confidence: 0.94,
    tags: ['contrato', 'cliente-alfa', 'legal'],
  },
  {
    seq: 4,
    title: 'Preparar propuesta de cronograma de implementación para Cliente Alfa',
    description: 'Hitos por fase e incluir plan de capacitación al equipo del cliente.',
    owner: 'andres',
    area: 'OP',
    project: 'alfa',
    meeting: 'alfa',
    evidenceSeq: [19, 20],
    status: S.PENDING,
    priority: P.MEDIUM,
    due: 7,
    dueText: 'para la próxima semana',
    dateConfidence: 0.7,
    confidence: 0.9,
    tags: ['cliente-alfa', 'implementacion'],
  },
  {
    seq: 5,
    title: 'Enviar minuta del comité a los gerentes',
    owner: 'gestora',
    area: 'DG',
    meeting: 'comite',
    evidenceSeq: [6],
    status: S.COMPLETED,
    priority: P.LOW,
    due: -1,
    completedAgo: 1,
    confidence: 0.97,
    tags: ['comite'],
  },
  {
    seq: 6,
    title: 'Definir OKRs del Q4 por área',
    description: 'Cada gerente entrega sus OKRs con la plantilla coordinada por Andrés.',
    owner: 'direccion',
    collaborators: ['andres', 'ventas', 'juridico'],
    area: 'DG',
    meeting: 'comite',
    evidenceSeq: [3],
    status: S.IN_PROGRESS,
    priority: P.HIGH,
    due: 10,
    confidence: 0.93,
    tags: ['okr', 'q4'],
    history: [
      { from: null, to: S.PENDING, system: true, ago: 2, reason: 'Creada desde reunión' },
      { from: S.PENDING, to: S.IN_PROGRESS, by: 'direccion', ago: 1 },
    ],
  },
  {
    seq: 7,
    title: 'Actualizar política de firmas electrónicas',
    description: 'Esperando respuesta del proveedor de firma electrónica.',
    owner: 'juridico',
    area: 'JU',
    meeting: 'legal',
    evidenceSeq: [5],
    status: S.WAITING,
    priority: P.MEDIUM,
    due: 14,
    confidence: 0.85,
    tags: ['politicas'],
    history: [
      { from: null, to: S.PENDING, system: true, ago: 6, reason: 'Creada desde reunión' },
      { from: S.PENDING, to: S.WAITING, by: 'juridico', ago: 4, reason: 'En espera del proveedor' },
    ],
  },
  {
    seq: 8,
    title: 'Dictamen legal sobre cláusula de exclusividad Cliente Alfa',
    owner: 'juridico',
    area: 'JU',
    project: 'alfa',
    meeting: 'negociacion',
    evidenceSeq: [4],
    status: S.COMPLETED,
    priority: P.HIGH,
    due: -3,
    completedAgo: 3,
    confidence: 0.9,
    tags: ['legal', 'cliente-alfa'],
    links: [
      {
        meeting: 'legal',
        relation: RelationType.COMPLETED,
        evidenceSeq: [3],
        previousStatus: S.IN_PROGRESS,
        detectedStatus: S.COMPLETION_PROPOSED,
      },
    ],
  },
  {
    seq: 9,
    title: 'Configurar ambiente de pruebas Plataforma Beta',
    owner: 'operaciones',
    area: 'OP',
    project: 'beta',
    meeting: 'kickoffBeta',
    evidenceSeq: [3],
    status: S.BLOCKED,
    priority: P.HIGH,
    due: -4,
    confidence: 0.91,
    blocker: 'Nube MX no ha entregado las credenciales del ambiente de pruebas.',
    tags: ['beta', 'infraestructura'],
    links: [
      {
        meeting: 'avancesBeta',
        relation: RelationType.BLOCKED,
        evidenceSeq: [2],
        previousStatus: S.IN_PROGRESS,
        detectedStatus: S.BLOCKED,
      },
    ],
    history: [
      { from: null, to: S.PENDING, system: true, ago: 12, reason: 'Creada desde reunión' },
      { from: S.PENDING, to: S.IN_PROGRESS, by: 'operaciones', ago: 10 },
      {
        from: S.IN_PROGRESS,
        to: S.BLOCKED,
        by: 'operaciones',
        ago: 6,
        reason: 'Sin credenciales del proveedor',
        meeting: 'avancesBeta',
      },
    ],
    comments: [
      {
        by: 'operaciones',
        body: 'Escalado con Andrés; depende del contrato de soporte con Nube MX.',
        source: 'USER',
        ago: 5,
      },
    ],
  },
  {
    seq: 10,
    title: 'Entregar credenciales del ambiente de pruebas',
    external: 'nube',
    ownerText: 'Nube MX / Elena Vidal',
    area: 'EX',
    project: 'beta',
    meeting: 'kickoffBeta',
    evidenceSeq: [2],
    status: S.WAITING,
    priority: P.HIGH,
    due: -6,
    confidence: 0.87,
    tags: ['beta', 'proveedor'],
    history: [
      { from: null, to: S.WAITING, system: true, ago: 12, reason: 'Compromiso de tercero' },
    ],
  },
  {
    seq: 11,
    title: 'Documentar requerimientos de integración con CRM',
    owner: 'operaciones',
    area: 'OP',
    project: 'beta',
    meeting: 'kickoffBeta',
    evidenceSeq: [4, 5],
    status: S.IN_PROGRESS,
    priority: P.MEDIUM,
    due: 5,
    dueText: 'para dentro de dos semanas',
    dateConfidence: 0.8,
    confidence: 0.9,
    tags: ['beta', 'crm'],
    history: [
      { from: null, to: S.PENDING, system: true, ago: 12, reason: 'Creada desde reunión' },
      { from: S.PENDING, to: S.IN_PROGRESS, by: 'operaciones', ago: 7 },
    ],
  },
  {
    seq: 12,
    title: 'Diseñar campaña digital Q4',
    owner: 'ventas',
    area: 'VM',
    project: 'campana',
    meeting: 'pipeline',
    evidenceSeq: [2],
    status: S.IN_PROGRESS,
    priority: P.HIGH,
    due: 12,
    dueText: 'antes de que termine el mes',
    dateConfidence: 0.75,
    confidence: 0.9,
    tags: ['marketing', 'q4'],
    history: [
      { from: null, to: S.PENDING, system: true, ago: 9, reason: 'Creada desde reunión' },
      { from: S.PENDING, to: S.IN_PROGRESS, by: 'ventas', ago: 6 },
    ],
  },
  {
    seq: 13,
    title: 'Actualizar pipeline en CRM con oportunidades nuevas',
    description: 'Actividad semanal, todos los lunes.',
    owner: 'ventas',
    area: 'VM',
    meeting: 'pipeline',
    evidenceSeq: [3],
    status: S.PENDING,
    priority: P.MEDIUM,
    confidence: 0.86,
    recurrence: { frequency: 'WEEKLY', weekdays: [1], textOriginal: 'cada semana, los lunes' },
    tags: ['crm', 'recurrente'],
  },
  {
    seq: 14,
    title: 'Cotizar agencia para producción de video',
    owner: 'ventas',
    area: 'VM',
    project: 'campana',
    meeting: 'pipeline',
    evidenceSeq: [5, 6],
    status: S.PROPOSED,
    priority: P.LOW,
    due: 9,
    confidence: 0.74,
    requiresReview: true,
    tags: ['marketing'],
  },
  {
    seq: 15,
    title: 'Conciliar cuentas bancarias de agosto',
    owner: 'finanzas',
    area: 'AF',
    project: 'fiscal',
    meeting: 'cierre',
    evidenceSeq: [1],
    status: S.COMPLETED,
    priority: P.HIGH,
    due: -5,
    completedAgo: 5,
    confidence: 0.96,
    tags: ['cierre-contable'],
  },
  {
    seq: 16,
    title: 'Enviar estados financieros al despacho contable',
    owner: 'finanzas',
    area: 'AF',
    project: 'fiscal',
    meeting: 'cierre',
    evidenceSeq: [1],
    status: S.COMPLETED,
    priority: P.MEDIUM,
    due: -4,
    completedAgo: 4,
    confidence: 0.95,
    tags: ['cierre-contable'],
  },
  {
    seq: 17,
    title: 'Revisar deducciones fiscales de agosto',
    external: 'ruiz',
    ownerText: 'Despacho Ruiz',
    area: 'EX',
    project: 'fiscal',
    meeting: 'cierre',
    evidenceSeq: [2, 4],
    status: S.PENDING,
    priority: P.MEDIUM,
    due: 6,
    dueText: 'la próxima semana',
    dateConfidence: 0.65,
    confidence: 0.9,
    tags: ['fiscal', 'externo'],
  },
  {
    seq: 18,
    title: 'Preparar deck para inversionistas Fondo Gamma',
    owner: 'capital',
    collaborators: ['andres'],
    area: 'CC',
    project: 'gamma',
    meeting: 'gamma',
    evidenceSeq: [1, 2],
    status: S.COMPLETED,
    priority: P.HIGH,
    due: -25,
    completedAgo: 25,
    confidence: 0.94,
    tags: ['inversionistas'],
  },
  {
    seq: 19,
    title: 'Agendar segunda ronda con inversionistas',
    owner: 'capital',
    area: 'CC',
    project: 'gamma',
    meeting: 'gamma',
    evidenceSeq: [3],
    status: S.WAITING,
    priority: P.MEDIUM,
    due: 3,
    confidence: 0.83,
    tags: ['inversionistas'],
    history: [
      { from: null, to: S.PENDING, system: true, ago: 33, reason: 'Creada desde reunión' },
      {
        from: S.PENDING,
        to: S.WAITING,
        by: 'capital',
        ago: 15,
        reason: 'Esperando confirmación de los inversionistas',
      },
    ],
  },
  {
    seq: 20,
    title: 'Responder quejas pendientes del portal (backlog NPS)',
    owner: 'servicio',
    area: 'SC',
    project: 'portal',
    meeting: 'nps',
    evidenceSeq: [1],
    status: S.IN_PROGRESS,
    priority: P.HIGH,
    due: -1,
    confidence: 0.9,
    tags: ['portal', 'nps'],
    history: [
      { from: null, to: S.PENDING, system: true, ago: 8, reason: 'Creada desde reunión' },
      { from: S.PENDING, to: S.IN_PROGRESS, by: 'servicio', ago: 7 },
    ],
  },
  {
    seq: 21,
    title: 'Implementar encuesta NPS post-atención',
    owner: 'servicio',
    area: 'SC',
    project: 'portal',
    meeting: 'nps',
    evidenceSeq: [2],
    status: S.PENDING,
    priority: P.MEDIUM,
    due: 15,
    confidence: 0.88,
    tags: ['portal', 'nps'],
  },
  {
    seq: 22,
    title: 'Capacitar al equipo de soporte en el nuevo portal',
    ownerText: 'equipo de soporte',
    area: 'SC',
    project: 'portal',
    meeting: 'nps',
    evidenceSeq: [4, 5],
    status: S.PROPOSED,
    priority: P.MEDIUM,
    confidence: 0.79,
    requiresReview: true,
    tags: ['portal', 'capacitacion'],
  },
  {
    seq: 23,
    title: 'Evaluar locales comerciales en Monterrey',
    owner: 'andres',
    area: 'OP',
    project: 'norte',
    meeting: 'norte',
    evidenceSeq: [1, 2],
    status: S.IN_PROGRESS,
    priority: P.HIGH,
    due: 20,
    confidence: 0.92,
    tags: ['expansion'],
    history: [
      { from: null, to: S.PENDING, system: true, ago: 20, reason: 'Creada desde reunión' },
      { from: S.PENDING, to: S.IN_PROGRESS, by: 'andres', ago: 14 },
    ],
    comments: [
      {
        by: 'andres',
        body: 'Visita a Monterrey programada; dos de los tres locales siguen disponibles.',
        source: 'USER',
        ago: 6,
      },
    ],
  },
  {
    seq: 24,
    title: 'Elaborar estudio de mercado Expansión Norte',
    owner: 'ventas',
    area: 'VM',
    project: 'norte',
    meeting: 'norte',
    evidenceSeq: [3],
    status: S.PENDING,
    priority: P.MEDIUM,
    due: 25,
    confidence: 0.9,
    tags: ['expansion', 'mercado'],
  },
  {
    seq: 25,
    title: 'Proyección financiera Expansión Norte 2027',
    owner: 'finanzas',
    area: 'AF',
    project: 'norte',
    meeting: 'norte',
    evidenceSeq: [4],
    status: S.BLOCKED,
    priority: P.HIGH,
    due: -8,
    confidence: 0.89,
    blocker:
      'Faltan supuestos de renta del local; depende de la evaluación de locales (ACT-000023).',
    tags: ['expansion', 'finanzas'],
    history: [
      { from: null, to: S.PENDING, system: true, ago: 20, reason: 'Creada desde reunión' },
      { from: S.PENDING, to: S.BLOCKED, by: 'finanzas', ago: 12, reason: 'Sin supuestos de renta' },
    ],
  },
  {
    seq: 26,
    title: 'Negociar términos comerciales iniciales con Cliente Alfa',
    owner: 'andres',
    area: 'OP',
    project: 'alfa',
    meeting: 'negociacion',
    evidenceSeq: [1],
    status: S.COMPLETED,
    priority: P.HIGH,
    due: -18,
    completedAgo: 18,
    confidence: 0.93,
    tags: ['cliente-alfa'],
  },
  {
    seq: 27,
    title: 'Enviar borrador de contrato a Cliente Alfa',
    owner: 'juridico',
    area: 'JU',
    project: 'alfa',
    meeting: 'negociacion',
    evidenceSeq: [4],
    status: S.COMPLETED,
    priority: P.HIGH,
    due: -12,
    completedAgo: 12,
    confidence: 0.91,
    tags: ['cliente-alfa', 'legal'],
    links: [
      {
        meeting: 'legal',
        relation: RelationType.COMPLETED,
        evidenceSeq: [1],
        previousStatus: S.IN_PROGRESS,
        detectedStatus: S.COMPLETION_PROPOSED,
      },
    ],
  },
  {
    seq: 28,
    title: 'Corregir errores de carga en módulo de reportes Beta',
    owner: 'operaciones',
    area: 'OP',
    project: 'beta',
    meeting: 'avancesBeta',
    evidenceSeq: [5],
    status: S.IN_PROGRESS,
    priority: P.URGENT,
    due: 2,
    confidence: 0.93,
    tags: ['beta', 'bug'],
    history: [
      { from: null, to: S.PENDING, system: true, ago: 6, reason: 'Creada desde reunión' },
      { from: S.PENDING, to: S.IN_PROGRESS, by: 'operaciones', ago: 5 },
    ],
  },
  {
    seq: 29,
    title: 'Definir fecha de liberación de Plataforma Beta v1',
    owner: 'andres',
    area: 'OP',
    project: 'beta',
    meeting: 'avancesBeta',
    evidenceSeq: [6],
    status: S.PROPOSED,
    priority: P.HIGH,
    due: 8,
    dueText: 'a finales de la próxima semana',
    dateConfidence: 0.6,
    confidence: 0.84,
    requiresReview: true,
    tags: ['beta', 'release'],
  },
  {
    seq: 30,
    title: 'Revisar contrato de soporte con Nube MX',
    owner: 'juridico',
    area: 'JU',
    project: 'beta',
    meeting: 'avancesBeta',
    evidenceSeq: [3, 4],
    status: S.PENDING,
    priority: P.MEDIUM,
    due: 11,
    confidence: 0.9,
    tags: ['legal', 'proveedor'],
  },
  // --- Backlog migrado del legado (sin reunión de origen) ------------------
  {
    seq: 31,
    title: 'Renovar póliza de seguro de oficinas',
    owner: 'finanzas',
    area: 'AF',
    status: S.COMPLETED,
    priority: P.MEDIUM,
    due: -40,
    completedAgo: 40,
    legacyId: 'AF-012',
    createdAgo: 55,
    tags: ['legado'],
    comments: [
      { body: 'Completada en julio; póliza enviada por correo.', source: 'LEGACY_IMPORT', ago: 40 },
    ],
  },
  {
    seq: 32,
    title: 'Registrar marca ante el IMPI',
    owner: 'juridico',
    area: 'JU',
    status: S.COMPLETED,
    priority: P.HIGH,
    due: -35,
    completedAgo: 35,
    legacyId: 'JU-004',
    createdAgo: 70,
    tags: ['legado', 'legal'],
    comments: [{ body: 'Título de registro recibido.', source: 'LEGACY_IMPORT', ago: 35 }],
  },
  {
    seq: 33,
    title: 'Actualizar organigrama en el sitio web',
    owner: 'ventas',
    area: 'VM',
    status: S.COMPLETED,
    priority: P.LOW,
    due: -30,
    completedAgo: 30,
    legacyId: 'VM-021',
    createdAgo: 45,
    tags: ['legado'],
  },
  {
    seq: 34,
    title: 'Seguimiento diario a cobranza',
    description: 'Actividad recurrente diaria; no se cierra como tarea única.',
    owner: 'finanzas',
    area: 'AF',
    status: S.IN_PROGRESS,
    priority: P.MEDIUM,
    legacyId: 'AF-030',
    createdAgo: 60,
    recurrence: { frequency: 'DAILY', textOriginal: 'diaria' },
    tags: ['legado', 'recurrente', 'cobranza'],
    history: [
      {
        from: null,
        to: S.IN_PROGRESS,
        system: true,
        ago: 60,
        reason: 'Migración legado: estado En proceso',
      },
    ],
    comments: [
      {
        body: 'Seguimiento diario; reporte semanal a Dirección.',
        source: 'LEGACY_IMPORT',
        ago: 60,
      },
    ],
  },
  {
    seq: 35,
    title: 'Migrar expedientes a Drive compartido',
    owner: 'operaciones',
    area: 'OP',
    status: S.COMPLETED,
    priority: P.MEDIUM,
    due: -28,
    completedAgo: 28,
    legacyId: 'OP-015',
    createdAgo: 50,
    tags: ['legado'],
    comments: [
      {
        body: 'Falta validar carpeta de contratos 2024 (marcada completa en el sheet).',
        source: 'LEGACY_IMPORT',
        ago: 28,
      },
    ],
  },
  {
    seq: 36,
    title: 'Contratar servicio de mensajería',
    ownerText: 'Por definir',
    area: 'AF',
    status: S.PENDING,
    priority: P.LOW,
    legacyId: 'AF-033',
    createdAgo: 40,
    tags: ['legado'],
  },
  {
    seq: 37,
    title: 'Preparar reporte trimestral para el consejo',
    owner: 'direccion',
    area: 'DG',
    status: S.COMPLETED,
    priority: P.HIGH,
    due: -20,
    completedAgo: 20,
    legacyId: 'DG-002',
    createdAgo: 48,
    tags: ['legado', 'consejo'],
  },
  {
    seq: 38,
    title: 'Escriturar terreno de Monterrey',
    external: 'notaria',
    ownerText: 'Notaría 27',
    area: 'EX',
    project: 'norte',
    status: S.WAITING,
    priority: P.MEDIUM,
    due: 30,
    legacyId: 'EX-003',
    createdAgo: 35,
    tags: ['legado', 'expansion', 'externo'],
    history: [
      {
        from: null,
        to: S.WAITING,
        system: true,
        ago: 35,
        reason: 'Migración legado: compromiso de tercero',
      },
    ],
  },
  {
    seq: 39,
    title: 'Auditoría interna de accesos a sistemas',
    owner: 'auditoria',
    area: null,
    status: S.PENDING,
    priority: P.MEDIUM,
    due: 18,
    createdAgo: 4,
    tags: ['auditoria'],
  },
  {
    seq: 40,
    title: 'Revisar contratos de proveedores vencidos',
    owner: 'juridico',
    area: 'JU',
    status: S.PENDING,
    priority: P.LOW,
    due: -15,
    legacyId: 'JU-011',
    createdAgo: 42,
    tags: ['legado', 'legal'],
    comments: [
      { body: 'Por revisar; proyecto en pausa según el sheet.', source: 'LEGACY_IMPORT', ago: 42 },
    ],
  },
  {
    seq: 41,
    title: 'Cancelar suscripción de software sin uso',
    owner: 'finanzas',
    area: 'AF',
    meeting: 'cierre',
    evidenceSeq: [5],
    status: S.CANCELLED,
    priority: P.LOW,
    cancelledAgo: 4,
    confidence: 0.8,
    tags: ['ahorro'],
    history: [
      { from: null, to: S.PENDING, system: true, ago: 5, reason: 'Creada desde reunión' },
      {
        from: S.PENDING,
        to: S.CANCELLED,
        by: 'finanzas',
        ago: 4,
        reason: 'Ya se había cancelado antes de la reunión',
      },
    ],
  },
  {
    seq: 42,
    title: 'Publicar caso de éxito Cliente Alfa',
    owner: 'ventas',
    area: 'VM',
    project: 'alfa',
    meeting: 'comite',
    evidenceSeq: [8],
    status: S.PENDING,
    priority: P.LOW,
    confidence: 0.82,
    tags: ['marketing', 'cliente-alfa'],
  },
  {
    seq: 43,
    title: 'Enviar propuesta a Fondo Gamma sobre comisión de éxito',
    owner: 'capital',
    area: 'CC',
    project: 'gamma',
    meeting: 'gamma',
    evidenceSeq: [4, 5],
    status: S.COMPLETED,
    priority: P.MEDIUM,
    due: -10,
    completedAgo: 8,
    confidence: 0.9,
    tags: ['inversionistas'],
  },
  {
    seq: 44,
    title: 'Definir SLA de respuesta para tickets',
    owner: 'servicio',
    area: 'SC',
    project: 'portal',
    meeting: 'nps',
    evidenceSeq: [5],
    status: S.PENDING,
    priority: P.HIGH,
    due: 4,
    confidence: 0.88,
    tags: ['portal', 'sla'],
    links: [{ meeting: 'comite', relation: RelationType.MENTIONED, evidenceSeq: [7] }],
  },
  {
    seq: 45,
    title: 'Preparar presentación de resultados de agosto',
    owner: 'direccion',
    collaborators: ['finanzas'],
    area: 'DG',
    meeting: 'cierre',
    evidenceSeq: [3],
    status: S.COMPLETED,
    priority: P.HIGH,
    due: -2,
    completedAgo: 2,
    confidence: 0.9,
    tags: ['comite', 'resultados'],
  },
  {
    seq: 46,
    title: 'Obtener permisos municipales para local Monterrey',
    owner: 'andres',
    area: 'OP',
    project: 'norte',
    meeting: 'norte',
    evidenceSeq: [5],
    status: S.BLOCKED,
    priority: P.MEDIUM,
    due: 6,
    confidence: 0.86,
    blocker: 'El ayuntamiento no ha respondido la solicitud de permisos.',
    tags: ['expansion', 'permisos'],
    history: [
      { from: null, to: S.PENDING, system: true, ago: 20, reason: 'Creada desde reunión' },
      {
        from: S.PENDING,
        to: S.BLOCKED,
        by: 'andres',
        ago: 9,
        reason: 'Sin respuesta del ayuntamiento',
      },
    ],
  },
  {
    seq: 47,
    title: 'Definir responsable de mantenimiento del portal',
    area: 'SC',
    project: 'portal',
    meeting: 'nps',
    evidenceSeq: [6],
    status: S.PENDING,
    priority: P.MEDIUM,
    confidence: 0.81,
    tags: ['portal'],
  },
]

export interface ActionItemsResult {
  ids: Record<number, string>
  counts: Record<string, number>
}

export function itemId(seq: number): string {
  return stableId(`item:${seq}`)
}

function evidenceFor(
  m: MeetingsResult,
  cat: Catalogs,
  meeting: MeetingKey,
  seqs: number[],
): EvidenceQuote[] {
  return seqs.map((seq) => ({
    text: m.segmentText(meeting, seq),
    segmentId: m.segmentId(meeting, seq),
    speaker: speakerOf(m, cat, meeting, seq),
  }))
}

function speakerOf(m: MeetingsResult, _cat: Catalogs, meeting: MeetingKey, seq: number): string {
  // La etiqueta de hablante vive en el segmento; para el seed basta con referenciarlo.
  return `segmento ${seq} de ${m.titles[meeting]}`
}

function resolveDue(def: ItemDef): Date | null {
  if (def.dueWeekday !== undefined) return nextWeekday(def.dueWeekday)
  if (def.due === undefined) return null
  return localDate(def.due)
}

export async function seedActionItems(
  db: PrismaClient,
  cat: Catalogs,
  m: MeetingsResult,
): Promise<ActionItemsResult> {
  const ids: Record<number, string> = {}
  const counts = {
    actionItems: 0,
    links: 0,
    statusHistory: 0,
    comments: 0,
    completionProposals: 0,
    aiReviewItems: 0,
    collaborators: 0,
  }

  for (const def of ITEMS) {
    const id = itemId(def.seq)
    ids[def.seq] = id
    const meetingId = def.meeting ? m.ids[def.meeting] : null
    const createdAt = def.meeting
      ? addMinutes(m.starts[def.meeting], 60)
      : daysAgo(def.createdAgo ?? 30)
    const isLegacy = def.legacyId !== undefined
    const sourceEvidence =
      def.meeting && def.evidenceSeq ? evidenceFor(m, cat, def.meeting, def.evidenceSeq) : []
    const data = {
      title: def.title,
      description: def.description ?? null,
      type: def.recurrence ? ActionItemType.RECURRING : ActionItemType.ONE_OFF,
      ownerUserId: def.owner ? cat.users[def.owner] : null,
      externalAssigneeId: def.external ? cat.externals[def.external] : null,
      ownerTextOriginal: def.ownerText ?? (def.owner ? cat.userNames[def.owner] : null),
      areaId: def.area ? cat.areas[def.area] : null,
      projectId: def.project ? cat.projects[def.project] : null,
      createdFromMeetingId: meetingId,
      latestMeetingId: meetingId,
      status: def.status,
      priority: def.priority,
      dueDate: resolveDue(def),
      dueDateTextOriginal: def.dueText ?? null,
      dateConfidence: def.dateConfidence ?? (def.due !== undefined ? 0.9 : null),
      startDate: null,
      completedAt: def.completedAgo !== undefined ? daysAgo(def.completedAgo) : null,
      cancelledAt: def.cancelledAgo !== undefined ? daysAgo(def.cancelledAgo) : null,
      confidence: def.confidence ?? null,
      requiresReview: def.requiresReview ?? false,
      sourceEvidence: jsonSafe(sourceEvidence),
      recurrence: def.recurrence ? jsonSafe(def.recurrence) : Prisma.DbNull,
      parentActionItemId: null,
      blocker: def.blocker ?? null,
      tags: def.tags ?? [],
      migrationTrust: isLegacy ? MigrationTrust.LEGACY : MigrationTrust.PLATFORM,
      legacyId: def.legacyId ?? null,
      lastMentionedAt: null as Date | null,
      createdAt,
    }
    await db.actionItem.upsert({
      where: { id },
      create: { id, sequence: def.seq, externalKey: formatExternalKey(def.seq), ...data },
      update: data,
    })
    counts.actionItems++

    // Colaboradores.
    await db.actionItemCollaborator.deleteMany({ where: { actionItemId: id } })
    for (const c of def.collaborators ?? []) {
      await db.actionItemCollaborator.create({ data: { actionItemId: id, userId: cat.users[c] } })
      counts.collaborators++
    }

    // Links: CREATED desde la reunión de origen + los adicionales.
    const links: LinkDef[] = []
    if (def.meeting)
      links.push({
        meeting: def.meeting,
        relation: RelationType.CREATED,
        evidenceSeq: def.evidenceSeq,
      })
    links.push(...(def.links ?? []))
    let lastMention: Date | null = null
    let latestMeeting: { id: string; at: Date } | null = null
    for (const [i, l] of links.entries()) {
      const linkId = stableId(`link:${def.seq}:${i}`)
      const linkAt = addMinutes(m.starts[l.meeting], 45)
      const linkData = {
        actionItemId: id,
        meetingId: m.ids[l.meeting],
        relationType: l.relation,
        evidence: jsonSafe(l.evidenceSeq ? evidenceFor(m, cat, l.meeting, l.evidenceSeq) : []),
        previousStatus: l.previousStatus ?? null,
        detectedStatus: l.detectedStatus ?? null,
        detectedDueDate: null,
        createdAt: linkAt,
      }
      await db.actionItemMeetingLink.upsert({
        where: { id: linkId },
        create: { id: linkId, ...linkData },
        update: linkData,
      })
      counts.links++
      if (l.relation === RelationType.MENTIONED && (!lastMention || linkAt > lastMention))
        lastMention = linkAt
      if (!latestMeeting || linkAt > latestMeeting.at)
        latestMeeting = { id: m.ids[l.meeting], at: linkAt }
    }
    if (latestMeeting || lastMention) {
      await db.actionItem.update({
        where: { id },
        data: { latestMeetingId: latestMeeting?.id ?? meetingId, lastMentionedAt: lastMention },
      })
    }

    // Historial de estado.
    const history: HistoryDef[] = [...(def.history ?? [])]
    let proposalIndex = 0
    if (def.status === S.COMPLETED && !isLegacy && def.owner) {
      const completedAgo = def.completedAgo ?? 1
      const approver = APPROVER[def.owner]
      history.push(
        {
          from: null,
          to: S.PENDING,
          system: true,
          ago: completedAgo + 3,
          reason: 'Creada desde reunión',
        },
        {
          from: S.PENDING,
          to: S.COMPLETION_PROPOSED,
          by: def.owner,
          ago: completedAgo + 1,
          reason: 'El responsable propone el cierre',
        },
        {
          from: S.COMPLETION_PROPOSED,
          to: S.COMPLETED,
          by: approver,
          ago: completedAgo,
          reason: 'Propuesta de cierre aprobada',
        },
      )
      const proposalId = stableId(`proposal:${def.seq}:${proposalIndex++}`)
      const proposalData = {
        actionItemId: id,
        proposedByType: ProposedByType.USER,
        proposedByUserId: cat.users[def.owner],
        proposedFromMeetingId: null,
        reason: 'Entregable concluido; se solicita aprobación de cierre.',
        evidenceSegmentIds: [] as string[],
        evidence: jsonSafe([]),
        confidence: 1,
        status: CompletionProposalStatus.APPROVED,
        reviewedByUserId: cat.users[approver],
        reviewedAt: daysAgo(completedAgo),
        reviewComment: 'Aprobado.',
        createdAt: daysAgo(completedAgo + 1),
      }
      await db.completionProposal.upsert({
        where: { id: proposalId },
        create: { id: proposalId, ...proposalData },
        update: proposalData,
      })
      counts.completionProposals++
    } else if (isLegacy && history.length === 0) {
      history.push({
        from: null,
        to: def.status,
        system: true,
        ago: def.createdAgo ?? 30,
        reason: `Migración legado: estado inicial ${def.status}`,
      })
    } else if (history.length === 0) {
      history.push({
        from: null,
        to: def.status === S.PROPOSED ? S.PROPOSED : S.PENDING,
        system: true,
        ago: 0,
        reason: def.meeting ? 'Creada desde reunión' : 'Creada manualmente',
      })
    }
    for (const [i, h] of history.entries()) {
      const historyId = stableId(`history:${def.seq}:${i}`)
      const changedAt = h.ago === 0 ? createdAt : daysAgo(h.ago)
      const historyData = {
        actionItemId: id,
        fromStatus: h.from,
        toStatus: h.to,
        changedByUserId: h.by ? cat.users[h.by] : null,
        changedBySystem: h.system ?? false,
        reason: h.reason ?? null,
        meetingId: h.meeting ? m.ids[h.meeting] : null,
        changedAt,
      }
      await db.actionItemStatusHistory.upsert({
        where: { id: historyId },
        create: { id: historyId, ...historyData },
        update: historyData,
      })
      counts.statusHistory++
    }

    // Comentarios.
    for (const [i, c] of (def.comments ?? []).entries()) {
      const commentId = stableId(`comment:${def.seq}:${i}`)
      const commentData = {
        actionItemId: id,
        authorUserId: c.by ? cat.users[c.by] : null,
        body: c.body,
        source: c.source,
        createdAt: daysAgo(c.ago),
      }
      await db.actionItemComment.upsert({
        where: { id: commentId },
        create: { id: commentId, ...commentData },
        update: commentData,
      })
      counts.comments++
    }
  }

  // Propuesta de cierre PENDING (IA) sobre "Aprobar presupuesto de licencias" (§50 demo).
  {
    const proposalId = stableId('proposal:ai:licencias')
    const seg = m.segmentId('alfa', 15)
    const proposalData = {
      actionItemId: ids[2] as string,
      proposedByType: ProposedByType.AI,
      proposedByUserId: null,
      proposedFromMeetingId: m.ids.alfa,
      reason:
        'El cliente indicó en la reunión: "Lo del presupuesto de licencias ya quedó cerrado, lo mandé ayer". Requiere confirmación de Finanzas.',
      evidenceSegmentIds: [seg],
      evidence: jsonSafe([
        { text: m.segmentText('alfa', 15), speaker: 'Carlos Martínez', segmentId: seg },
      ]),
      confidence: 0.86,
      status: CompletionProposalStatus.PENDING,
      reviewedByUserId: null,
      reviewedAt: null,
      reviewComment: null,
      createdAt: addMinutes(m.starts.alfa, 50),
    }
    await db.completionProposal.upsert({
      where: { id: proposalId },
      create: { id: proposalId, ...proposalData },
      update: proposalData,
    })
    counts.completionProposals++
  }

  // Bandeja de revisión IA (§23): 6 elementos pendientes.
  const nextTuesday = nextWeekday(2)
  const reviews: Array<{
    key: string
    meeting: MeetingKey
    reasons: AiReviewReason[]
    decision: ReconcileDecision
    candidateSeq?: number
    candidateScore?: number
    proposedSeq?: number
    extracted: ExtractedActionItem
    suggestedOwner?: UserKey
    suggestedOwnerConfidence?: number
    suggestedDueDate?: Date
    suggestedDueDateConfidence?: number
  }> = [
    {
      key: 'alfa-carta',
      meeting: 'alfa',
      reasons: [AiReviewReason.POSSIBLE_DUPLICATE, AiReviewReason.AMBIGUOUS_OWNER],
      decision: ReconcileDecision.LINK_EXISTING,
      candidateSeq: 1,
      candidateScore: 0.78,
      extracted: {
        title: 'Enviar carta de intención de Cliente Alfa',
        description: 'El cliente enviará la carta de intención; Andrés da seguimiento.',
        owner: { name: 'Carlos Martínez', evidence: m.segmentText('alfa', 5) },
        dueDate: ymd(nextTuesday),
        dueDateTextOriginal: 'el próximo martes',
        priority: ActionItemPriority.HIGH,
        statusHint: 'UPDATE',
        evidence: [
          {
            text: m.segmentText('alfa', 5),
            speaker: 'Andrés Escandón',
            segmentId: m.segmentId('alfa', 5),
          },
        ],
        confidence: 0.81,
        relatedOpenActionKey: formatExternalKey(1),
        projectHint: 'Cliente Alfa',
      },
      suggestedOwner: 'andres',
      suggestedOwnerConfidence: 0.82,
      suggestedDueDate: nextTuesday,
      suggestedDueDateConfidence: 0.94,
    },
    {
      key: 'pipeline-video',
      meeting: 'pipeline',
      reasons: [AiReviewReason.LOW_CONFIDENCE],
      decision: ReconcileDecision.CREATE_NEW,
      proposedSeq: 14,
      extracted: {
        title: 'Cotizar agencia para producción de video',
        owner: { name: 'Paola Mendieta', evidence: m.segmentText('pipeline', 5) },
        dueDate: null,
        priority: ActionItemPriority.LOW,
        statusHint: 'NEW',
        evidence: [{ text: m.segmentText('pipeline', 5), segmentId: m.segmentId('pipeline', 5) }],
        confidence: 0.74,
      },
      suggestedOwner: 'ventas',
      suggestedOwnerConfidence: 0.7,
    },
    {
      key: 'nps-capacitacion',
      meeting: 'nps',
      reasons: [AiReviewReason.AMBIGUOUS_OWNER],
      decision: ReconcileDecision.REQUIRES_HUMAN_REVIEW,
      proposedSeq: 22,
      extracted: {
        title: 'Capacitar al equipo de soporte en el nuevo portal',
        owner: { name: 'equipo de soporte', evidence: m.segmentText('nps', 4) },
        dueDate: null,
        priority: ActionItemPriority.MEDIUM,
        statusHint: 'NEW',
        evidence: [{ text: m.segmentText('nps', 4), segmentId: m.segmentId('nps', 4) }],
        confidence: 0.79,
      },
      suggestedOwner: 'servicio',
      suggestedOwnerConfidence: 0.55,
    },
    {
      key: 'beta-fecha',
      meeting: 'avancesBeta',
      reasons: [AiReviewReason.AMBIGUOUS_DUE_DATE],
      decision: ReconcileDecision.CREATE_NEW,
      proposedSeq: 29,
      extracted: {
        title: 'Definir fecha de liberación de Plataforma Beta v1',
        owner: { name: 'Andrés Escandón', evidence: m.segmentText('avancesBeta', 6) },
        dueDate: ymd(localDate(8)),
        dueDateTextOriginal: 'a finales de la próxima semana',
        priority: ActionItemPriority.HIGH,
        statusHint: 'NEW',
        evidence: [
          { text: m.segmentText('avancesBeta', 6), segmentId: m.segmentId('avancesBeta', 6) },
        ],
        confidence: 0.84,
      },
      suggestedOwner: 'andres',
      suggestedOwnerConfidence: 0.9,
      suggestedDueDate: localDate(8),
      suggestedDueDateConfidence: 0.6,
    },
    {
      key: 'comite-okr',
      meeting: 'comite',
      reasons: [AiReviewReason.POSSIBLE_DUPLICATE],
      decision: ReconcileDecision.REQUIRES_HUMAN_REVIEW,
      candidateSeq: 6,
      candidateScore: 0.71,
      extracted: {
        title: 'Definir objetivos del trimestre por área',
        owner: { name: 'Andrés Escandón', evidence: m.segmentText('comite', 3) },
        dueDate: null,
        priority: ActionItemPriority.HIGH,
        statusHint: 'UNKNOWN',
        evidence: [{ text: m.segmentText('comite', 3), segmentId: m.segmentId('comite', 3) }],
        confidence: 0.77,
        relatedOpenActionKey: formatExternalKey(6),
      },
      suggestedOwner: 'andres',
      suggestedOwnerConfidence: 0.6,
    },
    {
      key: 'nps-encuesta',
      meeting: 'nps',
      reasons: [AiReviewReason.POSSIBLE_COMPLETION],
      decision: ReconcileDecision.MARK_DONE_CANDIDATE,
      candidateSeq: 21,
      candidateScore: 0.66,
      extracted: {
        title: 'Implementar encuesta NPS post-atención',
        owner: { name: 'Iván Robles', evidence: m.segmentText('nps', 3) },
        dueDate: null,
        priority: ActionItemPriority.MEDIUM,
        statusHint: 'DONE',
        evidence: [{ text: m.segmentText('nps', 3), segmentId: m.segmentId('nps', 3) }],
        confidence: 0.66,
        relatedOpenActionKey: formatExternalKey(21),
      },
    },
  ]
  for (const r of reviews) {
    const reviewId = stableId(`review:${r.key}`)
    const runId = m.runs[r.meeting]
    if (!runId) throw new Error(`La reunión ${r.meeting} no tiene ProcessingRun`)
    const reviewData = {
      meetingId: m.ids[r.meeting],
      processingRunId: runId,
      reasons: r.reasons,
      reconcileDecision: r.decision,
      candidateActionItemId: r.candidateSeq !== undefined ? (ids[r.candidateSeq] ?? null) : null,
      candidateScore: r.candidateScore ?? null,
      proposedActionItemId: r.proposedSeq !== undefined ? (ids[r.proposedSeq] ?? null) : null,
      extracted: jsonSafe(r.extracted),
      suggestedOwnerUserId: r.suggestedOwner ? cat.users[r.suggestedOwner] : null,
      suggestedOwnerConfidence: r.suggestedOwnerConfidence ?? null,
      suggestedDueDate: r.suggestedDueDate ?? null,
      suggestedDueDateConfidence: r.suggestedDueDateConfidence ?? null,
      status: AiReviewItemStatus.PENDING,
      resolvedByUserId: null,
      resolvedAt: null,
      resolutionNote: null,
      createdAt: addMinutes(m.starts[r.meeting], 50),
    }
    await db.aiReviewItem.upsert({
      where: { id: reviewId },
      create: { id: reviewId, ...reviewData },
      update: reviewData,
    })
    counts.aiReviewItems++
  }

  // Avanzar la secuencia serial por encima del máximo sembrado (para nextSequence()).
  await db.$executeRaw`
    SELECT setval(
      pg_get_serial_sequence('action_items', 'sequence'),
      (SELECT COALESCE(MAX("sequence"), 0) FROM "action_items") + 1,
      false
    )
  `

  return { ids, counts }
}
