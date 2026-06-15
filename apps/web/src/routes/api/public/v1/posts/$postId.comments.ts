import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  handleDomainError,
} from '@/lib/server/domains/api/responses'
import { parseTypeId, parseOptionalTypeId } from '@/lib/server/domains/api/validation'
import { NotFoundError } from '@/lib/shared/errors'
import type { CommentId, PostId } from '@opencoven-feedback/ids'

const createCommentSchema = z.object({
  content: z.string().min(1, 'Content is required').max(10000),
  parentId: z.string().optional(),
})

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

          const { getPostWithDetails, getCommentsWithReplies } =
            await import('@/lib/server/domains/posts/post.query')

          // C1/C2: enforce post visibility before returning any comments
          const post = await getPostWithDetails(postId)
          if (!post.board?.isPublic || post.deletedAt != null || post.canonicalPostId != null) {
            throw new NotFoundError('POST_NOT_FOUND', 'Post not found')
          }

          // C2: pass publicOnly so private/team comments are excluded and deleted leaves pruned
          const comments = await getCommentsWithReplies(postId, undefined, { publicOnly: true })

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

      /**
       * POST /api/public/v1/posts/:postId/comments
       * Authenticated end-user comment creation.
       * requirePortalSession runs first — anonymous requests are rejected
       * with 401 before any body parsing or DB work.
       */
      POST: async ({ request, params }) => {
        try {
          const { requirePortalSession } = await import('@/lib/server/domains/api/portal-auth')
          const session = await requirePortalSession(request)

          const postId = parseTypeId<PostId>(params.postId, 'post', 'post ID')

          const body = await request.json()
          const parsed = createCommentSchema.safeParse(body)
          if (!parsed.success) {
            return badRequestResponse('Invalid request body', {
              errors: parsed.error.flatten().fieldErrors,
            })
          }

          const parentId = parseOptionalTypeId<CommentId>(
            parsed.data.parentId,
            'comment',
            'parent ID'
          )

          const { createComment } = await import('@/lib/server/domains/comments/comment.service')

          const result = await createComment(
            {
              postId,
              content: parsed.data.content,
              parentId,
            },
            {
              principalId: session.principal.id,
              role: session.principal.role as 'admin' | 'member' | 'user',
            }
          )

          return createdResponse({
            id: result.comment.id,
            content: result.comment.content,
            createdAt: result.comment.createdAt.toISOString(),
          })
        } catch (error) {
          return handleDomainError(error)
        }
      },
    },
  },
})
