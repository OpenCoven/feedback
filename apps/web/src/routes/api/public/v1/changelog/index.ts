import { createFileRoute } from '@tanstack/react-router'
import { successResponse, handleDomainError } from '@/lib/server/domains/api/responses'
import { listChangelogs } from '@/lib/server/domains/changelog/changelog.query'

export const Route = createFileRoute('/api/public/v1/changelog/')({
  server: {
    handlers: {
      /**
       * GET /api/public/v1/changelog
       * Anonymous read — returns published changelog entries only.
       */
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const cursor = url.searchParams.get('cursor') ?? undefined
          const rawLimit = parseInt(url.searchParams.get('limit') ?? '20', 10)
          const limit = Math.min(100, Math.max(1, isNaN(rawLimit) ? 20 : rawLimit))

          const result = await listChangelogs({ status: 'published', cursor, limit })

          return successResponse(
            result.items.map((entry) => ({
              id: entry.id,
              title: entry.title,
              publishedAt: entry.publishedAt?.toISOString() ?? null,
            })),
            {
              pagination: {
                cursor: result.nextCursor,
                hasMore: result.hasMore,
              },
            }
          )
        } catch (error) {
          return handleDomainError(error)
        }
      },
    },
  },
})
