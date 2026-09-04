import type { Env } from '@smlxl/config'
import type {
  CalendarPort,
  DirectoryPort,
  DrivePort,
  MailPort,
  MeetingCapturePort,
  SheetsPort,
  WorkspaceEventsPort,
} from '@smlxl/domain'
import { DomainError, DomainErrorCode } from '@smlxl/domain'
import { ImpersonatedAuthFactory, loadServiceAccountCredentials } from './auth/dwd.js'
import type { GoogleRetryOptions } from './http/retry.js'
import { GoogleCalendarAdapter } from './adapters/calendar.js'
import { GoogleDirectoryAdapter } from './adapters/directory.js'
import { GoogleDriveAdapter } from './adapters/drive.js'
import { GmailAdapter, InMemoryNotificationLog, type NotificationLog } from './adapters/gmail.js'
import { GoogleMeetAdapter } from './adapters/meet.js'
import { GoogleSheetsAdapter } from './adapters/sheets.js'
import { GoogleWorkspaceEventsAdapter } from './adapters/workspace-events.js'
import { FakeCalendarAdapter } from './fake/calendar.js'
import { FakeDirectoryAdapter } from './fake/directory.js'
import { FakeDriveAdapter } from './fake/drive.js'
import { FakeMailAdapter } from './fake/mail.js'
import { FakeMeetAdapter } from './fake/meet.js'
import { FakeSheetsAdapter } from './fake/sheets.js'
import { FakeWorkspaceEventsAdapter } from './fake/workspace-events.js'
import type { FakeGoogleFixtures, NowFn } from './fake/fixtures.js'

export interface GoogleAdapters {
  meet: MeetingCapturePort
  calendar: CalendarPort
  workspaceEvents: WorkspaceEventsPort
  directory: DirectoryPort
  drive: DrivePort
  mail: MailPort
  sheets: SheetsPort
}

export interface FakeGoogleAdapters extends GoogleAdapters {
  meet: FakeMeetAdapter
  calendar: FakeCalendarAdapter
  workspaceEvents: FakeWorkspaceEventsAdapter
  directory: FakeDirectoryAdapter
  drive: FakeDriveAdapter
  mail: FakeMailAdapter
  sheets: FakeSheetsAdapter
}

export interface CreateGoogleAdaptersDeps {
  /** Emails monitoreados (Directory fake / impersonación). */
  monitoredUserEmails?: string[]
  /** Registro de idempotencia de correos (REAL). Por defecto en memoria. */
  notificationLog?: NotificationLog
  /** Cuenta admin para Directory (REAL). Por defecto GMAIL_SENDER_EMAIL. */
  adminEmail?: string
  retry?: GoogleRetryOptions
  /** Sólo FAKE. */
  fixtures?: FakeGoogleFixtures
  now?: NowFn
  fakeMailOutDir?: string | null
}

export function createFakeGoogleAdapters(env: Pick<Env, 'GOOGLE_WORKSPACE_DOMAIN'>, deps: CreateGoogleAdaptersDeps = {}): FakeGoogleAdapters {
  const now = deps.now ?? (() => new Date())
  const meet = new FakeMeetAdapter({ fixtures: deps.fixtures, now, companyDomain: env.GOOGLE_WORKSPACE_DOMAIN })
  // Calendar y Drive comparten la misma instancia de fixtures que Meet para coherencia.
  const calendar = new FakeCalendarAdapter({ fixtures: meet.fixtures, now })
  const drive = new FakeDriveAdapter(meet.fixtures)
  const directory = new FakeDirectoryAdapter(deps.monitoredUserEmails ?? [])
  return {
    meet,
    calendar,
    workspaceEvents: new FakeWorkspaceEventsAdapter(now),
    directory,
    drive,
    mail: new FakeMailAdapter({ outDir: deps.fakeMailOutDir ?? null, now }),
    sheets: new FakeSheetsAdapter(),
  }
}

export function createRealGoogleAdapters(env: Env, deps: CreateGoogleAdaptersDeps = {}): GoogleAdapters {
  const credentials = loadServiceAccountCredentials(env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS)
  if (!credentials) {
    throw new DomainError(DomainErrorCode.VALIDATION_ERROR, 'GOOGLE_SERVICE_ACCOUNT_CREDENTIALS es obligatorio en modo REAL')
  }
  const auth = new ImpersonatedAuthFactory({ credentials, allowedDomain: env.GOOGLE_WORKSPACE_DOMAIN })
  const retry = deps.retry
  const adminEmail = deps.adminEmail || env.GMAIL_SENDER_EMAIL
  const directory = new GoogleDirectoryAdapter({ auth, retry, adminEmail })
  const meet = new GoogleMeetAdapter({ auth, retry, resolveUserEmail: (id) => directory.getUserEmailById(id) })
  return {
    meet,
    calendar: new GoogleCalendarAdapter({ auth, retry }),
    workspaceEvents: new GoogleWorkspaceEventsAdapter({ auth, retry }),
    directory,
    drive: new GoogleDriveAdapter({ auth, retry }),
    mail: new GmailAdapter({
      auth,
      retry,
      senderEmail: env.GMAIL_SENDER_EMAIL,
      notificationLog: deps.notificationLog ?? new InMemoryNotificationLog(),
    }),
    sheets: new GoogleSheetsAdapter({ auth, retry, actingUserEmail: env.GMAIL_SENDER_EMAIL || adminEmail }),
  }
}

/** Fábrica principal: `mode` proviene de `googleMode(env)` (§51). */
export function createGoogleAdapters(env: Env, mode: 'FAKE' | 'REAL', deps: CreateGoogleAdaptersDeps = {}): GoogleAdapters {
  return mode === 'REAL' ? createRealGoogleAdapters(env, deps) : createFakeGoogleAdapters(env, deps)
}
