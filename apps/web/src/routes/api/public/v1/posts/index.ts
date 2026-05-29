import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import type { BoardId } from '@opencoven-feedback/ids'
import { NotFoundError } from '@/lib/shared/errors'
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  handleDomainError,
} from '@/lib/server/domains/api/responses'

const submitPostSchema = z.object({
  boardId: z.string().min(1, 'Board ID is required'),
  title: z.string().min(1, 'Title is required').max(200),
  content: z.string().max(10000).optional().default(''),
})

export const Route = createFileRoute('/api/public/v1/posts/')({
  server: {
    handlers: {
      /**
       * GET /api/public/v1/posts
       * Anonymous feed — returns public posts with per-principal hasVoted flag.
       */
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)

          const rawLimit = parseInt(url.searchParams.get('limit') ?? '20', 10)
          const limit = Math.min(100, Math.max(1, isNaN(rawLimit) ? 20 : rawLimit))

          const rawSort = url.searchParams.get('sort') ?? 'newest'
          const sort: 'newest' | 'votes' = rawSort === 'votes' ? 'votes' : 'newest'

          const boardIdParam = url.searchParams.get('boardId') ?? undefined
          const cursor = url.searchParams.get('cursor') ?? undefined

          const { isValidTypeId } = await import('@opencoven-feedback/ids')
          const boardId =
            boardIdParam && isValidTypeId(boardIdParam, 'board')
              ? (boardIdParam as BoardId)
              : undefined

          const { listPublicPostFeed } = await import('@/lib/server/domains/posts/post.public-list')
          const result = await listPublicPostFeed({
            boardId,
            sort,
            cursor,
            limit,
          })

          const { optionalPortalSession } = await import('@/lib/server/domains/api/portal-auth')
          const session = await optionalPortalSession(request)

          let voted: Set<string> = new Set()
          if (session) {
            const { getAllUserVotedPostIds } =
              await import('@/lib/server/domains/posts/post.public')
            voted = await getAllUserVotedPostIds(session.principal.id)
          }

          return successResponse(
            result.items.map((p) => ({ ...p, hasVoted: voted.has(p.id) })),
            { pagination: { cursor: result.cursor, hasMore: result.hasMore } }
          )
        } catch (error) {
          return handleDomainError(error)
        }
      },

      /**
       * POST /api/public/v1/posts
       * Authenticated end-user post submission.
       * requirePortalSession runs first — anonymous requests are rejected
       * with 401 before any body parsing or DB work.
       */
      POST: async ({ request }) => {
        try {
          const { requirePortalSession } = await import('@/lib/server/domains/api/portal-auth')
          const session = await requirePortalSession(request)

          const body = await request.json()
          const parsed = submitPostSchema.safeParse(body)
          if (!parsed.success) {
            return badRequestResponse('Invalid request body', {
              errors: parsed.error.flatten().fieldErrors,
            })
          }

          const { getBoardById } = await import('@/lib/server/domains/boards/board.service')
          const board = await getBoardById(parsed.data.boardId as BoardId)
          if (!board.isPublic) {
            throw new NotFoundError('BOARD_NOT_FOUND', 'Board not found')
          }

          const { createPost } = await import('@/lib/server/domains/posts/post.service')
          const result = await createPost(
            {
              boardId: parsed.data.boardId as BoardId,
              title: parsed.data.title,
              content: parsed.data.content,
            },
            {
              principalId: session.principal.id,
            }
          )

          return createdResponse({
            id: result.id,
            title: result.title,
            boardId: result.boardId,
            createdAt: result.createdAt.toISOString(),
          })
        } catch (error) {
          return handleDomainError(error)
        }
      },
    },
  },
})
