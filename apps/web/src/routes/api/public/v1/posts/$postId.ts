import { createFileRoute } from '@tanstack/react-router'
import {
  successResponse,
  notFoundResponse,
  handleDomainError,
} from '@/lib/server/domains/api/responses'
import type { PostId } from '@opencoven-feedback/ids'

export const Route = createFileRoute('/api/public/v1/posts/$postId')({
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

          return successResponse({
            id: post.id,
            title: post.title,
            content: post.content,
            voteCount: post.voteCount,
            statusId: post.statusId,
            boardId: post.board.id,
            createdAt: post.createdAt.toISOString(),
            hasVoted: false,
          })
        } catch (error) {
          return handleDomainError(error)
        }
      },
    },
  },
})
