import type { DigestItem, WeeklyDigestPayload } from './payload.js'

/**
 * Render puro del correo del digest (HTML con CSS inline + texto plano), en
 * español. Exportado para previsualización (`GET /reports/weekly/:id`).
 */
export interface RenderedDigestEmail {
  subject: string
  html: string
  text: string
}

const STATUS_LABEL: Record<string, string> = {
  PROPOSED: 'Propuesta',
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En proceso',
  BLOCKED: 'Bloqueada',
  WAITING: 'En espera',
  COMPLETION_PROPOSED: 'Cierre propuesto',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
}

const PRIORITY_LABEL: Record<string, string> = { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta', URGENT: 'Urgente' }

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const styles = {
  body: 'font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;background:#f5f6f8;margin:0;padding:24px;',
  card: 'background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;max-width:840px;margin:0 auto 16px auto;',
  h1: 'font-size:20px;margin:0 0 4px 0;color:#111827;',
  h2: 'font-size:16px;margin:0 0 12px 0;color:#111827;border-bottom:2px solid #e5e7eb;padding-bottom:6px;',
  muted: 'color:#6b7280;font-size:12px;',
  table: 'width:100%;border-collapse:collapse;font-size:13px;',
  th: 'text-align:left;background:#f3f4f6;padding:6px 8px;border-bottom:1px solid #e5e7eb;',
  td: 'padding:6px 8px;border-bottom:1px solid #f3f4f6;vertical-align:top;',
  kpi: 'display:inline-block;min-width:120px;margin:0 12px 12px 0;padding:10px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;',
  kpiN: 'font-size:22px;font-weight:bold;color:#111827;display:block;',
  link: 'color:#1d4ed8;text-decoration:none;',
  warn: 'color:#b45309;',
  danger: 'color:#b91c1c;',
}

function itemRow(i: DigestItem, extraCells: string[] = []): string {
  return `<tr><td style="${styles.td}"><a style="${styles.link}" href="${escapeHtml(i.url)}">${escapeHtml(i.key)}</a></td><td style="${styles.td}">${escapeHtml(i.title)}</td><td style="${styles.td}">${escapeHtml(i.owner ?? 'Sin responsable')}</td><td style="${styles.td}">${escapeHtml(i.area ?? '-')}</td><td style="${styles.td}">${PRIORITY_LABEL[i.priority] ?? i.priority}</td><td style="${styles.td}">${STATUS_LABEL[i.status] ?? i.status}</td><td style="${styles.td}">${i.dueDate ?? '<span style="color:#b45309">SIN FECHA</span>'}</td>${extraCells.map((c) => `<td style="${styles.td}">${c}</td>`).join('')}</tr>`
}

function itemTable(items: DigestItem[], extraHeader: string[] = [], extra: (i: DigestItem) => string[] = () => []): string {
  if (items.length === 0) return `<p style="${styles.muted}">Sin elementos.</p>`
  const head = ['Clave', 'Actividad', 'Responsable', 'Área', 'Prioridad', 'Estado', 'Fecha compromiso', ...extraHeader].map((h) => `<th style="${styles.th}">${h}</th>`).join('')
  return `<table style="${styles.table}"><thead><tr>${head}</tr></thead><tbody>${items.map((i) => itemRow(i, extra(i))).join('')}</tbody></table>`
}

function itemLine(i: DigestItem, extra = ''): string {
  return `- ${i.key} | ${i.title} | ${i.owner ?? 'Sin responsable'} | ${i.area ?? '-'} | ${PRIORITY_LABEL[i.priority] ?? i.priority} | ${STATUS_LABEL[i.status] ?? i.status} | ${i.dueDate ?? 'SIN FECHA'}${extra ? ` | ${extra}` : ''} | ${i.url}`
}

function itemLines(items: DigestItem[], extra: (i: DigestItem) => string = () => ''): string {
  return items.length === 0 ? '  (sin elementos)' : items.map((i) => itemLine(i, extra(i))).join('\n')
}

export function renderDigestEmail(p: WeeklyDigestPayload): RenderedDigestEmail {
  const s = p.summary
  const subject = `Resumen semanal SMLXL — Semana ${p.weekLabel} (${p.weekStart} a ${p.weekEnd})`
  const kpi = (label: string, n: number, cls = ''): string => `<div style="${styles.kpi}"><span style="${styles.kpiN}${cls}">${n}</span><span style="${styles.muted}">${label}</span></div>`
  const narrative = p.narrative
    ? `<div style="${styles.card}"><h2 style="${styles.h2}">Narrativa ejecutiva</h2>${p.narrative.executiveNarrative.map((t) => `<p>${escapeHtml(t)}</p>`).join('')}${p.narrative.highlights.length > 0 ? `<p><strong>Destacados</strong></p><ul>${p.narrative.highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}</ul>` : ''}</div>`
    : ''
  const groups = (gs: WeeklyDigestPayload['newCommitments']['byOwner'], title: string): string =>
    gs.length === 0 ? '' : `<p><strong>${title}</strong></p>${gs.map((g) => `<p style="margin:6px 0 2px 0">${escapeHtml(g.label)} (${g.items.length})</p>${itemTable(g.items)}`).join('')}`
  const html = `<div style="${styles.body}">
<div style="${styles.card}"><h1 style="${styles.h1}">Resumen semanal de compromisos</h1><div style="${styles.muted}">Semana ${escapeHtml(p.weekLabel)} · ${p.weekStart} a ${p.weekEnd} · generado ${escapeHtml(p.generatedAt)} (${escapeHtml(p.timezone)})</div></div>
<div style="${styles.card}"><h2 style="${styles.h2}">A. Resumen ejecutivo</h2>
${kpi('Reuniones detectadas', s.meetingsDetected)}${kpi('Procesadas', s.meetingsProcessed)}${kpi('Sin artefactos', s.meetingsWithoutArtifacts, s.meetingsWithoutArtifacts > 0 ? styles.warn : '')}${kpi('Con error', s.meetingsWithError, s.meetingsWithError > 0 ? styles.danger : '')}<br/>
${kpi('Tareas nuevas', s.newActionItems)}${kpi('Cierres pendientes de aprobación', s.pendingProposals, s.pendingProposals > 0 ? styles.warn : '')}${kpi('Completadas aprobadas', s.approvedCompletions)}${kpi('Vencidas', s.overdue, s.overdue > 0 ? styles.danger : '')}${kpi('Sin fecha', s.noDueDate)}${kpi('Bloqueadas', s.blocked)}
</div>
${narrative}
<div style="${styles.card}"><h2 style="${styles.h2}">B. Nuevos compromisos de la semana (${p.newCommitments.items.length})</h2>${itemTable(p.newCommitments.items)}${groups(p.newCommitments.byOwner, 'Por responsable')}${groups(p.newCommitments.byArea, 'Por área')}${groups(p.newCommitments.byPriority, 'Por prioridad')}</div>
<div style="${styles.card}"><h2 style="${styles.h2}">C. Backlog acumulado (${p.backlog.length})</h2>${itemTable(p.backlog, ['Días abierta', 'Última mención', 'Último avance'], (i) => { const b = i as WeeklyDigestPayload['backlog'][number]; return [String(b.daysOpen), b.lastMentionedAt ?? '-', b.lastProgressAt ?? '-'] })}</div>
<div style="${styles.card}"><h2 style="${styles.h2}">D. Riesgos</h2>
<p><strong style="${styles.danger}">Vencidas (${p.risks.overdue.length})</strong></p>${itemTable(p.risks.overdue, ['Días vencida'], (i) => [String((i as WeeklyDigestPayload['risks']['overdue'][number]).daysOverdue)])}
<p><strong>Sin responsable (${p.risks.noOwner.length})</strong></p>${itemTable(p.risks.noOwner)}
<p><strong>Sin fecha (${p.risks.noDueDate.length})</strong></p>${itemTable(p.risks.noDueDate)}
<p><strong>Bloqueadas (${p.risks.blocked.length})</strong></p>${itemTable(p.risks.blocked)}
<p><strong>Repetidas sin avance (${p.risks.repeatedWithoutProgress.length})</strong></p>${itemTable(p.risks.repeatedWithoutProgress, ['Menciones'], (i) => [String((i as WeeklyDigestPayload['risks']['repeatedWithoutProgress'][number]).mentions)])}
<p><strong>Reuniones no capturadas (${p.risks.captureIssues.length})</strong></p>${p.risks.captureIssues.length === 0 ? `<p style="${styles.muted}">Sin incidencias.</p>` : `<ul>${p.risks.captureIssues.map((c) => `<li><a style="${styles.link}" href="${escapeHtml(c.url)}">${escapeHtml(c.title)}</a> (${c.startAt.slice(0, 10)}): ${escapeHtml(c.issue)}</li>`).join('')}</ul>`}
${p.narrative && p.narrative.risksNarrative.length > 0 ? `<ul>${p.narrative.risksNarrative.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>` : ''}
</div>
<div style="${styles.card}"><h2 style="${styles.h2}">E. Cambios detectados (${p.changes.length})</h2>${p.changes.length === 0 ? `<p style="${styles.muted}">Sin cambios.</p>` : `<table style="${styles.table}"><thead><tr><th style="${styles.th}">Clave</th><th style="${styles.th}">Tarea</th><th style="${styles.th}">Cambio</th><th style="${styles.th}">Detalle</th><th style="${styles.th}">Fecha</th></tr></thead><tbody>${p.changes.map((c) => `<tr><td style="${styles.td}"><a style="${styles.link}" href="${escapeHtml(c.url)}">${escapeHtml(c.key)}</a></td><td style="${styles.td}">${escapeHtml(c.title)}</td><td style="${styles.td}">${c.type}</td><td style="${styles.td}">${escapeHtml(c.detail)}</td><td style="${styles.td}">${c.at.slice(0, 10)}</td></tr>`).join('')}</tbody></table>`}</div>
<div style="${styles.card}"><h2 style="${styles.h2}">F. Bandeja de aprobación (${p.approvalInbox.length})</h2><p style="${styles.muted}">Tareas con cierre propuesto; requieren aprobación humana. Este correo no cambia estados.</p>${itemTable(p.approvalInbox, ['Propuesto por', 'Motivo'], (i) => { const a = i as WeeklyDigestPayload['approvalInbox'][number]; return [escapeHtml(a.proposedBy), escapeHtml(a.reason)] })}</div>
<div style="${styles.card}"><h2 style="${styles.h2}">G. Próxima semana</h2>
<p><strong>Vencimientos próximos (${p.nextWeek.dueSoon.length})</strong></p>${itemTable(p.nextWeek.dueSoon)}
<p><strong>Alta prioridad (${p.nextWeek.highPriority.length})</strong></p>${itemTable(p.nextWeek.highPriority)}
<p><strong>Actividades recurrentes (${p.nextWeek.recurring.length})</strong></p>${itemTable(p.nextWeek.recurring)}
</div>
<div style="${styles.muted};text-align:center">SMLXL Meeting Intelligence · generado automáticamente</div>
</div>`

  const text = [
    `RESUMEN SEMANAL DE COMPROMISOS — Semana ${p.weekLabel} (${p.weekStart} a ${p.weekEnd})`,
    '',
    'A. RESUMEN EJECUTIVO',
    `  Reuniones detectadas: ${s.meetingsDetected} | procesadas: ${s.meetingsProcessed} | sin artefactos: ${s.meetingsWithoutArtifacts} | con error: ${s.meetingsWithError}`,
    `  Tareas nuevas: ${s.newActionItems} | cierres pendientes de aprobación: ${s.pendingProposals} | completadas aprobadas: ${s.approvedCompletions}`,
    `  Vencidas: ${s.overdue} | sin fecha: ${s.noDueDate} | bloqueadas: ${s.blocked}`,
    ...(p.narrative ? ['', ...p.narrative.executiveNarrative.map((t) => `  ${t}`)] : []),
    '',
    `B. NUEVOS COMPROMISOS (${p.newCommitments.items.length})`,
    itemLines(p.newCommitments.items),
    '',
    `C. BACKLOG ACUMULADO (${p.backlog.length})`,
    itemLines(p.backlog, (i) => `${(i as WeeklyDigestPayload['backlog'][number]).daysOpen} días abierta`),
    '',
    'D. RIESGOS',
    `  Vencidas (${p.risks.overdue.length}):`,
    itemLines(p.risks.overdue, (i) => `${(i as WeeklyDigestPayload['risks']['overdue'][number]).daysOverdue} días vencida`),
    `  Sin responsable (${p.risks.noOwner.length}):`,
    itemLines(p.risks.noOwner),
    `  Sin fecha (${p.risks.noDueDate.length}):`,
    itemLines(p.risks.noDueDate),
    `  Bloqueadas (${p.risks.blocked.length}):`,
    itemLines(p.risks.blocked),
    `  Repetidas sin avance (${p.risks.repeatedWithoutProgress.length}):`,
    itemLines(p.risks.repeatedWithoutProgress),
    `  Reuniones no capturadas (${p.risks.captureIssues.length}):`,
    ...(p.risks.captureIssues.length === 0 ? ['  (sin incidencias)'] : p.risks.captureIssues.map((c) => `- ${c.title} (${c.startAt.slice(0, 10)}): ${c.issue} | ${c.url}`)),
    '',
    `E. CAMBIOS DETECTADOS (${p.changes.length})`,
    ...(p.changes.length === 0 ? ['  (sin cambios)'] : p.changes.map((c) => `- ${c.key} | ${c.title} | ${c.type} | ${c.detail} | ${c.at.slice(0, 10)} | ${c.url}`)),
    '',
    `F. BANDEJA DE APROBACIÓN (${p.approvalInbox.length})`,
    itemLines(p.approvalInbox, (i) => `propuesto por ${(i as WeeklyDigestPayload['approvalInbox'][number]).proposedBy}`),
    '',
    'G. PRÓXIMA SEMANA',
    `  Vencimientos próximos (${p.nextWeek.dueSoon.length}):`,
    itemLines(p.nextWeek.dueSoon),
    `  Alta prioridad (${p.nextWeek.highPriority.length}):`,
    itemLines(p.nextWeek.highPriority),
    `  Recurrentes (${p.nextWeek.recurring.length}):`,
    itemLines(p.nextWeek.recurring),
    '',
    'SMLXL Meeting Intelligence — generado automáticamente',
  ].join('\n')
  return { subject, html, text }
}
