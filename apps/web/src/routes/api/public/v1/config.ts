import { createFileRoute } from '@tanstack/react-router'
import { successResponse, handleDomainError } from '@/lib/server/domains/api/responses'

export const Route = createFileRoute('/api/public/v1/config')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { getPublicWidgetConfig } =
            await import('@/lib/server/domains/settings/settings.widget')
          const config = await getPublicWidgetConfig()
          return successResponse(config)
        } catch (error) {
          return handleDomainError(error)
        }
      },
    },
  },
})
