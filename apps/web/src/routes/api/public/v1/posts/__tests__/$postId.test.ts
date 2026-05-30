import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetPublicPostDetail = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: vi.fn(() => (opts: unknown) => ({ options: opts })),
}))

vi.mock('@/lib/server/domains/posts/post.public.detail', () => ({
  getPublicPostDetail: (...args: unknown[]) => mockGetPublicPostDetail(...args),
}))

import { Route } from '../$postId'

type RouteOpts = { server: { handlers: { GET: (...args: unknown[]) => Promise<Response> } } }
const GET = (Route as unknown as { options: RouteOpts }).options.server.handlers.GET

describe('GET /api/public/v1/posts/:postId', () => {
  beforeEach(() => {
    mockGetPublicPostDetail.mockReset()
  })

  it('returns a mobile SDK compatible public post detail envelope', async () => {
    mockGetPublicPostDetail.mockResolvedValue({
      id: 'post_01kqy4vw9jfg8v5z8r0k2tqjda',
      title: 'Ship iOS support',
      content: 'Native users need this.',
      voteCount: 12,
      statusId: null,
      createdAt: new Date('2026-05-30T05:30:00.000Z'),
      board: {
        id: 'board_01kqy4vw9jfg8v5z8r0pfjp8he',
        name: 'Feedback',
        slug: 'feedback',
      },
      comments: [],
    })

    const res = await GET({
      request: new Request('http://test/api/public/v1/posts/post_01kqy4vw9jfg8v5z8r0k2tqjda'),
      params: { postId: 'post_01kqy4vw9jfg8v5z8r0k2tqjda' },
    })

    expect(res.status).toBe(200)
    expect(mockGetPublicPostDetail).toHaveBeenCalledWith('post_01kqy4vw9jfg8v5z8r0k2tqjda')
    await expect(res.json()).resolves.toEqual({
      data: {
        id: 'post_01kqy4vw9jfg8v5z8r0k2tqjda',
        title: 'Ship iOS support',
        content: 'Native users need this.',
        voteCount: 12,
        statusId: null,
        boardId: 'board_01kqy4vw9jfg8v5z8r0pfjp8he',
        createdAt: '2026-05-30T05:30:00.000Z',
        hasVoted: false,
      },
    })
  })
})
