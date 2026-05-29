import { createFileRoute } from '@tanstack/react-router'
import { successResponse, handleDomainError } from '@/lib/server/domains/api/responses'

export const Route = createFileRoute('/api/public/v1/posts/')({
  server: {
    handlers: {
      /**
       * GET /api/public/v1/posts
       * Anonymous feed — returns public posts with per-principal hasVoted flag.
       */
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)

          const rawLimit = parseInt(url.searchParams.get('limit') ?? '20', 10)
          const limit = Math.min(100, Math.max(1, isNaN(rawLimit) ? 20 : rawLimit))

          const rawSort = url.searchParams.get('sort') ?? 'newest'
          const sort: 'newest' | 'votes' = rawSort === 'votes' ? 'votes' : 'newest'

          const boardId = url.searchParams.get('boardId') ?? undefined
          const cursor = url.searchParams.get('cursor') ?? undefined

          const { listPublicPostFeed } = await import('@/lib/server/domains/posts/post.public-list')
          const result = await listPublicPostFeed({
            boardId: boardId as never,
            sort,
            cursor,
            limit,
          })

          const { optionalPortalSession } = await import('@/lib/server/domains/api/portal-auth')
          const session = await optionalPortalSession(request)

          let voted: Set<string> = new Set()
          if (session) {
            const { getAllUserVotedPostIds } =
              await import('@/lib/server/domains/posts/post.public')
            voted = await getAllUserVotedPostIds(session.principal.id)
          }

          return successResponse(
            result.items.map((p) => ({ ...p, hasVoted: voted.has(p.id) })),
            { pagination: { cursor: result.cursor, hasMore: result.hasMore } }
          )
        } catch (error) {
          return handleDomainError(error)
        }
      },
    },
  },
})
