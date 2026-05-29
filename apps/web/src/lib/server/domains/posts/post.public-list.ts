/**
 * Public post feed query for the anonymous feed (cursor-keyset paginated).
 *
 * Uses the core query builder with an explicit INNER JOIN on boards so that
 * the boards.isPublic / boards.deletedAt filters are applied correctly.
 * The relational API (db.query.*) re-aliases joined columns to the outer
 * table, which would silently drop or misapply cross-table WHERE conditions.
 */

import { db, eq, and, isNull, desc, sql, posts, boards } from '@/lib/server/db'
import { toUuid, type PostId, type BoardId, type StatusId } from '@opencoven-feedback/ids'

export interface PublicPostFeedSummary {
  id: PostId
  title: string
  voteCount: number
  statusId: StatusId | null
  boardId: BoardId
  createdAt: string // ISO-8601
}

export interface ListPublicPostFeedParams {
  boardId?: BoardId
  sort?: 'newest' | 'votes'
  cursor?: string
  limit: number
}

export interface ListPublicPostFeedResult {
  items: PublicPostFeedSummary[]
  cursor: string | null
  hasMore: boolean
}

export async function listPublicPostFeed(
  params: ListPublicPostFeedParams
): Promise<ListPublicPostFeedResult> {
  const { boardId, sort = 'newest', cursor, limit } = params

  // Base conditions: public board, board not soft-deleted, post not soft-deleted, not merged
  const conditions = [
    eq(boards.isPublic, true),
    isNull(boards.deletedAt),
    isNull(posts.deletedAt),
    isNull(posts.canonicalPostId),
  ]

  if (boardId) {
    conditions.push(eq(posts.boardId, boardId))
  }

  // Cursor-based keyset pagination
  if (cursor) {
    const cursorPost = await db.query.posts.findFirst({
      where: and(eq(posts.id, cursor as PostId), isNull(posts.deletedAt)),
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

  const rawPosts = await db
    .select({
      id: posts.id,
      title: posts.title,
      voteCount: posts.voteCount,
      statusId: posts.statusId,
      boardId: posts.boardId,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .innerJoin(boards, eq(posts.boardId, boards.id))
    .where(and(...conditions))
    .orderBy(...orderByMap[sort])
    .limit(limit + 1)

  const hasMore = rawPosts.length > limit
  const sliced = hasMore ? rawPosts.slice(0, limit) : rawPosts

  const items: PublicPostFeedSummary[] = sliced.map((post) => ({
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
