import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockListPublicCategories = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: vi.fn(() => (opts: unknown) => ({ options: opts })),
}))

vi.mock('@/lib/server/domains/help-center/help-center.category.service', () => ({
  listPublicCategories: (...args: unknown[]) => mockListPublicCategories(...args),
}))

import { Route } from '../categories'

type RouteOpts = { server: { handlers: { GET: (...args: unknown[]) => Promise<Response> } } }
const GET = (Route as unknown as { options: RouteOpts }).options.server.handlers.GET

describe('GET /api/public/v1/help/categories', () => {
  beforeEach(() => {
    mockListPublicCategories.mockReset()
  })

  it('returns public categories in the mobile SDK envelope', async () => {
    mockListPublicCategories.mockResolvedValue([
      {
        id: 'category_01kqy4vw9jfg8v5z8r0fvkgw8h',
        name: 'Getting Started',
        slug: 'getting-started',
        description: 'Basics',
      },
    ])

    const res = await GET({ request: new Request('http://test/api/public/v1/help/categories') })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      data: [
        {
          id: 'category_01kqy4vw9jfg8v5z8r0fvkgw8h',
          name: 'Getting Started',
          slug: 'getting-started',
          description: 'Basics',
        },
      ],
    })
  })
})
