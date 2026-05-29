import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommentId, PostId, PrincipalId, StatusId, BoardId } from '@opencoven-feedback/ids'

// --- mock fns ---
const mockGetPostWithDetails = vi.fn()
const mockGetCommentsWithReplies = vi.fn()
const mockOptionalPortalSession = vi.fn()
const mockGetAllUserVotedPostIds = vi.fn()
const mockParseTypeId = vi.fn((value: string) => value)

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: vi.fn(() => (opts: unknown) => ({ options: opts })),
}))
vi.mock('@/lib/server/domains/posts/post.query', () => ({
  getPostWithDetails: (...args: unknown[]) => mockGetPostWithDetails(...args),
  getCommentsWithReplies: (...args: unknown[]) => mockGetCommentsWithReplies(...args),
}))
vi.mock('@/lib/server/domains/api/portal-auth', () => ({
  optionalPortalSession: (...args: unknown[]) => mockOptionalPortalSession(...args),
}))
vi.mock('@/lib/server/domains/posts/post.public', () => ({
  getAllUserVotedPostIds: (...args: unknown[]) => mockGetAllUserVotedPostIds(...args),
}))
vi.mock('@/lib/server/domains/api/validation', () => ({
  parseTypeId: (...args: unknown[]) => mockParseTypeId(...args),
}))

import { Route as DetailRoute } from '../$postId'
import { Route as CommentsRoute } from '../$postId.comments'

type DetailRouteOpts = {
  server: {
    handlers: {
      GET: (ctx: { request: Request; params: { postId: string } }) => Promise<Response>
    }
  }
}
type CommentsRouteOpts = {
  server: {
    handlers: {
      GET: (ctx: { request: Request; params: { postId: string } }) => Promise<Response>
    }
  }
}

const DetailGET = (DetailRoute as unknown as { options: DetailRouteOpts }).options.server.handlers
  .GET
const CommentsGET = (CommentsRoute as unknown as { options: CommentsRouteOpts }).options.server
  .handlers.GET

// --- fixtures ---
const POST_ID = 'post_01kqhxq697fvgat0fn8rr1r7ea' as unknown as PostId
const BOARD_ID = 'board_01kqhxq697fvgat0geegv834v0' as unknown as BoardId
const STATUS_ID = 'status_01kqhxq697fvgat0geegv834v1' as unknown as StatusId
const PRINCIPAL_ID = 'principal_01kqhxq697fvgat0fn8rr1r7ew' as unknown as PrincipalId
const COMMENT_ID_1 = 'comment_01kqhxq697fvgat0fn8rr1r7eb' as unknown as CommentId
const COMMENT_ID_2 = 'comment_01kqhxq697fvgat0fn8rr1r7ec' as unknown as CommentId

const MOCK_POST = {
  id: POST_ID,
  title: 'Test Post',
  content: 'Post content',
  contentJson: null,
  voteCount: 7,
  commentCount: 2,
  boardId: BOARD_ID,
  boardSlug: 'general',
  boardName: 'General',
  statusId: STATUS_ID,
  authorName: 'Alice',
  authorEmail: 'alice@example.com',
  ownerPrincipalId: null,
  tags: [],
  roadmapIds: [],
  pinnedComment: null,
  summaryJson: null,
  summaryUpdatedAt: null,
  canonicalPostId: null,
  mergedAt: null,
  isCommentsLocked: false,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  deletedAt: null,
}

const MOCK_COMMENTS = [
  {
    id: COMMENT_ID_1,
    postId: POST_ID,
    parentId: null,
    content: 'Top-level comment',
    authorName: 'Bob',
    principalId: PRINCIPAL_ID,
    isTeamMember: false,
    isPrivate: false,
    createdAt: new Date('2024-01-03T00:00:00.000Z'),
    deletedAt: null,
    deletedByPrincipalId: null,
    reactions: [],
    replies: [
      {
        id: COMMENT_ID_2,
        postId: POST_ID,
        parentId: COMMENT_ID_1,
        content: 'Nested reply',
        authorName: 'Carol',
        principalId: PRINCIPAL_ID,
        isTeamMember: false,
        isPrivate: false,
        createdAt: new Date('2024-01-04T00:00:00.000Z'),
        deletedAt: null,
        deletedByPrincipalId: null,
        reactions: [],
        replies: [],
      },
    ],
  },
]

function makeRequest(url = 'http://test/api/public/v1/posts/post_01', token?: string): Request {
  const headers: Record<string, string> = {}
  if (token) headers['authorization'] = `Bearer ${token}`
  return new Request(url, { headers })
}

// ============================================================
// GET /api/public/v1/posts/:postId
// ============================================================
describe('GET /api/public/v1/posts/:postId', () => {
  beforeEach(() => {
    mockGetPostWithDetails.mockReset()
    mockOptionalPortalSession.mockReset()
    mockGetAllUserVotedPostIds.mockReset()
    mockParseTypeId.mockImplementation((value: string) => value)

    mockGetPostWithDetails.mockResolvedValue(MOCK_POST)
    mockOptionalPortalSession.mockResolvedValue(null)
  })

  it('returns 200 with public-safe post fields', async () => {
    const res = await DetailGET({ request: makeRequest(), params: { postId: POST_ID } })
    expect(res.status).toBe(200)
    const json = await res.json()
    const data = json.data
    expect(data.id).toBe(POST_ID)
    expect(data.title).toBe('Test Post')
    expect(data.content).toBe('Post content')
    expect(data.voteCount).toBe(7)
    expect(data.statusId).toBe(STATUS_ID)
    expect(data.boardId).toBe(BOARD_ID)
    expect(data.createdAt).toBe('2024-01-01T00:00:00.000Z')
  })

  it('does not expose private admin fields', async () => {
    const res = await DetailGET({ request: makeRequest(), params: { postId: POST_ID } })
    const json = await res.json()
    const data = json.data
    expect(data.authorEmail).toBeUndefined()
    expect(data.ownerPrincipalId).toBeUndefined()
    expect(data.contentJson).toBeUndefined()
    expect(data.summaryJson).toBeUndefined()
    expect(data.updatedAt).toBeUndefined()
    expect(data.deletedAt).toBeUndefined()
  })

  it('returns hasVoted: false when anonymous', async () => {
    mockOptionalPortalSession.mockResolvedValue(null)
    const res = await DetailGET({ request: makeRequest(), params: { postId: POST_ID } })
    const json = await res.json()
    expect(json.data.hasVoted).toBe(false)
    expect(mockGetAllUserVotedPostIds).not.toHaveBeenCalled()
  })

  it('returns hasVoted: true when authed and post is in voted set', async () => {
    mockOptionalPortalSession.mockResolvedValue({
      user: { id: 'user_01', email: 'a@b.com', name: 'A', image: null },
      principal: { id: PRINCIPAL_ID, role: 'user', type: 'user' },
    })
    mockGetAllUserVotedPostIds.mockResolvedValue(new Set([POST_ID]))

    const res = await DetailGET({
      request: makeRequest(undefined, 'mytoken'),
      params: { postId: POST_ID },
    })
    const json = await res.json()
    expect(json.data.hasVoted).toBe(true)
    expect(mockGetAllUserVotedPostIds).toHaveBeenCalledWith(PRINCIPAL_ID)
  })

  it('returns hasVoted: false when authed but post not in voted set', async () => {
    mockOptionalPortalSession.mockResolvedValue({
      user: { id: 'user_01', email: 'a@b.com', name: 'A', image: null },
      principal: { id: PRINCIPAL_ID, role: 'user', type: 'user' },
    })
    mockGetAllUserVotedPostIds.mockResolvedValue(new Set<PostId>())

    const res = await DetailGET({
      request: makeRequest(undefined, 'mytoken'),
      params: { postId: POST_ID },
    })
    const json = await res.json()
    expect(json.data.hasVoted).toBe(false)
  })

  it('returns 404 when getPostWithDetails throws POST_NOT_FOUND', async () => {
    mockGetPostWithDetails.mockRejectedValue({ code: 'POST_NOT_FOUND', message: 'Post not found' })
    const res = await DetailGET({ request: makeRequest(), params: { postId: POST_ID } })
    expect(res.status).toBe(404)
  })

  it('delegates other errors to handleDomainError', async () => {
    mockGetPostWithDetails.mockRejectedValue({ code: 'VALIDATION_ERROR', message: 'bad id' })
    const res = await DetailGET({ request: makeRequest(), params: { postId: POST_ID } })
    expect(res.status).toBe(400)
  })

  it('calls parseTypeId with the postId param', async () => {
    await DetailGET({ request: makeRequest(), params: { postId: POST_ID } })
    expect(mockParseTypeId).toHaveBeenCalledWith(POST_ID, 'post', 'post ID')
  })
})

// ============================================================
// GET /api/public/v1/posts/:postId/comments
// ============================================================
describe('GET /api/public/v1/posts/:postId/comments', () => {
  beforeEach(() => {
    mockGetCommentsWithReplies.mockReset()
    mockParseTypeId.mockImplementation((value: string) => value)

    mockGetCommentsWithReplies.mockResolvedValue(MOCK_COMMENTS)
  })

  it('returns 200 with serialized comments array', async () => {
    const res = await CommentsGET({ request: makeRequest(), params: { postId: POST_ID } })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json.data)).toBe(true)
    expect(json.data).toHaveLength(1)
  })

  it('serializes top-level comment fields correctly', async () => {
    const res = await CommentsGET({ request: makeRequest(), params: { postId: POST_ID } })
    const json = await res.json()
    const comment = json.data[0]
    expect(comment.id).toBe(COMMENT_ID_1)
    expect(comment.content).toBe('Top-level comment')
    expect(comment.authorName).toBe('Bob')
    expect(comment.createdAt).toBe('2024-01-03T00:00:00.000Z')
    expect(Array.isArray(comment.replies)).toBe(true)
  })

  it('serializes nested replies recursively', async () => {
    const res = await CommentsGET({ request: makeRequest(), params: { postId: POST_ID } })
    const json = await res.json()
    const reply = json.data[0].replies[0]
    expect(reply.id).toBe(COMMENT_ID_2)
    expect(reply.content).toBe('Nested reply')
    expect(reply.authorName).toBe('Carol')
    expect(reply.createdAt).toBe('2024-01-04T00:00:00.000Z')
    expect(reply.replies).toEqual([])
  })

  it('returns empty array when no comments', async () => {
    mockGetCommentsWithReplies.mockResolvedValue([])
    const res = await CommentsGET({ request: makeRequest(), params: { postId: POST_ID } })
    const json = await res.json()
    expect(json.data).toEqual([])
  })

  it('delegates errors to handleDomainError', async () => {
    mockGetCommentsWithReplies.mockRejectedValue({ code: 'POST_NOT_FOUND', message: 'not found' })
    const res = await CommentsGET({ request: makeRequest(), params: { postId: POST_ID } })
    expect(res.status).toBe(404)
  })

  it('calls parseTypeId with the postId param', async () => {
    await CommentsGET({ request: makeRequest(), params: { postId: POST_ID } })
    expect(mockParseTypeId).toHaveBeenCalledWith(POST_ID, 'post', 'post ID')
  })
})
