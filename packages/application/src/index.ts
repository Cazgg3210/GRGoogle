import type { AppContext } from './context.js'
import {
  discoverMeetingsFromCalendar,
  ensureAutoCapture,
} from './use-cases/google/discover-meetings-from-calendar.js'
import { ensureWorkspaceSubscriptions } from './use-cases/google/ensure-workspace-subscriptions.js'
import { processInboundGoogleEvent } from './use-cases/google/process-inbound-google-event.js'
import { fetchMeetingArtifacts } from './use-cases/meetings/fetch-meeting-artifacts.js'
import { analyzeMeeting } from './use-cases/meetings/analyze-meeting.js'
import { reprocessMeeting } from './use-cases/meetings/reprocess-meeting.js'
import { reconcileMissingEvents } from './use-cases/meetings/reconcile-missing-events.js'
import { cleanupExpiredRawData } from './use-cases/meetings/cleanup-expired-raw-data.js'
import { simulateMeetingEnded } from './use-cases/meetings/simulate-meeting-ended.js'
import { createManualMeeting, updateMeeting } from './use-cases/meetings/meeting-commands.js'
import {
  approveAiReview,
  mergeAiReview,
  rejectAiReview,
} from './use-cases/review/resolve-ai-review.js'
import {
  addComment,
  approveCompletion,
  changeActionItemStatus,
  createActionItem,
  notifyNewAssignment,
  proposeCompletion,
  rejectCompletion,
  reopenActionItem,
  sendNewAssignmentEmail,
  updateActionItem,
} from './use-cases/action-items/commands.js'
import { generateWeeklyDigest } from './use-cases/digest/generate-weekly-digest.js'
import {
  getDigest,
  getDigestConfig,
  listDigests,
  scheduleWeeklyDigest,
  sendWeeklyDigest,
  updateDigestConfig,
} from './use-cases/digest/send-weekly-digest.js'
import { sendReminders } from './use-cases/notifications/send-reminders.js'
import { syncTasksToGoogleSheets } from './use-cases/sheets/sync-tasks-to-google-sheets.js'
import {
  getPlatformSettings,
  updatePlatformSettings,
  updateUser,
  upsertArea,
  upsertProject,
} from './use-cases/admin/commands.js'
import {
  getActionItemDetail,
  getActionItemDto,
  listActionItems,
  listActionItemsByMeeting,
} from './queries/action-items.js'
import { getMeetingDetail, getMeetingTranscript, listMeetings } from './queries/meetings.js'
import { getDashboard } from './queries/dashboard.js'
import { searchKnowledge } from './queries/search.js'
import {
  getAiReviewItem,
  getGoogleStatus,
  getNotificationCounts,
  getSession,
  listAiReviewItems,
  listAreas,
  listAuditEntries,
  listExternalAssignees,
  listMeetingAudit,
  listProjects,
  listReviewItemsByMeeting,
  listUsers,
} from './queries/misc.js'
import { retryFailedMeetings } from './use-cases/meetings/reprocess-meeting.js'

export * from './context.js'
export * from './shared.js'
export * from './use-cases/google/discover-meetings-from-calendar.js'
export * from './use-cases/google/ensure-workspace-subscriptions.js'
export * from './use-cases/google/process-inbound-google-event.js'
export * from './use-cases/meetings/fetch-meeting-artifacts.js'
export * from './use-cases/meetings/analyze-meeting.js'
export * from './use-cases/meetings/reconcile-action-items.js'
export * from './use-cases/meetings/reprocess-meeting.js'
export * from './use-cases/meetings/reconcile-missing-events.js'
export * from './use-cases/meetings/cleanup-expired-raw-data.js'
export * from './use-cases/meetings/simulate-meeting-ended.js'
export * from './use-cases/meetings/meeting-commands.js'
export * from './use-cases/review/resolve-ai-review.js'
export * from './use-cases/action-items/commands.js'
export * from './use-cases/digest/payload.js'
export * from './use-cases/digest/render-digest-email.js'
export * from './use-cases/digest/generate-weekly-digest.js'
export * from './use-cases/digest/send-weekly-digest.js'
export * from './use-cases/notifications/send-reminders.js'
export * from './use-cases/sheets/sync-tasks-to-google-sheets.js'
export * from './use-cases/admin/commands.js'
export * from './queries/mappers.js'
export * from './queries/action-items.js'
export * from './queries/meetings.js'
export * from './queries/dashboard.js'
export * from './queries/search.js'
export * from './queries/misc.js'

type Bound<F> = F extends (ctx: AppContext, ...args: infer A) => infer R ? (...args: A) => R : never

function bind<F extends (ctx: AppContext, ...args: never[]) => unknown>(
  ctx: AppContext,
  fn: F,
): Bound<F> {
  return ((...args: unknown[]) =>
    (fn as unknown as (...a: unknown[]) => unknown)(ctx, ...args)) as Bound<F>
}

/**
 * Composición única para API/worker (§8.2): todos los casos de uso y consultas
 * enlazados al `AppContext`. Los handlers de jobs usan `JobPayloads`.
 */
export function createApplication(ctx: AppContext) {
  return {
    ctx,
    google: {
      discoverMeetingsFromCalendar: bind(ctx, discoverMeetingsFromCalendar),
      ensureAutoCapture: bind(ctx, ensureAutoCapture),
      ensureWorkspaceSubscriptions: bind(ctx, ensureWorkspaceSubscriptions),
      processInboundGoogleEvent: bind(ctx, processInboundGoogleEvent),
      reconcileMissingEvents: bind(ctx, reconcileMissingEvents),
      getGoogleStatus: bind(ctx, getGoogleStatus),
      simulateMeetingEnded: bind(ctx, simulateMeetingEnded),
    },
    meetings: {
      fetchMeetingArtifacts: bind(ctx, fetchMeetingArtifacts),
      analyzeMeeting: bind(ctx, analyzeMeeting),
      reprocessMeeting: bind(ctx, reprocessMeeting),
      retryFailedMeetings: bind(ctx, retryFailedMeetings),
      cleanupExpiredRawData: bind(ctx, cleanupExpiredRawData),
      createManualMeeting: bind(ctx, createManualMeeting),
      updateMeeting: bind(ctx, updateMeeting),
      listMeetings: bind(ctx, listMeetings),
      getMeetingDetail: bind(ctx, getMeetingDetail),
      getMeetingTranscript: bind(ctx, getMeetingTranscript),
      listActionItemsByMeeting: bind(ctx, listActionItemsByMeeting),
      listReviewItemsByMeeting: bind(ctx, listReviewItemsByMeeting),
      listMeetingAudit: bind(ctx, listMeetingAudit),
    },
    actionItems: {
      create: bind(ctx, createActionItem),
      update: bind(ctx, updateActionItem),
      changeStatus: bind(ctx, changeActionItemStatus),
      proposeCompletion: bind(ctx, proposeCompletion),
      approveCompletion: bind(ctx, approveCompletion),
      rejectCompletion: bind(ctx, rejectCompletion),
      reopen: bind(ctx, reopenActionItem),
      addComment: bind(ctx, addComment),
      notifyNewAssignment: bind(ctx, notifyNewAssignment),
      sendNewAssignmentEmail: bind(ctx, sendNewAssignmentEmail),
      list: bind(ctx, listActionItems),
      get: bind(ctx, getActionItemDto),
      getDetail: bind(ctx, getActionItemDetail),
    },
    aiReview: {
      list: bind(ctx, listAiReviewItems),
      get: bind(ctx, getAiReviewItem),
      approve: bind(ctx, approveAiReview),
      reject: bind(ctx, rejectAiReview),
      merge: bind(ctx, mergeAiReview),
    },
    reports: {
      getDashboard: bind(ctx, getDashboard),
      searchKnowledge: bind(ctx, searchKnowledge),
      generateWeeklyDigest: bind(ctx, generateWeeklyDigest),
      sendWeeklyDigest: bind(ctx, sendWeeklyDigest),
      scheduleWeeklyDigest: bind(ctx, scheduleWeeklyDigest),
      listDigests: bind(ctx, listDigests),
      getDigest: bind(ctx, getDigest),
      getDigestConfig: bind(ctx, getDigestConfig),
      updateDigestConfig: bind(ctx, updateDigestConfig),
    },
    notifications: {
      sendReminders: bind(ctx, sendReminders),
      getCounts: bind(ctx, getNotificationCounts),
    },
    sheets: { syncTasksToGoogleSheets: bind(ctx, syncTasksToGoogleSheets) },
    session: { get: bind(ctx, getSession) },
    admin: {
      listUsers: bind(ctx, listUsers),
      listAreas: bind(ctx, listAreas),
      listProjects: bind(ctx, listProjects),
      listExternalAssignees: bind(ctx, listExternalAssignees),
      updateUser: bind(ctx, updateUser),
      upsertArea: bind(ctx, upsertArea),
      upsertProject: bind(ctx, upsertProject),
      getPlatformSettings: bind(ctx, getPlatformSettings),
      updatePlatformSettings: bind(ctx, updatePlatformSettings),
      listAuditEntries: bind(ctx, listAuditEntries),
    },
  }
}

export type Application = ReturnType<typeof createApplication>
