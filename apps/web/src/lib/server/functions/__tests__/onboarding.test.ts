import { beforeEach, describe, expect, it, vi } from 'vitest'

const { state, principalTable, settingsTable, postStatusesTable, userTable } = vi.hoisted(() => ({
  state: {
    sessionUserId: 'user_attacker',
    currentSettings: null as null | {
      id: string
      name: string
      slug: string
      setupState: string
      portalConfig?: string | null
      authConfig?: string | null
      managedFieldPaths?: string[] | null
    },
    principals: [] as Array<{
      id: string
      userId: string
      role: string
      type: string
      createdAt?: Date
    }>,
    inserts: [] as Array<{ table: string; values: unknown }>,
    updates: [] as Array<{ table: string; values: Record<string, unknown>; where: unknown }>,
    statusesExist: true,
  },
  principalTable: {
    userId: 'principal.userId',
    role: 'principal.role',
    type: 'principal.type',
    tableName: 'principal',
  },
  settingsTable: { id: 'settings.id', tableName: 'settings' },
  postStatusesTable: { tableName: 'postStatuses' },
  userTable: { id: 'user.id', tableName: 'user' },
}))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    const chain = {
      inputValidator: () => chain,
      handler: (fn: unknown) => fn,
    }
    return chain
  },
}))

vi.mock('@opencoven-feedback/ids', () => ({
  generateId: (prefix: string) => `${prefix}_generated`,
}))

vi.mock('@/lib/server/auth/session', () => ({
  getSession: async () => ({ user: { id: state.sessionUserId } }),
}))

vi.mock('@/lib/server/functions/workspace', () => ({
  getSettings: async () => state.currentSettings,
}))

vi.mock('@/lib/server/config-file/managed-guard', () => ({
  assertNotManaged: async () => undefined,
}))

vi.mock('@/lib/server/config-file/managed-paths', () => ({
  isPathManaged: () => false,
}))

vi.mock('@/lib/server/domains/settings/settings.helpers', () => ({
  invalidateSettingsCache: async () => undefined,
}))

vi.mock('@/lib/server/domains/settings', () => ({
  DEFAULT_AUTH_CONFIG: { openSignup: false },
  DEFAULT_PORTAL_CONFIG: { oauth: {}, features: {} },
}))

vi.mock('@/lib/server/domains/principals/principal.service', () => ({
  syncPrincipalProfile: async () => undefined,
}))

vi.mock('@/lib/server/domains/boards/board.service', () => ({
  listBoards: async () => [],
}))

function matchesWhere(row: Record<string, unknown>, where: unknown): boolean {
  if (!where || typeof where !== 'object') return false
  const clause = where as { op?: string; col?: string; value?: unknown; conditions?: unknown[] }
  if (clause.op === 'and') {
    return clause.conditions?.every((condition) => matchesWhere(row, condition)) ?? false
  }
  if (clause.col === principalTable.userId) return row.userId === clause.value
  if (clause.col === principalTable.role) return row.role === clause.value
  if (clause.col === principalTable.type) return row.type === clause.value
  if (clause.col === settingsTable.id) return row.id === clause.value
  return false
}

vi.mock('@/lib/server/db', () => ({
  USE_CASE_TYPES: ['saas', 'consumer', 'marketplace', 'internal'],
  DEFAULT_STATUSES: [],
  principal: principalTable,
  settings: settingsTable,
  postStatuses: postStatusesTable,
  user: userTable,
  eq: (col: string, value: unknown) => ({ op: 'eq', col, value }),
  and: (...conditions: unknown[]) => ({ op: 'and', conditions }),
  db: {
    query: {
      principal: {
        findFirst: async ({ where }: { where: unknown }) =>
          state.principals.find((row) => matchesWhere(row, where)) ?? null,
      },
      postStatuses: {
        findFirst: async () => (state.statusesExist ? { id: 'status_existing' } : null),
      },
    },
    insert: (table: { tableName?: string }) => ({
      values: (values: unknown) => {
        const tableName = table.tableName ?? 'principal'
        state.inserts.push({ table: tableName, values })
        if (table === principalTable) {
          state.principals.push({
            ...(values as { id: string; userId: string; role: string }),
            type: 'user',
          })
        }
        return {
          returning: async () => {
            if (table === settingsTable) {
              state.currentSettings = values as NonNullable<typeof state.currentSettings>
              return [state.currentSettings]
            }
            return [values]
          },
        }
      },
    }),
    update: (table: { tableName?: string }) => ({
      set: (values: Record<string, unknown>) => ({
        where: (where: unknown) => {
          const tableName = table.tableName ?? 'principal'
          state.updates.push({ table: tableName, values, where })
          if (table === principalTable) {
            const row = state.principals.find((principal) => matchesWhere(principal, where))
            if (row) Object.assign(row, values)
          }
          if (table === settingsTable && state.currentSettings) {
            state.currentSettings = { ...state.currentSettings, ...values }
          }
          return {
            returning: async () => [state.currentSettings],
          }
        },
      }),
    }),
  },
}))

beforeEach(() => {
  state.sessionUserId = 'user_attacker'
  state.currentSettings = {
    id: 'settings_existing',
    name: 'Existing',
    slug: 'existing',
    setupState: JSON.stringify({
      version: 1,
      steps: { core: true, workspace: false, boards: false },
    }),
    portalConfig: null,
    authConfig: null,
    managedFieldPaths: null,
  }
  state.principals = [
    { id: 'principal_owner', userId: 'user_owner', role: 'admin', type: 'user' },
    { id: 'principal_attacker', userId: 'user_attacker', role: 'user', type: 'user' },
  ]
  state.inserts = []
  state.updates = []
  state.statusesExist = true
})

describe('onboarding authorization', () => {
  it('does not promote a non-admin caller during an existing mid-onboarding setup', async () => {
    const { setupWorkspaceFn } = await import('../onboarding')

    await expect(
      setupWorkspaceFn({ data: { workspaceName: 'Pwned Workspace', useCase: 'saas' } })
    ).rejects.toThrow('Only admin can complete setup')

    expect(state.principals.find((row) => row.userId === 'user_attacker')?.role).toBe('user')
    expect(state.inserts).toEqual([])
    expect(state.updates).toEqual([])
  })

  it('does not let saveUseCaseFn mutate settings when another human admin exists', async () => {
    const { saveUseCaseFn } = await import('../onboarding')

    await expect(saveUseCaseFn({ data: { useCase: 'saas' } })).rejects.toThrow(
      'Only admin can complete setup'
    )

    expect(JSON.parse(state.currentSettings!.setupState).useCase).toBeUndefined()
    expect(state.principals.find((row) => row.userId === 'user_attacker')?.role).toBe('user')
    expect(state.inserts).toEqual([])
    expect(state.updates).toEqual([])
  })

  it('still bootstraps the first authenticated human user when no admin exists', async () => {
    state.principals = [
      { id: 'principal_first', userId: 'user_attacker', role: 'user', type: 'user' },
    ]

    const { saveUseCaseFn } = await import('../onboarding')

    await saveUseCaseFn({ data: { useCase: 'saas' } })

    expect(state.principals.find((row) => row.userId === 'user_attacker')?.role).toBe('admin')
    expect(JSON.parse(state.currentSettings!.setupState).useCase).toBe('saas')
  })
})
