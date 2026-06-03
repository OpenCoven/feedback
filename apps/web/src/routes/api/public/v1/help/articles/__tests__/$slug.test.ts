import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetPublicArticleBySlug = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: vi.fn(() => (opts: unknown) => ({ options: opts })),
}))

vi.mock('@/lib/server/help-center-access', () => ({
  requirePublicHelpCenterAccess: vi.fn(async () => undefined),
}))

vi.mock('@/lib/server/domains/help-center/help-center.article.service', () => ({
  getPublicArticleBySlug: (...args: unknown[]) => mockGetPublicArticleBySlug(...args),
}))

import { Route } from '../$slug'

type RouteOpts = { server: { handlers: { GET: (...args: unknown[]) => Promise<Response> } } }
const GET = (Route as unknown as { options: RouteOpts }).options.server.handlers.GET

describe('GET /api/public/v1/help/articles/:slug', () => {
  beforeEach(() => {
    mockGetPublicArticleBySlug.mockReset()
  })

  it('returns a public help article in the mobile SDK envelope', async () => {
    mockGetPublicArticleBySlug.mockResolvedValue({
      id: 'article_01kqy4vw9jfg8v5z8r07c1ezp',
      slug: 'install',
      title: 'Install',
      content: 'Install the SDK.',
      categoryId: 'category_01kqy4vw9jfg8v5z8r0fvkgw8h',
    })

    const res = await GET({
      request: new Request('http://test/api/public/v1/help/articles/install'),
      params: { slug: 'install' },
    })

    expect(res.status).toBe(200)
    expect(mockGetPublicArticleBySlug).toHaveBeenCalledWith('install')
    await expect(res.json()).resolves.toEqual({
      data: {
        id: 'article_01kqy4vw9jfg8v5z8r07c1ezp',
        slug: 'install',
        title: 'Install',
        content: 'Install the SDK.',
        categoryId: 'category_01kqy4vw9jfg8v5z8r0fvkgw8h',
      },
    })
  })
})
