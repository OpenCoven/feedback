import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardId } from '@opencoven-feedback/ids'

// ── Drizzle operator mocks ──────────────────────────────────────────────────
const mockEq = vi.fn((col, val) => ({ _tag: 'eq', col, val }))
const mockIsNull = vi.fn((col) => ({ _tag: 'isNull', col }))
const mockAnd = vi.fn((...args: unknown[]) => ({ _tag: 'and', args }))
const mockDesc = vi.fn((col) => ({ _tag: 'desc', col }))
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
  deletedAt: Symbol('boards.deletedAt'),
}

// ── Core query builder chain mock ──────────────────────────────────────────
// db.select({}).from(posts).innerJoin(boards,...).where(...).orderBy(...).limit(N)
const mockLimit = vi.fn().mockResolvedValue([])
const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit })
const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere })
const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin })
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom })

// ── db.query mock (used only for cursor resolution) ─────────────────────────
const mockPostsFindFirst = vi.fn()

vi.mock('@/lib/server/db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    query: {
      posts: {
        findFirst: (...args: unknown[]) => mockPostsFindFirst(...args),
      },
    },
  },
  eq: mockEq,
  and: mockAnd,
  isNull: mockIsNull,
  desc: mockDesc,
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
  }> = {}
) {
  return {
    id: overrides.id ?? 'post_01',
    title: overrides.title ?? 'A post',
    voteCount: overrides.voteCount ?? 3,
    statusId: overrides.statusId ?? null,
    boardId: overrides.boardId ?? 'board_01',
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00Z'),
  }
}

// ── tests ───────────────────────────────────────────────────────────────────
describe('listPublicPostFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLimit.mockResolvedValue([])
    mockOrderBy.mockReturnValue({ limit: mockLimit })
    mockWhere.mockReturnValue({ orderBy: mockOrderBy })
    mockInnerJoin.mockReturnValue({ where: mockWhere })
    mockFrom.mockReturnValue({ innerJoin: mockInnerJoin })
    mockSelect.mockReturnValue({ from: mockFrom })
    mockPostsFindFirst.mockResolvedValue(null)
  })

  it('uses innerJoin(boards, eq(posts.boardId, boards.id))', async () => {
    const { listPublicPostFeed } = await import('../post.public-list')
    await listPublicPostFeed({ limit: 10 })

    expect(mockInnerJoin).toHaveBeenCalledWith(mockBoards, expect.objectContaining({ _tag: 'eq' }))
    // The join condition must be eq(posts.boardId, boards.id)
    expect(mockEq).toHaveBeenCalledWith(mockPosts.boardId, mockBoards.id)
  })

  it('filters to public boards (eq boards.isPublic, true)', async () => {
    const { listPublicPostFeed } = await import('../post.public-list')
    await listPublicPostFeed({ limit: 10 })

    expect(mockEq).toHaveBeenCalledWith(mockBoards.isPublic, true)
  })

  it('filters out soft-deleted boards (isNull boards.deletedAt)', async () => {
    const { listPublicPostFeed } = await import('../post.public-list')
    await listPublicPostFeed({ limit: 10 })

    expect(mockIsNull).toHaveBeenCalledWith(mockBoards.deletedAt)
  })

  it('filters out soft-deleted posts (isNull posts.deletedAt)', async () => {
    const { listPublicPostFeed } = await import('../post.public-list')
    await listPublicPostFeed({ limit: 10 })

    expect(mockIsNull).toHaveBeenCalledWith(mockPosts.deletedAt)
  })

  it('filters out merged posts (isNull canonicalPostId)', async () => {
    const { listPublicPostFeed } = await import('../post.public-list')
    await listPublicPostFeed({ limit: 10 })

    expect(mockIsNull).toHaveBeenCalledWith(mockPosts.canonicalPostId)
  })

  it('applies boardId filter when provided', async () => {
    const { listPublicPostFeed } = await import('../post.public-list')
    await listPublicPostFeed({ boardId: 'board_01' as BoardId, limit: 10 })

    expect(mockEq).toHaveBeenCalledWith(mockPosts.boardId, 'board_01')
  })

  it('does not apply boardId filter when omitted', async () => {
    const { listPublicPostFeed } = await import('../post.public-list')
    await listPublicPostFeed({ limit: 10 })

    const boardIdCalls = mockEq.mock.calls.filter(([col]) => col === mockPosts.boardId)
    // Only the join condition uses posts.boardId; the filter boardId eq must not appear
    const boardIdFilterCalls = boardIdCalls.filter(([, val]) => val !== mockBoards.id)
    expect(boardIdFilterCalls).toHaveLength(0)
  })

  it('orders by desc(createdAt) for sort=newest', async () => {
    const { listPublicPostFeed } = await import('../post.public-list')
    await listPublicPostFeed({ sort: 'newest', limit: 10 })

    expect(mockDesc).toHaveBeenCalledWith(mockPosts.createdAt)
  })

  it('orders by desc(voteCount) for sort=votes', async () => {
    const { listPublicPostFeed } = await import('../post.public-list')
    await listPublicPostFeed({ sort: 'votes', limit: 10 })

    expect(mockDesc).toHaveBeenCalledWith(mockPosts.voteCount)
  })

  it('defaults to newest sort when sort is omitted', async () => {
    const { listPublicPostFeed } = await import('../post.public-list')
    await listPublicPostFeed({ limit: 10 })

    expect(mockDesc).toHaveBeenCalledWith(mockPosts.createdAt)
  })

  it('maps returned rows to PublicPostFeedSummary with ISO createdAt string', async () => {
    const post = makePost({ id: 'post_01', title: 'Hello', voteCount: 5, statusId: 'status_01' })
    mockLimit.mockResolvedValue([post])

    const { listPublicPostFeed } = await import('../post.public-list')
    const result = await listPublicPostFeed({ limit: 10 })

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
    mockLimit.mockResolvedValue([makePost()])

    const { listPublicPostFeed } = await import('../post.public-list')
    const result = await listPublicPostFeed({ limit: 10 })

    expect(result.hasMore).toBe(false)
    expect(result.cursor).toBeNull()
  })

  it('hasMore=true and cursor=lastItemId when results > limit (limit+1 trick)', async () => {
    // limit=2, return 3 items → hasMore true, cursor = id of 2nd item
    const fakePosts = [
      makePost({ id: 'post_01' }),
      makePost({ id: 'post_02' }),
      makePost({ id: 'post_03' }),
    ]
    mockLimit.mockResolvedValue(fakePosts)

    const { listPublicPostFeed } = await import('../post.public-list')
    const result = await listPublicPostFeed({ limit: 2 })

    expect(result.hasMore).toBe(true)
    expect(result.items).toHaveLength(2)
    expect(result.cursor).toBe('post_02')
  })

  it('passes limit+1 to the query', async () => {
    const { listPublicPostFeed } = await import('../post.public-list')
    await listPublicPostFeed({ limit: 5 })

    expect(mockLimit).toHaveBeenCalledWith(6)
  })

  it('resolves cursor to keyset condition for sort=newest', async () => {
    const validId = 'post_01kssa4ttmf68rwn8jn633yxp3'
    const cursorPost = makePost({ id: validId, createdAt: new Date('2026-03-01T00:00:00Z') })
    mockPostsFindFirst.mockResolvedValue(cursorPost)
    mockLimit.mockResolvedValue([])

    const { listPublicPostFeed } = await import('../post.public-list')
    await listPublicPostFeed({ sort: 'newest', cursor: validId, limit: 10 })

    expect(mockPostsFindFirst).toHaveBeenCalled()
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
    mockLimit.mockResolvedValue([])

    const { listPublicPostFeed } = await import('../post.public-list')
    await listPublicPostFeed({ sort: 'votes', cursor: validId, limit: 10 })

    expect(mockPostsFindFirst).toHaveBeenCalled()
    expect(mockSql).toHaveBeenCalled()
  })

  it('does not call findFirst when no cursor provided', async () => {
    const { listPublicPostFeed } = await import('../post.public-list')
    await listPublicPostFeed({ limit: 10 })

    expect(mockPostsFindFirst).not.toHaveBeenCalled()
  })

  // I1 — cursor anchor query must include isNull(posts.deletedAt)
  it('cursor anchor query includes isNull(posts.deletedAt) guard (I1)', async () => {
    // Reuse a valid TypeID from sibling tests so toUuid() does not throw
    const validId = 'post_01kssa4ttmf68rwn8jn633yxp3'
    const cursorPost = makePost({ id: validId, createdAt: new Date('2026-03-01T00:00:00Z') })
    mockPostsFindFirst.mockResolvedValue(cursorPost)
    mockLimit.mockResolvedValue([])

    const { listPublicPostFeed } = await import('../post.public-list')
    await listPublicPostFeed({ sort: 'newest', cursor: validId, limit: 10 })

    // The cursor findFirst call must filter by isNull(posts.deletedAt)
    expect(mockPostsFindFirst).toHaveBeenCalled()
    const findFirstArg = mockPostsFindFirst.mock.calls[0][0]
    // where should be an and(...) combining eq(posts.id, ...) and isNull(posts.deletedAt)
    expect(findFirstArg.where).toMatchObject({ _tag: 'and' })
    const andArgs = findFirstArg.where.args as unknown[]
    const hasDeletedAtGuard = andArgs.some(
      (a) =>
        typeof a === 'object' &&
        a !== null &&
        '_tag' in a &&
        (a as { _tag: string })._tag === 'isNull'
    )
    expect(hasDeletedAtGuard).toBe(true)
    expect(mockIsNull).toHaveBeenCalledWith(mockPosts.deletedAt)
  })
})
