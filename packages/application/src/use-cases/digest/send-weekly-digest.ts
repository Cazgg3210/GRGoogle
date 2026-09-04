import { JobNames } from '@smlxl/config'
import type { WeeklyDigestConfigDto, WeeklyDigestDto } from '@smlxl/contracts'
import { DomainError, DomainErrorCode, Permission, hasPermission, isoWeekOf, nextDigestRunAt, toLocalDateString, type Principal, type WeeklyDigest, type WeeklyDigestConfig } from '@smlxl/domain'
import type { AppContext } from '../../context.js'
import { audit } from '../../shared.js'
import type { WeeklyDigestPayload } from './payload.js'
import { renderDigestEmail } from './render-digest-email.js'

/** Envía el digest a `config.recipientUserIds` con idempotencia `digest:${id}:v${version}`. */
export async function sendWeeklyDigest(ctx: AppContext, principal: Principal | null, digestId: string): Promise<WeeklyDigest> {
  if (principal && !hasPermission(principal, Permission.DIGEST_SEND)) throw DomainError.forbidden('No tienes permiso para enviar el resumen semanal')
  const settings = await ctx.getSettings()
  if (!settings.featureFlags.WEEKLY_DIGEST_ENABLED) throw DomainError.featureDisabled('WEEKLY_DIGEST_ENABLED')
  const config = await ctx.repos.digests.getConfig()
  if (!config.sendEmail) throw DomainError.featureDisabled('WeeklyDigestConfig.sendEmail')
  const digest = await ctx.repos.digests.findById(digestId)
  if (!digest) throw DomainError.notFound('WeeklyDigest', digestId)
  const recipients: string[] = []
  for (const id of config.recipientUserIds) {
    const u = await ctx.repos.users.findById(id)
    if (u && u.active) recipients.push(u.email)
  }
  if (recipients.length === 0) throw new DomainError(DomainErrorCode.VALIDATION_ERROR, 'El resumen semanal no tiene destinatarios configurados')
  const email = renderDigestEmail(digest.payload as WeeklyDigestPayload)
  const idempotencyKey = `digest:${digest.id}:v${digest.version}`
  const res = await ctx.mail.send({ to: recipients, subject: email.subject, html: email.html, text: email.text, idempotencyKey })
  const now = ctx.clock.now()
  const saved = await ctx.uow.run(async (repos) => {
    const s = await repos.digests.save({ ...digest, sentAt: res.skipped ? (digest.sentAt ?? now) : now, recipientEmails: recipients })
    await audit(repos, ctx, { actorType: principal ? 'USER' : 'SYSTEM', actorUserId: principal?.id ?? null, action: res.skipped ? 'digest.send_skipped' : 'digest.sent', entity: 'WeeklyDigest', entityId: digest.id, after: { recipients, messageId: res.messageId } })
    return s
  })
  if (!res.skipped) await ctx.events.publish({ type: 'WeeklyDigestSent', digestId: digest.id, recipients, occurredAt: now })
  return saved
}

/** Cron y próxima ejecución a partir de la configuración (§18.2). */
export function digestCronOf(config: Pick<WeeklyDigestConfig, 'dayOfWeek' | 'localTime'>): string {
  const [hh, mm] = config.localTime.split(':')
  return `${Number(mm ?? '0')} ${Number(hh ?? '18')} * * ${config.dayOfWeek}`
}

export async function scheduleWeeklyDigest(ctx: AppContext, options: { register?: boolean } = {}): Promise<{ enabled: boolean; cron: string; timezone: string; nextRunAt: Date | null }> {
  const config = await ctx.repos.digests.getConfig()
  const cron = digestCronOf(config)
  const nextRunAt = config.enabled ? nextDigestRunAt({ dayOfWeek: config.dayOfWeek, localTime: config.localTime, timezone: config.timezone }, ctx.clock.now()) : null
  if (options.register ?? true) {
    if (config.enabled) await ctx.queue.schedule(JobNames.GENERATE_WEEKLY_DIGEST, cron, { sendAfterGenerate: true }, { timezone: config.timezone })
  }
  return { enabled: config.enabled, cron, timezone: config.timezone, nextRunAt }
}

export function toDigestConfigDto(config: WeeklyDigestConfig, now: Date): WeeklyDigestConfigDto {
  return {
    enabled: config.enabled,
    timezone: config.timezone,
    dayOfWeek: config.dayOfWeek,
    localTime: config.localTime,
    recipientUserIds: config.recipientUserIds,
    includeAreaIds: config.includeAreaIds,
    includeExternalTasks: config.includeExternalTasks,
    attachSpreadsheet: config.attachSpreadsheet,
    sendEmail: config.sendEmail,
    nextRunAt: config.enabled ? nextDigestRunAt({ dayOfWeek: config.dayOfWeek, localTime: config.localTime, timezone: config.timezone }, now).toISOString() : null,
  }
}

export function toDigestDto(d: WeeklyDigest, timezone: string, withPreview: boolean): WeeklyDigestDto {
  const payload = d.payload as WeeklyDigestPayload
  return {
    id: d.id,
    weekLabel: payload?.weekLabel ?? isoWeekOf(d.weekStart, timezone).label,
    weekStart: toLocalDateString(d.weekStart, timezone),
    weekEnd: toLocalDateString(d.weekEnd, timezone),
    generatedAt: d.generatedAt.toISOString(),
    audience: d.audience,
    sentAt: d.sentAt?.toISOString() ?? null,
    version: d.version,
    recipientEmails: d.recipientEmails,
    payload: d.payload,
    emailPreviewHtml: withPreview && payload ? renderDigestEmail(payload).html : null,
  }
}

export async function listDigests(ctx: AppContext, principal: Principal, limit = 12): Promise<WeeklyDigestDto[]> {
  if (!hasPermission(principal, Permission.REPORT_GLOBAL) && !hasPermission(principal, Permission.REPORT_AREA)) throw DomainError.forbidden('No tienes permiso para ver reportes')
  const settings = await ctx.getSettings()
  return (await ctx.repos.digests.list(limit)).map((d) => toDigestDto(d, settings.companyTimezone, false))
}

export async function getDigest(ctx: AppContext, principal: Principal, id: string): Promise<WeeklyDigestDto> {
  if (!hasPermission(principal, Permission.REPORT_GLOBAL)) throw DomainError.forbidden('No tienes permiso para ver reportes')
  const settings = await ctx.getSettings()
  const d = await ctx.repos.digests.findById(id)
  if (!d) throw DomainError.notFound('WeeklyDigest', id)
  return toDigestDto(d, settings.companyTimezone, true)
}

export async function getDigestConfig(ctx: AppContext, principal: Principal): Promise<WeeklyDigestConfigDto> {
  if (!hasPermission(principal, Permission.CONFIG_MANAGE) && !hasPermission(principal, Permission.DIGEST_GENERATE)) throw DomainError.forbidden('No tienes permiso para ver la configuración del resumen')
  return toDigestConfigDto(await ctx.repos.digests.getConfig(), ctx.clock.now())
}

export async function updateDigestConfig(ctx: AppContext, principal: Principal, patch: Partial<Omit<WeeklyDigestConfigDto, 'nextRunAt'>>): Promise<WeeklyDigestConfigDto> {
  if (!hasPermission(principal, Permission.CONFIG_MANAGE)) throw DomainError.forbidden('No tienes permiso para configurar el resumen semanal')
  const current = await ctx.repos.digests.getConfig()
  const now = ctx.clock.now()
  const next: WeeklyDigestConfig = {
    ...current,
    enabled: patch.enabled ?? current.enabled,
    timezone: patch.timezone ?? current.timezone,
    dayOfWeek: patch.dayOfWeek ?? current.dayOfWeek,
    localTime: patch.localTime ?? current.localTime,
    recipientUserIds: patch.recipientUserIds ?? current.recipientUserIds,
    includeAreaIds: patch.includeAreaIds === undefined ? current.includeAreaIds : patch.includeAreaIds,
    includeExternalTasks: patch.includeExternalTasks ?? current.includeExternalTasks,
    attachSpreadsheet: patch.attachSpreadsheet ?? current.attachSpreadsheet,
    sendEmail: patch.sendEmail ?? current.sendEmail,
    updatedByUserId: principal.id,
    updatedAt: now,
  }
  const saved = await ctx.uow.run(async (repos) => {
    const s = await repos.digests.saveConfig(next)
    await audit(repos, ctx, { actorType: 'USER', actorUserId: principal.id, action: 'digest.config_updated', entity: 'WeeklyDigestConfig', entityId: s.id, before: current, after: s })
    return s
  })
  await scheduleWeeklyDigest(ctx, { register: true })
  return toDigestConfigDto(saved, now)
}
