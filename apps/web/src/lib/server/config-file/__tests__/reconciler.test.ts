import { describe, it, expect, vi } from 'vitest'
import { reconcileFileIntoDb, type ReconcileDeps } from '../reconciler'

const baseDeps = (): ReconcileDeps => ({
  readSettings: vi.fn(async () => ({
    id: 'ws_1',
    name: 'Old',
    slug: 'old',
    setupState: JSON.stringify({
      version: 1,
      steps: { core: true, workspace: false, boards: false },
    }),
    tierLimits: null,
    featureFlags: null,
    authConfig: null,
    managedFieldPaths: [],
    state: 'active' as const,
  })),
  updateSettings: vi.fn(async () => {}),
  invalidateSettingsCache: vi.fn(async () => {}),
  invalidateTierLimitsCache: vi.fn(async () => {}),
  resetAuth: vi.fn(async () => {}),
})

describe('reconcileFileIntoDb', () => {
  it('writes name + slug + managedFieldPaths when workspace is in spec', async () => {
    const deps = baseDeps()
    await reconcileFileIntoDb({ workspace: { name: 'Acme', slug: 'acme' } }, deps)
    expect(deps.updateSettings).toHaveBeenCalledTimes(1)
    const arg = (deps.updateSettings as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(arg.name).toBe('Acme')
    expect(arg.slug).toBe('acme')
    expect(arg.managedFieldPaths).toEqual(['workspace.name', 'workspace.slug'])
  })

  it('marks setupState.steps.workspace=true when workspace.name is managed', async () => {
    const deps = baseDeps()
    await reconcileFileIntoDb({ workspace: { name: 'Acme' } }, deps)
    const arg = (deps.updateSettings as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    const setup = JSON.parse(arg.setupState as string)
    expect(setup.steps.workspace).toBe(true)
  })

  it('writes tierLimits as a JSON-encoded string', async () => {
    const deps = baseDeps()
    await reconcileFileIntoDb({ tierLimits: { maxBoards: 7 } }, deps)
    const arg = (deps.updateSettings as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(JSON.parse(arg.tierLimits as string)).toEqual({ maxBoards: 7 })
    expect(arg.managedFieldPaths).toEqual(['tierLimits'])
  })

  it('per-key merges features over existing flags', async () => {
    const deps = baseDeps()
    deps.readSettings = vi.fn(async () => ({
      id: 'ws_1',
      name: 'X',
      slug: 'x',
      setupState: null,
      tierLimits: null,
      featureFlags: JSON.stringify({ helpCenter: false, other: true }),
      authConfig: null,
      managedFieldPaths: [],
      state: 'active' as const,
    }))
    await reconcileFileIntoDb({ features: { helpCenter: true } }, deps)
    const arg = (deps.updateSettings as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(JSON.parse(arg.featureFlags as string)).toEqual({ helpCenter: true, other: true })
    expect(arg.managedFieldPaths).toEqual(['features.helpCenter'])
  })

  it('clears managedFieldPaths when called with an empty spec', async () => {
    const deps = baseDeps()
    deps.readSettings = vi.fn(async () => ({
      id: 'ws_1',
      name: 'X',
      slug: 'x',
      setupState: null,
      tierLimits: null,
      featureFlags: null,
      authConfig: null,
      managedFieldPaths: ['tierLimits', 'workspace.name'],
      state: 'active' as const,
    }))
    await reconcileFileIntoDb({}, deps)
    const arg = (deps.updateSettings as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(arg.managedFieldPaths).toEqual([])
  })

  it('invalidates settings + tier-limits caches after every reconcile', async () => {
    const deps = baseDeps()
    await reconcileFileIntoDb({ tierLimits: { maxBoards: 1 } }, deps)
    expect(deps.invalidateSettingsCache).toHaveBeenCalledTimes(1)
    expect(deps.invalidateTierLimitsCache).toHaveBeenCalledTimes(1)
  })

  it('calls resetAuth when features are managed (auth plugins gate on flags)', async () => {
    const deps = baseDeps()
    await reconcileFileIntoDb({ features: { helpCenter: true } }, deps)
    expect(deps.resetAuth).toHaveBeenCalledTimes(1)
  })

  it('does NOT call resetAuth when only tierLimits change', async () => {
    const deps = baseDeps()
    await reconcileFileIntoDb({ tierLimits: { maxBoards: 1 } }, deps)
    expect(deps.resetAuth).not.toHaveBeenCalled()
  })

  it('skips updateSettings when nothing has changed', async () => {
    const deps = baseDeps()
    deps.readSettings = vi.fn(async () => ({
      id: 'ws_1',
      name: 'Acme',
      slug: 'acme',
      setupState: JSON.stringify({
        version: 1,
        steps: { core: true, workspace: true, boards: false },
      }),
      tierLimits: null,
      featureFlags: null,
      authConfig: null,
      managedFieldPaths: ['workspace.name', 'workspace.slug'],
      state: 'active' as const,
    }))
    await reconcileFileIntoDb({ workspace: { name: 'Acme', slug: 'acme' } }, deps)
    expect(deps.updateSettings).not.toHaveBeenCalled()
  })

  it('writes state when spec.state is set', async () => {
    const deps = baseDeps()
    await reconcileFileIntoDb({ state: 'suspended' }, deps)
    const arg = (deps.updateSettings as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(arg.state).toBe('suspended')
    expect(arg.managedFieldPaths).toEqual(['state'])
  })

  it('per-key merges auth.oauth over existing config', async () => {
    const deps = baseDeps()
    deps.readSettings = vi.fn(async () => ({
      id: 'ws_1',
      name: 'X',
      slug: 'x',
      setupState: null,
      tierLimits: null,
      featureFlags: null,
      authConfig: JSON.stringify({
        oauth: { google: false, github: true },
        openSignup: true,
      }),
      managedFieldPaths: [],
      state: 'active' as const,
    }))
    await reconcileFileIntoDb({ auth: { oauth: { google: true } } }, deps)
    const arg = (deps.updateSettings as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    const merged = JSON.parse(arg.authConfig as string)
    expect(merged.oauth).toEqual({ google: true, github: true })
    expect(merged.openSignup).toBe(true)
    expect(arg.managedFieldPaths).toEqual(['auth.oauth.google'])
    expect(deps.resetAuth).toHaveBeenCalled()
  })

  it('writes openSignup leaf without nuking existing oauth providers', async () => {
    const deps = baseDeps()
    deps.readSettings = vi.fn(async () => ({
      id: 'ws_1',
      name: 'X',
      slug: 'x',
      setupState: null,
      tierLimits: null,
      featureFlags: null,
      authConfig: JSON.stringify({
        oauth: { google: true, github: true },
        openSignup: false,
      }),
      managedFieldPaths: [],
      state: 'active' as const,
    }))
    await reconcileFileIntoDb({ auth: { openSignup: true } }, deps)
    const arg = (deps.updateSettings as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    const merged = JSON.parse(arg.authConfig as string)
    expect(merged.oauth).toEqual({ google: true, github: true })
    expect(merged.openSignup).toBe(true)
    expect(arg.managedFieldPaths).toEqual(['auth.openSignup'])
    expect(deps.resetAuth).toHaveBeenCalled()
  })

  it('does NOT call resetAuth when only tierLimits change (auth-untouched path)', async () => {
    const deps = baseDeps()
    await reconcileFileIntoDb({ tierLimits: { maxBoards: 1 } }, deps)
    expect(deps.resetAuth).not.toHaveBeenCalled()
  })
})
