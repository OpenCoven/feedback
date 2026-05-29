import { createFileRoute } from '@tanstack/react-router'
import { successResponse, handleDomainError } from '@/lib/server/domains/api/responses'
import { getChangelogById } from '@/lib/server/domains/changelog/changelog.service'
import { NotFoundError } from '@/lib/shared/errors'
import type { ChangelogId } from '@opencoven-feedback/ids'

export const Route = createFileRoute('/api/public/v1/changelog/$entryId')({
  server: {
    handlers: {
      /**
       * GET /api/public/v1/changelog/:entryId
       * Anonymous read — returns a published changelog entry only.
       */
      GET: async ({ params }) => {
        try {
          const entry = await getChangelogById(params.entryId as ChangelogId)

          if (entry.status !== 'published') {
            throw new NotFoundError('CHANGELOG_NOT_FOUND', 'Changelog entry not found')
          }

          return successResponse({
            id: entry.id,
            title: entry.title,
            content: entry.content,
            publishedAt: entry.publishedAt?.toISOString() ?? null,
          })
        } catch (error) {
          return handleDomainError(error)
        }
      },
    },
  },
})
