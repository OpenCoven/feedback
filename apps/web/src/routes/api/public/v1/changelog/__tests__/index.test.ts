import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockListPublicChangelogs = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: vi.fn(() => (opts: unknown) => ({ options: opts })),
}))

vi.mock('@/lib/server/domains/changelog/changelog.public', () => ({
  listPublicChangelogs: (...args: unknown[]) => mockListPublicChangelogs(...args),
}))

import { Route } from '../index'

type RouteOpts = { server: { handlers: { GET: (...args: unknown[]) => Promise<Response> } } }
const GET = (Route as unknown as { options: RouteOpts }).options.server.handlers.GET

describe('GET /api/public/v1/changelog', () => {
  beforeEach(() => {
    mockListPublicChangelogs.mockReset()
  })

  it('returns published changelog entries in the mobile SDK page envelope', async () => {
    mockListPublicChangelogs.mockResolvedValue({
      items: [
        {
          id: 'changelog_01kqy4vw9jfg8v5z8r04aa4n5e',
          title: 'iOS beta',
          content: 'Mobile support shipped.',
          publishedAt: new Date('2026-05-30T05:30:00.000Z'),
        },
      ],
      nextCursor: 'changelog_next',
      hasMore: true,
    })

    const res = await GET({
      request: new Request('http://test/api/public/v1/changelog?cursor=changelog_prev'),
    })

    expect(res.status).toBe(200)
    expect(mockListPublicChangelogs).toHaveBeenCalledWith({
      cursor: 'changelog_prev',
      limit: 20,
    })
    await expect(res.json()).resolves.toEqual({
      data: [
        {
          id: 'changelog_01kqy4vw9jfg8v5z8r04aa4n5e',
          title: 'iOS beta',
          content: 'Mobile support shipped.',
          publishedAt: '2026-05-30T05:30:00.000Z',
        },
      ],
      meta: {
        pagination: {
          cursor: 'changelog_next',
          hasMore: true,
        },
      },
    })
  })
})
