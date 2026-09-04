'use client'

import * as React from 'react'
import { useFormStatus } from 'react-dom'
import type { UserDto } from '@smlxl/contracts'
import { Button, Input, Label, ROLE_LABELS, RoleBadge, UserAvatar, cn, labelFor } from '@smlxl/ui'
import { devSignInAction } from '@/app/(auth)/login/actions'

function SubmitButton({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" className="w-full" loading={pending} disabled={disabled}>
      {children}
    </Button>
  )
}

export function DevUserPicker({
  users,
  loadError,
  callbackUrl,
  domain,
}: {
  users: UserDto[]
  loadError: string | null
  callbackUrl: string
  domain: string
}) {
  const [selected, setSelected] = React.useState<string>(users[0]?.email ?? '')
  const [manual, setManual] = React.useState('')
  const useManual = users.length === 0

  return (
    <form action={devSignInAction} className="flex flex-col gap-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <p className="text-xs text-muted-foreground">
        Modo <span className="font-mono">AUTH_DEV_BYPASS</span>: entra como cualquier usuario del
        directorio sin OAuth. Nunca disponible en producción.
      </p>
      {loadError ? <p className="text-xs text-warning-800">{loadError}</p> : null}

      {!useManual ? (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="sr-only">Usuario demo</legend>
          <div className="max-h-72 overflow-y-auto rounded-md border border-border bg-surface p-1 scrollbar-thin">
            {users.map((u) => {
              const active = selected === u.email
              return (
                <label
                  key={u.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-sm px-2.5 py-2 transition-colors',
                    active ? 'bg-ink-900 text-paper-50' : 'hover:bg-paper-100',
                  )}
                >
                  <input
                    type="radio"
                    name="email"
                    value={u.email}
                    checked={active}
                    onChange={() => setSelected(u.email)}
                    className="sr-only"
                  />
                  <UserAvatar
                    name={u.displayName}
                    size="sm"
                    className={cn(active && 'ring-2 ring-signal-400')}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{u.displayName}</span>
                    <span
                      className={cn(
                        'block truncate text-xs',
                        active ? 'text-ink-300' : 'text-muted-foreground',
                      )}
                    >
                      {u.email}
                      {u.areaName ? ` · ${u.areaName}` : ''}
                    </span>
                  </span>
                  {active ? (
                    <span className="rounded-sm bg-paper-50/15 px-1.5 py-0.5 text-[11px] font-medium">
                      {labelFor(ROLE_LABELS, u.role).label}
                    </span>
                  ) : (
                    <RoleBadge role={u.role} />
                  )}
                </label>
              )
            })}
          </div>
        </fieldset>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dev-email">Correo corporativo</Label>
          <Input
            id="dev-email"
            name="email"
            type="email"
            inputMode="email"
            placeholder={`nombre@${domain}`}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            required
            pattern={`.+@${domain.replace('.', '\\.')}`}
          />
        </div>
      )}

      <SubmitButton disabled={useManual ? manual.length === 0 : selected.length === 0}>
        Entrar como{' '}
        {useManual ? manual || '…' : (users.find((u) => u.email === selected)?.displayName ?? '…')}
      </SubmitButton>
    </form>
  )
}
