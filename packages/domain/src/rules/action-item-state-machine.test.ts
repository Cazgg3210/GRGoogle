import { describe, expect, it } from 'vitest'
import { ActionItemStatus } from '../enums.js'
import { DomainErrorCode } from '../errors.js'
import {
  assertTransition,
  canTransition,
  initialStatusFromLegacy,
} from './action-item-state-machine.js'

const user = { actor: { kind: 'USER' as const, userId: 'u1' } }
const ai = { actor: { kind: 'AI' as const } }

describe('ActionItem state machine', () => {
  it('la IA nunca puede marcar COMPLETED', () => {
    for (const from of Object.values(ActionItemStatus)) {
      expect(canTransition(from, ActionItemStatus.COMPLETED, ai)).toBe(false)
      expect(
        canTransition(from, ActionItemStatus.COMPLETED, {
          ...ai,
          viaApprovedCompletionProposal: true,
        }),
      ).toBe(false)
    }
  })

  it('la IA sólo puede proponer cierre desde estados abiertos', () => {
    expect(canTransition(ActionItemStatus.PENDING, ActionItemStatus.COMPLETION_PROPOSED, ai)).toBe(
      true,
    )
    expect(
      canTransition(ActionItemStatus.IN_PROGRESS, ActionItemStatus.COMPLETION_PROPOSED, ai),
    ).toBe(true)
    expect(canTransition(ActionItemStatus.PENDING, ActionItemStatus.IN_PROGRESS, ai)).toBe(false)
    expect(canTransition(ActionItemStatus.COMPLETED, ActionItemStatus.IN_PROGRESS, ai)).toBe(false)
  })

  it('un usuario no puede saltar a COMPLETED sin propuesta aprobada', () => {
    expect(canTransition(ActionItemStatus.PENDING, ActionItemStatus.COMPLETED, user)).toBe(false)
    expect(
      canTransition(ActionItemStatus.COMPLETION_PROPOSED, ActionItemStatus.COMPLETED, user),
    ).toBe(false)
    expect(() =>
      assertTransition(ActionItemStatus.IN_PROGRESS, ActionItemStatus.COMPLETED, user),
    ).toThrowError(
      expect.objectContaining({ code: DomainErrorCode.ACTION_ITEM_COMPLETION_REQUIRES_APPROVAL }),
    )
  })

  it('COMPLETION_PROPOSED -> COMPLETED sólo con aprobación humana', () => {
    expect(
      canTransition(ActionItemStatus.COMPLETION_PROPOSED, ActionItemStatus.COMPLETED, {
        ...user,
        viaApprovedCompletionProposal: true,
      }),
    ).toBe(true)
  })

  it('rechazo humano devuelve a PENDING/IN_PROGRESS', () => {
    expect(
      canTransition(ActionItemStatus.COMPLETION_PROPOSED, ActionItemStatus.PENDING, user),
    ).toBe(true)
    expect(
      canTransition(ActionItemStatus.COMPLETION_PROPOSED, ActionItemStatus.IN_PROGRESS, user),
    ).toBe(true)
  })

  it('reapertura auditada COMPLETED -> IN_PROGRESS', () => {
    expect(canTransition(ActionItemStatus.COMPLETED, ActionItemStatus.IN_PROGRESS, user)).toBe(true)
    expect(canTransition(ActionItemStatus.COMPLETED, ActionItemStatus.PENDING, user)).toBe(false)
  })

  it('cualquier abierto -> CANCELLED por humano', () => {
    for (const from of [
      ActionItemStatus.PROPOSED,
      ActionItemStatus.PENDING,
      ActionItemStatus.IN_PROGRESS,
      ActionItemStatus.BLOCKED,
      ActionItemStatus.WAITING,
    ]) {
      expect(canTransition(from, ActionItemStatus.CANCELLED, user)).toBe(true)
    }
  })

  it('mapea estados legados', () => {
    expect(initialStatusFromLegacy('Pendiente')).toEqual({ status: 'PENDING', recognized: true })
    expect(initialStatusFromLegacy('En proceso')).toEqual({
      status: 'IN_PROGRESS',
      recognized: true,
    })
    expect(initialStatusFromLegacy('Completo')).toEqual({ status: 'COMPLETED', recognized: true })
    expect(initialStatusFromLegacy('completo')).toEqual({ status: 'COMPLETED', recognized: true })
    expect(initialStatusFromLegacy('Entregado')).toEqual({
      status: 'COMPLETION_PROPOSED',
      recognized: true,
    })
    expect(initialStatusFromLegacy('???')).toEqual({ status: 'PENDING', recognized: false })
    expect(initialStatusFromLegacy(null)).toEqual({ status: 'PENDING', recognized: false })
  })
})
