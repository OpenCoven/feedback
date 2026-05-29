import { createFileRoute } from '@tanstack/react-router'
import { successResponse, handleDomainError } from '@/lib/server/domains/api/responses'
import { parseTypeId } from '@/lib/server/domains/api/validation'
import { NotFoundError } from '@/lib/shared/errors'
import type { PostId } from '@opencoven-feedback/ids'

export const Route = createFileRoute('/api/public/v1/posts/$postId')({
  server: {
    handlers: {
      /**
       * GET /api/public/v1/posts/:postId
       * Anonymous-read single post — public-safe subset only.
       */
      GET: async ({ request, params }) => {
        try {
          const postId = parseTypeId<PostId>(params.postId, 'post', 'post ID')

          const { getPostWithDetails } = await import('@/lib/server/domains/posts/post.query')
          const { optionalPortalSession } = await import('@/lib/server/domains/api/portal-auth')

          const [post, session] = await Promise.all([
            getPostWithDetails(postId),
            optionalPortalSession(request),
          ])

          // C1/C3: enforce public visibility — return identical 404 for private/deleted/merged
          if (!post.board?.isPublic || post.deletedAt != null || post.canonicalPostId != null) {
            throw new NotFoundError('POST_NOT_FOUND', 'Post not found')
          }

          let hasVoted = false
          if (session) {
            const { getAllUserVotedPostIds } =
              await import('@/lib/server/domains/posts/post.public')
            const voted = await getAllUserVotedPostIds(session.principal.id)
            hasVoted = voted.has(postId)
          }

          return successResponse({
            id: post.id,
            title: post.title,
            content: post.content,
            voteCount: post.voteCount,
            statusId: post.statusId,
            boardId: post.boardId,
            createdAt: post.createdAt.toISOString(),
            hasVoted,
          })
        } catch (error) {
          return handleDomainError(error)
        }
      },
    },
  },
})
