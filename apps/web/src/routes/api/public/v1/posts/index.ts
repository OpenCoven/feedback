import { createFileRoute } from '@tanstack/react-router'
import { successResponse, handleDomainError } from '@/lib/server/domains/api/responses'
import type { BoardId, StatusId, TagId } from '@opencoven-feedback/ids'

function parsePage(cursor: string | null): number {
  if (!cursor) return 1
  const parsed = Number.parseInt(cursor, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function mapSort(sort: string | null): 'top' | 'new' | 'trending' {
  switch (sort) {
    case 'newest':
    case 'new':
      return 'new'
    case 'trending':
      return 'trending'
    case 'votes':
    case 'top':
    default:
      return 'top'
  }
}

export const Route = createFileRoute('/api/public/v1/posts/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const page = parsePage(url.searchParams.get('cursor'))
          const limit = Math.min(
            100,
            Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '20', 10) || 20)
          )
          const boardId = url.searchParams.get('boardId') || undefined
          const boardSlug = url.searchParams.get('boardSlug') || undefined
          const search = url.searchParams.get('search') || undefined
          const statusId = url.searchParams.get('statusId') || undefined
          const statusSlug = url.searchParams.get('status') || undefined
          const tagIds = url.searchParams.get('tagIds') || undefined

          const { listPublicPosts } = await import('@/lib/server/domains/posts/post.public')
          const result = await listPublicPosts({
            boardId: boardId as BoardId | undefined,
            boardSlug,
            search,
            statusIds: statusId ? ([statusId] as StatusId[]) : undefined,
            statusSlugs: statusSlug ? [statusSlug] : undefined,
            tagIds: tagIds ? (tagIds.split(',').filter(Boolean) as TagId[]) : undefined,
            sort: mapSort(url.searchParams.get('sort')),
            page,
            limit,
          })

          return successResponse(
            result.items.map((post) => ({
              id: post.id,
              title: post.title,
              voteCount: post.voteCount,
              statusId: post.statusId,
              boardId: post.board?.id,
              createdAt: post.createdAt.toISOString(),
              hasVoted: false,
            })),
            {
              pagination: {
                cursor: result.hasMore ? String(page + 1) : null,
                hasMore: result.hasMore,
              },
            }
          )
        } catch (error) {
          return handleDomainError(error)
        }
      },
    },
  },
})
