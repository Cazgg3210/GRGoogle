import { describe, expect, it } from 'vitest'
import type { AnalyzeMeetingInput } from '@smlxl/domain'
import { MeetingAnalysisResultSchema } from '@smlxl/contracts'
import { FakeMeetingAnalyzer } from './analyzer.js'
import { detectLanguage } from './heuristics.js'

function input(
  title: string,
  segments: Array<[string, string]>,
  extra: Partial<AnalyzeMeetingInput> = {},
): AnalyzeMeetingInput {
  return {
    meeting: {
      id: 'm1',
      title,
      startAt: '2026-09-03T15:00:00Z',
      endAt: '2026-09-03T16:00:00Z',
      organizerEmail: 'andres.escandon@smlxl.mx',
      reportedLanguageCode: 'es-MX',
    },
    participants: [
      {
        displayName: 'Andrés Escandón',
        email: 'andres.escandon@smlxl.mx',
        isInternal: true,
        internalUserId: 'u-andres',
      },
      {
        displayName: 'Lucía Ferrer',
        email: 'lucia.ferrer@smlxl.mx',
        isInternal: true,
        internalUserId: 'u-lucia',
      },
      {
        displayName: 'Carlos Martínez',
        email: 'carlos.martinez@cliente-alfa.example',
        isInternal: false,
        internalUserId: null,
      },
      {
        displayName: 'Mariana Solís',
        email: 'mariana.solis@smlxl.mx',
        isInternal: true,
        internalUserId: 'u-mariana',
      },
    ],
    segments: segments.map(([speaker, text], i) => ({
      id: `s${i}`,
      sequence: i + 1,
      speakerLabel: speaker,
      text,
      startTime: null,
      endTime: null,
    })),
    smartNotesText: null,
    openActions: [],
    companyDomain: 'smlxl.mx',
    referenceDate: '2026-09-03',
    timezone: 'America/Mexico_City',
    ...extra,
  }
}

describe('FakeMeetingAnalyzer', () => {
  it('usa el escenario Cliente Alfa con exactamente 3 items y 2 decisiones', async () => {
    const ai = new FakeMeetingAnalyzer()
    const { result, usage } = await ai.analyzeMeeting(
      input('Seguimiento contrato Cliente Alfa', [['Andrés Escandón', 'Hola']]),
    )
    expect(MeetingAnalysisResultSchema.safeParse(result).success).toBe(true)
    expect(result.actionItems).toHaveLength(3)
    const [carta, anexo, presupuesto] = result.actionItems
    expect(carta).toMatchObject({
      statusHint: 'UPDATE',
      confidence: 0.82,
      dueDate: '2026-09-08',
      relatedOpenActionKey: null,
    })
    expect(carta?.owner).toMatchObject({
      name: 'Carlos Martínez',
      email: 'carlos.martinez@cliente-alfa.example',
    })
    expect(anexo).toMatchObject({ statusHint: 'NEW', confidence: 0.91, dueDate: '2026-09-04' })
    expect(anexo?.owner?.name).toBe('Jurídico')
    expect(presupuesto).toMatchObject({ statusHint: 'DONE', confidence: 0.86 })
    expect(result.decisions).toHaveLength(2)
    expect(result.summary.executive.length).toBeGreaterThanOrEqual(3)
    expect(usage.provider).toBe('fake')
    expect(usage.estimatedCostUsd).toBe(0)
  })

  it('asigna el participante de Jurídico cuando está presente', async () => {
    const ai = new FakeMeetingAnalyzer()
    const base = input('Seguimiento contrato Cliente Alfa', [['Andrés Escandón', 'Hola']])
    base.participants.push({
      displayName: 'Pedro Jurídico',
      email: 'pedro@smlxl.mx',
      isInternal: true,
      internalUserId: 'u-pedro',
    })
    const { result } = await ai.analyzeMeeting(base)
    expect(result.actionItems[1]?.owner).toMatchObject({
      name: 'Pedro Jurídico',
      email: 'pedro@smlxl.mx',
    })
  })

  it('extrae heurísticamente compromisos, fechas, DONE/BLOCKED y decisiones', async () => {
    const ai = new FakeMeetingAnalyzer()
    const { result } = await ai.analyzeMeeting(
      input('Sincronización semanal Operaciones', [
        ['Mariana Solís', 'Arrancamos con la revisión de operaciones de la semana.'],
        [
          'Andrés Escandón',
          'La migración del servidor de archivos ya quedó lista desde el lunes, no hubo incidencias.',
        ],
        [
          'Mariana Solís',
          'Yo voy a preparar el reporte de avance del proyecto de bodega para el jueves, con los datos de inventario.',
        ],
        [
          'Lucía Ferrer',
          'Hay que revisar el inventario de la bodega norte mañana, hay diferencias entre el sistema y el conteo físico.',
        ],
        [
          'Mariana Solís',
          'Acordamos mover el corte de nómina al día quince a partir del siguiente mes.',
        ],
        [
          'Lucía Ferrer',
          'El proveedor de transporte sigue bloqueado, estamos esperando a que nos manden la póliza actualizada.',
        ],
        ['Andrés Escandón', 'Es urgente, Lucía dale seguimiento diario al proveedor por favor.'],
      ]),
    )
    expect(MeetingAnalysisResultSchema.safeParse(result).success).toBe(true)
    expect(result.language.detectedLanguageCode).toBe('es-MX')
    const reporte = result.actionItems.find((i) => /reporte de avance/i.test(i.title))
    expect(reporte).toMatchObject({
      dueDate: '2026-09-10',
      statusHint: 'NEW',
      dueDateTextOriginal: 'para el jueves',
    })
    expect(reporte?.owner?.name).toBe('Mariana Solís')
    const inventario = result.actionItems.find((i) => /bodega norte/i.test(i.title))
    expect(inventario?.dueDate).toBe('2026-09-04')
    const migracion = result.actionItems.find((i) => /migraci/i.test(i.title))
    expect(migracion?.statusHint).toBe('DONE')
    const proveedor = result.actionItems.find((i) => i.statusHint === 'BLOCKED')
    expect(proveedor).toBeDefined()
    const seguimiento = result.actionItems.find((i) => /seguimiento/i.test(i.title))
    expect(seguimiento).toMatchObject({ priority: 'URGENT', recurringHint: true })
    expect(seguimiento?.owner?.name).toBe('Lucía Ferrer')
    expect(result.decisions).toHaveLength(1)
    expect(result.decisions[0]?.description).toMatch(/corte de nómina/i)
    for (const item of result.actionItems) {
      expect(item.confidence).toBeGreaterThanOrEqual(0.6)
      expect(item.confidence).toBeLessThanOrEqual(0.95)
      expect(item.evidence.length).toBeGreaterThan(0)
    }
  })

  it('marca UPDATE cuando coincide con una acción abierta del contexto', async () => {
    const ai = new FakeMeetingAnalyzer()
    const { result } = await ai.analyzeMeeting(
      input(
        'Reunión',
        [
          [
            'Mariana Solís',
            'Yo voy a preparar el reporte de avance del proyecto de bodega para el jueves.',
          ],
        ],
        {
          openActions: [
            {
              id: 'a1',
              externalKey: 'ACT-000010',
              title: 'Preparar reporte de avance del proyecto de bodega',
              ownerName: 'Mariana Solís',
              status: 'PENDING',
              dueDate: null,
              projectName: null,
            },
          ],
        },
      ),
    )
    expect(result.actionItems[0]).toMatchObject({
      statusHint: 'UPDATE',
      relatedOpenActionKey: 'ACT-000010',
    })
  })

  it('reconcilia de forma determinista y genera digest', async () => {
    const ai = new FakeMeetingAnalyzer()
    const extracted = {
      title: 'Enviar carta',
      owner: null,
      dueDate: null,
      priority: null,
      statusHint: 'NEW' as const,
      evidence: [{ text: 'x' }],
      confidence: 0.8,
    }
    const cand = (preScore: number) => ({
      actionItemId: 'a1',
      externalKey: 'ACT-000001',
      title: 'Enviar carta',
      description: null,
      ownerName: null,
      status: 'PENDING' as const,
      dueDate: null,
      projectName: null,
      preScore,
    })
    expect(
      (
        await ai.reconcileActionItems({
          extracted,
          candidates: [cand(0.9)],
          meetingTitle: 'R',
          referenceDate: '2026-09-03',
        })
      ).result.decision,
    ).toBe('LINK_EXISTING')
    expect(
      (
        await ai.reconcileActionItems({
          extracted: { ...extracted, statusHint: 'DONE' },
          candidates: [cand(0.7)],
          meetingTitle: 'R',
          referenceDate: '2026-09-03',
        })
      ).result.decision,
    ).toBe('MARK_DONE_CANDIDATE')
    expect(
      (
        await ai.reconcileActionItems({
          extracted,
          candidates: [cand(0.65)],
          meetingTitle: 'R',
          referenceDate: '2026-09-03',
        })
      ).result.decision,
    ).toBe('REQUIRES_HUMAN_REVIEW')
    expect(
      (
        await ai.reconcileActionItems({
          extracted,
          candidates: [],
          meetingTitle: 'R',
          referenceDate: '2026-09-03',
        })
      ).result.decision,
    ).toBe('CREATE_NEW')
    const digest = await ai.generateWeeklyDigest({
      weekLabel: '2026-W36',
      weekStart: '2026-08-31',
      weekEnd: '2026-09-06',
      stats: { meetingsDetected: 4, meetingsProcessed: 3, newActionItems: 5, overdue: 2 },
      newItems: [],
      overdueItems: [{ key: 'ACT-1', title: 'X', owner: null, daysOverdue: 3 }],
      proposals: [],
      captureIssues: [],
    })
    expect(digest.result.executiveNarrative[0]).toContain('4 reuniones')
    expect(digest.result.risksNarrative[0]).toContain('3 día')
  })

  it('detecta idioma por stopwords', () => {
    expect(detectLanguage(['The team will send the report and we review it on Monday']).code).toBe(
      'en-US',
    )
    expect(detectLanguage(['El equipo va a enviar el reporte y lo revisamos el lunes']).code).toBe(
      'es-MX',
    )
  })
})
