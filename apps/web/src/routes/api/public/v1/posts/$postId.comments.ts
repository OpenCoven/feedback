import { createFileRoute } from '@tanstack/react-router'
import { successResponse, handleDomainError } from '@/lib/server/domains/api/responses'
import { parseTypeId } from '@/lib/server/domains/api/validation'
import type { PostId } from '@opencoven-feedback/ids'

export const Route = createFileRoute('/api/public/v1/posts/$postId/comments')({
  server: {
    handlers: {
      /**
       * GET /api/public/v1/posts/:postId/comments
       * Anonymous-read threaded comments for a post.
       */
      GET: async ({ request: _request, params }) => {
        try {
          const postId = parseTypeId<PostId>(params.postId, 'post', 'post ID')

          const { getCommentsWithReplies } = await import('@/lib/server/domains/posts/post.query')

          const comments = await getCommentsWithReplies(postId)

          type Comment = (typeof comments)[0]

          const serializeComment = (c: Comment): unknown => ({
            id: c.id,
            content: c.content,
            authorName: c.authorName,
            createdAt: c.createdAt.toISOString(),
            replies: c.replies.map(serializeComment),
          })

          return successResponse(comments.map(serializeComment))
        } catch (error) {
          return handleDomainError(error)
        }
      },
    },
  },
})
