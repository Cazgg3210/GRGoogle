import type { ActionItemStatus, RelationType } from './enums.js'
import type { Id } from './entities.js'

/** Eventos de dominio: los casos de uso los emiten; el worker/notificador los consume. */
export type DomainEvent =
  | { type: 'MeetingDiscovered'; meetingId: Id; source: string; occurredAt: Date }
  | { type: 'MeetingArtifactsAvailable'; meetingId: Id; occurredAt: Date }
  | { type: 'MeetingIngested'; meetingId: Id; transcriptId: Id | null; occurredAt: Date }
  | {
      type: 'MeetingAnalyzed'
      meetingId: Id
      processingRunId: Id
      reviewRequired: boolean
      occurredAt: Date
    }
  | { type: 'MeetingProcessingFailed'; meetingId: Id; errorCode: string; occurredAt: Date }
  | {
      type: 'ActionItemCreated'
      actionItemId: Id
      meetingId: Id | null
      ownerUserId: Id | null
      proposed: boolean
      occurredAt: Date
    }
  | {
      type: 'ActionItemLinkedToMeeting'
      actionItemId: Id
      meetingId: Id
      relation: RelationType
      occurredAt: Date
    }
  | {
      type: 'ActionItemStatusChanged'
      actionItemId: Id
      from: ActionItemStatus
      to: ActionItemStatus
      byUserId: Id | null
      occurredAt: Date
    }
  | {
      type: 'ActionItemReassigned'
      actionItemId: Id
      fromUserId: Id | null
      toUserId: Id | null
      byUserId: Id | null
      occurredAt: Date
    }
  | {
      type: 'CompletionProposed'
      actionItemId: Id
      proposalId: Id
      byType: 'AI' | 'USER'
      occurredAt: Date
    }
  | { type: 'CompletionApproved'; actionItemId: Id; proposalId: Id; byUserId: Id; occurredAt: Date }
  | { type: 'CompletionRejected'; actionItemId: Id; proposalId: Id; byUserId: Id; occurredAt: Date }
  | { type: 'AiReviewItemCreated'; reviewItemId: Id; meetingId: Id; occurredAt: Date }
  | { type: 'WeeklyDigestGenerated'; digestId: Id; weekLabel: string; occurredAt: Date }
  | { type: 'WeeklyDigestSent'; digestId: Id; recipients: string[]; occurredAt: Date }

export interface DomainEventPublisher {
  publish(event: DomainEvent): Promise<void>
}

export class CollectingEventPublisher implements DomainEventPublisher {
  readonly events: DomainEvent[] = []
  async publish(event: DomainEvent): Promise<void> {
    this.events.push(event)
  }
  drain(): DomainEvent[] {
    return this.events.splice(0, this.events.length)
  }
}
