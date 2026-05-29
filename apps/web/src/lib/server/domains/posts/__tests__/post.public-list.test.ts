import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardId } from '@opencoven-feedback/ids'

// ── Drizzle operator mocks ──────────────────────────────────────────────────
const mockEq = vi.fn((col, val) => ({ _tag: 'eq', col, val }))
const mockIsNull = vi.fn((col) => ({ _tag: 'isNull', col }))
const mockAnd = vi.fn((...args: unknown[]) => ({ _tag: 'and', args }))
const mockDesc = vi.fn((col) => ({ _tag: 'desc', col }))
const mockAsc = vi.fn((col) => ({ _tag: 'asc', col }))
const mockSql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
  _tag: 'sql',
  strings,
  values,
}))

// ── Schema symbol mocks ─────────────────────────────────────────────────────
const mockPosts = {
  id: Symbol('posts.id'),
  boardId: Symbol('posts.boardId'),
  title: Symbol('posts.title'),
  voteCount: Symbol('posts.voteCount'),
  statusId: Symbol('posts.statusId'),
  createdAt: Symbol('posts.createdAt'),
  deletedAt: Symbol('posts.deletedAt'),
  canonicalPostId: Symbol('posts.canonicalPostId'),
}

const mockBoards = {
  isPublic: Symbol('boards.isPublic'),
  id: Symbol('boards.id'),
  slug: Symbol('boards.slug'),
  name: Symbol('boards.name'),
}

// ── db.query mock ───────────────────────────────────────────────────────────
const mockPostsFindFirst = vi.fn()
const mockPostsFindMany = vi.fn()

vi.mock('@/lib/server/db', () => ({
  db: {
    query: {
      posts: {
        findFirst: (...args: unknown[]) => mockPostsFindFirst(...args),
        findMany: (...args: unknown[]) => mockPostsFindMany(...args),
      },
    },
  },
  eq: mockEq,
  and: mockAnd,
  isNull: mockIsNull,
  desc: mockDesc,
  asc: mockAsc,
  sql: mockSql,
  posts: mockPosts,
  boards: mockBoards,
}))

// ── helpers ─────────────────────────────────────────────────────────────────
function makePost(
  overrides: Partial<{
    id: string
    title: string
    voteCount: number
    statusId: string | null
    boardId: string
    createdAt: Date
    board: { isPublic: boolean; id: string; name: string; slug: string }
  }> = {}
) {
  return {
    id: overrides.id ?? 'post_01',
    title: overrides.title ?? 'A post',
    voteCount: overrides.voteCount ?? 3,
    statusId: overrides.statusId ?? null,
    boardId: overrides.boardId ?? 'board_01',
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00Z'),
    board: overrides.board ?? { isPublic: true, id: 'board_01', name: 'General', slug: 'general' },
  }
}

// ── tests ───────────────────────────────────────────────────────────────────
describe('listPublicPosts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPostsFindMany.mockResolvedValue([])
    mockPostsFindFirst.mockResolvedValue(null)
  })

  it('filters to public boards (eq boards.isPublic, true)', async () => {
    const { listPublicPosts } = await import('../post.public-list')
    await listPublicPosts({ limit: 10 })

    expect(mockEq).toHaveBeenCalledWith(mockBoards.isPublic, true)
  })

  it('filters out soft-deleted posts (isNull deletedAt)', async () => {
    const { listPublicPosts } = await import('../post.public-list')
    await listPublicPosts({ limit: 10 })

    expect(mockIsNull).toHaveBeenCalledWith(mockPosts.deletedAt)
  })

  it('filters out merged posts (isNull canonicalPostId)', async () => {
    const { listPublicPosts } = await import('../post.public-list')
    await listPublicPosts({ limit: 10 })

    expect(mockIsNull).toHaveBeenCalledWith(mockPosts.canonicalPostId)
  })

  it('applies boardId filter when provided', async () => {
    const { listPublicPosts } = await import('../post.public-list')
    await listPublicPosts({ boardId: 'board_01' as BoardId, limit: 10 })

    expect(mockEq).toHaveBeenCalledWith(mockPosts.boardId, 'board_01')
  })

  it('does not apply boardId filter when omitted', async () => {
    const { listPublicPosts } = await import('../post.public-list')
    await listPublicPosts({ limit: 10 })

    const boardIdCalls = mockEq.mock.calls.filter(([col]) => col === mockPosts.boardId)
    expect(boardIdCalls).toHaveLength(0)
  })

  it('orders by desc(createdAt) for sort=newest', async () => {
    const { listPublicPosts } = await import('../post.public-list')
    await listPublicPosts({ sort: 'newest', limit: 10 })

    expect(mockDesc).toHaveBeenCalledWith(mockPosts.createdAt)
  })

  it('orders by desc(voteCount) for sort=votes', async () => {
    const { listPublicPosts } = await import('../post.public-list')
    await listPublicPosts({ sort: 'votes', limit: 10 })

    expect(mockDesc).toHaveBeenCalledWith(mockPosts.voteCount)
  })

  it('defaults to newest sort when sort is omitted', async () => {
    const { listPublicPosts } = await import('../post.public-list')
    await listPublicPosts({ limit: 10 })

    expect(mockDesc).toHaveBeenCalledWith(mockPosts.createdAt)
  })

  it('maps returned rows to PublicPostSummary with ISO createdAt string', async () => {
    const post = makePost({ id: 'post_01', title: 'Hello', voteCount: 5, statusId: 'status_01' })
    mockPostsFindMany.mockResolvedValue([post])

    const { listPublicPosts } = await import('../post.public-list')
    const result = await listPublicPosts({ limit: 10 })

    expect(result.items).toHaveLength(1)
    const item = result.items[0]
    expect(item.id).toBe('post_01')
    expect(item.title).toBe('Hello')
    expect(item.voteCount).toBe(5)
    expect(item.statusId).toBe('status_01')
    expect(item.boardId).toBe('board_01')
    expect(typeof item.createdAt).toBe('string')
    expect(item.createdAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('hasMore=false and cursor=null when results <= limit', async () => {
    mockPostsFindMany.mockResolvedValue([makePost()])

    const { listPublicPosts } = await import('../post.public-list')
    const result = await listPublicPosts({ limit: 10 })

    expect(result.hasMore).toBe(false)
    expect(result.cursor).toBeNull()
  })

  it('hasMore=true and cursor=lastItemId when results > limit (limit+1 trick)', async () => {
    // limit=2, return 3 items → hasMore true, cursor = id of 2nd item
    const posts = [
      makePost({ id: 'post_01' }),
      makePost({ id: 'post_02' }),
      makePost({ id: 'post_03' }),
    ]
    mockPostsFindMany.mockResolvedValue(posts)

    const { listPublicPosts } = await import('../post.public-list')
    const result = await listPublicPosts({ limit: 2 })

    expect(result.hasMore).toBe(true)
    expect(result.items).toHaveLength(2)
    expect(result.cursor).toBe('post_02')
  })

  it('passes limit+1 to the query', async () => {
    const { listPublicPosts } = await import('../post.public-list')
    await listPublicPosts({ limit: 5 })

    const call = mockPostsFindMany.mock.calls[0][0] as { limit?: number }
    expect(call.limit).toBe(6)
  })

  it('resolves cursor to keyset condition for sort=newest', async () => {
    const validId = 'post_01kssa4ttmf68rwn8jn633yxp3'
    const cursorPost = makePost({ id: validId, createdAt: new Date('2026-03-01T00:00:00Z') })
    mockPostsFindFirst.mockResolvedValue(cursorPost)
    mockPostsFindMany.mockResolvedValue([])

    const { listPublicPosts } = await import('../post.public-list')
    await listPublicPosts({ sort: 'newest', cursor: validId, limit: 10 })

    // Should have fetched the cursor post to get its sort values
    expect(mockPostsFindFirst).toHaveBeenCalled()
    // Should have called sql`` to build the keyset condition
    expect(mockSql).toHaveBeenCalled()
  })

  it('resolves cursor to keyset condition for sort=votes', async () => {
    const validId = 'post_01kssa4ttmf68rwn8tsfp3m1e2'
    const cursorPost = makePost({
      id: validId,
      voteCount: 7,
      createdAt: new Date('2026-03-01T00:00:00Z'),
    })
    mockPostsFindFirst.mockResolvedValue(cursorPost)
    mockPostsFindMany.mockResolvedValue([])

    const { listPublicPosts } = await import('../post.public-list')
    await listPublicPosts({ sort: 'votes', cursor: validId, limit: 10 })

    expect(mockPostsFindFirst).toHaveBeenCalled()
    expect(mockSql).toHaveBeenCalled()
  })

  it('does not call findFirst when no cursor provided', async () => {
    const { listPublicPosts } = await import('../post.public-list')
    await listPublicPosts({ limit: 10 })

    expect(mockPostsFindFirst).not.toHaveBeenCalled()
  })
})
