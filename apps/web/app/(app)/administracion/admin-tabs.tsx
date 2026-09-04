'use client'

import type { AreaDto, ProjectDto, UserDto } from '@smlxl/contracts'
import { InlineNotice, Tabs, TabsContent, TabsList, TabsTrigger } from '@smlxl/ui'
import { useUrlState } from '@/lib/hooks/use-url-state'
import { UsersAdmin } from './users-admin'
import { CatalogsAdmin } from './catalogs-admin'
import { AuditAdmin } from './audit-admin'
import { JobsAdmin } from './jobs-admin'

export function AdminTabs({
  initialTab,
  users,
  usersError,
  areas,
  projects,
  can,
}: {
  initialTab?: string
  users: UserDto[]
  usersError: string | null
  areas: AreaDto[]
  projects: ProjectDto[]
  can: { users: boolean; catalog: boolean; audit: boolean; jobs: boolean }
}) {
  const url = useUrlState()
  const available = [
    can.users && 'usuarios',
    can.catalog && 'catalogos',
    can.audit && 'auditoria',
    can.jobs && 'jobs',
  ].filter(Boolean) as string[]
  const tab = available.includes(initialTab ?? '')
    ? (initialTab as string)
    : (available[0] ?? 'usuarios')
  if (available.length === 0)
    return <InlineNotice tone="warning">Tu rol no tiene permisos de administración.</InlineNotice>
  return (
    <Tabs value={tab} onValueChange={(v) => url.set({ tab: v })}>
      <TabsList>
        {can.users ? <TabsTrigger value="usuarios">Usuarios</TabsTrigger> : null}
        {can.catalog ? <TabsTrigger value="catalogos">Catálogos</TabsTrigger> : null}
        {can.audit ? <TabsTrigger value="auditoria">Auditoría</TabsTrigger> : null}
        {can.jobs ? <TabsTrigger value="jobs">Jobs</TabsTrigger> : null}
      </TabsList>
      {can.users ? (
        <TabsContent value="usuarios">
          {usersError ? (
            <InlineNotice tone="danger">
              No se pudieron cargar los usuarios ({usersError}).
            </InlineNotice>
          ) : (
            <UsersAdmin users={users} areas={areas} />
          )}
        </TabsContent>
      ) : null}
      {can.catalog ? (
        <TabsContent value="catalogos">
          <CatalogsAdmin areas={areas} projects={projects} />
        </TabsContent>
      ) : null}
      {can.audit ? (
        <TabsContent value="auditoria">
          <AuditAdmin users={users} active={tab === 'auditoria'} />
        </TabsContent>
      ) : null}
      {can.jobs ? (
        <TabsContent value="jobs">
          <JobsAdmin active={tab === 'jobs'} />
        </TabsContent>
      ) : null}
    </Tabs>
  )
}
