import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const hoisted = vi.hoisted(() => {
  const updateWhere = vi.fn().mockResolvedValue(undefined)
  return {
    insertValues: vi.fn().mockResolvedValue(undefined),
    updateWhere,
    updateSet: vi.fn(() => ({ where: updateWhere })),
  }
})

vi.mock('@/lib/server/db', () => ({
  db: {
    query: {
      principal: { findFirst: vi.fn() },
      settings: { findFirst: vi.fn() },
      postStatuses: { findFirst: vi.fn() },
    },
    insert: vi.fn(() => ({ values: hoisted.insertValues })),
    update: vi.fn(() => ({ set: hoisted.updateSet })),
  },
  settings: { id: 'settings.id' },
  principal: { role: 'principal.role', userId: 'principal.userId', type: 'principal.type' },
  postStatuses: {},
  eq: vi.fn((left, right) => ({ left, right })),
  and: vi.fn((...conditions) => ({ and: conditions })),
  DEFAULT_STATUSES: [],
}))

vi.mock('@/lib/server/auth', () => ({
  getAuth: vi.fn(),
}))

vi.mock('@/lib/server/auth/magic-link-mint', () => ({
  mintMagicLinkUrl: vi.fn(),
}))

vi.mock('@/lib/server/domains/settings/settings.helpers', () => ({
  invalidateSettingsCache: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/server/domains/settings', () => ({
  DEFAULT_AUTH_CONFIG: { oauth: { google: true, github: true, password: true }, openSignup: false },
  DEFAULT_PORTAL_CONFIG: { oauth: { password: true, magicLink: true }, features: {} },
}))

vi.mock('@/lib/shared/utils', () => ({
  slugify: (value: string) =>
    value
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, ''),
}))

vi.mock('@opencoven-feedback/ids', () => ({
  generateId: (prefix: string) => `${prefix}_test`,
}))

import { getAuth } from '@/lib/server/auth'
import { mintMagicLinkUrl } from '@/lib/server/auth/magic-link-mint'
import { db } from '@/lib/server/db'
import { handleCloudBootstrap } from '../bootstrap'

const dbMock = db as unknown as {
  query: {
    principal: { findFirst: ReturnType<typeof vi.fn> }
    settings: { findFirst: ReturnType<typeof vi.fn> }
    postStatuses: { findFirst: ReturnType<typeof vi.fn> }
  }
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}

function makeReq(opts: { body?: unknown; authHeader?: string | null } = {}): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.authHeader !== null) headers.Authorization = opts.authHeader ?? 'Bearer test-token'

  return new Request('http://acme.example.com/api/cloud/bootstrap', {
    method: 'POST',
    headers,
    body:
      opts.body === undefined
        ? JSON.stringify({ email: 'Founder@Acme.com', workspaceName: 'Acme Feedback' })
        : typeof opts.body === 'string'
          ? opts.body
          : JSON.stringify(opts.body),
  })
}

describe('POST /api/cloud/bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CLOUD_BOOTSTRAP_TOKEN = 'test-token'
    dbMock.query.principal.findFirst.mockResolvedValue(undefined)
    dbMock.query.settings.findFirst.mockResolvedValue(undefined)
    dbMock.query.postStatuses.findFirst.mockResolvedValue(undefined)
    vi.mocked(getAuth).mockResolvedValue({
      api: { signUpEmail: vi.fn().mockResolvedValue({ user: { id: 'user_admin' } }) },
    } as never)
    vi.mocked(mintMagicLinkUrl).mockResolvedValue('https://acme.example.com/verify?token=claim')
  })

  afterEach(() => {
    delete process.env.CLOUD_BOOTSTRAP_TOKEN
  })

  it('404s when CLOUD_BOOTSTRAP_TOKEN is unset', async () => {
    delete process.env.CLOUD_BOOTSTRAP_TOKEN
    const res = await handleCloudBootstrap({ request: makeReq() })
    expect(res.status).toBe(404)
  })

  it('401s when bearer token is missing or incorrect', async () => {
    await expect(
      handleCloudBootstrap({ request: makeReq({ authHeader: null }) })
    ).resolves.toHaveProperty('status', 401)
    await expect(
      handleCloudBootstrap({ request: makeReq({ authHeader: 'Bearer wrong-token' }) })
    ).resolves.toHaveProperty('status', 401)
  })

  it('400s when required fields are missing', async () => {
    const res = await handleCloudBootstrap({
      request: makeReq({ body: { email: 'founder@acme.com' } }),
    })
    expect(res.status).toBe(400)
  })

  it('409s when a different admin already exists', async () => {
    dbMock.query.principal.findFirst.mockResolvedValueOnce({
      role: 'admin',
      user: { id: 'user_other', email: 'other@example.com' },
    })

    const res = await handleCloudBootstrap({ request: makeReq() })

    expect(res.status).toBe(409)
    expect(vi.mocked(getAuth)).not.toHaveBeenCalled()
    expect(vi.mocked(mintMagicLinkUrl)).not.toHaveBeenCalled()
  })

  it('creates the intended admin and returns a bounded claim URL', async () => {
    const signUpEmail = vi.fn().mockResolvedValue({ user: { id: 'user_admin' } })
    vi.mocked(getAuth).mockResolvedValue({ api: { signUpEmail } } as never)

    const res = await handleCloudBootstrap({ request: makeReq() })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      claimUrl: 'https://acme.example.com/verify?token=claim',
      expiresInDays: 7,
      userId: 'user_admin',
    })
    expect(signUpEmail).toHaveBeenCalledWith({
      body: expect.objectContaining({
        email: 'founder@acme.com',
        name: 'Acme Feedback',
        password: expect.any(String),
      }),
      headers: expect.any(Headers),
    })
    expect(vi.mocked(mintMagicLinkUrl)).toHaveBeenCalledWith({
      email: 'founder@acme.com',
      portalUrl: 'https://acme.example.com',
      callbackPath: '/admin/feedback',
      errorCallbackPath: '/admin/login',
      expiresInSeconds: 604800,
    })
    expect(hoisted.updateSet).toHaveBeenCalledWith({ role: 'admin' })
  })

  it('is idempotent for the same admin email', async () => {
    dbMock.query.principal.findFirst.mockResolvedValueOnce({
      role: 'admin',
      user: { id: 'user_existing', email: 'founder@acme.com' },
    })

    const res = await handleCloudBootstrap({ request: makeReq() })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ userId: 'user_existing' })
    expect(vi.mocked(getAuth)).toHaveBeenCalledOnce()
    expect(vi.mocked(mintMagicLinkUrl)).toHaveBeenCalledOnce()
  })
})
