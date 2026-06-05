/**
 * Tests for post merge service — guard conditions and core logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PostId, PrincipalId } from '@opencoven-feedback/ids'

// --- Mock tracking ---
const mockPostsFindFirst = vi.fn()
const mockPrincipalFindFirst = vi.fn()
const mockBoardsFindFirst = vi.fn()
const mockDbSelect = vi.fn()
const mockDbUpdate = vi.fn()
const mockDbExecute = vi.fn()
const createActivity = vi.fn()
const scheduleDispatch = vi.fn().mockResolvedValue(undefined)

function createUpdateChain() {
  const chain: Record<string, unknown> = {}
  chain.set = vi.fn(() => chain)
  chain.where = vi.fn().mockResolvedValue(undefined)
  return chain
}

type SelectChain = {
  from: ReturnType<typeof vi.fn>
  innerJoin: ReturnType<typeof vi.fn>
  where: ReturnType<typeof vi.fn>
  orderBy: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
}

function createSelectChain(result: unknown[]): SelectChain {
  const chain = {} as SelectChain
  chain.from = vi.fn(() => chain)
  chain.innerJoin = vi.fn(() => chain)
  chain.where = vi.fn(() => chain)
  chain.orderBy = vi.fn().mockResolvedValue(result)
  chain.limit = vi.fn().mockResolvedValue(result)
  return chain
}

vi.mock('@/lib/server/db', async () => {
  const { sql: realSql } = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm')

  return {
    db: {
      query: {
        posts: { findFirst: (...args: unknown[]) => mockPostsFindFirst(...args) },
        principal: { findFirst: (...args: unknown[]) => mockPrincipalFindFirst(...args) },
        boards: { findFirst: (...args: unknown[]) => mockBoardsFindFirst(...args) },
      },
      select: (...args: unknown[]) => mockDbSelect(...args),
      update: (..._args: unknown[]) => {
        mockDbUpdate(..._args)
        return createUpdateChain()
      },
      execute: (...args: unknown[]) => mockDbExecute(...args),
    },
    posts: { id: 'post_id', canonicalPostId: 'canonical_post_id' },
    votes: { principalId: 'principal_id', postId: 'post_id' },
    boards: { id: 'board_id', slug: 'board_slug', isPublic: 'is_public' },
    principal: { id: 'principal_id', displayName: 'display_name' },
    eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
    and: vi.fn((...args) => ({ op: 'and', args })),
    isNull: vi.fn((value) => ({ op: 'isNull', value })),
    sql: realSql,
  }
})

vi.mock('@/lib/server/domains/activity/activity.service', () => ({
  createActivity: (...args: unknown[]) => createActivity(...args),
}))

vi.mock('@/lib/server/events/scheduler', () => ({
  scheduleDispatch: (...args: unknown[]) => scheduleDispatch(...args),
}))

vi.mock('@/lib/server/events/dispatch', () => ({
  dispatchPostMerged: vi.fn(),
  dispatchPostUnmerged: vi.fn(),
  buildEventActor: vi.fn((actor) => actor),
}))

vi.mock('@/lib/server/utils', () => ({
  getExecuteRows: vi.fn((result: unknown) => result as unknown[]),
}))

vi.mock('./post.query', () => ({
  getPostWithDetails: vi.fn(),
  getCommentsWithReplies: vi.fn(),
}))

vi.mock('./post.public.utils', () => ({
  hasUserVoted: vi.fn(),
}))

vi.mock('@opencoven-feedback/ids', async (importOriginal) => {
  const original = await importOriginal<typeof import('@opencoven-feedback/ids')>()
  return {
    ...original,
    toUuid: vi.fn((id: string) => id),
  }
})

// Import after mocks
const { mergePost, unmergePost, getPublicMergedPosts, getPublicPostMergeInfo } =
  await import('../post.merge')

const POST_A = 'post_aaa' as PostId
const POST_B = 'post_bbb' as PostId
const ACTOR = 'principal_admin' as PrincipalId

function mockPost(overrides: Record<string, unknown> = {}) {
  return {
    id: POST_A,
    title: 'Test Post',
    voteCount: 5,
    canonicalPostId: null,
    deletedAt: null,
    principalId: 'principal_author',
    boardId: 'board_mock',
    ...overrides,
  }
}

describe('mergePost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: both posts exist and are valid
    mockPostsFindFirst.mockImplementation(() => {
      return Promise.resolve(mockPost())
    })
    mockPrincipalFindFirst.mockResolvedValue({ displayName: 'Author' })
    mockBoardsFindFirst.mockResolvedValue({ id: 'board_mock', slug: 'feedback', isPublic: true })
    // Default: vote count recalculation returns 5
    mockDbExecute.mockResolvedValue([{ unique_voters: 5 }])
  })

  it('throws ValidationError on self-merge', async () => {
    await expect(mergePost(POST_A, POST_A, ACTOR)).rejects.toThrow(
      'A post cannot be merged into itself'
    )
  })

  it('throws NotFoundError when duplicate post not found', async () => {
    mockPostsFindFirst
      .mockResolvedValueOnce(null) // duplicate not found
      .mockResolvedValueOnce(mockPost({ id: POST_B })) // canonical found

    await expect(mergePost(POST_A, POST_B, ACTOR)).rejects.toThrow(/not found/)
  })

  it('throws NotFoundError when canonical post not found', async () => {
    mockPostsFindFirst
      .mockResolvedValueOnce(mockPost({ id: POST_A })) // duplicate found
      .mockResolvedValueOnce(null) // canonical not found

    await expect(mergePost(POST_A, POST_B, ACTOR)).rejects.toThrow(/not found/)
  })

  it('throws ConflictError when duplicate is already merged', async () => {
    mockPostsFindFirst
      .mockResolvedValueOnce(mockPost({ id: POST_A, canonicalPostId: 'post_other' }))
      .mockResolvedValueOnce(mockPost({ id: POST_B }))

    await expect(mergePost(POST_A, POST_B, ACTOR)).rejects.toThrow(/already merged/)
  })

  it('throws ValidationError when canonical is itself merged', async () => {
    mockPostsFindFirst
      .mockResolvedValueOnce(mockPost({ id: POST_A }))
      .mockResolvedValueOnce(mockPost({ id: POST_B, canonicalPostId: 'post_other' }))

    await expect(mergePost(POST_A, POST_B, ACTOR)).rejects.toThrow(
      /Cannot merge into a post that is itself merged/
    )
  })

  it('throws ValidationError when boards have different public visibility', async () => {
    mockPostsFindFirst
      .mockResolvedValueOnce(mockPost({ id: POST_A, boardId: 'private_board' }))
      .mockResolvedValueOnce(mockPost({ id: POST_B, boardId: 'public_board' }))
    mockBoardsFindFirst
      .mockResolvedValueOnce({ slug: 'internal', isPublic: false })
      .mockResolvedValueOnce({ slug: 'feedback', isPublic: true })

    await expect(mergePost(POST_A, POST_B, ACTOR)).rejects.toThrow(/same public visibility/)
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('records activity on both posts after successful merge', async () => {
    mockPostsFindFirst
      .mockResolvedValueOnce(mockPost({ id: POST_A, title: 'Duplicate' }))
      .mockResolvedValueOnce(mockPost({ id: POST_B, title: 'Canonical' }))

    await mergePost(POST_A, POST_B, ACTOR)

    expect(createActivity).toHaveBeenCalledTimes(2)
    // First call: activity on canonical post
    expect(createActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: POST_B,
        type: 'post.merged_in',
      })
    )
    // Second call: activity on duplicate post
    expect(createActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: POST_A,
        type: 'post.merged_away',
      })
    )
  })

  it('schedules a merge recheck after merge', async () => {
    mockPostsFindFirst
      .mockResolvedValueOnce(mockPost({ id: POST_A }))
      .mockResolvedValueOnce(mockPost({ id: POST_B }))

    await mergePost(POST_A, POST_B, ACTOR)

    expect(scheduleDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        handler: '__post_merge_recheck__',
        payload: { postId: POST_B },
      })
    )
  })

  it('returns merge result with vote count', async () => {
    mockPostsFindFirst
      .mockResolvedValueOnce(mockPost({ id: POST_A }))
      .mockResolvedValueOnce(mockPost({ id: POST_B }))
    mockDbExecute.mockResolvedValue([{ unique_voters: 8 }])

    const result = await mergePost(POST_A, POST_B, ACTOR)

    expect(result).toEqual({
      canonicalPost: { id: POST_B, voteCount: 8 },
      duplicatePost: { id: POST_A },
    })
  })

  it('dispatches post.merged event with board data', async () => {
    const { dispatchPostMerged } = await import('@/lib/server/events/dispatch')
    mockPostsFindFirst
      .mockResolvedValueOnce(mockPost({ id: POST_A, title: 'Dup', boardId: 'board_a' }))
      .mockResolvedValueOnce(mockPost({ id: POST_B, title: 'Canon', boardId: 'board_b' }))
    mockBoardsFindFirst
      .mockResolvedValueOnce({ slug: 'board-a', isPublic: true })
      .mockResolvedValueOnce({ slug: 'board-b', isPublic: true })

    await mergePost(POST_A, POST_B, ACTOR)

    expect(dispatchPostMerged).toHaveBeenCalledWith(
      expect.objectContaining({ principalId: ACTOR }),
      expect.objectContaining({
        id: POST_A,
        title: 'Dup',
        boardId: 'board_a',
        boardSlug: 'board-a',
      }),
      expect.objectContaining({
        id: POST_B,
        title: 'Canon',
        boardId: 'board_b',
        boardSlug: 'board-b',
      })
    )
  })
})

describe('public merge visibility helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('filters merged-post summaries through public-board visibility', async () => {
    const mergedAt = new Date('2026-06-06T12:00:00.000Z')
    const selectChain = createSelectChain([
      {
        id: POST_A,
        title: 'Public duplicate',
        voteCount: 4,
        authorName: 'Author',
        createdAt: new Date('2026-06-05T12:00:00.000Z'),
        mergedAt,
      },
    ])
    mockDbSelect.mockReturnValueOnce(selectChain)

    const result = await getPublicMergedPosts(POST_B)

    expect(result).toEqual([
      {
        id: POST_A,
        title: 'Public duplicate',
        voteCount: 4,
        authorName: 'Author',
        createdAt: new Date('2026-06-05T12:00:00.000Z'),
        mergedAt,
      },
    ])
    expect(selectChain.innerJoin).toHaveBeenCalled()
    expect(JSON.stringify(vi.mocked(selectChain.where).mock.calls[0]?.[0])).toContain(
      '"left":"is_public","right":true'
    )
  })

  it('hides public merge info when the canonical target is not public or is deleted', async () => {
    const mergedAt = new Date('2026-06-06T12:00:00.000Z')
    mockDbSelect
      .mockReturnValueOnce(createSelectChain([{ canonicalPostId: POST_B, mergedAt }]))
      .mockReturnValueOnce(createSelectChain([]))

    await expect(getPublicPostMergeInfo(POST_A)).resolves.toBeNull()
  })

  it('returns public merge info only after both post queries pass public-board filters', async () => {
    const mergedAt = new Date('2026-06-06T12:00:00.000Z')
    const mergedPostQuery = createSelectChain([{ canonicalPostId: POST_B, mergedAt }])
    const canonicalPostQuery = createSelectChain([
      { id: POST_B, title: 'Canonical public post', boardSlug: 'feedback' },
    ])
    mockDbSelect.mockReturnValueOnce(mergedPostQuery).mockReturnValueOnce(canonicalPostQuery)

    const result = await getPublicPostMergeInfo(POST_A)

    expect(result).toEqual({
      canonicalPostId: POST_B,
      canonicalPostTitle: 'Canonical public post',
      canonicalPostBoardSlug: 'feedback',
      mergedAt,
    })
    expect(JSON.stringify(vi.mocked(mergedPostQuery.where).mock.calls[0]?.[0])).toContain(
      '"left":"is_public","right":true'
    )
    expect(JSON.stringify(vi.mocked(canonicalPostQuery.where).mock.calls[0]?.[0])).toContain(
      '"left":"is_public","right":true'
    )
  })
})

describe('unmergePost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBoardsFindFirst.mockResolvedValue({ id: 'board_mock', slug: 'feedback', isPublic: true })
    mockDbExecute.mockResolvedValue([{ unique_voters: 3 }])
  })

  it('throws NotFoundError when post not found', async () => {
    mockPostsFindFirst.mockResolvedValue(null)

    await expect(unmergePost(POST_A, ACTOR)).rejects.toThrow(/not found/)
  })

  it('throws ValidationError when post is not merged', async () => {
    mockPostsFindFirst.mockResolvedValue(mockPost({ canonicalPostId: null }))

    await expect(unmergePost(POST_A, ACTOR)).rejects.toThrow(/not currently merged/)
  })

  it('records activity on both posts after unmerge', async () => {
    mockPostsFindFirst
      .mockResolvedValueOnce(mockPost({ id: POST_A, canonicalPostId: POST_B, title: 'Dup' }))
      .mockResolvedValueOnce(mockPost({ id: POST_B, title: 'Canon' }))

    await unmergePost(POST_A, ACTOR)

    expect(createActivity).toHaveBeenCalledTimes(2)
    expect(createActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: POST_A,
        type: 'post.unmerged',
      })
    )
    expect(createActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: POST_B,
        type: 'post.unmerged',
      })
    )
  })

  it('returns unmerge result with recalculated vote count', async () => {
    mockPostsFindFirst
      .mockResolvedValueOnce(mockPost({ id: POST_A, canonicalPostId: POST_B }))
      .mockResolvedValueOnce(mockPost({ id: POST_B, title: 'Canon' }))
    mockDbExecute.mockResolvedValue([{ unique_voters: 3 }])

    const result = await unmergePost(POST_A, ACTOR)

    expect(result).toEqual({
      post: { id: POST_A },
      canonicalPost: { id: POST_B, voteCount: 3 },
    })
  })

  it('dispatches post.unmerged event with board data', async () => {
    const { dispatchPostUnmerged } = await import('@/lib/server/events/dispatch')
    mockPostsFindFirst
      .mockResolvedValueOnce(
        mockPost({ id: POST_A, canonicalPostId: POST_B, title: 'Dup', boardId: 'board_a' })
      )
      .mockResolvedValueOnce(mockPost({ id: POST_B, title: 'Canon', boardId: 'board_b' }))
    mockBoardsFindFirst
      .mockResolvedValueOnce({ slug: 'board-a', isPublic: true })
      .mockResolvedValueOnce({ slug: 'board-b', isPublic: true })

    await unmergePost(POST_A, ACTOR)

    expect(dispatchPostUnmerged).toHaveBeenCalledWith(
      expect.objectContaining({ principalId: ACTOR }),
      expect.objectContaining({ id: POST_A, boardId: 'board_a' }),
      expect.objectContaining({ id: POST_B, boardId: 'board_b' })
    )
  })
})
