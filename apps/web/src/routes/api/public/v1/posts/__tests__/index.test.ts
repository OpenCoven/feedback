import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockListPublicPosts = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: vi.fn(() => (opts: unknown) => ({ options: opts })),
}))

vi.mock('@/lib/server/domains/posts/post.public', () => ({
  listPublicPosts: (...args: unknown[]) => mockListPublicPosts(...args),
}))

import { Route } from '../index'

type RouteOpts = { server: { handlers: { GET: (...args: unknown[]) => Promise<Response> } } }
const GET = (Route as unknown as { options: RouteOpts }).options.server.handlers.GET

describe('GET /api/public/v1/posts', () => {
  beforeEach(() => {
    mockListPublicPosts.mockReset()
  })

  it('returns mobile SDK compatible public posts without API key auth', async () => {
    mockListPublicPosts.mockResolvedValue({
      items: [
        {
          id: 'post_01kqy4vw9jfg8v5z8r0k2tqjda',
          title: 'Ship iOS support',
          content: 'Native users need this.',
          statusId: 'status_01kqy4vw9jfg8v5z8r0bc0k21',
          voteCount: 12,
          authorName: 'Val',
          principalId: 'principal_01kqy4vw9jfg8v5z8r0z6tvfaa',
          createdAt: new Date('2026-05-30T05:30:00.000Z'),
          commentCount: 3,
          tags: [],
          board: {
            id: 'board_01kqy4vw9jfg8v5z8r0pfjp8he',
            name: 'Feedback',
            slug: 'feedback',
          },
        },
      ],
      total: -1,
      hasMore: true,
    })

    const res = await GET({
      request: new Request(
        'http://test/api/public/v1/posts?boardId=board_01kqy4vw9jfg8v5z8r0pfjp8he&sort=newest&cursor=2'
      ),
    })

    expect(res.status).toBe(200)
    expect(mockListPublicPosts).toHaveBeenCalledWith({
      boardId: 'board_01kqy4vw9jfg8v5z8r0pfjp8he',
      sort: 'new',
      page: 2,
      limit: 20,
    })
    await expect(res.json()).resolves.toEqual({
      data: [
        {
          id: 'post_01kqy4vw9jfg8v5z8r0k2tqjda',
          title: 'Ship iOS support',
          voteCount: 12,
          statusId: 'status_01kqy4vw9jfg8v5z8r0bc0k21',
          boardId: 'board_01kqy4vw9jfg8v5z8r0pfjp8he',
          createdAt: '2026-05-30T05:30:00.000Z',
          hasVoted: false,
        },
      ],
      meta: {
        pagination: {
          cursor: '3',
          hasMore: true,
        },
      },
    })
  })
})
