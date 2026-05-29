import { createFileRoute } from '@tanstack/react-router'
import { successResponse, handleDomainError } from '@/lib/server/domains/api/responses'
import { listPublicCategories } from '@/lib/server/domains/help-center/help-center.service'

export const Route = createFileRoute('/api/public/v1/help/categories/')({
  server: {
    handlers: {
      GET: async ({ request: _request }) => {
        try {
          const categories = await listPublicCategories()
          return successResponse(
            categories.map((cat) => ({
              id: cat.id,
              name: cat.name,
              slug: cat.slug,
              description: cat.description,
            }))
          )
        } catch (error) {
          return handleDomainError(error)
        }
      },
    },
  },
})
