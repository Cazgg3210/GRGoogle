import type { QueryParams } from './api'

/** Claves de TanStack Query centralizadas para invalidaciones consistentes. */
export const qk = {
  session: ['session'] as const,
  dashboard: (params?: QueryParams) => ['dashboard', params ?? {}] as const,
  meetings: (params?: QueryParams) => ['meetings', params ?? {}] as const,
  meeting: (id: string) => ['meeting', id] as const,
  meetingTranscript: (id: string) => ['meeting', id, 'transcript'] as const,
  meetingActionItems: (id: string) => ['meeting', id, 'action-items'] as const,
  meetingReviewItems: (id: string) => ['meeting', id, 'review-items'] as const,
  meetingAudit: (id: string) => ['meeting', id, 'audit'] as const,
  actionItems: (params?: QueryParams) => ['action-items', params ?? {}] as const,
  actionItem: (id: string) => ['action-item', id] as const,
  aiReview: (params?: QueryParams) => ['ai-review', params ?? {}] as const,
  digests: ['digests'] as const,
  digest: (id: string) => ['digest', id] as const,
  digestConfig: ['digest-config'] as const,
  users: ['team', 'users'] as const,
  areas: ['team', 'areas'] as const,
  projects: ['team', 'projects'] as const,
  googleStatus: ['integrations', 'google'] as const,
  settings: ['admin', 'settings'] as const,
  audit: (params?: QueryParams) => ['admin', 'audit', params ?? {}] as const,
  jobs: ['admin', 'jobs'] as const,
  notifications: ['notifications'] as const,
}
