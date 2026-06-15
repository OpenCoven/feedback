import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrincipalId, UserId } from '@opencoven-feedback/ids'

const mockSessionFindFirst = vi.fn()
const mockPrincipalFindFirst = vi.fn()
const mockInsertPrincipal = vi.fn()
const mockGenerateId = vi.fn()

vi.mock('@/lib/server/db', () => ({
  db: {
    query: {
      session: { findFirst: (...args: unknown[]) => mockSessionFindFirst(...args) },
      principal: { findFirst: (...args: unknown[]) => mockPrincipalFindFirst(...args) },
    },
    insert: () => ({
      values: () => ({
        returning: () => mockInsertPrincipal(),
      }),
    }),
  },
  session: { token: 'token', expiresAt: 'expires_at' },
  principal: { userId: 'user_id' },
  eq: vi.fn(),
  and: vi.fn(),
  gt: vi.fn(),
}))

vi.mock('@opencoven-feedback/ids', () => ({
  generateId: (...args: unknown[]) => mockGenerateId(...args),
}))

import { optionalPortalSession, requirePortalSession } from '../portal-auth'
import { UnauthorizedError } from '@/lib/shared/errors'

const USER_ID = 'user_abc123' as unknown as UserId
const PRINCIPAL_ID = 'principal_01kqhxq697fvgat0fn8rr1r7ew' as unknown as PrincipalId

const sessionRow = {
  token: 'tok_valid',
  expiresAt: new Date(Date.now() + 3600_000),
  userId: USER_ID,
  user: {
    id: USER_ID,
    email: 'alice@example.com',
    name: 'Alice',
    image: 'https://example.com/avatar.png',
  },
}

const principalRow = {
  id: PRINCIPAL_ID,
  userId: USER_ID,
  role: 'user',
  type: 'user',
  displayName: 'Alice',
  avatarUrl: null,
}

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://test/api/public/v1/test', { headers })
}

describe('optionalPortalSession', () => {
  beforeEach(() => {
    mockSessionFindFirst.mockReset()
    mockPrincipalFindFirst.mockReset()
    mockInsertPrincipal.mockReset()
    mockGenerateId.mockReset()
  })

  it('returns null when no authorization header is present', async () => {
    const result = await optionalPortalSession(makeRequest())
    expect(result).toBeNull()
    expect(mockSessionFindFirst).not.toHaveBeenCalled()
  })

  it('returns null when authorization header is not a Bearer token', async () => {
    const result = await optionalPortalSession(makeRequest({ authorization: 'Basic dXNlcjpwYXNz' }))
    expect(result).toBeNull()
    expect(mockSessionFindFirst).not.toHaveBeenCalled()
  })

  it('returns null when session lookup returns undefined', async () => {
    mockSessionFindFirst.mockResolvedValue(undefined)
    const result = await optionalPortalSession(makeRequest({ authorization: 'Bearer tok_missing' }))
    expect(result).toBeNull()
  })

  it('returns null when session row has no user', async () => {
    mockSessionFindFirst.mockResolvedValue({ ...sessionRow, user: null })
    const result = await optionalPortalSession(makeRequest({ authorization: 'Bearer tok_valid' }))
    expect(result).toBeNull()
  })

  it('returns null when session user has a null email', async () => {
    mockSessionFindFirst.mockResolvedValue({
      ...sessionRow,
      user: { ...sessionRow.user, email: null },
    })
    const result = await optionalPortalSession(makeRequest({ authorization: 'Bearer tok_valid' }))
    expect(result).toBeNull()
  })

  it('returns null when session user has an empty string email', async () => {
    mockSessionFindFirst.mockResolvedValue({
      ...sessionRow,
      user: { ...sessionRow.user, email: '' },
    })
    const result = await optionalPortalSession(makeRequest({ authorization: 'Bearer tok_valid' }))
    expect(result).toBeNull()
  })

  it('returns null when insert returning() yields an empty array', async () => {
    mockSessionFindFirst.mockResolvedValue(sessionRow)
    mockPrincipalFindFirst.mockResolvedValue(null)
    mockGenerateId.mockReturnValue('principal_new_01')
    mockInsertPrincipal.mockResolvedValue([])

    const result = await optionalPortalSession(makeRequest({ authorization: 'Bearer tok_valid' }))
    expect(result).toBeNull()
  })

  it('returns user + principal when session is valid and principal exists', async () => {
    mockSessionFindFirst.mockResolvedValue(sessionRow)
    mockPrincipalFindFirst.mockResolvedValue(principalRow)

    const result = await optionalPortalSession(makeRequest({ authorization: 'Bearer tok_valid' }))

    expect(result).not.toBeNull()
    expect(result?.user.id).toBe(USER_ID)
    expect(result?.user.email).toBe('alice@example.com')
    expect(result?.user.name).toBe('Alice')
    expect(result?.user.image).toBe('https://example.com/avatar.png')
    expect(result?.principal.id).toBe(PRINCIPAL_ID)
    expect(result?.principal.role).toBe('user')
    expect(result?.principal.type).toBe('user')
  })

  it('inserts a principal and returns it when no principal exists for the user', async () => {
    const newPrincipalId = 'principal_new_01' as unknown as PrincipalId
    const newPrincipalRow = {
      id: newPrincipalId,
      userId: USER_ID,
      role: 'user',
      type: 'user',
      displayName: 'Alice',
      avatarUrl: null,
    }
    mockSessionFindFirst.mockResolvedValue(sessionRow)
    mockPrincipalFindFirst.mockResolvedValue(null)
    mockGenerateId.mockReturnValue(newPrincipalId)
    mockInsertPrincipal.mockResolvedValue([newPrincipalRow])

    const result = await optionalPortalSession(makeRequest({ authorization: 'Bearer tok_valid' }))

    expect(mockGenerateId).toHaveBeenCalledWith('principal')
    expect(mockInsertPrincipal).toHaveBeenCalled()
    expect(result?.principal.id).toBe(newPrincipalId)
    expect(result?.principal.role).toBe('user')
  })
})

describe('requirePortalSession', () => {
  beforeEach(() => {
    mockSessionFindFirst.mockReset()
    mockPrincipalFindFirst.mockReset()
    mockInsertPrincipal.mockReset()
    mockGenerateId.mockReset()
  })

  it('throws UnauthorizedError when no authorization header', async () => {
    await expect(requirePortalSession(makeRequest())).rejects.toThrow(UnauthorizedError)
  })

  it('throws UnauthorizedError when token is invalid (no session found)', async () => {
    mockSessionFindFirst.mockResolvedValue(undefined)
    await expect(
      requirePortalSession(makeRequest({ authorization: 'Bearer tok_bad' }))
    ).rejects.toThrow(UnauthorizedError)
  })

  it('returns session when valid', async () => {
    mockSessionFindFirst.mockResolvedValue(sessionRow)
    mockPrincipalFindFirst.mockResolvedValue(principalRow)

    const result = await requirePortalSession(makeRequest({ authorization: 'Bearer tok_valid' }))
    expect(result.user.email).toBe('alice@example.com')
    expect(result.principal.role).toBe('user')
  })
})
