import { createFileRoute } from '@tanstack/react-router'
import { successResponse, handleDomainError } from '@/lib/server/domains/api/responses'

export const Route = createFileRoute('/api/public/v1/boards/')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { listPublicBoardsWithStats } =
            await import('@/lib/server/domains/boards/board.public')
          const boards = await listPublicBoardsWithStats()

          return successResponse(
            boards.map((board) => ({
              id: board.id,
              name: board.name,
              slug: board.slug,
              description: board.description,
              postCount: board.postCount,
            }))
          )
        } catch (error) {
          return handleDomainError(error)
        }
      },
    },
  },
})
