'use client'

import { createApiClient, type ApiClient } from './api'

/** Cliente para Client Components: pasa por /api/proxy, que agrega Authorization. */
export const clientApi: ApiClient = createApiClient({ baseUrl: '/api/proxy' })
