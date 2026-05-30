import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockListPublicBoardsWithStats = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: vi.fn(() => (opts: unknown) => ({ options: opts })),
}))

vi.mock('@/lib/server/domains/boards/board.public', () => ({
  listPublicBoardsWithStats: (...args: unknown[]) => mockListPublicBoardsWithStats(...args),
}))

import { Route } from '../index'

type RouteOpts = { server: { handlers: { GET: (...args: unknown[]) => Promise<Response> } } }
const GET = (Route as unknown as { options: RouteOpts }).options.server.handlers.GET

describe('GET /api/public/v1/boards', () => {
  beforeEach(() => {
    mockListPublicBoardsWithStats.mockReset()
  })

  it('returns public boards in the mobile SDK envelope', async () => {
    mockListPublicBoardsWithStats.mockResolvedValue([
      {
        id: 'board_01kqy4vw9jfg8v5z8r0pfjp8he',
        name: 'Feedback',
        slug: 'feedback',
        description: 'Public feedback board',
        postCount: 12,
      },
    ])

    const res = await GET({ request: new Request('http://test/api/public/v1/boards') })

    expect(res.status).toBe(200)
    expect(mockListPublicBoardsWithStats).toHaveBeenCalledWith()
    await expect(res.json()).resolves.toEqual({
      data: [
        {
          id: 'board_01kqy4vw9jfg8v5z8r0pfjp8he',
          name: 'Feedback',
          slug: 'feedback',
          description: 'Public feedback board',
          postCount: 12,
        },
      ],
    })
  })
})
