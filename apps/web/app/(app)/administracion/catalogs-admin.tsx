'use client'

import * as React from 'react'
import { Pencil, Plus } from 'lucide-react'
import type { AreaDto, ProjectDto } from '@smlxl/contracts'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@smlxl/ui'
import { clientApi } from '@/lib/api.client'
import { qk } from '@/lib/query-keys'
import { useApiMutation } from '@/lib/use-api-mutation'

const NONE = '__none__'

export function CatalogsAdmin({ areas, projects }: { areas: AreaDto[]; projects: ProjectDto[] }) {
  const [areaDialog, setAreaDialog] = React.useState<null | { area: AreaDto | null }>(null)
  const [projectDialog, setProjectDialog] = React.useState<null | { project: ProjectDto | null }>(
    null,
  )
  const areaName = new Map(areas.map((a) => [a.id, a.name]))
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Áreas</CardTitle>
          <Button size="sm" onClick={() => setAreaDialog({ area: null })}>
            <Plus />
            Nueva área
          </Button>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Área</TableHead>
                <TableHead>Código</TableHead>
                <TableHead className="text-right">Orden</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...areas]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {a.name}
                      {a.isExternalCategory ? (
                        <Badge tone="warning" className="ml-2">
                          Externos
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{a.code ?? '—'}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{a.sortOrder}</TableCell>
                    <TableCell>
                      {a.active ? (
                        <Badge tone="success">Activa</Badge>
                      ) : (
                        <Badge tone="neutral">Inactiva</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="xs" onClick={() => setAreaDialog({ area: a })}>
                        <Pencil />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Proyectos y alias</CardTitle>
          <Button size="sm" onClick={() => setProjectDialog({ project: null })}>
            <Plus />
            Nuevo proyecto
          </Button>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Proyecto</TableHead>
                <TableHead>Área</TableHead>
                <TableHead>Alias</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <span className="font-medium">{p.canonicalName}</span>
                    {p.code ? (
                      <span className="ml-1 font-mono text-xs text-muted-foreground">{p.code}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">
                    {p.areaId ? (areaName.get(p.areaId) ?? '—') : '—'}
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-1">
                      {p.aliases.map((a) => (
                        <Badge key={a}>{a}</Badge>
                      ))}
                    </span>
                  </TableCell>
                  <TableCell>
                    {p.active ? (
                      <Badge tone="success">Activo</Badge>
                    ) : (
                      <Badge tone="neutral">Inactivo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setProjectDialog({ project: p })}
                    >
                      <Pencil />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {areaDialog ? (
        <AreaDialog area={areaDialog.area} onClose={() => setAreaDialog(null)} />
      ) : null}
      {projectDialog ? (
        <ProjectDialog
          project={projectDialog.project}
          areas={areas}
          onClose={() => setProjectDialog(null)}
        />
      ) : null}
    </div>
  )
}

function AreaDialog({ area, onClose }: { area: AreaDto | null; onClose: () => void }) {
  const [form, setForm] = React.useState({
    name: area?.name ?? '',
    code: area?.code ?? '',
    active: area?.active ?? true,
    sortOrder: area?.sortOrder ?? 100,
  })
  const save = useApiMutation<AreaDto, typeof form>({
    mutationFn: (f) => {
      const body = {
        name: f.name.trim(),
        code: f.code.trim() || null,
        active: f.active,
        sortOrder: f.sortOrder,
      }
      return area
        ? clientApi.patch<AreaDto>(`/admin/areas/${area.id}`, body)
        : clientApi.post<AreaDto>('/admin/areas', body)
    },
    successMessage: area ? 'Área actualizada' : 'Área creada',
    invalidate: [qk.areas],
    onSuccess: onClose,
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{area ? 'Editar área' : 'Nueva área'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field label="Nombre" htmlFor="a-name" required>
            <Input
              id="a-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Código" htmlFor="a-code">
              <Input
                id="a-code"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                maxLength={20}
              />
            </Field>
            <Field label="Orden" htmlFor="a-order">
              <Input
                id="a-order"
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
              />
            </Field>
          </div>
          <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
            Activa
            <Switch
              checked={form.active}
              onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => save.mutate(form)}
            loading={save.isPending}
            disabled={!form.name.trim()}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ProjectDialog({
  project,
  areas,
  onClose,
}: {
  project: ProjectDto | null
  areas: AreaDto[]
  onClose: () => void
}) {
  const [form, setForm] = React.useState({
    canonicalName: project?.canonicalName ?? '',
    code: project?.code ?? '',
    areaId: project?.areaId ?? null,
    active: project?.active ?? true,
    aliases: project?.aliases.join('\n') ?? '',
  })
  const save = useApiMutation<ProjectDto, typeof form>({
    mutationFn: (f) => {
      const body = {
        canonicalName: f.canonicalName.trim(),
        code: f.code.trim() || null,
        areaId: f.areaId,
        active: f.active,
        aliases: f.aliases
          .split(/[\n,]/)
          .map((a) => a.trim())
          .filter(Boolean),
      }
      return project
        ? clientApi.patch<ProjectDto>(`/admin/projects/${project.id}`, body)
        : clientApi.post<ProjectDto>('/admin/projects', body)
    },
    successMessage: project ? 'Proyecto actualizado' : 'Proyecto creado',
    invalidate: [qk.projects],
    onSuccess: onClose,
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{project ? 'Editar proyecto' : 'Nuevo proyecto'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre canónico" htmlFor="p-name" required className="sm:col-span-2">
            <Input
              id="p-name"
              value={form.canonicalName}
              onChange={(e) => setForm((f) => ({ ...f, canonicalName: e.target.value }))}
            />
          </Field>
          <Field label="Código" htmlFor="p-code">
            <Input
              id="p-code"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              maxLength={30}
            />
          </Field>
          <Field label="Área" htmlFor="p-area">
            <Select
              value={form.areaId ?? NONE}
              onValueChange={(v) => setForm((f) => ({ ...f, areaId: v === NONE ? null : v }))}
            >
              <SelectTrigger id="p-area">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sin área</SelectItem>
                {areas.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Alias"
            htmlFor="p-alias"
            hint="Uno por línea o separados por coma. La IA los usa para reconocer el proyecto en las transcripciones."
            className="sm:col-span-2"
          >
            <Textarea
              id="p-alias"
              rows={4}
              value={form.aliases}
              onChange={(e) => setForm((f) => ({ ...f, aliases: e.target.value }))}
            />
          </Field>
          <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm sm:col-span-2">
            Activo
            <Switch
              checked={form.active}
              onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => save.mutate(form)}
            loading={save.isPending}
            disabled={!form.canonicalName.trim()}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
