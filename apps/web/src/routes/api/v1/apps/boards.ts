import { createFileRoute } from '@tanstack/react-router'
import { withApiKeyAuth } from '@/lib/server/domains/api/auth'
import { APP_INTEGRATION_API_KEY_SCOPE } from '@/lib/server/domains/api-keys/api-key.service'
import { handleDomainError } from '@/lib/server/domains/api/responses'
import { appJsonResponse, preflightResponse } from '@/lib/server/integrations/apps/cors'

export const Route = createFileRoute('/api/v1/apps/boards')({
  server: {
    handlers: {
      OPTIONS: () => preflightResponse(),

      GET: async ({ request }) => {
        try {
          await withApiKeyAuth(request, { role: 'team', scope: APP_INTEGRATION_API_KEY_SCOPE })
          const { listPublicBoardsWithStats } =
            await import('@/lib/server/domains/boards/board.public')

          const boards = await listPublicBoardsWithStats()

          return appJsonResponse({
            boards: boards.map((b) => ({
              id: b.id,
              name: b.name,
              slug: b.slug,
            })),
          })
        } catch (error) {
          return handleDomainError(error)
        }
      },
    },
  },
})
