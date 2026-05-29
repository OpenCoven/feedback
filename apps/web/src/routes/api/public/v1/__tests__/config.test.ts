import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetPublicWidgetConfig = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: vi.fn(() => (opts: unknown) => ({ options: opts })),
}))
vi.mock('@/lib/server/domains/settings/settings.widget', () => ({
  getPublicWidgetConfig: (...args: unknown[]) => mockGetPublicWidgetConfig(...args),
}))

import { Route } from '../config'

type RouteOpts = { server: { handlers: { GET: () => Promise<Response> } } }
const GET = (Route as unknown as { options: RouteOpts }).options.server.handlers.GET

const MOCK_CONFIG = {
  enabled: true,
  defaultBoard: 'board_abc',
  position: 'bottom-right',
  tabs: ['feedback', 'changelog'],
  hmacRequired: false,
  imageUploadsInWidget: true,
}

describe('GET /api/public/v1/config', () => {
  beforeEach(() => {
    mockGetPublicWidgetConfig.mockReset()
  })

  it('returns 200 with the public widget config in data envelope', async () => {
    mockGetPublicWidgetConfig.mockResolvedValue(MOCK_CONFIG)
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toEqual(MOCK_CONFIG)
  })

  it('delegates errors to handleDomainError', async () => {
    mockGetPublicWidgetConfig.mockRejectedValue({ code: 'NOT_FOUND', message: 'not found' })
    const res = await GET()
    expect(res.status).toBe(404)
  })
})
