import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarDays, ClipboardList, Gavel, Search } from 'lucide-react'
import type { SearchResultDto } from '@smlxl/contracts'
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader, StatusBadge, formatDateTime } from '@smlxl/ui'
import { api, safe } from '@/lib/api.server'
import { first, type SearchParams } from '@/lib/search-params'
import { PageError } from '@/components/shared/page-error'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Búsqueda' }

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const q = (first(sp, 'q') ?? '').trim()
  if (q.length < 2) {
    return (
      <>
        <PageHeader eyebrow="Búsqueda corporativa" title="Buscar" description="Reuniones, pendientes y decisiones. Fase 1: búsqueda estructurada; las respuestas siempre citan las reuniones fuente." />
        <EmptyState icon={Search} title="Escribe al menos dos caracteres" description="Prueba: “qué quedó pendiente con el contrato Alfa”, “pendientes de Andrés”, “cliente Beta”." />
      </>
    )
  }
  const result = await safe(api.get<SearchResultDto>('/search', { query: { q, limit: 30 } }))
  return (
    <>
      <PageHeader eyebrow="Búsqueda corporativa" title={<>Resultados para “{q}”</>} description="Cada resultado indica su reunión fuente. La búsqueda semántica (RAG) llegará en fase 2." />
      {!result.ok ? (
        <PageError error={result.error} retryHref={`/buscar?q=${encodeURIComponent(q)}`} />
      ) : (
        <SearchResults data={result.data} />
      )}
    </>
  )
}

function SearchResults({ data }: { data: SearchResultDto }) {
  const total = data.meetings.length + data.actionItems.length + data.decisions.length
  if (total === 0) {
    return <EmptyState icon={Search} title="Sin resultados" description="Intenta con otras palabras clave o el nombre de una persona/proyecto." />
  }
  const sourceMeetings = new Map(data.meetings.map((m) => [m.id, m]))
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-muted-foreground">
        {total} resultados · reuniones fuente:{' '}
        {data.sourceMeetingIds.length === 0
          ? 'ninguna'
          : data.sourceMeetingIds.map((id, i) => (
              <span key={id}>
                {i > 0 ? ', ' : ''}
                <Link href={`/reuniones/${id}`} className="text-info-700 hover:underline">
                  {sourceMeetings.get(id)?.title ?? id.slice(0, 8)}
                </Link>
              </span>
            ))}
      </p>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="inline-flex items-center gap-2">
              <CalendarDays className="size-4 text-muted-foreground" />
              Reuniones <Badge>{data.meetings.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {data.meetings.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted-foreground">Sin reuniones.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.meetings.map((m) => (
                  <li key={m.id} className="px-5 py-3">
                    <Link href={`/reuniones/${m.id}`} className="font-medium hover:underline">
                      {m.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">{formatDateTime(m.startAt)}</p>
                    {m.snippet ? <p className="mt-1 line-clamp-3 text-sm text-foreground/80">{m.snippet}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="inline-flex items-center gap-2">
              <ClipboardList className="size-4 text-muted-foreground" />
              Pendientes <Badge>{data.actionItems.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {data.actionItems.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted-foreground">Sin pendientes.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.actionItems.map((a) => (
                  <li key={a.id} className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Link href={`/pendientes/${a.id}`} className="font-mono text-xs text-info-700 hover:underline">
                        {a.externalKey}
                      </Link>
                      <StatusBadge status={a.status} />
                    </div>
                    <Link href={`/pendientes/${a.id}`} className="mt-0.5 block font-medium hover:underline">
                      {a.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">{a.ownerName ?? 'Sin responsable'}</p>
                    {a.snippet ? <p className="mt-1 line-clamp-3 text-sm text-foreground/80">{a.snippet}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="inline-flex items-center gap-2">
              <Gavel className="size-4 text-muted-foreground" />
              Decisiones <Badge>{data.decisions.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {data.decisions.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted-foreground">Sin decisiones.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.decisions.map((d) => (
                  <li key={d.id} className="px-5 py-3">
                    <p className="text-sm">{d.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Fuente:{' '}
                      <Link href={`/reuniones/${d.meetingId}?tab=decisiones`} className="text-info-700 hover:underline">
                        {d.meetingTitle}
                      </Link>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
