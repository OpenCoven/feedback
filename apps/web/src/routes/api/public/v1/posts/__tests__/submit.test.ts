import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardId, PostId, PrincipalId } from '@opencoven-feedback/ids'
import { UnauthorizedError } from '@/lib/shared/errors'

// ---- mocks ----------------------------------------------------------------

const mockRequirePortalSession = vi.fn()
const mockCreatePost = vi.fn()
const mockGetBoardById = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: vi.fn(() => (opts: unknown) => ({ options: opts })),
}))
vi.mock('@/lib/server/domains/api/portal-auth', () => ({
  optionalPortalSession: vi.fn().mockResolvedValue(null),
  requirePortalSession: (...args: unknown[]) => mockRequirePortalSession(...args),
}))
vi.mock('@/lib/server/domains/posts/post.service', () => ({
  createPost: (...args: unknown[]) => mockCreatePost(...args),
}))
vi.mock('@/lib/server/domains/boards/board.service', () => ({
  getBoardById: (...args: unknown[]) => mockGetBoardById(...args),
  // keep other exports harmless
  listBoardsWithDetails: vi.fn().mockResolvedValue([]),
}))
// The route also dynamic-imports post.public-list; mock it to prevent DB hits
vi.mock('@/lib/server/domains/posts/post.public-list', () => ({
  listPublicPostFeed: vi.fn().mockResolvedValue({ items: [], cursor: null, hasMore: false }),
}))
vi.mock('@/lib/server/domains/posts/post.public', () => ({
  getAllUserVotedPostIds: vi.fn().mockResolvedValue(new Set()),
}))

// ---- import route ---------------------------------------------------------

import { Route } from '../index'

type RouteOpts = {
  server: {
    handlers: {
      GET: (ctx: { request: Request }) => Promise<Response>
      POST: (ctx: { request: Request }) => Promise<Response>
    }
  }
}

const POST = (Route as unknown as { options: RouteOpts }).options.server.handlers.POST

// ---- fixtures -------------------------------------------------------------

const BOARD_ID = 'board_01kqhxq697fvgat0geegv834v0' as unknown as BoardId
const PRINCIPAL_ID = 'principal_01kqhxq697fvgat0fn8rr1r7ew' as unknown as PrincipalId
const POST_ID = 'post_01kqhxq697fvgat0fn8rr1r7ea' as unknown as PostId

const MOCK_SESSION = {
  user: { id: 'user_01', email: 'alice@example.com', name: 'Alice', image: null },
  principal: { id: PRINCIPAL_ID, role: 'user', type: 'user' },
}

const PUBLIC_BOARD = {
  id: BOARD_ID,
  name: 'Public Board',
  slug: 'public-board',
  isPublic: true,
  deletedAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

const CREATED_POST = {
  id: POST_ID,
  title: 'My Feature Request',
  content: 'Details here',
  boardId: BOARD_ID,
  createdAt: new Date('2024-06-01T12:00:00.000Z'),
  updatedAt: new Date('2024-06-01T12:00:00.000Z'),
  voteCount: 0,
  statusId: null,
}

function makePostRequest(body: unknown, token = 'valid-token'): Request {
  return new Request('http://test/api/public/v1/posts', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
}

// ---- tests ----------------------------------------------------------------

describe('POST /api/public/v1/posts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePortalSession.mockResolvedValue(MOCK_SESSION)
    mockGetBoardById.mockResolvedValue(PUBLIC_BOARD)
    mockCreatePost.mockResolvedValue(CREATED_POST)
  })

  it('(a) anonymous request → 401 before any DB work', async () => {
    mockRequirePortalSession.mockRejectedValue(new UnauthorizedError('Authentication required.'))

    const req = new Request('http://test/api/public/v1/posts', { method: 'POST' })
    const res = await POST({ request: req })

    expect(res.status).toBe(401)
    expect(mockCreatePost).not.toHaveBeenCalled()
    expect(mockGetBoardById).not.toHaveBeenCalled()
  })

  it('(b) signed-in + valid body + public board → 201, createPost called with session principalId', async () => {
    const res = await POST({
      request: makePostRequest({
        boardId: BOARD_ID,
        title: 'My Feature Request',
        content: 'Details here',
      }),
    })

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.data).toMatchObject({
      id: POST_ID,
      title: 'My Feature Request',
      boardId: BOARD_ID,
    })
    expect(typeof json.data.createdAt).toBe('string')

    // createPost must be called with the session's principalId as authorPrincipalId
    expect(mockCreatePost).toHaveBeenCalledOnce()
    const [, authorArg] = mockCreatePost.mock.calls[0]
    expect(authorArg.principalId).toBe(PRINCIPAL_ID)
  })

  it('(b2) content defaults to empty string when omitted', async () => {
    await POST({
      request: makePostRequest({ boardId: BOARD_ID, title: 'No content' }),
    })

    expect(mockCreatePost).toHaveBeenCalledOnce()
    const [inputArg] = mockCreatePost.mock.calls[0]
    expect(inputArg.content).toBe('')
  })

  it('(c) invalid body — empty title → 400, createPost not called', async () => {
    const res = await POST({
      request: makePostRequest({ boardId: BOARD_ID, title: '' }),
    })

    expect(res.status).toBe(400)
    expect(mockCreatePost).not.toHaveBeenCalled()
  })

  it('(c2) invalid body — missing boardId → 400', async () => {
    const res = await POST({
      request: makePostRequest({ title: 'Hello' }),
    })

    expect(res.status).toBe(400)
    expect(mockCreatePost).not.toHaveBeenCalled()
  })

  it('(c3) invalid body — title over 200 chars → 400', async () => {
    const res = await POST({
      request: makePostRequest({ boardId: BOARD_ID, title: 'x'.repeat(201) }),
    })

    expect(res.status).toBe(400)
    expect(mockCreatePost).not.toHaveBeenCalled()
  })

  it('(d) board not found (getBoardById throws NotFoundError) → 404, createPost not called', async () => {
    const { NotFoundError } = await import('@/lib/shared/errors')
    mockGetBoardById.mockRejectedValue(new NotFoundError('BOARD_NOT_FOUND', 'Board not found'))

    const res = await POST({
      request: makePostRequest({ boardId: BOARD_ID, title: 'Hello' }),
    })

    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error.message).toBe('Board not found')
    expect(mockCreatePost).not.toHaveBeenCalled()
  })

  it('(d2) board exists but is not public → 404 (same as missing board), createPost not called', async () => {
    mockGetBoardById.mockResolvedValue({ ...PUBLIC_BOARD, isPublic: false })

    const res = await POST({
      request: makePostRequest({ boardId: BOARD_ID, title: 'Hello' }),
    })

    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error.message).toBe('Board not found')
    expect(mockCreatePost).not.toHaveBeenCalled()
  })

  it('(e) client-supplied authorPrincipalId in body is ignored — session principal is used', async () => {
    const ATTACKER_PRINCIPAL = 'principal_attacker' as unknown as PrincipalId

    const res = await POST({
      request: makePostRequest({
        boardId: BOARD_ID,
        title: 'Injected post',
        content: 'Trying to set author',
        authorPrincipalId: ATTACKER_PRINCIPAL,
        author: ATTACKER_PRINCIPAL,
        principalId: ATTACKER_PRINCIPAL,
      }),
    })

    expect(res.status).toBe(201)
    expect(mockCreatePost).toHaveBeenCalledOnce()
    const [, authorArg] = mockCreatePost.mock.calls[0]
    expect(authorArg.principalId).toBe(PRINCIPAL_ID)
    expect(authorArg.principalId).not.toBe(ATTACKER_PRINCIPAL)
  })

  it('requirePortalSession is the very first async call (called before board lookup)', async () => {
    // We verify ordering by having requirePortalSession reject; board + createPost must not run
    mockRequirePortalSession.mockRejectedValue(new UnauthorizedError('Authentication required.'))

    await POST({ request: makePostRequest({ boardId: BOARD_ID, title: 'Hello' }) })

    expect(mockRequirePortalSession).toHaveBeenCalledOnce()
    expect(mockGetBoardById).not.toHaveBeenCalled()
    expect(mockCreatePost).not.toHaveBeenCalled()
  })
})
