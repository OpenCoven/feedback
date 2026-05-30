import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetPublicPostDetail = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: vi.fn(() => (opts: unknown) => ({ options: opts })),
}))

vi.mock('@/lib/server/domains/posts/post.public.detail', () => ({
  getPublicPostDetail: (...args: unknown[]) => mockGetPublicPostDetail(...args),
}))

import { Route } from '../$postId.comments'

type RouteOpts = { server: { handlers: { GET: (...args: unknown[]) => Promise<Response> } } }
const GET = (Route as unknown as { options: RouteOpts }).options.server.handlers.GET

describe('GET /api/public/v1/posts/:postId/comments', () => {
  beforeEach(() => {
    mockGetPublicPostDetail.mockReset()
  })

  it('returns public comments in the mobile SDK envelope', async () => {
    mockGetPublicPostDetail.mockResolvedValue({
      comments: [
        {
          id: 'comment_01kqy4vw9jfg8v5z8r0t8624hd',
          content: 'Agreed',
          authorName: 'Val',
          createdAt: new Date('2026-05-30T05:35:00.000Z'),
          replies: [],
        },
      ],
    })

    const res = await GET({
      request: new Request(
        'http://test/api/public/v1/posts/post_01kqy4vw9jfg8v5z8r0k2tqjda/comments'
      ),
      params: { postId: 'post_01kqy4vw9jfg8v5z8r0k2tqjda' },
    })

    expect(res.status).toBe(200)
    expect(mockGetPublicPostDetail).toHaveBeenCalledWith('post_01kqy4vw9jfg8v5z8r0k2tqjda')
    await expect(res.json()).resolves.toEqual({
      data: [
        {
          id: 'comment_01kqy4vw9jfg8v5z8r0t8624hd',
          content: 'Agreed',
          authorName: 'Val',
          createdAt: '2026-05-30T05:35:00.000Z',
          replies: [],
        },
      ],
    })
  })
})
