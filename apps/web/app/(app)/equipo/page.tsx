import type { Metadata } from 'next'
import Link from 'next/link'
import type { AreaDto, ProjectDto, UserDto } from '@smlxl/contracts'
import { Permission } from '@smlxl/domain'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  RoleBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  UserAvatar,
} from '@smlxl/ui'
import { api, getAppSession, safe } from '@/lib/api.server'
import { hasPermission } from '@/lib/permissions'
import { PageError } from '@/components/shared/page-error'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Equipo' }

export default async function TeamPage() {
  const session = await getAppSession()
  const [users, areas, projects] = await Promise.all([
    safe(api.get<UserDto[]>('/team/users')),
    safe(api.get<AreaDto[]>('/team/areas')),
    safe(api.get<ProjectDto[]>('/team/projects')),
  ])
  const canManage =
    hasPermission(session?.permissions ?? [], Permission.USER_MANAGE) ||
    hasPermission(session?.permissions ?? [], Permission.CATALOG_MANAGE)
  const areaName = new Map((areas.ok ? areas.data : []).map((a) => [a.id, a.name]))
  const userName = new Map((users.ok ? users.data : []).map((u) => [u.id, u.displayName]))

  return (
    <>
      <PageHeader
        eyebrow="Directorio"
        title="Equipo"
        description="Usuarios, áreas y proyectos con sus alias. Sólo lectura; los cambios se hacen en Administración."
        actions={
          canManage ? (
            <Button variant="outline" asChild>
              <Link href="/administracion">Administrar</Link>
            </Button>
          ) : null
        }
      />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Usuarios</CardTitle>
            {users.ok ? (
              <span className="text-xs text-muted-foreground">
                {users.data.filter((u) => u.monitored).length} monitoreados ·{' '}
                {users.data.filter((u) => u.active).length} activos
              </span>
            ) : null}
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {!users.ok ? (
              <div className="px-5 pb-5">
                <PageError error={users.error} compact />
              </div>
            ) : users.data.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState compact title="Sin usuarios" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Nombre</TableHead>
                    <TableHead>Correo</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Área</TableHead>
                    <TableHead>Reporta a</TableHead>
                    <TableHead>Monitoreado</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.data.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <span className="inline-flex items-center gap-2 font-medium">
                          <UserAvatar name={u.displayName} size="sm" />
                          {u.displayName}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <RoleBadge role={u.role} />
                      </TableCell>
                      <TableCell className="text-sm">
                        {u.areaName ?? (u.areaId ? areaName.get(u.areaId) : null) ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {u.managerId ? (userName.get(u.managerId) ?? '—') : '—'}
                      </TableCell>
                      <TableCell>
                        {u.monitored ? (
                          <Badge tone="ai">Meet monitoreado</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">No</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {u.active ? (
                          <Badge tone="success">Activo</Badge>
                        ) : (
                          <Badge tone="neutral">Inactivo</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Áreas</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {!areas.ok ? (
                <div className="px-5 pb-5">
                  <PageError error={areas.error} compact />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Área</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...areas.data]
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.name}</TableCell>
                          <TableCell className="font-mono text-xs">{a.code ?? '—'}</TableCell>
                          <TableCell>
                            {a.isExternalCategory ? (
                              <Badge tone="warning">Categoría externa</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">Interna</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {a.active ? (
                              <Badge tone="success">Activa</Badge>
                            ) : (
                              <Badge tone="neutral">Inactiva</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Proyectos y alias</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {!projects.ok ? (
                <div className="px-5 pb-5">
                  <PageError error={projects.error} compact />
                </div>
              ) : projects.data.length === 0 ? (
                <div className="px-5 pb-5">
                  <EmptyState compact title="Sin proyectos" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Proyecto</TableHead>
                      <TableHead>Área</TableHead>
                      <TableHead>Alias</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects.data.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <span className="font-medium">{p.canonicalName}</span>
                          {p.code ? (
                            <span className="ml-1 font-mono text-xs text-muted-foreground">
                              {p.code}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm">
                          {p.areaId ? (areaName.get(p.areaId) ?? '—') : '—'}
                        </TableCell>
                        <TableCell>
                          <span className="flex flex-wrap gap-1">
                            {p.aliases.length ? (
                              p.aliases.map((a) => <Badge key={a}>{a}</Badge>)
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          {p.active ? (
                            <Badge tone="success">Activo</Badge>
                          ) : (
                            <Badge tone="neutral">Inactivo</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
