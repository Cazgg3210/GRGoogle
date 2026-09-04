'use client'

import { useQuery } from '@tanstack/react-query'
import type { AreaDto, ProjectDto, UserDto } from '@smlxl/contracts'
import { clientApi } from '@/lib/api.client'
import { qk } from '@/lib/query-keys'

const FIVE_MIN = 5 * 60_000

export function useUsers(initial?: UserDto[]) {
  return useQuery({
    queryKey: qk.users,
    queryFn: () => clientApi.get<UserDto[]>('/team/users'),
    staleTime: FIVE_MIN,
    initialData: initial,
  })
}

export function useAreas(initial?: AreaDto[]) {
  return useQuery({
    queryKey: qk.areas,
    queryFn: () => clientApi.get<AreaDto[]>('/team/areas'),
    staleTime: FIVE_MIN,
    initialData: initial,
  })
}

export function useProjects(initial?: ProjectDto[]) {
  return useQuery({
    queryKey: qk.projects,
    queryFn: () => clientApi.get<ProjectDto[]>('/team/projects'),
    staleTime: FIVE_MIN,
    initialData: initial,
  })
}
