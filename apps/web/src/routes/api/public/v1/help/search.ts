import { createFileRoute } from '@tanstack/react-router'
import { successResponse, handleDomainError } from '@/lib/server/domains/api/responses'
import { hybridSearch } from '@/lib/server/domains/help-center/help-center-search.service'

export const Route = createFileRoute('/api/public/v1/help/search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const q = url.searchParams.get('q')?.trim()

          if (!q) {
            return successResponse([])
          }

          const limit = Math.min(Number(url.searchParams.get('limit')) || 10, 20)
          const results = await hybridSearch(q, limit)

          return successResponse(
            results.map((a) => ({
              id: a.id,
              slug: a.slug,
              title: a.title,
            }))
          )
        } catch (error) {
          return handleDomainError(error)
        }
      },
    },
  },
})
