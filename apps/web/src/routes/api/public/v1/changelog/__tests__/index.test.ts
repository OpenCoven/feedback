import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChangelogId } from '@opencoven-feedback/ids'

const mockListChangelogs = vi.fn()
const mockGetChangelogById = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: vi.fn(() => (opts: unknown) => ({ options: opts })),
}))
vi.mock('@/lib/server/domains/changelog/changelog.query', () => ({
  listChangelogs: (...args: unknown[]) => mockListChangelogs(...args),
}))
vi.mock('@/lib/server/domains/changelog/changelog.service', () => ({
  getChangelogById: (...args: unknown[]) => mockGetChangelogById(...args),
}))

import { Route as ListRoute } from '../index'
import { Route as EntryRoute } from '../$entryId'

type ListRouteOpts = {
  server: { handlers: { GET: (ctx: { request: Request }) => Promise<Response> } }
}
type EntryRouteOpts = {
  server: {
    handlers: {
      GET: (ctx: { request: Request; params: { entryId: string } }) => Promise<Response>
    }
  }
}

const ListGET = (ListRoute as unknown as { options: ListRouteOpts }).options.server.handlers.GET
const EntryGET = (EntryRoute as unknown as { options: EntryRouteOpts }).options.server.handlers.GET

const ENTRY_ID_1 = 'changelog_01kqhxq697fvgat0fn8rr1r7ea' as unknown as ChangelogId
const ENTRY_ID_2 = 'changelog_01kqhxq697fvgat0fn8rr1r7eb' as unknown as ChangelogId

const PUBLISHED_DATE = new Date('2024-03-01T12:00:00.000Z')

const MOCK_ENTRIES = [
  {
    id: ENTRY_ID_1,
    title: 'Entry One',
    content: 'Content one',
    publishedAt: PUBLISHED_DATE,
    status: 'published' as const,
    createdAt: new Date('2024-03-01T00:00:00.000Z'),
    updatedAt: new Date('2024-03-02T00:00:00.000Z'),
  },
  {
    id: ENTRY_ID_2,
    title: 'Entry Two',
    content: 'Content two',
    publishedAt: new Date('2024-02-01T12:00:00.000Z'),
    status: 'published' as const,
    createdAt: new Date('2024-02-01T00:00:00.000Z'),
    updatedAt: new Date('2024-02-02T00:00:00.000Z'),
  },
]

function makeRequest(url = 'http://test/api/public/v1/changelog'): Request {
  return new Request(url)
}

// =============================================================
// GET /api/public/v1/changelog
// =============================================================
describe('GET /api/public/v1/changelog', () => {
  beforeEach(() => {
    mockListChangelogs.mockReset()
    mockListChangelogs.mockResolvedValue({
      items: MOCK_ENTRIES,
      nextCursor: null,
      hasMore: false,
    })
  })

  it('always calls listChangelogs with status: published', async () => {
    await ListGET({ request: makeRequest() })
    expect(mockListChangelogs).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'published' })
    )
  })

  it('does not accept a status query param — still hardcodes published', async () => {
    await ListGET({ request: makeRequest('http://test/api/public/v1/changelog?status=draft') })
    expect(mockListChangelogs).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'published' })
    )
  })

  it('maps items to public subset { id, title, publishedAt }', async () => {
    const res = await ListGET({ request: makeRequest() })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toHaveLength(2)
    const item = json.data[0]
    expect(item.id).toBe(ENTRY_ID_1)
    expect(item.title).toBe('Entry One')
    expect(item.publishedAt).toBe(PUBLISHED_DATE.toISOString())
    // private fields must NOT be present
    expect(item.content).toBeUndefined()
    expect(item.createdAt).toBeUndefined()
    expect(item.updatedAt).toBeUndefined()
  })

  it('passes cursor and limit to listChangelogs', async () => {
    const url =
      'http://test/api/public/v1/changelog?cursor=changelog_01kqhxq697fvgat0fn8rr1r7ea&limit=10'
    await ListGET({ request: makeRequest(url) })
    expect(mockListChangelogs).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: 'changelog_01kqhxq697fvgat0fn8rr1r7ea', limit: 10 })
    )
  })

  it('clamps limit to 100 maximum', async () => {
    await ListGET({ request: makeRequest('http://test/api/public/v1/changelog?limit=999') })
    expect(mockListChangelogs).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }))
  })

  it('clamps limit to 1 minimum', async () => {
    await ListGET({ request: makeRequest('http://test/api/public/v1/changelog?limit=0') })
    expect(mockListChangelogs).toHaveBeenCalledWith(expect.objectContaining({ limit: 1 }))
  })

  it('defaults limit to 20', async () => {
    await ListGET({ request: makeRequest() })
    expect(mockListChangelogs).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }))
  })

  it('pagination meta passes through (hasMore, cursor)', async () => {
    mockListChangelogs.mockResolvedValue({
      items: MOCK_ENTRIES,
      nextCursor: ENTRY_ID_2,
      hasMore: true,
    })
    const res = await ListGET({ request: makeRequest() })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.meta.pagination.hasMore).toBe(true)
    expect(json.meta.pagination.cursor).toBe(ENTRY_ID_2)
  })

  it('serializes null publishedAt as null', async () => {
    mockListChangelogs.mockResolvedValue({
      items: [{ ...MOCK_ENTRIES[0], publishedAt: null }],
      nextCursor: null,
      hasMore: false,
    })
    const res = await ListGET({ request: makeRequest() })
    const json = await res.json()
    expect(json.data[0].publishedAt).toBeNull()
  })

  it('delegates errors to handleDomainError', async () => {
    mockListChangelogs.mockRejectedValue({ code: 'NOT_FOUND', message: 'not found' })
    const res = await ListGET({ request: makeRequest() })
    expect(res.status).toBe(404)
  })
})

// =============================================================
// GET /api/public/v1/changelog/:entryId
// =============================================================
describe('GET /api/public/v1/changelog/:entryId', () => {
  beforeEach(() => {
    mockGetChangelogById.mockReset()
    mockGetChangelogById.mockResolvedValue({
      ...MOCK_ENTRIES[0],
      status: 'published' as const,
    })
  })

  it('returns 200 with { id, title, content, publishedAt } for published entry', async () => {
    const res = await EntryGET({
      request: makeRequest(),
      params: { entryId: ENTRY_ID_1 },
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.id).toBe(ENTRY_ID_1)
    expect(json.data.title).toBe('Entry One')
    expect(json.data.content).toBe('Content one')
    expect(json.data.publishedAt).toBe(PUBLISHED_DATE.toISOString())
  })

  it('does not expose admin-only fields', async () => {
    const res = await EntryGET({
      request: makeRequest(),
      params: { entryId: ENTRY_ID_1 },
    })
    const json = await res.json()
    expect(json.data.createdAt).toBeUndefined()
    expect(json.data.updatedAt).toBeUndefined()
    expect(json.data.principalId).toBeUndefined()
    expect(json.data.contentJson).toBeUndefined()
  })

  it('returns 404 when entry is not found (CHANGELOG_NOT_FOUND)', async () => {
    mockGetChangelogById.mockRejectedValue({
      code: 'CHANGELOG_NOT_FOUND',
      message: 'Changelog entry not found',
    })
    const res = await EntryGET({
      request: makeRequest(),
      params: { entryId: 'changelog_missing' },
    })
    expect(res.status).toBe(404)
  })

  it('returns 404 when entry status is draft (not published)', async () => {
    mockGetChangelogById.mockResolvedValue({
      ...MOCK_ENTRIES[0],
      publishedAt: null,
      status: 'draft' as const,
    })
    const res = await EntryGET({
      request: makeRequest(),
      params: { entryId: ENTRY_ID_1 },
    })
    expect(res.status).toBe(404)
  })

  it('returns 404 when entry status is scheduled (not yet published)', async () => {
    mockGetChangelogById.mockResolvedValue({
      ...MOCK_ENTRIES[0],
      publishedAt: new Date(Date.now() + 86400000),
      status: 'scheduled' as const,
    })
    const res = await EntryGET({
      request: makeRequest(),
      params: { entryId: ENTRY_ID_1 },
    })
    expect(res.status).toBe(404)
  })

  it('serializes null publishedAt as null for published entry edge case', async () => {
    mockGetChangelogById.mockResolvedValue({
      ...MOCK_ENTRIES[0],
      publishedAt: null,
      status: 'published' as const,
    })
    // status=published but publishedAt=null edge — route returns the entry anyway
    const res = await EntryGET({
      request: makeRequest(),
      params: { entryId: ENTRY_ID_1 },
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.publishedAt).toBeNull()
  })
})
