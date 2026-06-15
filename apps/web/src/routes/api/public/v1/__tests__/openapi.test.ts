import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: vi.fn(() => (opts: unknown) => ({ options: opts })),
}))

vi.mock('@/lib/server/config', () => ({
  config: {
    baseUrl: 'https://example.com',
  },
}))

import { Route } from '../openapi.json'

type RouteOpts = { server: { handlers: { GET: () => Promise<Response> } } }
const GET = (Route as unknown as { options: RouteOpts }).options.server.handlers.GET

describe('GET /api/public/v1/openapi.json', () => {
  it('returns 200', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
  })

  it('returns a valid OpenAPI 3.1 document', async () => {
    const res = await GET()
    const doc = await res.json()
    expect(doc.openapi).toMatch(/^3\./)
  })

  it('includes /api/public/v1/posts in paths', async () => {
    const res = await GET()
    const doc = await res.json()
    expect(Object.keys(doc.paths)).toContain('/api/public/v1/posts')
  })

  it('includes /api/public/v1/posts/{postId}/vote in paths', async () => {
    const res = await GET()
    const doc = await res.json()
    expect(Object.keys(doc.paths)).toContain('/api/public/v1/posts/{postId}/vote')
  })

  it('includes bearerAuth security scheme', async () => {
    const res = await GET()
    const doc = await res.json()
    expect(doc.components?.securitySchemes?.bearerAuth).toBeDefined()
    expect(doc.components.securitySchemes.bearerAuth.type).toBe('http')
    expect(doc.components.securitySchemes.bearerAuth.scheme).toBe('bearer')
  })

  it('sets correct Content-Type header', async () => {
    const res = await GET()
    expect(res.headers.get('Content-Type')).toContain('application/json')
  })

  it('sets CORS header', async () => {
    const res = await GET()
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
})
