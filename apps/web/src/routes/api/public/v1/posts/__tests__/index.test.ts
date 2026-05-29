import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardId, PostId, PrincipalId, StatusId } from '@opencoven-feedback/ids'

const mockListPublicPostFeed = vi.fn()
const mockOptionalPortalSession = vi.fn()
const mockGetAllUserVotedPostIds = vi.fn()
const mockListBoardsWithDetails = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: vi.fn(() => (opts: unknown) => ({ options: opts })),
}))
vi.mock('@/lib/server/domains/posts/post.public-list', () => ({
  listPublicPostFeed: (...args: unknown[]) => mockListPublicPostFeed(...args),
}))
vi.mock('@/lib/server/domains/api/portal-auth', () => ({
  optionalPortalSession: (...args: unknown[]) => mockOptionalPortalSession(...args),
}))
vi.mock('@/lib/server/domains/posts/post.public', () => ({
  getAllUserVotedPostIds: (...args: unknown[]) => mockGetAllUserVotedPostIds(...args),
}))
vi.mock('@/lib/server/domains/boards/board.service', () => ({
  listBoardsWithDetails: (...args: unknown[]) => mockListBoardsWithDetails(...args),
}))

import { Route } from '../index'

type RouteOpts = {
  server: { handlers: { GET: (ctx: { request: Request }) => Promise<Response> } }
}
const GET = (Route as unknown as { options: RouteOpts }).options.server.handlers.GET

const POST_ID_1 = 'post_01kqhxq697fvgat0fn8rr1r7ea' as unknown as PostId
const POST_ID_2 = 'post_01kqhxq697fvgat0fn8rr1r7eb' as unknown as PostId
const BOARD_ID = 'board_01kqhxq697fvgat0geegv834v0' as unknown as BoardId
const STATUS_ID = 'status_01kqhxq697fvgat0geegv834v1' as unknown as StatusId
const PRINCIPAL_ID = 'principal_01kqhxq697fvgat0fn8rr1r7ew' as unknown as PrincipalId

const MOCK_POSTS = [
  {
    id: POST_ID_1,
    title: 'Post One',
    voteCount: 5,
    statusId: STATUS_ID,
    boardId: BOARD_ID,
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: POST_ID_2,
    title: 'Post Two',
    voteCount: 2,
    statusId: null,
    boardId: BOARD_ID,
    createdAt: '2024-01-02T00:00:00.000Z',
  },
]

function makeRequest(url = 'http://test/api/public/v1/posts'): Request {
  return new Request(url)
}

function makeAuthedRequest(url = 'http://test/api/public/v1/posts', token = 'test-token'): Request {
  return new Request(url, { headers: { authorization: `Bearer ${token}` } })
}

describe('GET /api/public/v1/posts', () => {
  beforeEach(() => {
    mockListPublicPostFeed.mockReset()
    mockOptionalPortalSession.mockReset()
    mockGetAllUserVotedPostIds.mockReset()

    mockListPublicPostFeed.mockResolvedValue({
      items: MOCK_POSTS,
      cursor: null,
      hasMore: false,
    })
    mockOptionalPortalSession.mockResolvedValue(null)
  })

  it('authenticated session: hasVoted true for voted post ids', async () => {
    mockOptionalPortalSession.mockResolvedValue({
      user: { id: 'user_01', email: 'test@test.com', name: 'Test', image: null },
      principal: { id: PRINCIPAL_ID, role: 'user', type: 'user' },
    })
    mockGetAllUserVotedPostIds.mockResolvedValue(new Set([POST_ID_1]))

    const res = await GET({ request: makeAuthedRequest() })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toHaveLength(2)
    const post1 = json.data.find((p: { id: string }) => p.id === POST_ID_1)
    const post2 = json.data.find((p: { id: string }) => p.id === POST_ID_2)
    expect(post1.hasVoted).toBe(true)
    expect(post2.hasVoted).toBe(false)
    expect(mockGetAllUserVotedPostIds).toHaveBeenCalledWith(PRINCIPAL_ID)
  })

  it('anonymous (optionalPortalSession → null): all hasVoted false', async () => {
    mockOptionalPortalSession.mockResolvedValue(null)

    const res = await GET({ request: makeRequest() })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toHaveLength(2)
    for (const post of json.data) {
      expect(post.hasVoted).toBe(false)
    }
    expect(mockGetAllUserVotedPostIds).not.toHaveBeenCalled()
  })

  it('pagination meta passes through (hasMore, cursor)', async () => {
    mockListPublicPostFeed.mockResolvedValue({
      items: MOCK_POSTS,
      cursor: POST_ID_2,
      hasMore: true,
    })

    const res = await GET({ request: makeRequest() })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.meta.pagination.hasMore).toBe(true)
    expect(json.meta.pagination.cursor).toBe(POST_ID_2)
  })

  it('passes query params to listPublicPostFeed', async () => {
    const url =
      'http://test/api/public/v1/posts?limit=5&sort=votes&boardId=board_01kqhxq697fvgat0geegv834v0&cursor=post_cursor'
    const res = await GET({ request: makeRequest(url) })
    expect(res.status).toBe(200)
    expect(mockListPublicPostFeed).toHaveBeenCalledWith({
      limit: 5,
      sort: 'votes',
      boardId: 'board_01kqhxq697fvgat0geegv834v0',
      cursor: 'post_cursor',
    })
  })

  it('clamps limit to 100 maximum', async () => {
    const url = 'http://test/api/public/v1/posts?limit=999'
    await GET({ request: makeRequest(url) })
    expect(mockListPublicPostFeed).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }))
  })

  it('clamps limit to 1 minimum', async () => {
    const url = 'http://test/api/public/v1/posts?limit=0'
    await GET({ request: makeRequest(url) })
    expect(mockListPublicPostFeed).toHaveBeenCalledWith(expect.objectContaining({ limit: 1 }))
  })

  it('defaults limit to 20 and sort to newest', async () => {
    await GET({ request: makeRequest() })
    expect(mockListPublicPostFeed).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, sort: 'newest' })
    )
  })

  it('delegates errors to handleDomainError', async () => {
    mockListPublicPostFeed.mockRejectedValue({ code: 'NOT_FOUND', message: 'not found' })
    const res = await GET({ request: makeRequest() })
    expect(res.status).toBe(404)
  })
})

// ---- Boards route tests ----

import { Route as BoardsRoute } from '../../boards/index'

type BoardsRouteOpts = {
  server: { handlers: { GET: () => Promise<Response> } }
}
const BoardsGET = (BoardsRoute as unknown as { options: BoardsRouteOpts }).options.server.handlers
  .GET

describe('GET /api/public/v1/boards', () => {
  beforeEach(() => {
    mockListBoardsWithDetails.mockReset()
  })

  it('returns only public boards', async () => {
    mockListBoardsWithDetails.mockResolvedValue([
      {
        id: BOARD_ID,
        name: 'Public Board',
        slug: 'public-board',
        description: 'A public board',
        isPublic: true,
        postCount: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        settings: {},
      },
      {
        id: 'board_private' as unknown as BoardId,
        name: 'Private Board',
        slug: 'private-board',
        description: null,
        isPublic: false,
        postCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        settings: {},
      },
    ])

    const res = await BoardsGET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toHaveLength(1)
    expect(json.data[0].name).toBe('Public Board')
    expect(json.data[0]).toMatchObject({
      id: BOARD_ID,
      name: 'Public Board',
      slug: 'public-board',
      description: 'A public board',
      postCount: 3,
    })
  })

  it('returns empty array when no public boards', async () => {
    mockListBoardsWithDetails.mockResolvedValue([
      {
        id: 'board_private' as unknown as BoardId,
        name: 'Private',
        slug: 'private',
        description: null,
        isPublic: false,
        postCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        settings: {},
      },
    ])

    const res = await BoardsGET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toHaveLength(0)
  })

  it('delegates errors to handleDomainError', async () => {
    mockListBoardsWithDetails.mockRejectedValue({ code: 'NOT_FOUND', message: 'not found' })
    const res = await BoardsGET()
    expect(res.status).toBe(404)
  })
})
