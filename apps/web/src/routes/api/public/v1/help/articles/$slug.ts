import { createFileRoute } from '@tanstack/react-router'
import { successResponse, handleDomainError } from '@/lib/server/domains/api/responses'
import { getPublicArticleBySlug } from '@/lib/server/domains/help-center/help-center.service'

export const Route = createFileRoute('/api/public/v1/help/articles/$slug')({
  server: {
    handlers: {
      GET: async ({ request: _request, params }) => {
        try {
          const article = await getPublicArticleBySlug(params.slug)
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
