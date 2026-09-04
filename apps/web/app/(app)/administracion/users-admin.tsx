'use client'

import * as React from 'react'
import { Pencil } from 'lucide-react'
import type { AreaDto, UserDto } from '@smlxl/contracts'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  ROLE_LABELS,
  RoleBadge,
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
  UserAvatar,
} from '@smlxl/ui'
import { clientApi } from '@/lib/api.client'
import { qk } from '@/lib/query-keys'
import { useApiMutation } from '@/lib/use-api-mutation'

const NONE = '__none__'
const ROLES = Object.keys(ROLE_LABELS) as Array<keyof typeof ROLE_LABELS>

export function UsersAdmin({ users, areas }: { users: UserDto[]; areas: AreaDto[] }) {
  const [editing, setEditing] = React.useState<UserDto | null>(null)
  const areaName = new Map(areas.map((a) => [a.id, a.name]))
  const userName = new Map(users.map((u) => [u.id, u.displayName]))
  return (
    <div className="rounded-lg border border-border bg-surface shadow-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Usuario</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Área</TableHead>
            <TableHead>Reporta a</TableHead>
            <TableHead>Monitoreado</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell>
                <span className="inline-flex items-center gap-2">
                  <UserAvatar name={u.displayName} size="sm" />
                  <span>
                    <span className="block font-medium">{u.displayName}</span>
                    <span className="block text-xs text-muted-foreground">{u.email}</span>
                  </span>
                </span>
              </TableCell>
              <TableCell>
                <RoleBadge role={u.role} />
              </TableCell>
              <TableCell className="text-sm">{u.areaName ?? (u.areaId ? areaName.get(u.areaId) : null) ?? '—'}</TableCell>
              <TableCell className="text-sm">{u.managerId ? (userName.get(u.managerId) ?? '—') : '—'}</TableCell>
              <TableCell>{u.monitored ? <Badge tone="ai">Sí</Badge> : <span className="text-xs text-muted-foreground">No</span>}</TableCell>
              <TableCell>{u.active ? <Badge tone="success">Activo</Badge> : <Badge tone="neutral">Inactivo</Badge>}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="xs" onClick={() => setEditing(u)}>
                  <Pencil />
                  Editar
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {editing ? <EditUserDialog user={editing} users={users} areas={areas} onClose={() => setEditing(null)} /> : null}
    </div>
  )
}

function EditUserDialog({ user, users, areas, onClose }: { user: UserDto; users: UserDto[]; areas: AreaDto[]; onClose: () => void }) {
  const [form, setForm] = React.useState({
    displayName: user.displayName,
    role: user.role,
    areaId: user.areaId,
    managerId: user.managerId,
    active: user.active,
    monitored: user.monitored,
  })
  const save = useApiMutation<UserDto, typeof form>({
    mutationFn: (body) => clientApi.patch<UserDto>(`/admin/users/${user.id}`, body),
    successMessage: 'Usuario actualizado',
    invalidate: [qk.users],
    onSuccess: onClose,
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
          <DialogDescription>{user.email}. Los cambios de rol aplican en la siguiente petición y quedan auditados.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" htmlFor="u-name" className="sm:col-span-2">
            <Input id="u-name" value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} />
          </Field>
          <Field label="Rol" htmlFor="u-role">
            <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as UserDto['role'] }))}>
              <SelectTrigger id="u-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Área" htmlFor="u-area">
            <Select value={form.areaId ?? NONE} onValueChange={(v) => setForm((f) => ({ ...f, areaId: v === NONE ? null : v }))}>
              <SelectTrigger id="u-area">
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
          <Field label="Reporta a" htmlFor="u-manager" className="sm:col-span-2">
            <Select value={form.managerId ?? NONE} onValueChange={(v) => setForm((f) => ({ ...f, managerId: v === NONE ? null : v }))}>
              <SelectTrigger id="u-manager">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nadie</SelectItem>
                {users
                  .filter((u) => u.id !== user.id)
                  .map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.displayName}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
          <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
            Activo
            <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
          </label>
          <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
            Monitorear Meet
            <Switch checked={form.monitored} onCheckedChange={(v) => setForm((f) => ({ ...f, monitored: v }))} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate(form)} loading={save.isPending}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
