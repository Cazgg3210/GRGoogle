'use client'

import * as React from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { AuditEntryDto } from '@smlxl/contracts'
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn, formatDateTime } from '@smlxl/ui'
import { JsonDiff } from './json-diff'

const ACTOR_TONE: Record<string, 'info' | 'ai' | 'neutral'> = { USER: 'info', AI: 'ai', SYSTEM: 'neutral' }

export function AuditTable({ entries }: { entries: AuditEntryDto[] }) {
  const [open, setOpen] = React.useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  return (
    <div className="rounded-lg border border-border bg-surface shadow-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-8" />
            <TableHead>Fecha</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Acción</TableHead>
            <TableHead>Entidad</TableHead>
            <TableHead>Origen</TableHead>
            <TableHead>Correlación</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((e) => {
            const expanded = open.has(e.id)
            const hasDiff = e.before !== null || e.after !== null
            return (
              <React.Fragment key={e.id}>
                <TableRow className={cn(hasDiff && 'cursor-pointer')} onClick={hasDiff ? () => toggle(e.id) : undefined}>
                  <TableCell className="text-muted-foreground">
                    {hasDiff ? expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" /> : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs">{formatDateTime(e.timestamp)}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <Badge tone={ACTOR_TONE[e.actorType] ?? 'neutral'}>{e.actorType}</Badge>
                      {e.actorName ?? (e.actorType === 'USER' ? e.actorUserId : '')}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{e.action}</TableCell>
                  <TableCell className="text-xs">
                    {e.entity} <span className="font-mono text-muted-foreground">{e.entityId.slice(0, 8)}</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{e.source}</TableCell>
                  <TableCell className="font-mono text-[11px] text-muted-foreground">{e.correlationId ?? '—'}</TableCell>
                </TableRow>
                {expanded ? (
                  <TableRow className="bg-surface-muted/40 hover:bg-surface-muted/40">
                    <TableCell colSpan={7} className="p-3">
                      <JsonDiff before={e.before} after={e.after} />
                    </TableCell>
                  </TableRow>
                ) : null}
              </React.Fragment>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
