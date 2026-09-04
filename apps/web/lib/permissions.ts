import { Permission } from '@smlxl/domain'
import {
  Bell,
  CalendarDays,
  ClipboardList,
  Home,
  Plug,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react'

/**
 * Permisos en la UI: se usan SOLO para ocultar navegación/controles. La API
 * aplica RBAC en cada endpoint (§25).
 */
export function hasPermission(permissions: readonly string[], permission: Permission): boolean {
  return permissions.includes(permission)
}

export function hasAnyPermission(permissions: readonly string[], required: readonly Permission[]): boolean {
  if (required.length === 0) return true
  return required.some((p) => permissions.includes(p))
}

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Basta con uno de estos permisos. Vacío = cualquier usuario autenticado. */
  anyOf: readonly Permission[]
  description?: string
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/inicio', label: 'Inicio', icon: Home, anyOf: [Permission.ACTION_ITEM_READ] },
  { href: '/reuniones', label: 'Reuniones', icon: CalendarDays, anyOf: [Permission.MEETING_READ] },
  { href: '/pendientes', label: 'Pendientes', icon: ClipboardList, anyOf: [Permission.ACTION_ITEM_READ] },
  { href: '/revision-ia', label: 'Revisión IA', icon: Sparkles, anyOf: [Permission.AI_REVIEW_RESOLVE] },
  { href: '/reportes', label: 'Reportes', icon: Bell, anyOf: [Permission.REPORT_GLOBAL, Permission.REPORT_AREA] },
  { href: '/equipo', label: 'Equipo', icon: Users, anyOf: [] },
  { href: '/integraciones', label: 'Integraciones', icon: Plug, anyOf: [Permission.INTEGRATION_MANAGE] },
  { href: '/configuracion', label: 'Configuración', icon: Settings, anyOf: [Permission.CONFIG_MANAGE] },
  {
    href: '/administracion',
    label: 'Administración',
    icon: ShieldCheck,
    anyOf: [Permission.USER_MANAGE, Permission.CATALOG_MANAGE, Permission.AUDIT_READ],
  },
]

export function visibleNavItems(permissions: readonly string[]): NavItem[] {
  return NAV_ITEMS.filter((item) => hasAnyPermission(permissions, item.anyOf))
}

export { Permission }
