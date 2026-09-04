import {
  OPEN_ACTION_ITEM_STATUSES,
  ActionItemStatus,
  daysUntilDue,
  isOverdue,
  toLocalDateString,
  type ActionItem,
  type User,
} from '@smlxl/domain'
import type { AppContext } from '../../context.js'
import { escapeHtml } from '../digest/render-digest-email.js'

/**
 * Recordatorios (§17): por usuario, un solo correo al día que agrupa
 * "vence pronto" (según su preferencia `dueSoonDays`) y "vencidas".
 * Idempotencia: `reminder:${userId}:${localDate}`.
 */
export interface SendRemindersResult {
  users: number
  emailsSent: number
  emailsSkipped: number
  dueSoon: number
  overdue: number
  disabled: boolean
}

export function renderReminderEmail(
  user: User,
  dueSoon: ActionItem[],
  overdue: ActionItem[],
  appUrl: string,
  tz: string,
): { subject: string; html: string; text: string } {
  const subject =
    overdue.length > 0
      ? `Tienes ${overdue.length} tarea(s) vencida(s) y ${dueSoon.length} por vencer`
      : `Tienes ${dueSoon.length} tarea(s) por vencer`
  const row = (i: ActionItem): string =>
    `<li><a href="${appUrl}/pendientes/${i.id}">${escapeHtml(i.externalKey)}</a> — ${escapeHtml(i.title)} (${i.dueDate ? toLocalDateString(i.dueDate, tz) : 'sin fecha'})</li>`
  const line = (i: ActionItem): string =>
    `- ${i.externalKey} — ${i.title} (${i.dueDate ? toLocalDateString(i.dueDate, tz) : 'sin fecha'}) ${appUrl}/pendientes/${i.id}`
  const html = `<p>Hola ${escapeHtml(user.displayName)},</p>${overdue.length > 0 ? `<p><strong>Tareas vencidas (${overdue.length})</strong></p><ul>${overdue.map(row).join('')}</ul>` : ''}${dueSoon.length > 0 ? `<p><strong>Por vencer (${dueSoon.length})</strong></p><ul>${dueSoon.map(row).join('')}</ul>` : ''}<p><a href="${appUrl}/pendientes?view=mine">Ver mis pendientes</a></p>`
  const text = [
    `Hola ${user.displayName},`,
    '',
    ...(overdue.length > 0
      ? [`Tareas vencidas (${overdue.length}):`, ...overdue.map(line), '']
      : []),
    ...(dueSoon.length > 0 ? [`Por vencer (${dueSoon.length}):`, ...dueSoon.map(line), ''] : []),
    `Ver mis pendientes: ${appUrl}/pendientes?view=mine`,
  ].join('\n')
  return { subject, html, text }
}

export async function sendReminders(
  ctx: AppContext,
  options: { userId?: string } = {},
): Promise<SendRemindersResult> {
  const settings = await ctx.getSettings()
  const result: SendRemindersResult = {
    users: 0,
    emailsSent: 0,
    emailsSkipped: 0,
    dueSoon: 0,
    overdue: 0,
    disabled: false,
  }
  if (!settings.featureFlags.GMAIL_NOTIFICATIONS_ENABLED) {
    result.disabled = true
    ctx.logger.info('GMAIL_NOTIFICATIONS_ENABLED desactivado; no se envían recordatorios')
    return result
  }
  const tz = settings.companyTimezone
  const now = ctx.clock.now()
  const localDate = toLocalDateString(now, tz)
  let users = await ctx.repos.users.list({ active: true })
  if (options.userId) users = users.filter((u) => u.id === options.userId)
  for (const user of users) {
    const prefs = user.notificationPreferences
    if (!prefs.dueSoon && !prefs.overdue) continue
    const items = await ctx.repos.actionItems.listAll({
      ownerUserId: user.id,
      status: OPEN_ACTION_ITEM_STATUSES.filter((s) => s !== ActionItemStatus.PROPOSED),
    })
    const overdue = prefs.overdue
      ? items.filter((i) => isOverdue({ dueDate: i.dueDate, status: i.status }, now, tz))
      : []
    const dueSoon = prefs.dueSoon
      ? items.filter(
          (i) =>
            i.dueDate &&
            !isOverdue({ dueDate: i.dueDate, status: i.status }, now, tz) &&
            daysUntilDue(i.dueDate, now, tz) <= Math.max(0, prefs.dueSoonDays),
        )
      : []
    if (overdue.length === 0 && dueSoon.length === 0) continue
    result.users += 1
    result.dueSoon += dueSoon.length
    result.overdue += overdue.length
    const email = renderReminderEmail(user, dueSoon, overdue, ctx.env.APP_URL, tz)
    const res = await ctx.mail.send({
      to: [user.email],
      subject: email.subject,
      html: email.html,
      text: email.text,
      idempotencyKey: `reminder:${user.id}:${localDate}`,
    })
    if (res.skipped) result.emailsSkipped += 1
    else result.emailsSent += 1
  }
  return result
}
