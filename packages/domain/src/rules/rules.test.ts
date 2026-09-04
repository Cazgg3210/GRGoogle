import { describe, expect, it } from 'vitest'
import { ActionItemPriority, ActionItemStatus, ConfidentialityLevel, UserRole } from '../enums.js'
import { AttentionReason, attentionScore } from './attention-score.js'
import { ConfidenceBand, confidenceBand, validateThresholds } from './confidence-gate.js'
import {
  detectRecurrenceHint,
  normalizePriority,
  normalizeText,
  tokenJaccard,
  trigramSimilarity,
} from './normalize.js'
import { Permission, canAccessMeeting, canApproveCompletion, hasPermission } from './rbac.js'
import { captureQualityBuckets } from './meeting-processing.js'
import { parseLocalDate } from './dates.js'

describe('attention score', () => {
  const now = new Date('2026-09-10T12:00:00Z')
  const base = {
    status: ActionItemStatus.PENDING,
    priority: ActionItemPriority.MEDIUM,
    dueDate: parseLocalDate('2026-09-15')!,
    ownerUserId: 'u1',
    externalAssigneeId: null,
    confidence: null,
  }
  it('vencida + alta prioridad pesa más que todo', () => {
    const r = attentionScore(
      { item: { ...base, priority: 'HIGH', dueDate: parseLocalDate('2026-09-01')! } },
      now,
    )
    expect(r.reasons[0]).toBe(AttentionReason.OVERDUE_HIGH_PRIORITY)
    expect(r.score).toBeGreaterThan(
      attentionScore({ item: { ...base, ownerUserId: null, dueDate: null } }, now).score,
    )
  })
  it('completadas no requieren atención', () => {
    expect(attentionScore({ item: { ...base, status: 'COMPLETED' } }, now).score).toBe(0)
  })
  it('explica razones', () => {
    const r = attentionScore(
      { item: { ...base, ownerUserId: null, dueDate: null, confidence: 0.5 } },
      now,
    )
    expect(r.reasons).toEqual([
      AttentionReason.NO_OWNER,
      AttentionReason.NO_DUE_DATE,
      AttentionReason.LOW_AI_CONFIDENCE,
    ])
  })
})

describe('confidence gate', () => {
  it('bandas por defecto', () => {
    expect(confidenceBand(0.95)).toBe(ConfidenceBand.AUTO_ACCEPT)
    expect(confidenceBand(0.9)).toBe(ConfidenceBand.AUTO_ACCEPT)
    expect(confidenceBand(0.8)).toBe(ConfidenceBand.PROPOSAL)
    expect(confidenceBand(0.69)).toBe(ConfidenceBand.REVIEW)
    expect(confidenceBand(Number.NaN)).toBe(ConfidenceBand.REVIEW)
  })
  it('valida umbrales', () => {
    expect(validateThresholds({ autoAccept: 0.9, proposal: 0.7 })).toEqual([])
    expect(validateThresholds({ autoAccept: 0.6, proposal: 0.7 }).length).toBeGreaterThan(0)
  })
})

describe('normalización', () => {
  it('unifica acentos y casing', () => {
    expect(normalizeText('Andrés')).toBe(normalizeText('andres'))
    expect(normalizeText('Lisa de la Fuente')).toBe(normalizeText('Lisa de La Fuente'))
    expect(normalizeText('Escandón')).toBe('escandon')
  })
  it('similitud entre variantes', () => {
    expect(trigramSimilarity('Contrato Cliente Alfa', 'contrato cliente alfa')).toBe(1)
    expect(
      tokenJaccard('Enviar carta al cliente Alfa', 'Enviar la carta a cliente Alfa'),
    ).toBeGreaterThan(0.7)
    expect(tokenJaccard('Enviar carta', 'Revisar presupuesto')).toBe(0)
  })
  it('prioridad y recurrencia', () => {
    expect(normalizePriority('Alta')).toBe('HIGH')
    expect(normalizePriority('media')).toBe('MEDIUM')
    expect(normalizePriority('')).toBeNull()
    expect(detectRecurrenceHint('Dar seguimiento diario a cobranza')?.frequency).toBe('DAILY')
    expect(detectRecurrenceHint('Reporte semanal de ventas')?.frequency).toBe('WEEKLY')
    expect(detectRecurrenceHint('Enviar contrato')).toBeNull()
  })
})

describe('RBAC', () => {
  const director = { id: 'd', role: UserRole.DIRECTOR, areaId: null, email: 'd@smlxl.mx' }
  const member = { id: 'm', role: UserRole.MEMBER, areaId: 'a1', email: 'm@smlxl.mx' }
  const manager = {
    id: 'g',
    role: UserRole.MANAGER,
    areaId: 'a1',
    email: 'g@smlxl.mx',
    teamUserIds: ['m'],
  }
  it('permisos por rol', () => {
    expect(hasPermission(director, Permission.REPORT_GLOBAL)).toBe(true)
    expect(hasPermission(member, Permission.REPORT_GLOBAL)).toBe(false)
    expect(hasPermission(member, Permission.ACTION_ITEM_APPROVE_COMPLETION)).toBe(false)
  })
  it('MEMBER sólo ve reuniones donde participa', () => {
    const meeting = {
      organizerUserId: 'x',
      confidentialityLevel: ConfidentialityLevel.NORMAL,
      areaId: 'a1',
      participantUserIds: ['y'],
    }
    expect(canAccessMeeting(member, meeting)).toBe(false)
    expect(canAccessMeeting(member, { ...meeting, participantUserIds: ['m'] })).toBe(true)
    expect(canAccessMeeting(director, meeting)).toBe(true)
  })
  it('MANAGER ve reuniones de su área/equipo, salvo restringidas', () => {
    const meeting = {
      organizerUserId: 'm',
      confidentialityLevel: ConfidentialityLevel.NORMAL,
      areaId: 'a1',
      participantUserIds: [] as string[],
    }
    expect(canAccessMeeting(manager, meeting)).toBe(true)
    expect(
      canAccessMeeting(manager, { ...meeting, confidentialityLevel: ConfidentialityLevel.LEGAL }),
    ).toBe(false)
  })
  it('aprobación de cierre requiere permiso y alcance', () => {
    const item = { ownerUserId: 'm', collaboratorUserIds: [], areaId: 'a1' }
    expect(canApproveCompletion(member, item)).toBe(false)
    expect(canApproveCompletion(manager, item)).toBe(true)
    expect(canApproveCompletion(manager, { ...item, ownerUserId: 'z', areaId: 'a2' })).toBe(false)
  })
})

describe('calidad de captura', () => {
  it('clasifica host externo sin artefactos', () => {
    const b = captureQualityBuckets({
      transcriptStatus: 'UNAVAILABLE_EXTERNAL_HOST',
      smartNotesStatus: 'UNAVAILABLE_EXTERNAL_HOST',
      processingStatus: 'COMPLETED',
      isExternalHost: true,
    })
    expect(b).toContain('EXTERNAL_HOST_UNAVAILABLE')
    expect(b).not.toContain('NO_ARTIFACT')
  })
  it('sólo transcript', () => {
    const b = captureQualityBuckets({
      transcriptStatus: 'INGESTED',
      smartNotesStatus: 'UNAVAILABLE',
      processingStatus: 'COMPLETED',
      isExternalHost: false,
    })
    expect(b).toEqual(['WITH_TRANSCRIPT', 'TRANSCRIPT_ONLY'])
  })
})
