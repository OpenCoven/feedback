import { createFileRoute } from '@tanstack/react-router'
import { successResponse, handleDomainError } from '@/lib/server/domains/api/responses'
import { parseTypeId } from '@/lib/server/domains/api/validation'
import type { PostId } from '@opencoven-feedback/ids'

export const Route = createFileRoute('/api/public/v1/posts/$postId/vote')({
  server: {
    handlers: {
      /**
       * POST /api/public/v1/posts/:postId/vote
       * Toggle vote on a post — auth required, vote attributed to session principal.
       */
      POST: async ({ request, params }) => {
        try {
          const { requirePortalSession } = await import('@/lib/server/domains/api/portal-auth')
          const session = await requirePortalSession(request)

          const postId = parseTypeId<PostId>(params.postId, 'post', 'post ID')

          const { voteOnPost } = await import('@/lib/server/domains/posts/post.voting')
          const result = await voteOnPost(postId, session.principal.id)

          return successResponse({ voted: result.voted, voteCount: result.voteCount })
        } catch (error) {
          return handleDomainError(error)
        }
      },
    },
  },
})
