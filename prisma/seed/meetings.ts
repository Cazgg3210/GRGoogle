import { createHash } from 'node:crypto'
import {
  AiAnalysisStatus,
  ArtifactStatus,
  ConfidentialityLevel,
  DecisionStatus,
  DomainErrorCode,
  MeetingProcessingStatus,
  MeetingSource,
  MeetingStatus,
  ParticipantType,
  TranscriptSourceType,
} from '@smlxl/domain'
import type { PrismaClient } from '../../packages/database/src/index.js'
import type { AreaKey, Catalogs, ProjectKey, UserKey } from './catalogs.js'
import { addMinutes, at, hoursFromNow, stableId } from './helpers.js'

export type MeetingKey =
  | 'alfa'
  | 'comite'
  | 'legal'
  | 'kickoffBeta'
  | 'pipeline'
  | 'cierre'
  | 'gamma'
  | 'nps'
  | 'norte'
  | 'externo'
  | 'syncOps'
  | 'licencias'
  | 'entrevista'
  | 'negociacion'
  | 'avancesBeta'

/** Participante externo (no usuario del tenant). */
interface ExternalParticipant {
  name: string
  email: string
}

type ParticipantDef = UserKey | ExternalParticipant

/** Etiqueta de hablante: clave de usuario o nombre externo. */
type Speaker = UserKey | string

interface DecisionDef {
  description: string
  decidedBy: string | null
  evidenceSeq: number[]
  confidence: number
  status: DecisionStatus
}

interface SummaryDef {
  executive: string[]
  detailed: string
  topics: string[]
  risks: string[]
  openQuestions: string[]
}

interface MeetingDef {
  key: MeetingKey
  title: string
  organizer: UserKey | null
  organizerEmail?: string
  isExternalHost?: boolean
  area: AreaKey | null
  project: ProjectKey | null
  /** Días respecto a hoy (negativo = pasado). */
  dayOffset: number
  hour: number
  durationMin: number
  source: MeetingSource
  status: MeetingStatus
  processing: MeetingProcessingStatus
  transcript: ArtifactStatus
  notes: ArtifactStatus
  ai: AiAnalysisStatus
  confidentiality?: ConfidentialityLevel
  excludedFromAi?: boolean
  lastErrorCode?: string
  participants: ParticipantDef[]
  segments?: Array<[Speaker, string]>
  summary?: SummaryDef
  decisions?: DecisionDef[]
  /** Reunión "por venir": startAt relativo a ahora en horas. */
  startsInHours?: number
}

const EXTERNAL_CARLOS: ExternalParticipant = {
  name: 'Carlos Martínez',
  email: 'carlos.martinez@clientealfa.example',
}
const EXTERNAL_ELENA: ExternalParticipant = {
  name: 'Elena Vidal',
  email: 'elena.vidal@nubemx.example',
}
const EXTERNAL_RICARDO: ExternalParticipant = {
  name: 'Ricardo Ruiz',
  email: 'ricardo@despachoruiz.example',
}
const EXTERNAL_INVERSIONISTA: ExternalParticipant = {
  name: 'Tomás Aguirre',
  email: 'taguirre@fondogamma.example',
}

const MEETINGS: MeetingDef[] = [
  {
    key: 'alfa',
    title: 'Seguimiento contrato Cliente Alfa',
    organizer: 'andres',
    area: 'OP',
    project: 'alfa',
    dayOffset: -3,
    hour: 10,
    durationMin: 42,
    source: MeetingSource.WORKSPACE_EVENT,
    status: MeetingStatus.ENDED,
    processing: MeetingProcessingStatus.REVIEW_REQUIRED,
    transcript: ArtifactStatus.INGESTED,
    notes: ArtifactStatus.INGESTED,
    ai: AiAnalysisStatus.SUCCEEDED,
    participants: ['andres', 'direccion', 'gestora', EXTERNAL_CARLOS],
    segments: [
      [
        'andres',
        'Buenos días a todos. El objetivo de hoy es revisar el estatus del contrato con Cliente Alfa y cerrar los pendientes antes de la firma.',
      ],
      ['direccion', 'Perfecto. Carlos, gracias por acompañarnos. ¿Cómo va la revisión de su lado?'],
      [
        'Carlos Martínez',
        'Gracias, Lucía. Nuestro comité ya aprobó las condiciones comerciales. Sólo nos falta formalizar la intención por escrito.',
      ],
      ['andres', '¿Tenemos fecha para eso?'],
      [
        'andres',
        'Entonces quedamos así: Carlos enviará la carta de intención el próximo martes y nosotros preparamos el cronograma.',
      ],
      [
        'Carlos Martínez',
        'Correcto, el martes la tienen en su correo. Ya la tengo en borrador con nuestro director.',
      ],
      ['gestora', 'Lo anoto. ¿La carta va dirigida a Lucía o a Andrés?'],
      ['direccion', 'A Andrés, que lleva la relación. Yo firmo después.'],
      [
        'andres',
        'Ahora, el anexo de penalizaciones. Lisa nos comentó que hay dos cláusulas que le preocupan.',
      ],
      ['direccion', 'Sí, la de retraso por causas del cliente y la de terminación anticipada.'],
      [
        'Carlos Martínez',
        'De nuestro lado no hay problema en ajustar los porcentajes si se justifican.',
      ],
      [
        'andres',
        'Quedamos en que Jurídico revisa el anexo de penalizaciones antes del viernes y les manda comentarios.',
      ],
      ['gestora', 'Lo registro para Lisa, con fecha viernes.'],
      ['direccion', 'Carlos, ¿el presupuesto de licencias del sistema ya lo tienen aprobado?'],
      [
        'Carlos Martínez',
        'Lo del presupuesto de licencias ya quedó cerrado, lo mandé ayer a Héctor con el desglose.',
      ],
      [
        'andres',
        'Perfecto, entonces esa tarea la podemos dar por concluida en cuanto Héctor confirme.',
      ],
      ['gestora', 'Héctor no está en la llamada; le pido que lo valide hoy.'],
      ['direccion', 'Siguiente punto: el cronograma de implementación.'],
      [
        'andres',
        'Yo preparo una propuesta de cronograma de implementación para la próxima semana, con hitos por fase.',
      ],
      ['Carlos Martínez', 'Nos ayudaría que incluya el plan de capacitación a nuestro equipo.'],
      ['andres', 'Lo incluimos.'],
      ['direccion', '¿Algún riesgo que veamos para la firma?'],
      ['Carlos Martínez', 'Sólo el tiempo de respuesta de nuestra área legal; suele tardar.'],
      ['andres', 'Entonces conviene mandar el anexo cuanto antes. Mariana, ¿algo más pendiente?'],
      ['gestora', 'Sólo confirmar que la firma sería la semana del quince, si todo sale bien.'],
      ['direccion', 'Muy bien. Gracias a todos, cerramos.'],
    ],
    summary: {
      executive: [
        'Cliente Alfa aprobó las condiciones comerciales; la carta de intención llegará el próximo martes.',
        'Jurídico revisará el anexo de penalizaciones antes del viernes (cláusulas de retraso y terminación anticipada).',
        'El presupuesto de licencias quedó cerrado según el cliente; falta confirmación de Finanzas.',
        'Andrés preparará el cronograma de implementación con plan de capacitación.',
      ],
      detailed:
        'La reunión revisó el estatus del contrato con Cliente Alfa. El cliente confirmó la aprobación interna de las condiciones comerciales y se comprometió a enviar la carta de intención el próximo martes, dirigida a Andrés. Se identificaron dos cláusulas del anexo de penalizaciones que Jurídico debe revisar antes del viernes. El cliente indicó que el presupuesto de licencias ya fue enviado a Héctor; la tarea se considera concluida en cuanto Finanzas lo valide. Andrés preparará una propuesta de cronograma de implementación que incluya capacitación. El principal riesgo es el tiempo de respuesta del área legal del cliente. La firma tentativa sería la semana del quince.',
      topics: [
        'Carta de intención',
        'Anexo de penalizaciones',
        'Presupuesto de licencias',
        'Cronograma de implementación',
      ],
      risks: ['Tiempo de respuesta del área legal del cliente puede retrasar la firma.'],
      openQuestions: [
        '¿Héctor confirmó la recepción del presupuesto de licencias?',
        '¿La firma se mantiene para la semana del quince?',
      ],
    },
    decisions: [
      {
        description:
          'La carta de intención se dirigirá a Andrés Escandón, quien lleva la relación con Cliente Alfa.',
        decidedBy: 'Lucía Ferrer',
        evidenceSeq: [7, 8],
        confidence: 0.93,
        status: DecisionStatus.CONFIRMED,
      },
      {
        description:
          'Se ajustarán los porcentajes de penalización si se justifican; Jurídico envía comentarios antes del viernes.',
        decidedBy: 'Andrés Escandón',
        evidenceSeq: [11, 12],
        confidence: 0.88,
        status: DecisionStatus.PROPOSED,
      },
    ],
  },
  {
    key: 'comite',
    title: 'Comité de dirección semanal',
    organizer: 'direccion',
    area: 'DG',
    project: null,
    dayOffset: -2,
    hour: 9,
    durationMin: 55,
    source: MeetingSource.WORKSPACE_EVENT,
    status: MeetingStatus.ENDED,
    processing: MeetingProcessingStatus.COMPLETED,
    transcript: ArtifactStatus.INGESTED,
    notes: ArtifactStatus.INGESTED,
    ai: AiAnalysisStatus.SUCCEEDED,
    participants: ['direccion', 'gestora', 'andres', 'ventas', 'finanzas'],
    segments: [
      [
        'direccion',
        'Arrancamos el comité. Primero, resultados de agosto y después los objetivos del trimestre.',
      ],
      [
        'finanzas',
        'Cerramos agosto con ingresos ligeramente por arriba del plan; el detalle lo presento el jueves.',
      ],
      [
        'direccion',
        'Necesito que cada área defina sus OKRs del cuarto trimestre. Andrés coordina la plantilla.',
      ],
      [
        'andres',
        'De acuerdo, la circulo hoy. Sobre Alfa: la carta de intención sigue pendiente de recibir.',
      ],
      ['ventas', 'Del lado comercial, el pipeline del Q4 se actualiza semanalmente en el CRM.'],
      ['gestora', 'Yo envío la minuta de este comité a los gerentes hoy mismo.'],
      [
        'direccion',
        'También necesitamos definir el SLA de respuesta para tickets del portal; Iván ya lo tiene en su lista.',
      ],
      ['direccion', 'Publicaremos el caso de éxito de Cliente Alfa cuando se firme. Cerramos.'],
    ],
    summary: {
      executive: [
        'Agosto cerró por arriba del plan; Finanzas presenta el detalle el jueves.',
        'Cada área definirá OKRs del Q4; Andrés coordina la plantilla.',
        'La carta de intención de Cliente Alfa sigue pendiente de recibir.',
      ],
      detailed:
        'El comité revisó resultados de agosto, acordó definir OKRs por área para el cuarto trimestre y dio seguimiento a Cliente Alfa, cuya carta de intención aún no se recibe. Se mencionó el SLA de respuesta para tickets del portal y la minuta será enviada por Mariana.',
      topics: ['Resultados de agosto', 'OKRs Q4', 'Cliente Alfa', 'SLA de tickets'],
      risks: [
        'La carta de intención de Cliente Alfa se ha mencionado en varias reuniones sin avance.',
      ],
      openQuestions: ['¿Qué fecha límite tendrán los OKRs por área?'],
    },
    decisions: [
      {
        description: 'Cada área definirá OKRs del Q4 usando la plantilla que coordina Andrés.',
        decidedBy: 'Lucía Ferrer',
        evidenceSeq: [3, 4],
        confidence: 0.9,
        status: DecisionStatus.CONFIRMED,
      },
    ],
  },
  {
    key: 'legal',
    title: 'Revisión legal anexos Cliente Alfa',
    organizer: 'juridico',
    area: 'JU',
    project: 'alfa',
    dayOffset: -6,
    hour: 12,
    durationMin: 35,
    source: MeetingSource.WORKSPACE_EVENT,
    status: MeetingStatus.ENDED,
    processing: MeetingProcessingStatus.COMPLETED,
    transcript: ArtifactStatus.INGESTED,
    notes: ArtifactStatus.UNAVAILABLE,
    ai: AiAnalysisStatus.SUCCEEDED,
    confidentiality: ConfidentialityLevel.LEGAL,
    participants: ['juridico', 'andres', 'direccion'],
    segments: [
      [
        'juridico',
        'Revisé el borrador del contrato que enviamos; el cliente ya devolvió comentarios menores.',
      ],
      ['andres', 'La cláusula de exclusividad era la que más preocupaba. ¿Ya tenemos dictamen?'],
      [
        'juridico',
        'Sí, el dictamen sobre exclusividad quedó listo y está en la carpeta compartida.',
      ],
      [
        'direccion',
        'Bien. Lo que sigue es el anexo de penalizaciones, que aún no se ha negociado.',
      ],
      [
        'juridico',
        'También necesito actualizar la política de firmas electrónicas; estoy esperando al proveedor.',
      ],
      ['andres', 'Y recordar que seguimos sin recibir la carta de intención de Alfa.'],
    ],
    summary: {
      executive: [
        'Dictamen sobre exclusividad concluido.',
        'El anexo de penalizaciones sigue pendiente de negociación.',
      ],
      detailed:
        'Jurídico confirmó que el dictamen sobre la cláusula de exclusividad está listo y que el cliente devolvió comentarios menores al borrador. Queda pendiente el anexo de penalizaciones y la actualización de la política de firmas electrónicas, que depende del proveedor.',
      topics: ['Dictamen de exclusividad', 'Anexo de penalizaciones', 'Firmas electrónicas'],
      risks: ['Dependencia del proveedor de firma electrónica.'],
      openQuestions: [],
    },
  },
  {
    key: 'kickoffBeta',
    title: 'Kickoff Plataforma Beta',
    organizer: 'andres',
    area: 'OP',
    project: 'beta',
    dayOffset: -12,
    hour: 11,
    durationMin: 60,
    source: MeetingSource.WORKSPACE_EVENT,
    status: MeetingStatus.ENDED,
    processing: MeetingProcessingStatus.COMPLETED,
    transcript: ArtifactStatus.INGESTED,
    notes: ArtifactStatus.INGESTED,
    ai: AiAnalysisStatus.SUCCEEDED,
    participants: ['andres', 'operaciones', 'servicio', EXTERNAL_ELENA],
    segments: [
      [
        'andres',
        'Bienvenidos al kickoff de Plataforma Beta. Elena, gracias por acompañarnos de parte de Nube MX.',
      ],
      [
        'Elena Vidal',
        'Con gusto. Nosotros entregamos las credenciales del ambiente de pruebas en cuanto se firme el anexo de soporte.',
      ],
      ['operaciones', 'Yo configuro el ambiente de pruebas en cuanto tenga esas credenciales.'],
      [
        'andres',
        'Rodrigo, también necesitamos documentar los requerimientos de integración con el CRM.',
      ],
      ['operaciones', 'Lo tomo; para dentro de dos semanas tengo un primer borrador.'],
      ['servicio', 'Y hay que aprobar el presupuesto de licencias; Héctor lo tiene en revisión.'],
      ['andres', 'Correcto. Cerramos con esos tres puntos.'],
    ],
    summary: {
      executive: [
        'Nube MX entregará credenciales del ambiente de pruebas tras firmar el anexo de soporte.',
        'Rodrigo documentará requerimientos de integración con CRM.',
      ],
      detailed:
        'Kickoff del proyecto Plataforma Beta con el proveedor Nube MX. Se acordó que el proveedor entregará las credenciales del ambiente de pruebas, Rodrigo configurará el ambiente y documentará los requerimientos de integración con CRM, y Finanzas revisará el presupuesto de licencias.',
      topics: ['Ambiente de pruebas', 'Integración CRM', 'Presupuesto de licencias'],
      risks: ['La entrega de credenciales depende de la firma del anexo de soporte.'],
      openQuestions: ['¿Cuándo se firma el anexo de soporte con Nube MX?'],
    },
  },
  {
    key: 'pipeline',
    title: 'Pipeline de ventas Q4',
    organizer: 'ventas',
    area: 'VM',
    project: 'campana',
    dayOffset: -9,
    hour: 16,
    durationMin: 40,
    source: MeetingSource.WORKSPACE_EVENT,
    status: MeetingStatus.ENDED,
    processing: MeetingProcessingStatus.ANALYZED,
    transcript: ArtifactStatus.INGESTED,
    notes: ArtifactStatus.UNAVAILABLE,
    ai: AiAnalysisStatus.SUCCEEDED,
    participants: ['ventas', 'direccion', 'capital'],
    segments: [
      ['ventas', 'Revisemos el pipeline del cuarto trimestre. Tenemos doce oportunidades activas.'],
      [
        'direccion',
        'Quiero que la campaña digital del Q4 esté diseñada antes de que termine el mes.',
      ],
      ['ventas', 'Va. También propongo actualizar el pipeline en el CRM cada semana, los lunes.'],
      [
        'capital',
        'Desde captación podemos compartir contactos de inversionistas que también son prospectos.',
      ],
      [
        'ventas',
        'Igual habría que cotizar una agencia para producir el video de la campaña, si el presupuesto alcanza.',
      ],
      ['direccion', 'Cotícenlo y lo vemos.'],
    ],
    summary: {
      executive: [
        'Doce oportunidades activas en el pipeline del Q4.',
        'La campaña digital debe quedar diseñada antes de fin de mes.',
      ],
      detailed:
        'Ventas presentó el pipeline del Q4. Se acordó diseñar la campaña digital antes de fin de mes, actualizar el pipeline en el CRM semanalmente y cotizar una agencia de producción de video, sujeto a presupuesto.',
      topics: ['Pipeline Q4', 'Campaña digital', 'CRM'],
      risks: ['Presupuesto limitado para producción de video.'],
      openQuestions: ['¿Hay presupuesto para la agencia de video?'],
    },
  },
  {
    key: 'cierre',
    title: 'Cierre contable agosto',
    organizer: 'finanzas',
    area: 'AF',
    project: 'fiscal',
    dayOffset: -5,
    hour: 9,
    durationMin: 50,
    source: MeetingSource.WORKSPACE_EVENT,
    status: MeetingStatus.ENDED,
    processing: MeetingProcessingStatus.COMPLETED,
    transcript: ArtifactStatus.INGESTED,
    notes: ArtifactStatus.INGESTED,
    ai: AiAnalysisStatus.SUCCEEDED,
    participants: ['finanzas', 'gestora', 'direccion', EXTERNAL_RICARDO],
    segments: [
      [
        'finanzas',
        'Las cuentas bancarias de agosto ya están conciliadas y los estados financieros se enviaron al despacho.',
      ],
      [
        'Ricardo Ruiz',
        'Los recibimos. Nosotros revisamos las deducciones fiscales de agosto y les regresamos observaciones la próxima semana.',
      ],
      [
        'direccion',
        'Necesito la presentación de resultados de agosto para el comité; Lucía la preparo yo con base en tus números.',
      ],
      [
        'gestora',
        'Se acordó que el despacho es responsable de las deducciones; lo registro como tarea externa.',
      ],
      ['finanzas', 'También cancelé la suscripción de software que no se usaba, como se pidió.'],
      ['direccion', 'Perfecto, con eso cerramos agosto.'],
    ],
    summary: {
      executive: [
        'Conciliación bancaria de agosto concluida.',
        'El despacho revisará deducciones fiscales la próxima semana.',
      ],
      detailed:
        'Finanzas informó que las cuentas de agosto están conciliadas y los estados financieros fueron enviados al despacho contable, que revisará las deducciones fiscales. Se preparará la presentación de resultados para el comité.',
      topics: ['Conciliación bancaria', 'Estados financieros', 'Deducciones fiscales'],
      risks: [],
      openQuestions: [],
    },
    decisions: [
      {
        description:
          'El Despacho Contable Ruiz es responsable de la revisión de deducciones fiscales de agosto.',
        decidedBy: 'Héctor Salgado',
        evidenceSeq: [2, 4],
        confidence: 0.91,
        status: DecisionStatus.CONFIRMED,
      },
    ],
  },
  {
    key: 'gamma',
    title: 'Levantamiento Fondo Gamma — inversionistas',
    organizer: 'capital',
    area: 'CC',
    project: 'gamma',
    dayOffset: -33,
    hour: 13,
    durationMin: 45,
    source: MeetingSource.WORKSPACE_EVENT,
    status: MeetingStatus.ENDED,
    processing: MeetingProcessingStatus.COMPLETED,
    transcript: ArtifactStatus.INGESTED,
    notes: ArtifactStatus.INGESTED,
    ai: AiAnalysisStatus.SUCCEEDED,
    participants: ['capital', 'direccion', 'andres'],
    segments: [
      [
        'capital',
        'Tenemos tres inversionistas interesados en Fondo Gamma. Necesito el deck listo para la primera ronda.',
      ],
      ['direccion', 'El deck lo preparas tú con apoyo de Andrés en la parte operativa.'],
      [
        'capital',
        'Después de la primera ronda agendamos una segunda con los que sigan interesados.',
      ],
      ['andres', 'Y les mandamos la propuesta de comisión de éxito por escrito.'],
      ['direccion', 'Se decide que la comisión de éxito será del dos por ciento para esta ronda.'],
    ],
    summary: {
      executive: [
        'Tres inversionistas interesados en Fondo Gamma.',
        'Comisión de éxito fijada en 2% para la ronda.',
      ],
      detailed:
        'Captación presentó el interés de tres inversionistas en Fondo Gamma. Se acordó preparar el deck para la primera ronda, agendar una segunda ronda con los interesados y enviar la propuesta de comisión de éxito, fijada en 2%.',
      topics: ['Fondo Gamma', 'Inversionistas', 'Comisión de éxito'],
      risks: [],
      openQuestions: [],
    },
    decisions: [
      {
        description: 'La comisión de éxito para la ronda de Fondo Gamma será del 2%.',
        decidedBy: 'Lucía Ferrer',
        evidenceSeq: [5],
        confidence: 0.95,
        status: DecisionStatus.CONFIRMED,
      },
    ],
  },
  {
    key: 'nps',
    title: 'Atención de quejas y NPS',
    organizer: 'servicio',
    area: 'SC',
    project: 'portal',
    dayOffset: -8,
    hour: 15,
    durationMin: 38,
    source: MeetingSource.WORKSPACE_EVENT,
    status: MeetingStatus.ENDED,
    processing: MeetingProcessingStatus.ANALYZED,
    transcript: ArtifactStatus.INGESTED,
    notes: ArtifactStatus.UNAVAILABLE,
    ai: AiAnalysisStatus.SUCCEEDED,
    participants: ['servicio', 'ventas', 'operaciones'],
    segments: [
      [
        'servicio',
        'Tenemos un backlog de quejas del portal sin responder; lo estoy atacando esta semana.',
      ],
      [
        'ventas',
        'Hay que implementar la encuesta NPS después de cada atención; creo que ya está casi lista.',
      ],
      [
        'servicio',
        'La encuesta NPS ya está en producción desde ayer, sólo falta revisar los primeros resultados.',
      ],
      [
        'operaciones',
        'Alguien del equipo de soporte tiene que capacitarse en el nuevo portal antes de la liberación.',
      ],
      [
        'servicio',
        'Sí, falta definir quién. También hay que definir el SLA de respuesta para tickets.',
      ],
      ['ventas', 'Y quién dará mantenimiento al portal después; nadie lo tiene asignado.'],
    ],
    summary: {
      executive: [
        'Backlog de quejas del portal en atención.',
        'Encuesta NPS reportada como ya en producción.',
      ],
      detailed:
        'Servicio al Cliente reportó avance en el backlog de quejas del portal. Ventas solicitó implementar la encuesta NPS, que según Iván ya está en producción. Quedó pendiente definir quién capacita al equipo de soporte, el SLA de respuesta para tickets y el responsable de mantenimiento del portal.',
      topics: ['Backlog de quejas', 'Encuesta NPS', 'Capacitación de soporte', 'SLA de tickets'],
      risks: ['Tareas sin responsable definido (capacitación y mantenimiento del portal).'],
      openQuestions: [
        '¿Quién capacita al equipo de soporte?',
        '¿Quién será responsable del mantenimiento del portal?',
      ],
    },
  },
  {
    key: 'norte',
    title: 'Planeación Expansión Norte',
    organizer: 'direccion',
    area: 'DG',
    project: 'norte',
    dayOffset: -20,
    hour: 10,
    durationMin: 65,
    source: MeetingSource.WORKSPACE_EVENT,
    status: MeetingStatus.ENDED,
    processing: MeetingProcessingStatus.COMPLETED,
    transcript: ArtifactStatus.INGESTED,
    notes: ArtifactStatus.INGESTED,
    ai: AiAnalysisStatus.SUCCEEDED,
    participants: ['direccion', 'andres', 'ventas', 'finanzas'],
    segments: [
      [
        'direccion',
        'La expansión a Monterrey es prioridad del segundo semestre. Andrés evalúa locales comerciales.',
      ],
      ['andres', 'Ya tengo tres opciones; visito Monterrey en dos semanas.'],
      ['ventas', 'Nosotros preparamos el estudio de mercado de la zona norte.'],
      [
        'finanzas',
        'La proyección financiera 2027 la puedo hacer, pero necesito los supuestos de renta del local.',
      ],
      ['andres', 'También hay que obtener permisos municipales; el ayuntamiento no ha respondido.'],
      ['direccion', 'Decidimos que la apertura objetivo es el primer trimestre de 2027.'],
    ],
    summary: {
      executive: [
        'Apertura objetivo en Monterrey: Q1 2027.',
        'Proyección financiera bloqueada por falta de supuestos de renta.',
      ],
      detailed:
        'Se planeó la expansión a Monterrey: Andrés evalúa locales, Ventas prepara el estudio de mercado y Finanzas hará la proyección 2027 cuando tenga los supuestos de renta. Los permisos municipales dependen de la respuesta del ayuntamiento.',
      topics: [
        'Locales comerciales',
        'Estudio de mercado',
        'Proyección financiera',
        'Permisos municipales',
      ],
      risks: [
        'Ayuntamiento sin respuesta para permisos.',
        'Proyección financiera depende de la selección del local.',
      ],
      openQuestions: ['¿Cuándo responde el ayuntamiento?'],
    },
    decisions: [
      {
        description:
          'La apertura objetivo del local de Monterrey será el primer trimestre de 2027.',
        decidedBy: 'Lucía Ferrer',
        evidenceSeq: [6],
        confidence: 0.92,
        status: DecisionStatus.CONFIRMED,
      },
    ],
  },
  {
    key: 'externo',
    title: 'Sesión con inversionista externo — Fondo Gamma',
    organizer: null,
    organizerEmail: 'inversiones@fondogamma.example',
    isExternalHost: true,
    area: 'CC',
    project: 'gamma',
    dayOffset: -10,
    hour: 17,
    durationMin: 30,
    source: MeetingSource.CALENDAR_DISCOVERY,
    status: MeetingStatus.ENDED,
    processing: MeetingProcessingStatus.COMPLETED,
    transcript: ArtifactStatus.UNAVAILABLE_EXTERNAL_HOST,
    notes: ArtifactStatus.UNAVAILABLE_EXTERNAL_HOST,
    ai: AiAnalysisStatus.SKIPPED,
    participants: ['capital', 'direccion', EXTERNAL_INVERSIONISTA],
  },
  {
    key: 'syncOps',
    title: 'Sincronización semanal Operaciones',
    organizer: 'andres',
    area: 'OP',
    project: null,
    dayOffset: -1,
    hour: 9,
    durationMin: 30,
    source: MeetingSource.WORKSPACE_EVENT,
    status: MeetingStatus.ENDED,
    processing: MeetingProcessingStatus.FAILED,
    transcript: ArtifactStatus.FAILED,
    notes: ArtifactStatus.UNAVAILABLE,
    ai: AiAnalysisStatus.NOT_STARTED,
    lastErrorCode: DomainErrorCode.GOOGLE_MEET_ARTIFACT_NOT_AVAILABLE,
    participants: ['andres', 'operaciones', 'servicio'],
  },
  {
    key: 'licencias',
    title: 'Revisión de presupuesto de licencias',
    organizer: 'finanzas',
    area: 'AF',
    project: 'beta',
    dayOffset: 0,
    hour: 0,
    startsInHours: 3,
    durationMin: 30,
    source: MeetingSource.WORKSPACE_EVENT,
    status: MeetingStatus.SCHEDULED,
    processing: MeetingProcessingStatus.WAITING_FOR_ARTIFACTS,
    transcript: ArtifactStatus.PENDING,
    notes: ArtifactStatus.PENDING,
    ai: AiAnalysisStatus.NOT_STARTED,
    participants: ['finanzas', 'andres', 'gestora'],
  },
  {
    key: 'entrevista',
    title: 'Entrevista de candidato — Dirección',
    organizer: 'direccion',
    area: 'DG',
    project: null,
    dayOffset: -4,
    hour: 18,
    durationMin: 45,
    source: MeetingSource.WORKSPACE_EVENT,
    status: MeetingStatus.ENDED,
    processing: MeetingProcessingStatus.EXCLUDED,
    transcript: ArtifactStatus.AVAILABLE,
    notes: ArtifactStatus.NOT_REQUESTED,
    ai: AiAnalysisStatus.SKIPPED,
    confidentiality: ConfidentialityLevel.RESTRICTED,
    excludedFromAi: true,
    participants: ['direccion', 'gestora'],
  },
  {
    key: 'negociacion',
    title: 'Negociación inicial Cliente Alfa',
    organizer: 'andres',
    area: 'OP',
    project: 'alfa',
    dayOffset: -24,
    hour: 11,
    durationMin: 50,
    source: MeetingSource.WORKSPACE_EVENT,
    status: MeetingStatus.ENDED,
    processing: MeetingProcessingStatus.COMPLETED,
    transcript: ArtifactStatus.INGESTED,
    notes: ArtifactStatus.INGESTED,
    ai: AiAnalysisStatus.SUCCEEDED,
    participants: ['andres', 'direccion', EXTERNAL_CARLOS],
    segments: [
      [
        'andres',
        'Gracias por el tiempo, Carlos. Queremos alinear los términos comerciales iniciales del contrato.',
      ],
      [
        'Carlos Martínez',
        'De acuerdo. Nosotros necesitamos que nos manden la carta de intención firmada de su lado y luego devolvemos la nuestra.',
      ],
      ['andres', 'Yo me encargo de enviar la carta de intención a Cliente Alfa esta semana.'],
      ['direccion', 'Y Lisa manda el borrador del contrato en cuanto tengamos los términos.'],
      ['Carlos Martínez', 'Perfecto, con eso avanzamos con nuestro comité.'],
    ],
    summary: {
      executive: [
        'Se alinearon términos comerciales iniciales con Cliente Alfa.',
        'Andrés enviará la carta de intención; Jurídico el borrador del contrato.',
      ],
      detailed:
        'Primera negociación con Cliente Alfa. Se alinearon los términos comerciales iniciales; Andrés enviará la carta de intención y Jurídico el borrador del contrato para que el cliente avance con su comité.',
      topics: ['Términos comerciales', 'Carta de intención', 'Borrador de contrato'],
      risks: [],
      openQuestions: [],
    },
  },
  {
    key: 'avancesBeta',
    title: 'Seguimiento Plataforma Beta — avances',
    organizer: 'andres',
    area: 'OP',
    project: 'beta',
    dayOffset: -6,
    hour: 16,
    durationMin: 40,
    source: MeetingSource.WORKSPACE_EVENT,
    status: MeetingStatus.ENDED,
    processing: MeetingProcessingStatus.ANALYZED,
    transcript: ArtifactStatus.INGESTED,
    notes: ArtifactStatus.INGESTED,
    ai: AiAnalysisStatus.SUCCEEDED,
    participants: ['andres', 'operaciones', EXTERNAL_ELENA],
    segments: [
      ['andres', 'Revisemos avances de Beta. Rodrigo, ¿cómo va el ambiente de pruebas?'],
      ['operaciones', 'Sigue bloqueado: Nube MX no ha entregado las credenciales del ambiente.'],
      [
        'Elena Vidal',
        'Las entregamos en cuanto Jurídico nos regrese el contrato de soporte revisado.',
      ],
      [
        'andres',
        'Entonces Lisa revisa el contrato de soporte con Nube MX. Rodrigo, ¿y el módulo de reportes?',
      ],
      [
        'operaciones',
        'Estoy corrigiendo los errores de carga del módulo de reportes; es urgente para la demo.',
      ],
      [
        'andres',
        'Falta definir la fecha de liberación de la versión uno; yo diría a finales de la próxima semana, pero lo confirmo.',
      ],
      ['Elena Vidal', 'Nos parece bien, avísennos.'],
    ],
    summary: {
      executive: [
        'Ambiente de pruebas bloqueado por credenciales pendientes de Nube MX.',
        'Fecha de liberación v1 aún por confirmar.',
      ],
      detailed:
        'Seguimiento del proyecto Beta. El ambiente de pruebas sigue bloqueado porque Nube MX condiciona las credenciales a la revisión del contrato de soporte por Jurídico. Rodrigo corrige errores de carga del módulo de reportes. La fecha de liberación de la versión uno queda por confirmar.',
      topics: [
        'Ambiente de pruebas',
        'Contrato de soporte',
        'Módulo de reportes',
        'Fecha de liberación',
      ],
      risks: ['Bloqueo del ambiente de pruebas retrasa la demo.'],
      openQuestions: ['¿Cuál es la fecha de liberación de la v1?'],
    },
  },
]

export interface MeetingsResult {
  ids: Record<MeetingKey, string>
  starts: Record<MeetingKey, Date>
  titles: Record<MeetingKey, string>
  /** Id de ProcessingRun por reunión analizada. */
  runs: Partial<Record<MeetingKey, string>>
  segmentId(meeting: MeetingKey, seq: number): string
  segmentText(meeting: MeetingKey, seq: number): string
  counts: Record<string, number>
}

function participantId(meeting: MeetingKey, p: ParticipantDef): string {
  return stableId(`participant:${meeting}:${typeof p === 'string' ? p : p.email}`)
}

export async function seedMeetings(db: PrismaClient, cat: Catalogs): Promise<MeetingsResult> {
  const ids = {} as Record<MeetingKey, string>
  const starts = {} as Record<MeetingKey, Date>
  const titles = {} as Record<MeetingKey, string>
  const runs: Partial<Record<MeetingKey, string>> = {}
  const segmentTexts = new Map<string, string>()
  const counts = {
    meetings: 0,
    participants: 0,
    transcripts: 0,
    segments: 0,
    summaries: 0,
    decisions: 0,
    processingRuns: 0,
  }

  for (const m of MEETINGS) {
    const id = stableId(`meeting:${m.title}`)
    const startAt =
      m.startsInHours !== undefined ? hoursFromNow(m.startsInHours) : at(m.dayOffset, m.hour)
    const ended = m.status === MeetingStatus.ENDED
    const endAt = ended ? addMinutes(startAt, m.durationMin) : null
    const code = `${m.key.toLowerCase()}-${stableId(`code:${m.key}`).slice(0, 3)}-${stableId(`code2:${m.key}`).slice(0, 3)}`
    const conferenceRecordId =
      ended && m.source !== MeetingSource.LEGACY_IMPORT ? `conferenceRecords/fake-${m.key}` : null
    const data = {
      title: m.title,
      googleConferenceRecordId: conferenceRecordId,
      googleMeetingSpaceId: `spaces/fake-${m.key}`,
      googleMeetingCode: code,
      googleCalendarEventId: `fake-cal-${m.key}`,
      organizerUserId: m.organizer ? cat.users[m.organizer] : null,
      organizerEmail: m.organizer ? cat.userEmails[m.organizer] : (m.organizerEmail ?? null),
      isExternalHost: m.isExternalHost ?? false,
      startAt,
      endAt,
      durationSeconds: endAt ? m.durationMin * 60 : null,
      status: m.status,
      source: m.source,
      processingStatus: m.processing,
      transcriptStatus: m.transcript,
      smartNotesStatus: m.notes,
      aiAnalysisStatus: m.ai,
      confidentialityLevel: m.confidentiality ?? ConfidentialityLevel.NORMAL,
      excludedFromAi: m.excludedFromAi ?? false,
      reportedLanguageCode: 'es-MX',
      detectedLanguageCode: m.segments ? 'es-MX' : null,
      mixedLanguageDetected: false,
      lastErrorCode: m.lastErrorCode ?? null,
      lastErrorAt: m.lastErrorCode ? addMinutes(startAt, m.durationMin + 20) : null,
      areaId: m.area ? cat.areas[m.area] : null,
      projectId: m.project ? cat.projects[m.project] : null,
    }
    await db.meeting.upsert({ where: { id }, create: { id, ...data }, update: data })
    ids[m.key] = id
    starts[m.key] = startAt
    titles[m.key] = m.title
    counts.meetings++

    // Participantes (reemplazo completo, ids estables).
    await db.meetingParticipant.deleteMany({ where: { meetingId: id } })
    const participantByLabel = new Map<string, string>()
    for (const p of m.participants) {
      const pid = participantId(m.key, p)
      const internal = typeof p === 'string'
      await db.meetingParticipant.create({
        data: {
          id: pid,
          meetingId: id,
          internalUserId: internal ? cat.users[p] : null,
          googleParticipantId: `${conferenceRecordId ?? 'spaces/fake'}/participants/${pid.slice(0, 8)}`,
          displayName: internal ? cat.userNames[p] : p.name,
          email: internal ? cat.userEmails[p] : p.email,
          participantType: ParticipantType.SIGNED_IN_USER,
          isInternal: internal,
          joinedAt: ended ? startAt : null,
          leftAt: endAt,
          speakingDurationSeconds: ended ? 120 + (pid.charCodeAt(0) % 9) * 60 : null,
        },
      })
      participantByLabel.set(internal ? p : p.name, pid)
      counts.participants++
    }

    if (!m.segments) continue

    // ProcessingRun (fake analyzer).
    const runId = stableId(`run:${m.key}`)
    const inputTokens = 900 + m.segments.length * 85
    const outputTokens = 350 + m.segments.length * 20
    const runData = {
      meetingId: id,
      kind: 'ANALYZE_MEETING' as const,
      provider: 'fake',
      model: 'fake-analyzer-v1',
      promptVersion: 'v1',
      schemaVersion: '1.0',
      temperature: 0.1,
      inputTokens,
      outputTokens,
      cachedTokens: 0,
      estimatedCostUsd: Number(((inputTokens * 0.3 + outputTokens * 2.5) / 1_000_000).toFixed(6)),
      latencyMs: 1800 + m.segments.length * 40,
      success: true,
      errorCode: null,
      correlationId: `corr-seed-${m.key}`,
      startedAt: addMinutes(startAt, m.durationMin + 5),
      finishedAt: addMinutes(startAt, m.durationMin + 6),
    }
    await db.processingRun.upsert({
      where: { id: runId },
      create: { id: runId, ...runData },
      update: runData,
    })
    runs[m.key] = runId
    counts.processingRuns++

    // Transcript + segmentos.
    const lines = m.segments.map(([speaker, text]) => {
      const label =
        typeof speaker === 'string' && speaker in cat.userNames
          ? cat.userNames[speaker as UserKey]
          : speaker
      return `${label}: ${text}`
    })
    const rawText = lines.join('\n')
    const checksum = createHash('sha256').update(rawText).digest('hex')
    const transcriptId = stableId(`transcript:${m.key}`)
    const transcriptData = {
      meetingId: id,
      sourceType: TranscriptSourceType.MEET_TRANSCRIPT,
      googleTranscriptId: `${conferenceRecordId}/transcripts/fake-${m.key}`,
      languageCode: 'es-MX',
      startedAt: startAt,
      endedAt: endAt,
      rawText,
      structuredPayload: { source: 'seed', entries: m.segments.length },
      sourceUri: null,
      retainedUntil: null,
      ingestionChecksum: checksum,
    }
    await db.transcript.upsert({
      where: { id: transcriptId },
      create: { id: transcriptId, ...transcriptData },
      update: transcriptData,
    })
    counts.transcripts++
    const secondsPerSegment = Math.max(
      20,
      Math.floor((m.durationMin * 60) / (m.segments.length + 1)),
    )
    for (const [i, [speaker, text]] of m.segments.entries()) {
      const seq = i + 1
      const segId = stableId(`segment:${m.key}:${seq}`)
      const label = speaker in cat.userNames ? cat.userNames[speaker as UserKey] : speaker
      const segStart = new Date(startAt.getTime() + i * secondsPerSegment * 1000)
      const segData = {
        transcriptId,
        participantId: participantByLabel.get(speaker) ?? null,
        speakerLabel: label,
        text,
        startAt: segStart,
        endAt: new Date(segStart.getTime() + (secondsPerSegment - 2) * 1000),
        sequence: seq,
      }
      await db.transcriptSegment.upsert({
        where: { id: segId },
        create: { id: segId, ...segData },
        update: segData,
      })
      segmentTexts.set(`${m.key}:${seq}`, text)
      counts.segments++
    }

    if (m.summary) {
      const summaryId = stableId(`summary:${m.key}`)
      const summaryData = {
        meetingId: id,
        processingRunId: runId,
        executiveSummary: m.summary.executive,
        detailedSummary: m.summary.detailed,
        topics: m.summary.topics,
        risks: m.summary.risks,
        openQuestions: m.summary.openQuestions,
        aiModel: 'fake-analyzer-v1',
        promptVersion: 'v1',
        generatedAt: runData.finishedAt,
        approvedAt:
          m.processing === MeetingProcessingStatus.COMPLETED
            ? addMinutes(startAt, m.durationMin + 60)
            : null,
        approvedByUserId:
          m.processing === MeetingProcessingStatus.COMPLETED ? cat.users['gestora'] : null,
      }
      await db.meetingSummary.upsert({
        where: { id: summaryId },
        create: { id: summaryId, ...summaryData },
        update: summaryData,
      })
      counts.summaries++
    }

    for (const [i, d] of (m.decisions ?? []).entries()) {
      const decisionId = stableId(`decision:${m.key}:${i}`)
      const decisionData = {
        meetingId: id,
        processingRunId: runId,
        description: d.description,
        decidedBy: d.decidedBy,
        effectiveDate: null,
        confidence: d.confidence,
        sourceSegmentIds: d.evidenceSeq.map((s) => stableId(`segment:${m.key}:${s}`)),
        evidence: d.evidenceSeq.map((s) => ({
          text: m.segments?.[s - 1]?.[1] ?? '',
          speaker: (() => {
            const sp = m.segments?.[s - 1]?.[0] ?? ''
            return sp in cat.userNames ? cat.userNames[sp as UserKey] : sp
          })(),
          segmentId: stableId(`segment:${m.key}:${s}`),
        })),
        status: d.status,
        createdAt: runData.finishedAt,
      }
      await db.decision.upsert({
        where: { id: decisionId },
        create: { id: decisionId, ...decisionData },
        update: decisionData,
      })
      counts.decisions++
    }
  }

  return {
    ids,
    starts,
    titles,
    runs,
    segmentId: (meeting, seq) => stableId(`segment:${meeting}:${seq}`),
    segmentText: (meeting, seq) => segmentTexts.get(`${meeting}:${seq}`) ?? '',
    counts,
  }
}
