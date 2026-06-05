import { beforeEach, describe, expect, it, vi } from 'vitest'

type AnyHandler = (args: { data: Record<string, unknown> }) => Promise<unknown>

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    inputValidator: () => ({
      handler: (fn: AnyHandler) => fn,
    }),
    handler: (fn: AnyHandler) => fn,
  }),
}))

const hoisted = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetSettings: vi.fn(),
  mockAssertNotManaged: vi.fn(),
  mockInvalidateSettingsCache: vi.fn(),
  mockPrincipalFindFirst: vi.fn(),
  mockTxExecute: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockInsertValues: vi.fn(),
  mockTransaction: vi.fn(),
  mockEq: vi.fn((column: string, value: unknown) => ({ op: 'eq', column, value })),
  mockAnd: vi.fn((...conditions: unknown[]) => ({ op: 'and', conditions })),
  mockNe: vi.fn((column: string, value: unknown) => ({ op: 'ne', column, value })),
  mockGenerateId: vi.fn(),
}))

vi.mock('@/lib/server/auth/session', () => ({
  getSession: hoisted.mockGetSession,
}))

vi.mock('../workspace', () => ({
  getSettings: hoisted.mockGetSettings,
}))

vi.mock('@/lib/server/config-file/managed-guard', () => ({
  assertNotManaged: hoisted.mockAssertNotManaged,
}))

vi.mock('@/lib/server/domains/settings/settings.helpers', () => ({
  invalidateSettingsCache: hoisted.mockInvalidateSettingsCache,
}))

vi.mock('@opencoven-feedback/ids', () => ({
  generateId: hoisted.mockGenerateId,
}))

vi.mock('@/lib/server/domains/principals/principal.service', () => ({
  syncPrincipalProfile: vi.fn(),
}))

vi.mock('@/lib/server/domains/boards/board.service', () => ({
  listBoards: vi.fn(),
}))

vi.mock('@/lib/server/domains/settings', () => ({
  DEFAULT_AUTH_CONFIG: {},
  DEFAULT_PORTAL_CONFIG: {},
}))

vi.mock('@/lib/server/config-file/managed-paths', () => ({
  isPathManaged: vi.fn(() => false),
}))

vi.mock('@/lib/server/db', () => ({
  USE_CASE_TYPES: ['saas', 'consumer', 'marketplace', 'internal'],
  DEFAULT_STATUSES: [],
  settings: { id: 'settings.id' },
  principal: {
    id: 'principal.id',
    userId: 'principal.userId',
    role: 'principal.role',
    type: 'principal.type',
  },
  user: { id: 'user.id' },
  postStatuses: {},
  eq: hoisted.mockEq,
  and: hoisted.mockAnd,
  ne: hoisted.mockNe,
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
  db: {
    query: {
      principal: {
        findFirst: hoisted.mockPrincipalFindFirst,
      },
      postStatuses: {
        findFirst: vi.fn(),
      },
    },
    update: vi.fn(() => ({
      set: hoisted.mockUpdateSet.mockImplementation(() => ({
        where: hoisted.mockUpdateWhere.mockResolvedValue(undefined),
        returning: vi.fn().mockResolvedValue([]),
      })),
    })),
    insert: vi.fn(() => ({
      values: hoisted.mockInsertValues.mockResolvedValue(undefined),
    })),
    transaction: hoisted.mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        execute: hoisted.mockTxExecute.mockResolvedValue(undefined),
        query: {
          principal: {
            findFirst: hoisted.mockPrincipalFindFirst,
          },
        },
        update: vi.fn(() => ({
          set: hoisted.mockUpdateSet.mockImplementation(() => ({
            where: hoisted.mockUpdateWhere.mockResolvedValue(undefined),
          })),
        })),
        insert: vi.fn(() => ({
          values: hoisted.mockInsertValues.mockResolvedValue(undefined),
        })),
      })
    ),
  },
}))

const { saveUseCaseFn } = await import('../onboarding')

const incompleteSettings = {
  id: 'workspace_existing',
  setupState: JSON.stringify({
    version: 1,
    steps: { core: true, workspace: false, boards: false },
  }),
}

describe('saveUseCaseFn onboarding admin promotion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hoisted.mockGetSession.mockResolvedValue({ user: { id: 'user_attacker' } })
    hoisted.mockGetSettings.mockResolvedValue(incompleteSettings)
    hoisted.mockAssertNotManaged.mockResolvedValue(undefined)
    hoisted.mockInvalidateSettingsCache.mockResolvedValue(undefined)
    hoisted.mockGenerateId.mockReturnValue('principal_new_admin')
  })

  it('does not promote an existing non-admin principal when a human admin already exists', async () => {
    hoisted.mockPrincipalFindFirst
      .mockResolvedValueOnce({ id: 'principal_attacker', userId: 'user_attacker', role: 'user' })
      .mockResolvedValueOnce({
        id: 'principal_admin',
        userId: 'user_admin',
        role: 'admin',
        type: 'user',
      })

    await expect(saveUseCaseFn({ data: { useCase: 'saas' } })).rejects.toThrow(
      'Only admin can complete setup'
    )

    expect(hoisted.mockUpdateSet).not.toHaveBeenCalled()
    expect(hoisted.mockInsertValues).not.toHaveBeenCalled()
  })

  it('does not promote a non-admin principal when another human principal already exists', async () => {
    hoisted.mockPrincipalFindFirst
      .mockResolvedValueOnce({ id: 'principal_attacker', userId: 'user_attacker', role: 'user' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'principal_other', userId: 'user_other', role: 'user' })

    await expect(saveUseCaseFn({ data: { useCase: 'saas' } })).rejects.toThrow(
      'Only admin can complete setup'
    )

    expect(hoisted.mockUpdateSet).not.toHaveBeenCalled()
    expect(hoisted.mockInsertValues).not.toHaveBeenCalled()
  })

  it('still bootstraps an admin principal when no other human principal exists', async () => {
    hoisted.mockPrincipalFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)

    await saveUseCaseFn({ data: { useCase: 'saas' } })

    expect(hoisted.mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'principal_new_admin',
        userId: 'user_attacker',
        role: 'admin',
      })
    )
    expect(hoisted.mockUpdateSet).toHaveBeenCalledWith({
      setupState: JSON.stringify({
        version: 1,
        steps: { core: true, workspace: false, boards: false },
        useCase: 'saas',
      }),
    })
    expect(hoisted.mockInvalidateSettingsCache).toHaveBeenCalledOnce()
  })
})
