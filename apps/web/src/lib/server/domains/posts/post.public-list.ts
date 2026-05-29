/**
 * Public post list query for the anonymous feed.
 *
 * Only returns posts on public boards that are not soft-deleted or merged.
 * Uses cursor-based keyset pagination (mirrors listInboxPosts in post.inbox.ts).
 */

import { db, eq, and, isNull, desc, sql, posts, boards } from '@/lib/server/db'
import { toUuid, type PostId, type BoardId, type StatusId } from '@opencoven-feedback/ids'

export interface PublicPostSummary {
  id: PostId
  title: string
  voteCount: number
  statusId: StatusId | null
  boardId: BoardId
  createdAt: string // ISO-8601
}

export interface ListPublicPostsParams {
  boardId?: BoardId
  sort?: 'newest' | 'votes'
  cursor?: string
  limit: number
}

export interface ListPublicPostsResult {
  items: PublicPostSummary[]
  cursor: string | null
  hasMore: boolean
}

export async function listPublicPosts(
  params: ListPublicPostsParams
): Promise<ListPublicPostsResult> {
  const { boardId, sort = 'newest', cursor, limit } = params

  // Base conditions: public board, not soft-deleted, not merged into another post
  const conditions = [
    eq(boards.isPublic, true),
    isNull(posts.deletedAt),
    isNull(posts.canonicalPostId),
  ]

  if (boardId) {
    conditions.push(eq(posts.boardId, boardId))
  }

  // Cursor-based keyset pagination (same approach as listInboxPosts)
  if (cursor) {
    const cursorPost = await db.query.posts.findFirst({
      where: eq(posts.id, cursor as PostId),
      columns: { id: true, createdAt: true, voteCount: true },
    })
    if (cursorPost) {
      const cursorDate = cursorPost.createdAt.toISOString()
      const cursorUuid = toUuid(cursorPost.id)
      if (sort === 'votes') {
        conditions.push(
          sql`(${posts.voteCount}, ${posts.createdAt}, ${posts.id}) < (${cursorPost.voteCount}, ${cursorDate}, ${cursorUuid}::uuid)`
        )
      } else {
        // newest (default)
        conditions.push(
          sql`(${posts.createdAt}, ${posts.id}) < (${cursorDate}, ${cursorUuid}::uuid)`
        )
      }
    }
  }

  const orderByMap = {
    newest: [desc(posts.createdAt), desc(posts.id)],
    votes: [desc(posts.voteCount), desc(posts.createdAt), desc(posts.id)],
  }

  const rawPosts = await db.query.posts.findMany({
    columns: {
      id: true,
      title: true,
      voteCount: true,
      statusId: true,
      boardId: true,
      createdAt: true,
    },
    where: and(...conditions),
    orderBy: orderByMap[sort],
    limit: limit + 1,
    with: {
      board: {
        columns: { isPublic: true },
      },
    },
  })

  const hasMore = rawPosts.length > limit
  const sliced = hasMore ? rawPosts.slice(0, limit) : rawPosts

  const items: PublicPostSummary[] = sliced.map((post) => ({
    id: post.id,
    title: post.title,
    voteCount: post.voteCount,
    statusId: post.statusId,
    boardId: post.boardId,
    createdAt: post.createdAt.toISOString(),
  }))

  const lastItem = items[items.length - 1]
  const nextCursor = hasMore && lastItem ? lastItem.id : null

  return { items, cursor: nextCursor, hasMore }
}
