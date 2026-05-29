import { createFileRoute } from '@tanstack/react-router'
import { successResponse, handleDomainError } from '@/lib/server/domains/api/responses'

export const Route = createFileRoute('/api/public/v1/boards/')({
  server: {
    handlers: {
      /**
       * GET /api/public/v1/boards
       * Returns all public boards with post counts.
       */
      GET: async () => {
        try {
          const { listBoardsWithDetails } =
            await import('@/lib/server/domains/boards/board.service')

          const boards = await listBoardsWithDetails()

          return successResponse(
            boards
              .filter((b) => b.isPublic)
              .map((b) => ({
                id: b.id,
                name: b.name,
                slug: b.slug,
                description: b.description,
                postCount: b.postCount,
              }))
          )
        } catch (error) {
          return handleDomainError(error)
        }
      },
    },
  },
})
