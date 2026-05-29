import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostId, PrincipalId } from '@opencoven-feedback/ids'
import { UnauthorizedError } from '@/lib/shared/errors'

// ---- mocks ----------------------------------------------------------------

const mockRequirePortalSession = vi.fn()
const mockVoteOnPost = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: vi.fn(() => (opts: unknown) => ({ options: opts })),
}))
vi.mock('@/lib/server/domains/api/portal-auth', () => ({
  requirePortalSession: (...args: unknown[]) => mockRequirePortalSession(...args),
}))
vi.mock('@/lib/server/domains/posts/post.voting', () => ({
  voteOnPost: (...args: unknown[]) => mockVoteOnPost(...args),
}))
vi.mock('@/lib/server/domains/api/validation', () => ({
  parseTypeId: <T extends string>(value: string) => value as T,
}))

// ---- import route ---------------------------------------------------------

import { Route } from '../$postId.vote'

type RouteOpts = {
  server: {
    handlers: {
      POST: (ctx: { request: Request; params: { postId: string } }) => Promise<Response>
    }
  }
}

const POST = (Route as unknown as { options: RouteOpts }).options.server.handlers.POST

// ---- fixtures -------------------------------------------------------------

const POST_ID = 'post_01kqhxq697fvgat0fn8rr1r7ea' as unknown as PostId
const PRINCIPAL_ID = 'principal_01kqhxq697fvgat0fn8rr1r7ew' as unknown as PrincipalId

const MOCK_SESSION = {
  user: { id: 'user_01', email: 'alice@example.com', name: 'Alice', image: null },
  principal: { id: PRINCIPAL_ID, role: 'user', type: 'user' },
}

const VOTE_RESULT = { voted: true, voteCount: 5 }

function makeRequest(token = 'valid-token'): Request {
  return new Request(`http://test/api/public/v1/posts/${POST_ID}/vote`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  })
}

// ---- tests ----------------------------------------------------------------

describe('POST /api/public/v1/posts/:postId/vote', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePortalSession.mockResolvedValue(MOCK_SESSION)
    mockVoteOnPost.mockResolvedValue(VOTE_RESULT)
  })

  it('(a) anonymous request → 401, voteOnPost NOT called', async () => {
    mockRequirePortalSession.mockRejectedValue(new UnauthorizedError('Authentication required.'))

    const res = await POST({
      request: new Request('http://test/api/public/v1/posts/some-post/vote', { method: 'POST' }),
      params: { postId: String(POST_ID) },
    })

    expect(res.status).toBe(401)
    expect(mockVoteOnPost).not.toHaveBeenCalled()
  })

  it('(b) signed-in → 200, voteOnPost called with (postId, session.principal.id)', async () => {
    const res = await POST({
      request: makeRequest(),
      params: { postId: String(POST_ID) },
    })

    expect(res.status).toBe(200)
    expect(mockVoteOnPost).toHaveBeenCalledOnce()
    const [calledPostId, calledPrincipalId] = mockVoteOnPost.mock.calls[0]
    expect(calledPostId).toBe(POST_ID)
    expect(calledPrincipalId).toBe(PRINCIPAL_ID)
  })

  it('(c) voted + voteCount are passed through in data', async () => {
    mockVoteOnPost.mockResolvedValue({ voted: false, voteCount: 3 })

    const res = await POST({
      request: makeRequest(),
      params: { postId: String(POST_ID) },
    })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toMatchObject({ voted: false, voteCount: 3 })
  })
})
