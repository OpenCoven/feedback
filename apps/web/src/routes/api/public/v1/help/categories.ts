import { createFileRoute } from '@tanstack/react-router'
import { successResponse, handleDomainError } from '@/lib/server/domains/api/responses'
import { requirePublicHelpCenterAccess } from '@/lib/server/help-center-access'

export const Route = createFileRoute('/api/public/v1/help/categories')({
  server: {
    handlers: {
      GET: async () => {
        try {
          await requirePublicHelpCenterAccess()
          const { listPublicCategories } =
            await import('@/lib/server/domains/help-center/help-center.category.service')
          const categories = await listPublicCategories()

          return successResponse(
            categories.map((category) => ({
              id: category.id,
              name: category.name,
              slug: category.slug,
              description: category.description,
            }))
          )
        } catch (error) {
          return handleDomainError(error)
        }
      },
    },
  },
})
