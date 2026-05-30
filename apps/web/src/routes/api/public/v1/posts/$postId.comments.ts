import { createFileRoute } from '@tanstack/react-router'
import {
  successResponse,
  notFoundResponse,
  handleDomainError,
} from '@/lib/server/domains/api/responses'
import type { PostId } from '@opencoven-feedback/ids'
import type { PublicComment } from '@/lib/server/domains/posts/post.types'

function serializeComment(comment: PublicComment): unknown {
  return {
    id: comment.id,
    content: comment.content,
    authorName: comment.authorName ?? '',
    createdAt: comment.createdAt.toISOString(),
    replies: comment.replies.map(serializeComment),
  }
}

export const Route = createFileRoute('/api/public/v1/posts/$postId/comments')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { getPublicPostDetail } =
            await import('@/lib/server/domains/posts/post.public.detail')
          const post = await getPublicPostDetail(params.postId as PostId)

          if (!post) {
            return notFoundResponse('Post')
          }

          return successResponse(post.comments.map(serializeComment))
        } catch (error) {
          return handleDomainError(error)
        }
      },
    },
  },
})
