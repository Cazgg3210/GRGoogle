'use client'

import * as React from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@smlxl/ui'
import { useAreas, useProjects, useUsers } from '@/lib/hooks/use-catalogs'

export const NONE_VALUE = '__none__'

interface Option {
  value: string
  label: string
  hint?: string | null
}

function useOptions(kind: 'users' | 'areas' | 'projects'): { options: Option[]; loading: boolean } {
  const users = useUsers()
  const areas = useAreas()
  const projects = useProjects()
  return React.useMemo(() => {
    if (kind === 'users') {
      return {
        loading: users.isLoading,
        options: (users.data ?? [])
          .filter((u) => u.active)
          .map((u) => ({ value: u.id, label: u.displayName, hint: u.areaName })),
      }
    }
    if (kind === 'areas') {
      return {
        loading: areas.isLoading,
        options: (areas.data ?? []).filter((a) => a.active).map((a) => ({ value: a.id, label: a.name, hint: a.code })),
      }
    }
    return {
      loading: projects.isLoading,
      options: (projects.data ?? []).filter((p) => p.active).map((p) => ({ value: p.id, label: p.canonicalName, hint: p.code })),
    }
  }, [kind, users.data, users.isLoading, areas.data, areas.isLoading, projects.data, projects.isLoading])
}

export function CatalogSelect({
  kind,
  value,
  onChange,
  placeholder,
  emptyLabel = 'Sin asignar',
  allowEmpty = true,
  size,
  className,
  id,
  disabled,
  ariaLabel,
}: {
  kind: 'users' | 'areas' | 'projects'
  value: string | null | undefined
  onChange: (value: string | null) => void
  placeholder?: string
  emptyLabel?: string
  allowEmpty?: boolean
  size?: 'sm' | 'default'
  className?: string
  id?: string
  disabled?: boolean
  ariaLabel?: string
}) {
  const { options, loading } = useOptions(kind)
  const defaultPlaceholder = kind === 'users' ? 'Responsable' : kind === 'areas' ? 'Área' : 'Proyecto'
  return (
    <Select
      value={value ?? (allowEmpty ? NONE_VALUE : '')}
      onValueChange={(v) => onChange(v === NONE_VALUE ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger id={id} size={size} className={className} aria-label={ariaLabel ?? placeholder ?? defaultPlaceholder}>
        <SelectValue placeholder={loading ? 'Cargando…' : (placeholder ?? defaultPlaceholder)} />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty ? (
          <SelectItem value={NONE_VALUE}>
            <span className="text-muted-foreground">{emptyLabel}</span>
          </SelectItem>
        ) : null}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
            {o.hint ? <span className="ml-1.5 text-xs text-muted-foreground">{o.hint}</span> : null}
          </SelectItem>
        ))}
        {!loading && options.length === 0 ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">Sin opciones disponibles</div>
        ) : null}
      </SelectContent>
    </Select>
  )
}
