import type { AnalyzeMeetingInput, MeetingAnalysisResult } from '@smlxl/domain'
import { normalizeText } from '@smlxl/domain'
import { AI_SCHEMA_VERSION } from '@smlxl/contracts'
import { endOfMonth, nextWeekday } from './dates.js'

/**
 * Escenarios deterministas del analizador fake (§37 datos demo). Se seleccionan
 * por título de reunión; permiten demostrar el pipeline completo sin red.
 */
export interface FakeScenario {
  /** Coincide si el título normalizado de la reunión contiene este texto normalizado. */
  titleIncludes: string
  build(input: AnalyzeMeetingInput): MeetingAnalysisResult
}

function participantByName(input: AnalyzeMeetingInput, needle: string): AnalyzeMeetingInput['participants'][number] | null {
  const n = normalizeText(needle)
  return input.participants.find((p) => normalizeText(p.displayName).includes(n)) ?? null
}

export const clienteAlfaScenario: FakeScenario = {
  titleIncludes: 'seguimiento contrato cliente alfa',
  build(input) {
    const ref = input.referenceDate
    const carlos = participantByName(input, 'carlos martinez')
    const juridico = participantByName(input, 'juridico')
    const mariana = participantByName(input, 'mariana solis')
    const andres = participantByName(input, 'andres escandon')
    return {
      schemaVersion: AI_SCHEMA_VERSION,
      language: { detectedLanguageCode: 'es-MX', mixedLanguageDetected: false },
      topics: [
        { title: 'Contrato Cliente Alfa', subtopics: ['Anexo de penalizaciones', 'Carta de intención', 'Esquema de pagos'] },
        { title: 'Presupuesto de licencias', subtopics: ['Desglose por usuario'] },
        { title: 'Onboarding', subtopics: ['Orden de compra'] },
      ],
      projectHint: 'Cliente Alfa',
      sensitivityHint: 'NORMAL',
      summary: {
        executive: [
          'Cliente Alfa revisó la versión 3 del contrato; sólo quedan dudas en el anexo de penalizaciones (tope 15%).',
          'Carlos Martínez (Cliente Alfa) enviará la carta de intención firmada el próximo martes.',
          'Jurídico revisará el anexo de penalizaciones para el viernes, coordinado por Lucía Ferrer.',
          'El presupuesto de licencias ya fue enviado y validado por el cliente.',
          'Se acordó mantener el esquema de pagos trimestral y firmar antes de fin de mes.',
        ],
        detailed:
          'La reunión se centró en cerrar los puntos abiertos del contrato con Cliente Alfa. El cliente confirmó que revisó la versión 3 y que sus dudas se concentran en el anexo de penalizaciones, cuyo tope actual es de 15%. Se acordó que Jurídico revise el anexo con comentarios para el viernes y que el cliente envíe la carta de intención firmada el próximo martes, lo que permitirá liberar al equipo de implementación. El presupuesto de licencias ya fue enviado por Mariana Solís y validado por el cliente. Se mantiene el esquema de pagos trimestral y la meta de firmar antes de fin de mes. Queda abierta la pregunta de si el onboarding inicia con la firma o con la orden de compra; el cliente indica que requiere orden de compra, con un plazo aproximado de una semana tras la firma.',
        attentionPoints: ['La firma depende de que Jurídico no encuentre observaciones graves en el anexo.', 'El onboarding requiere orden de compra del cliente.'],
        risks: ['El área legal del cliente podría pedir cambios de última hora en las penalizaciones.'],
        openQuestions: ['¿El onboarding de usuarios arranca con la firma o con la orden de compra?'],
      },
      decisions: [
        {
          description: 'El esquema de pagos del contrato con Cliente Alfa se mantiene trimestral.',
          decidedBy: andres?.displayName ?? 'Andrés Escandón',
          effectiveDate: null,
          evidence: [{ text: 'Entonces se acordó que el esquema de pagos se mantiene trimestral, como estaba en la propuesta original.', speaker: andres?.displayName ?? 'Andrés Escandón' }],
          confidence: 0.92,
        },
        {
          description: 'La firma del contrato con Cliente Alfa se hará antes de fin de mes, salvo observaciones graves de Jurídico.',
          decidedBy: null,
          effectiveDate: endOfMonth(ref),
          evidence: [{ text: 'Quedamos en que la firma del contrato se hace antes de fin de mes, siempre que Jurídico no encuentre algo grave.', speaker: 'Lucía Ferrer' }],
          confidence: 0.85,
        },
      ],
      actionItems: [
        {
          title: 'Enviar carta de intención firmada por dirección de Cliente Alfa',
          description: 'Cliente Alfa enviará la carta de intención firmada por su dirección para liberar al equipo de implementación.',
          owner: {
            name: carlos?.displayName ?? 'Carlos Martínez',
            ...(carlos?.email ? { email: carlos.email } : {}),
            evidence: 'yo voy a enviar la carta de intención firmada por nuestra dirección el próximo martes',
          },
          dueDate: nextWeekday(ref, 2),
          dueDateTextOriginal: 'el próximo martes',
          priority: null,
          statusHint: 'UPDATE',
          evidence: [{ text: 'Por nuestra parte, yo voy a enviar la carta de intención firmada por nuestra dirección el próximo martes.', speaker: carlos?.displayName ?? 'Carlos Martínez' }],
          confidence: 0.82,
          relatedOpenActionKey: null,
          recurringHint: false,
          projectHint: 'Cliente Alfa',
        },
        {
          title: 'Revisar anexo de penalizaciones del contrato Cliente Alfa',
          description: 'Jurídico revisa el tope máximo de penalizaciones (15%) y entrega comentarios.',
          owner: {
            name: juridico?.displayName ?? 'Jurídico',
            ...(juridico?.email ? { email: juridico.email } : {}),
            evidence: 'yo me encargo de que Jurídico revise el anexo de penalizaciones y tengamos comentarios para el viernes',
          },
          dueDate: nextWeekday(ref, 5),
          dueDateTextOriginal: 'para el viernes',
          priority: 'HIGH',
          statusHint: 'NEW',
          evidence: [
            { text: 'Lucía, ¿puedes coordinar con Jurídico que revisen el anexo de penalizaciones para el viernes?', speaker: andres?.displayName ?? 'Andrés Escandón' },
            { text: 'Sí, yo me encargo de que Jurídico revise el anexo de penalizaciones y tengamos comentarios para el viernes.', speaker: 'Lucía Ferrer' },
          ],
          confidence: 0.91,
          relatedOpenActionKey: null,
          recurringHint: false,
          projectHint: 'Cliente Alfa',
        },
        {
          title: 'Enviar presupuesto de licencias a Cliente Alfa',
          description: 'El presupuesto de licencias con desglose por usuario ya fue enviado y validado por el cliente.',
          owner: {
            name: mariana?.displayName ?? 'Mariana Solís',
            ...(mariana?.email ? { email: mariana.email } : {}),
            evidence: 'ya quedó listo y lo mandé ayer al correo de Carlos',
          },
          dueDate: null,
          priority: null,
          statusHint: 'DONE',
          evidence: [{ text: 'Sobre el presupuesto de licencias, ya quedó listo y lo mandé ayer al correo de Carlos con el desglose por usuario.', speaker: mariana?.displayName ?? 'Mariana Solís' }],
          confidence: 0.86,
          relatedOpenActionKey: null,
          recurringHint: false,
          projectHint: 'Cliente Alfa',
        },
      ],
      extractionConfidence: 0.88,
    }
  },
}

export const FAKE_SCENARIOS: FakeScenario[] = [clienteAlfaScenario]

export function findScenario(title: string, registry: FakeScenario[] = FAKE_SCENARIOS): FakeScenario | null {
  const n = normalizeText(title)
  return registry.find((s) => n.includes(normalizeText(s.titleIncludes))) ?? null
}
