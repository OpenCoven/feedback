import { createFileRoute } from '@tanstack/react-router'
import {
  successResponse,
  notFoundResponse,
  handleDomainError,
} from '@/lib/server/domains/api/responses'
import { requirePublicHelpCenterAccess } from '@/lib/server/help-center-access'

export const Route = createFileRoute('/api/public/v1/help/articles/$slug')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          await requirePublicHelpCenterAccess()
          const { getPublicArticleBySlug } =
            await import('@/lib/server/domains/help-center/help-center.article.service')
          const article = await getPublicArticleBySlug(params.slug)

          if (!article) {
            return notFoundResponse('Help center article')
          }

          return successResponse({
            id: article.id,
            slug: article.slug,
            title: article.title,
            content: article.content,
            categoryId: article.categoryId,
          })
        } catch (error) {
          return handleDomainError(error)
        }
      },
    },
  },
})
