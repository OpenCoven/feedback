import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockListPublicCategories = vi.fn()
const mockGetPublicArticleBySlug = vi.fn()
const mockHybridSearch = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: vi.fn(() => (opts: unknown) => ({ options: opts })),
}))
vi.mock('@/lib/server/domains/help-center/help-center.service', () => ({
  listPublicCategories: (...args: unknown[]) => mockListPublicCategories(...args),
  getPublicArticleBySlug: (...args: unknown[]) => mockGetPublicArticleBySlug(...args),
}))
vi.mock('@/lib/server/domains/help-center/help-center-search.service', () => ({
  hybridSearch: (...args: unknown[]) => mockHybridSearch(...args),
}))

import { Route as CategoriesRoute } from '../categories/index'
import { Route as ArticleRoute } from '../articles/$slug'
import { Route as SearchRoute } from '../search'

type CategoriesOpts = {
  server: { handlers: { GET: (ctx: { request: Request }) => Promise<Response> } }
}
type ArticleOpts = {
  server: {
    handlers: {
      GET: (ctx: { request: Request; params: { slug: string } }) => Promise<Response>
    }
  }
}
type SearchOpts = {
  server: { handlers: { GET: (ctx: { request: Request }) => Promise<Response> } }
}

const CategoriesGET = (CategoriesRoute as unknown as { options: CategoriesOpts }).options.server
  .handlers.GET
const ArticleGET = (ArticleRoute as unknown as { options: ArticleOpts }).options.server.handlers.GET
const SearchGET = (SearchRoute as unknown as { options: SearchOpts }).options.server.handlers.GET

// ─── Mock data ───────────────────────────────────────────────────────────────

const MOCK_CATEGORIES = [
  {
    id: 'hcc_01',
    name: 'Getting Started',
    slug: 'getting-started',
    description: 'Start here',
    icon: null,
    parentId: null,
    isPublic: true,
    position: 0,
    articleCount: 3,
    publishedArticleCount: 2,
    recursiveArticleCount: 3,
    recursivePublishedArticleCount: 2,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  },
  {
    id: 'hcc_02',
    name: 'Advanced',
    slug: 'advanced',
    description: null,
    icon: null,
    parentId: null,
    isPublic: true,
    position: 1,
    articleCount: 1,
    publishedArticleCount: 1,
    recursiveArticleCount: 1,
    recursivePublishedArticleCount: 1,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  },
]

const MOCK_ARTICLE = {
  id: 'hca_01',
  slug: 'how-to-start',
  title: 'How to Start',
  content: 'This is the content',
  description: 'A short description',
  categoryId: 'hcc_01',
  position: null,
  contentJson: null,
  principalId: 'principal_01',
  publishedAt: new Date('2024-03-01T00:00:00.000Z'),
  viewCount: 5,
  helpfulCount: 3,
  notHelpfulCount: 1,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  category: { id: 'hcc_01', slug: 'getting-started', name: 'Getting Started' },
  author: null,
}

const MOCK_SEARCH_RESULTS = [
  {
    id: 'hca_01',
    slug: 'how-to-start',
    title: 'How to Start',
    content: 'This is the content of the article',
    categoryId: 'hcc_01',
    categorySlug: 'getting-started',
    categoryName: 'Getting Started',
  },
  {
    id: 'hca_02',
    slug: 'advanced-config',
    title: 'Advanced Config',
    content: 'More content here',
    categoryId: 'hcc_02',
    categorySlug: 'advanced',
    categoryName: 'Advanced',
  },
]

function makeRequest(url: string): Request {
  return new Request(url)
}

// =============================================================
// GET /api/public/v1/help/categories
// =============================================================
describe('GET /api/public/v1/help/categories', () => {
  beforeEach(() => {
    mockListPublicCategories.mockReset()
    mockListPublicCategories.mockResolvedValue(MOCK_CATEGORIES)
  })

  it('returns 200 with mapped public subset { id, name, slug, description }', async () => {
    const res = await CategoriesGET({
      request: makeRequest('http://test/api/public/v1/help/categories'),
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toHaveLength(2)
    const item = json.data[0]
    expect(item.id).toBe('hcc_01')
    expect(item.name).toBe('Getting Started')
    expect(item.slug).toBe('getting-started')
    expect(item.description).toBe('Start here')
  })

  it('does not expose internal fields', async () => {
    const res = await CategoriesGET({
      request: makeRequest('http://test/api/public/v1/help/categories'),
    })
    const json = await res.json()
    const item = json.data[0]
    expect(item.isPublic).toBeUndefined()
    expect(item.position).toBeUndefined()
    expect(item.parentId).toBeUndefined()
    expect(item.icon).toBeUndefined()
    expect(item.articleCount).toBeUndefined()
    expect(item.createdAt).toBeUndefined()
    expect(item.updatedAt).toBeUndefined()
  })

  it('returns null description when category has no description', async () => {
    const res = await CategoriesGET({
      request: makeRequest('http://test/api/public/v1/help/categories'),
    })
    const json = await res.json()
    expect(json.data[1].description).toBeNull()
  })

  it('delegates errors to handleDomainError', async () => {
    mockListPublicCategories.mockRejectedValue({ code: 'NOT_FOUND', message: 'not found' })
    const res = await CategoriesGET({
      request: makeRequest('http://test/api/public/v1/help/categories'),
    })
    expect(res.status).toBe(404)
  })
})

// =============================================================
// GET /api/public/v1/help/articles/:slug
// =============================================================
describe('GET /api/public/v1/help/articles/:slug', () => {
  beforeEach(() => {
    mockGetPublicArticleBySlug.mockReset()
    mockGetPublicArticleBySlug.mockResolvedValue(MOCK_ARTICLE)
  })

  it('returns 200 with { id, slug, title, content, categoryId } for a published article', async () => {
    const res = await ArticleGET({
      request: makeRequest('http://test/api/public/v1/help/articles/how-to-start'),
      params: { slug: 'how-to-start' },
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.id).toBe('hca_01')
    expect(json.data.slug).toBe('how-to-start')
    expect(json.data.title).toBe('How to Start')
    expect(json.data.content).toBe('This is the content')
    expect(json.data.categoryId).toBe('hcc_01')
  })

  it('does not expose internal fields', async () => {
    const res = await ArticleGET({
      request: makeRequest('http://test/api/public/v1/help/articles/how-to-start'),
      params: { slug: 'how-to-start' },
    })
    const json = await res.json()
    expect(json.data.contentJson).toBeUndefined()
    expect(json.data.principalId).toBeUndefined()
    expect(json.data.viewCount).toBeUndefined()
    expect(json.data.helpfulCount).toBeUndefined()
    expect(json.data.createdAt).toBeUndefined()
    expect(json.data.updatedAt).toBeUndefined()
  })

  it('returns 404 when article is not found (ARTICLE_NOT_FOUND)', async () => {
    mockGetPublicArticleBySlug.mockRejectedValue({
      code: 'ARTICLE_NOT_FOUND',
      message: 'Article not found',
    })
    const res = await ArticleGET({
      request: makeRequest('http://test/api/public/v1/help/articles/missing'),
      params: { slug: 'missing' },
    })
    expect(res.status).toBe(404)
  })

  it('returns 404 when article is unpublished (publishedAt is null)', async () => {
    mockGetPublicArticleBySlug.mockRejectedValue({
      code: 'ARTICLE_NOT_FOUND',
      message: 'Article not found',
    })
    const res = await ArticleGET({
      request: makeRequest('http://test/api/public/v1/help/articles/draft-article'),
      params: { slug: 'draft-article' },
    })
    expect(res.status).toBe(404)
  })

  it('passes the slug param to getPublicArticleBySlug', async () => {
    await ArticleGET({
      request: makeRequest('http://test/api/public/v1/help/articles/how-to-start'),
      params: { slug: 'how-to-start' },
    })
    expect(mockGetPublicArticleBySlug).toHaveBeenCalledWith('how-to-start')
  })
})

// =============================================================
// GET /api/public/v1/help/search
// =============================================================
describe('GET /api/public/v1/help/search', () => {
  beforeEach(() => {
    mockHybridSearch.mockReset()
    mockHybridSearch.mockResolvedValue(MOCK_SEARCH_RESULTS)
  })

  it('returns empty array without calling hybridSearch when q is absent', async () => {
    const res = await SearchGET({
      request: makeRequest('http://test/api/public/v1/help/search'),
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toEqual([])
    expect(mockHybridSearch).not.toHaveBeenCalled()
  })

  it('returns empty array without calling hybridSearch when q is blank whitespace', async () => {
    const res = await SearchGET({
      request: makeRequest('http://test/api/public/v1/help/search?q=   '),
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toEqual([])
    expect(mockHybridSearch).not.toHaveBeenCalled()
  })

  it('calls hybridSearch and maps results to { id, slug, title } when q has a value', async () => {
    const res = await SearchGET({
      request: makeRequest('http://test/api/public/v1/help/search?q=start'),
    })
    expect(res.status).toBe(200)
    expect(mockHybridSearch).toHaveBeenCalledWith('start', expect.any(Number))
    const json = await res.json()
    expect(json.data).toHaveLength(2)
    const item = json.data[0]
    expect(item.id).toBe('hca_01')
    expect(item.slug).toBe('how-to-start')
    expect(item.title).toBe('How to Start')
  })

  it('does not expose content or category fields in search results', async () => {
    const res = await SearchGET({
      request: makeRequest('http://test/api/public/v1/help/search?q=start'),
    })
    const json = await res.json()
    const item = json.data[0]
    expect(item.content).toBeUndefined()
    expect(item.categoryId).toBeUndefined()
    expect(item.categorySlug).toBeUndefined()
    expect(item.categoryName).toBeUndefined()
  })

  it('delegates errors to handleDomainError when hybridSearch throws', async () => {
    mockHybridSearch.mockRejectedValue(new Error('Search failed'))
    const res = await SearchGET({
      request: makeRequest('http://test/api/public/v1/help/search?q=crash'),
    })
    expect(res.status).toBe(500)
  })
})
