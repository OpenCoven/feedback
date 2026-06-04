/**
 * Principal cache invalidation tests.
 *
 * Verifies that updateMemberRole and removeTeamMember invalidate the
 * PRINCIPAL_BY_USER cache so the SSR bootstrap sees role changes
 * without waiting for the 5min TTL.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PrincipalId, UserId } from '@opencoven-feedback/ids'

const mockCacheDel = vi.fn()

vi.mock('@/lib/server/redis', () => ({
  cacheDel: (...args: unknown[]) => mockCacheDel(...args),
  CACHE_KEYS: {
    PRINCIPAL_BY_USER: (userId: string) => `principal:user:${userId}`,
  },
}))

const mockFindFirst = vi.fn()
const mockFindMany = vi.fn()
const mockSelect = vi.fn()
const mockUpdate = vi.fn()
let updateSets: unknown[] = []

vi.mock('@/lib/server/db', () => ({
  db: {
    query: {
      principal: { findFirst: (...a: unknown[]) => mockFindFirst(...a) },
      apiKeys: { findMany: (...a: unknown[]) => mockFindMany(...a) },
    },
    select: (...a: unknown[]) => mockSelect(...a),
    update: (...a: unknown[]) => mockUpdate(...a),
  },
  // Drizzle helpers / table identifiers — only need to be defined, not functional.
  eq: vi.fn(),
  ne: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(() => ({ as: vi.fn() })),
  ilike: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
  principal: { id: 'id', userId: 'userId', role: 'role', type: 'type' },
  apiKeys: { createdById: 'createdById', revokedAt: 'revokedAt' },
  user: {},
}))

const { updateMemberRole, removeTeamMember } = await import('../principal.service')

const ACTING = 'principal_acting' as PrincipalId
const TARGET = 'principal_target' as PrincipalId
const TARGET_USER = 'user_target' as UserId

beforeEach(() => {
  vi.clearAllMocks()
  updateSets = []
  mockCacheDel.mockResolvedValue(undefined)
  mockFindMany.mockResolvedValue([])

  // db.update(principal).set(...).where(...) chain — terminates as a Promise.
  mockUpdate.mockImplementation(() => ({
    set: vi.fn((value) => {
      updateSets.push(value)
      return { where: vi.fn().mockResolvedValue(undefined) }
    }),
  }))

  // Both LAST_ADMIN guards in updateMemberRole + removeTeamMember run
  // db.select({count}).from(principal).where(...). Return count=2 so the
  // guards pass and the mutation proceeds.
  mockSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ count: 2 }]) }),
  })
})

describe('updateMemberRole', () => {
  it('invalidates PRINCIPAL_BY_USER for the target user after role change', async () => {
    mockFindFirst.mockResolvedValue({
      id: TARGET,
      userId: TARGET_USER,
      type: 'user',
      role: 'admin',
    })

    await updateMemberRole(TARGET, 'member', ACTING)

    expect(mockCacheDel).toHaveBeenCalledWith(`principal:user:${TARGET_USER}`)
  })

  it('syncs active API key service principal roles after a demotion', async () => {
    mockFindFirst.mockResolvedValue({
      id: TARGET,
      userId: TARGET_USER,
      type: 'user',
      role: 'admin',
    })
    mockFindMany.mockResolvedValue([
      { principalId: 'principal_api_key_1' },
      { principalId: 'principal_api_key_2' },
    ])

    await updateMemberRole(TARGET, 'member', ACTING)

    expect(updateSets).toEqual(expect.arrayContaining([{ role: 'member' }, { role: 'member' }]))
    expect(mockUpdate).toHaveBeenCalledTimes(2)
  })

  it('does not call cacheDel when the target principal has no userId', async () => {
    // Service principals (API keys) have userId=null; nothing to invalidate.
    mockFindFirst.mockResolvedValue({
      id: TARGET,
      userId: null,
      type: 'service',
      role: 'admin',
    })

    await updateMemberRole(TARGET, 'member', ACTING)

    expect(mockCacheDel).not.toHaveBeenCalled()
  })
})

describe('removeTeamMember', () => {
  it('invalidates PRINCIPAL_BY_USER for the target user after removal', async () => {
    mockFindFirst.mockResolvedValue({
      id: TARGET,
      userId: TARGET_USER,
      type: 'user',
      role: 'member',
    })

    await removeTeamMember(TARGET, ACTING)

    expect(mockCacheDel).toHaveBeenCalledWith(`principal:user:${TARGET_USER}`)
  })

  it('removes team access from active API key service principals after removal', async () => {
    mockFindFirst.mockResolvedValue({
      id: TARGET,
      userId: TARGET_USER,
      type: 'user',
      role: 'member',
    })
    mockFindMany.mockResolvedValue([{ principalId: 'principal_api_key_1' }])

    await removeTeamMember(TARGET, ACTING)

    expect(updateSets).toEqual(expect.arrayContaining([{ role: 'user' }]))
    expect(mockUpdate).toHaveBeenCalledTimes(2)
  })
})
