import type { Metadata } from 'next'
import type { AreaDto, ProjectDto, UserDto } from '@smlxl/contracts'
import { Permission } from '@smlxl/domain'
import { PageHeader } from '@smlxl/ui'
import { api, getAppSession, safe } from '@/lib/api.server'
import { hasPermission } from '@/lib/permissions'
import { first, type SearchParams } from '@/lib/search-params'
import { AdminTabs } from './admin-tabs'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Administración' }

export default async function AdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const session = await getAppSession()
  const perms = session?.permissions ?? []
  const canUsers = hasPermission(perms, Permission.USER_MANAGE)
  const canCatalog = hasPermission(perms, Permission.CATALOG_MANAGE)
  const canAudit = hasPermission(perms, Permission.AUDIT_READ)
  const canJobs = hasPermission(perms, Permission.INTEGRATION_MANAGE)
  const [users, areas, projects] = await Promise.all([
    canUsers ? safe(api.get<UserDto[]>('/admin/users')) : safe(api.get<UserDto[]>('/team/users')),
    safe(api.get<AreaDto[]>('/team/areas')),
    safe(api.get<ProjectDto[]>('/team/projects')),
  ])
  return (
    <>
      <PageHeader eyebrow="Gobierno" title="Administración" description="Usuarios y roles, catálogos (áreas, proyectos y alias), auditoría de mutaciones y estado de la cola de trabajos." />
      <AdminTabs
        initialTab={first(sp, 'tab')}
        users={users.ok ? users.data : []}
        usersError={users.ok ? null : users.error.code}
        areas={areas.ok ? areas.data : []}
        projects={projects.ok ? projects.data : []}
        can={{ users: canUsers, catalog: canCatalog, audit: canAudit, jobs: canJobs }}
      />
    </>
  )
}
