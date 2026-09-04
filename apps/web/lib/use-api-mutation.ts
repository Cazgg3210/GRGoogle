'use client'

import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from '@smlxl/ui'
import { describeError } from './error-messages'

export interface ApiMutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>
  /** Mensaje de éxito (string o función). */
  successMessage?: string | ((data: TData, variables: TVariables) => string)
  /** Claves a invalidar tras éxito. */
  invalidate?: QueryKey[]
  /** Refresca los Server Components de la ruta actual (default: true). */
  refresh?: boolean
  onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>
  onError?: (error: unknown, variables: TVariables) => void
}

/** useMutation con toasts en español, invalidación y router.refresh(). */
export function useApiMutation<TData = unknown, TVariables = void>(
  options: ApiMutationOptions<TData, TVariables>,
) {
  const queryClient = useQueryClient()
  const router = useRouter()
  return useMutation<TData, unknown, TVariables>({
    mutationFn: options.mutationFn,
    onSuccess: async (data, variables) => {
      if (options.successMessage) {
        const msg =
          typeof options.successMessage === 'function'
            ? options.successMessage(data, variables)
            : options.successMessage
        toast.success(msg)
      }
      if (options.invalidate) {
        await Promise.all(
          options.invalidate.map((key) => queryClient.invalidateQueries({ queryKey: key })),
        )
      }
      if (options.refresh !== false) router.refresh()
      await options.onSuccess?.(data, variables)
    },
    onError: (error, variables) => {
      const d = describeError(error)
      toast.error(d.title, { description: d.message })
      options.onError?.(error, variables)
    },
  })
}
