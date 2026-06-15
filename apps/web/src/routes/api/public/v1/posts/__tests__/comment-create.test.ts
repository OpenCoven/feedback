import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommentId, PostId, PrincipalId } from '@opencoven-feedback/ids'
import { UnauthorizedError } from '@/lib/shared/errors'

// ---- mocks ----------------------------------------------------------------

const mockRequirePortalSession = vi.fn()
const mockCreateComment = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: vi.fn(() => (opts: unknown) => ({ options: opts })),
}))
vi.mock('@/lib/server/domains/api/portal-auth', () => ({
  requirePortalSession: (...args: unknown[]) => mockRequirePortalSession(...args),
}))
vi.mock('@/lib/server/domains/comments/comment.service', () => ({
  createComment: (...args: unknown[]) => mockCreateComment(...args),
}))
vi.mock('@/lib/server/domains/api/validation', () => ({
  parseTypeId: <T extends string>(value: string) => value as T,
  parseOptionalTypeId: <T extends string>(value: string | null | undefined) =>
    value ? (value as T) : undefined,
}))

// ---- import route ---------------------------------------------------------

import { Route } from '../$postId.comments'

type RouteOpts = {
  server: {
    handlers: {
      GET: (ctx: { request: Request; params: { postId: string } }) => Promise<Response>
      POST: (ctx: { request: Request; params: { postId: string } }) => Promise<Response>
    }
  }
}

const POST = (Route as unknown as { options: RouteOpts }).options.server.handlers.POST

// ---- fixtures -------------------------------------------------------------

const POST_ID = 'post_01kqhxq697fvgat0fn8rr1r7ea' as unknown as PostId
const COMMENT_ID = 'comment_01kqhxq697fvgat0fn8rr1r7eb' as unknown as CommentId
const PRINCIPAL_ID = 'principal_01kqhxq697fvgat0fn8rr1r7ew' as unknown as PrincipalId

const MOCK_SESSION = {
  user: { id: 'user_01', email: 'alice@example.com', name: 'Alice', image: null },
  principal: { id: PRINCIPAL_ID, role: 'user', type: 'user' },
}

const CREATED_COMMENT = {
  comment: {
    id: COMMENT_ID,
    postId: POST_ID,
    parentId: null,
    content: 'This is a comment',
    principalId: PRINCIPAL_ID,
    isTeamMember: false,
    isPrivate: false,
    createdAt: new Date('2024-06-01T12:00:00.000Z'),
  },
  post: { id: POST_ID, title: 'Some Post', boardSlug: 'feedback' },
}

function makePostRequest(body: unknown, token = 'valid-token'): Request {
  return new Request(`http://test/api/public/v1/posts/${POST_ID}/comments`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
}

// ---- tests ----------------------------------------------------------------

describe('POST /api/public/v1/posts/:postId/comments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePortalSession.mockResolvedValue(MOCK_SESSION)
    mockCreateComment.mockResolvedValue(CREATED_COMMENT)
  })

  it('(a) anonymous request → 401, createComment NOT called', async () => {
    mockRequirePortalSession.mockRejectedValue(new UnauthorizedError('Authentication required.'))

    const res = await POST({
      request: new Request(`http://test/api/public/v1/posts/${POST_ID}/comments`, {
        method: 'POST',
      }),
      params: { postId: String(POST_ID) },
    })

    expect(res.status).toBe(401)
    expect(mockCreateComment).not.toHaveBeenCalled()
  })

  it('(b) signed-in + valid body → 201, createComment called with author = session.principal.id', async () => {
    const res = await POST({
      request: makePostRequest({ content: 'This is a comment' }),
      params: { postId: String(POST_ID) },
    })

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.data).toMatchObject({
      id: COMMENT_ID,
      content: 'This is a comment',
    })
    expect(typeof json.data.createdAt).toBe('string')

    expect(mockCreateComment).toHaveBeenCalledOnce()
    const [inputArg, authorArg] = mockCreateComment.mock.calls[0]
    expect(inputArg.content).toBe('This is a comment')
    expect(authorArg.principalId).toBe(PRINCIPAL_ID)
  })

  it('(c) empty content → 400, createComment NOT called', async () => {
    const res = await POST({
      request: makePostRequest({ content: '' }),
      params: { postId: String(POST_ID) },
    })

    expect(res.status).toBe(400)
    expect(mockCreateComment).not.toHaveBeenCalled()
  })

  it('(c2) missing content → 400, createComment NOT called', async () => {
    const res = await POST({
      request: makePostRequest({}),
      params: { postId: String(POST_ID) },
    })

    expect(res.status).toBe(400)
    expect(mockCreateComment).not.toHaveBeenCalled()
  })

  it('(c3) content over 10000 chars → 400, createComment NOT called', async () => {
    const res = await POST({
      request: makePostRequest({ content: 'x'.repeat(10001) }),
      params: { postId: String(POST_ID) },
    })

    expect(res.status).toBe(400)
    expect(mockCreateComment).not.toHaveBeenCalled()
  })

  it('(d) author-injection: body includes authorPrincipalId/principalId → IGNORED, session principal used', async () => {
    const ATTACKER_PRINCIPAL = 'principal_attacker' as unknown as PrincipalId

    const res = await POST({
      request: makePostRequest({
        content: 'Injected comment',
        authorPrincipalId: ATTACKER_PRINCIPAL,
        principalId: ATTACKER_PRINCIPAL,
        author: ATTACKER_PRINCIPAL,
      }),
      params: { postId: String(POST_ID) },
    })

    expect(res.status).toBe(201)
    expect(mockCreateComment).toHaveBeenCalledOnce()
    const [, authorArg] = mockCreateComment.mock.calls[0]
    expect(authorArg.principalId).toBe(PRINCIPAL_ID)
    expect(authorArg.principalId).not.toBe(ATTACKER_PRINCIPAL)
  })

  it('(e) parentId is passed through to createComment when provided', async () => {
    const PARENT_ID = 'comment_parent_01' as unknown as CommentId

    const res = await POST({
      request: makePostRequest({ content: 'A reply', parentId: String(PARENT_ID) }),
      params: { postId: String(POST_ID) },
    })

    expect(res.status).toBe(201)
    expect(mockCreateComment).toHaveBeenCalledOnce()
    const [inputArg] = mockCreateComment.mock.calls[0]
    expect(inputArg.parentId).toBeDefined()
  })
})
