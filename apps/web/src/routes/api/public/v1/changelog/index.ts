import { createFileRoute } from '@tanstack/react-router'
import { successResponse, handleDomainError } from '@/lib/server/domains/api/responses'

export const Route = createFileRoute('/api/public/v1/changelog/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const cursor = url.searchParams.get('cursor') ?? undefined
          const limit = Math.min(
            100,
            Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '20', 10) || 20)
          )

          const { listPublicChangelogs } =
            await import('@/lib/server/domains/changelog/changelog.public')
          const result = await listPublicChangelogs({ cursor, limit })

          return successResponse(
            result.items.map((entry) => ({
              id: entry.id,
              title: entry.title,
              content: entry.content,
              publishedAt: entry.publishedAt.toISOString(),
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
