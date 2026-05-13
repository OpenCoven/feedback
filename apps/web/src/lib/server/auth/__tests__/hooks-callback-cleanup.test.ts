/**
 * Layer C post-session OAuth callback cleanup
 * (`handleCallbackPolicyCleanup`).
 *
 * Better-Auth's OAuth callback handler runs `setSessionCookie` and
 * populates `ctx.context.newSession` BEFORE the after-hook fires. By
 * the time we get here a real session row exists and the cookie is set
 * on the response. The cleanup helper's job is to inspect the resulting
 * principal+provider, and if the policy says reject, delete the session
 * row, clear the cookie, throw a redirect — and for brand-new sign-ups
 * (user.createdAt < 60s old) wipe the user / account / principal shells
 * so a blocked first attempt doesn't leave dangling rows.
 *
 * Important: `isHardBound` only matches `credential` and `magic-link`.
 * The OAuth-callback paths exercised in production carry inferred
 * provider ids like `google` / `github` / `sso`, none of which trigger
 * the hard-binding branch. The non-SSO blocking we see in production
 * happens via the `isAuthMethodAllowed` fall-through (oauth toggle off
 * or credentials missing). Layer A (registration filter) is what
 * actually prevents google/github from running when SSO is required.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { makeAuthConfig, makeTenant, makeVerifiedDomain } from './_helpers'

const mockPrincipalFindFirst = vi.fn()
const mockUserFindFirst = vi.fn()
const mockSessionDeleteWhere = vi.fn(async () => undefined)
const mockUserDeleteWhere = vi.fn(async () => undefined)
const mockAccountDeleteWhere = vi.fn(async () => undefined)
const mockPrincipalDeleteWhere = vi.fn(async () => undefined)
const mockDeleteSessionCookie = vi.fn()
const mockGetPublicPortalConfig = vi.fn()
const mockHasPlatformCredentials = vi.fn()

vi.mock('@/lib/server/db', () => ({
  db: {
    query: {
      principal: { findFirst: (...a: unknown[]) => mockPrincipalFindFirst(...a) },
      user: { findFirst: (...a: unknown[]) => mockUserFindFirst(...a) },
    },
    delete: (table: { __name: string }) => {
      if (table.__name === 'session') return { where: mockSessionDeleteWhere }
      if (table.__name === 'user') return { where: mockUserDeleteWhere }
      if (table.__name === 'account') return { where: mockAccountDeleteWhere }
      if (table.__name === 'principal') return { where: mockPrincipalDeleteWhere }
      throw new Error(`unexpected delete: ${String(table.__name)}`)
    },
  },
  user: { __name: 'user', id: 'user_id' },
  principal: { __name: 'principal', userId: 'principal_userId' },
  session: { __name: 'session', token: 'session_token' },
  account: { __name: 'account', userId: 'account_userId' },
  eq: vi.fn(),
}))

vi.mock('better-auth/cookies', () => ({
  deleteSessionCookie: (...a: unknown[]) => mockDeleteSessionCookie(...a),
}))

vi.mock('@/lib/server/domains/settings/settings.service', () => ({
  getPublicPortalConfig: (...a: unknown[]) => mockGetPublicPortalConfig(...a),
}))

vi.mock('@/lib/server/domains/platform-credentials/platform-credential.service', () => ({
  hasPlatformCredentials: (...a: unknown[]) => mockHasPlatformCredentials(...a),
}))

// Default mirrors production: registered iff admin enabled SSO. Tests
// for tier-downgrade / missing-secret override.
const mockIsSsoActuallyRegistered = vi.fn(
  async (sso: { enabled?: boolean } | undefined, _tier: unknown) => sso?.enabled === true
)
vi.mock('@/lib/server/auth/sso-secret', () => ({
  isSsoActuallyRegistered: (sso: { enabled?: boolean } | undefined, tier: unknown) =>
    mockIsSsoActuallyRegistered(sso, tier),
}))

vi.mock('@/lib/server/domains/settings/tier-limits.service', () => ({
  getTierLimits: async () => ({ features: { customOidcProvider: true } }),
}))

const { handleCallbackPolicyCleanup } = await import('../hooks')

const tenantSettings = (
  k: {
    required?: boolean
    passwordEnabled?: boolean
    googleEnabled?: boolean
    verifiedDomains?: ReturnType<typeof makeVerifiedDomain>[]
  } = {}
) =>
  makeTenant({
    authConfig: makeAuthConfig({
      oauth: { password: k.passwordEnabled, google: k.googleEnabled },
      ssoOidc: { required: k.required },
    }),
    verifiedDomains: k.verifiedDomains ?? [],
  })

function ctxFor(opts: {
  path: string
  providerParam?: string
  bodyProvider?: string
  userId?: string
  email?: string
  token?: string
}) {
  return {
    path: opts.path,
    params: opts.providerParam ? { providerId: opts.providerParam } : {},
    body: opts.bodyProvider ? { provider: opts.bodyProvider } : {},
    context: {
      newSession: {
        user: opts.userId ? { id: opts.userId, email: opts.email } : undefined,
        session: opts.token ? { token: opts.token } : undefined,
      },
    },
    redirect: vi.fn((url: string) => new Error(`REDIRECT:${url}`)),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrincipalFindFirst.mockResolvedValue(null)
  mockUserFindFirst.mockResolvedValue(null)
  mockGetPublicPortalConfig.mockResolvedValue({
    oauth: { password: true, magicLink: false },
  })
  mockHasPlatformCredentials.mockResolvedValue(true)
  mockIsSsoActuallyRegistered.mockImplementation(async (sso) => sso?.enabled === true)
})

// ============================================================
// Path / context guards
// ============================================================

describe('handleCallbackPolicyCleanup — guards', () => {
  it('skips when path is not session-creating callback', async () => {
    const ctx = ctxFor({ path: '/sign-in/email', userId: 'user_1', token: 'tok' })
    await handleCallbackPolicyCleanup(ctx, tenantSettings({}))
    expect(mockSessionDeleteWhere).not.toHaveBeenCalled()
    expect(ctx.redirect).not.toHaveBeenCalled()
  })

  it('skips when newSession.user.id is missing', async () => {
    const ctx = ctxFor({
      path: '/oauth2/callback/:providerId',
      providerParam: 'sso',
      token: 'tok',
    })
    await handleCallbackPolicyCleanup(ctx, tenantSettings({}))
    expect(mockSessionDeleteWhere).not.toHaveBeenCalled()
  })

  it('skips when session token is missing', async () => {
    const ctx = ctxFor({
      path: '/oauth2/callback/:providerId',
      providerParam: 'sso',
      userId: 'user_1',
    })
    await handleCallbackPolicyCleanup(ctx, tenantSettings({}))
    expect(mockSessionDeleteWhere).not.toHaveBeenCalled()
  })

  it('skips when provider cannot be inferred', async () => {
    const ctx = ctxFor({
      path: '/oauth2/callback/:providerId',
      userId: 'user_1',
      token: 'tok',
    })
    await handleCallbackPolicyCleanup(ctx, tenantSettings({}))
    expect(mockSessionDeleteWhere).not.toHaveBeenCalled()
  })

  it('early-returns when no principal row exists (after hard-binding check)', async () => {
    mockPrincipalFindFirst.mockResolvedValue(null)
    const ctx = ctxFor({
      path: '/oauth2/callback/:providerId',
      providerParam: 'google',
      userId: 'user_brandnew',
      email: 'a@external.com',
      token: 'tok',
    })
    await handleCallbackPolicyCleanup(ctx, tenantSettings({}))
    // No hard-binding for 'google', no principal → return without
    // running the method-allowed gate.
    expect(mockSessionDeleteWhere).not.toHaveBeenCalled()
    expect(ctx.redirect).not.toHaveBeenCalled()
  })
})

// ============================================================
// SSO callback — always allowed for team
// ============================================================

describe('handleCallbackPolicyCleanup — SSO provider', () => {
  it('passes through for admin', async () => {
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    const ctx = ctxFor({
      path: '/oauth2/callback/:providerId',
      providerParam: 'sso',
      userId: 'user_1',
      email: 'a@acme.com',
      token: 'tok',
    })
    await handleCallbackPolicyCleanup(ctx, tenantSettings({}))
    expect(mockSessionDeleteWhere).not.toHaveBeenCalled()
    expect(ctx.redirect).not.toHaveBeenCalled()
  })

  it('passes through for member', async () => {
    mockPrincipalFindFirst.mockResolvedValue({ role: 'member' })
    const ctx = ctxFor({
      path: '/oauth2/callback/:providerId',
      providerParam: 'sso',
      userId: 'user_1',
      email: 'a@acme.com',
      token: 'tok',
    })
    await handleCallbackPolicyCleanup(ctx, tenantSettings({}))
    expect(ctx.redirect).not.toHaveBeenCalled()
  })

  it('blocks portal user when portalConfig.oauth.sso is not enabled', async () => {
    mockPrincipalFindFirst.mockResolvedValue({ role: 'user' })
    mockGetPublicPortalConfig.mockResolvedValue({
      oauth: { password: true, magicLink: false },
    })
    const ctx = ctxFor({
      path: '/oauth2/callback/:providerId',
      providerParam: 'sso',
      userId: 'user_1',
      email: 'a@external.com',
      token: 'tok',
    })

    await expect(handleCallbackPolicyCleanup(ctx, tenantSettings({}))).rejects.toThrow(
      /\/auth\/login\?error=oauth_method_not_allowed/
    )
    expect(mockSessionDeleteWhere).toHaveBeenCalled()
    expect(mockDeleteSessionCookie).toHaveBeenCalled()
  })

  it('allows portal user when portalConfig.oauth.sso is enabled', async () => {
    mockPrincipalFindFirst.mockResolvedValue({ role: 'user' })
    mockGetPublicPortalConfig.mockResolvedValue({
      oauth: { password: true, magicLink: false, sso: true },
    })
    const ctx = ctxFor({
      path: '/oauth2/callback/:providerId',
      providerParam: 'sso',
      userId: 'user_1',
      email: 'a@external.com',
      token: 'tok',
    })
    await handleCallbackPolicyCleanup(ctx, tenantSettings({}))
    expect(ctx.redirect).not.toHaveBeenCalled()
  })
})

// ============================================================
// Non-SSO OAuth callback — gated by isAuthMethodAllowed
// ============================================================

describe('handleCallbackPolicyCleanup — non-SSO OAuth', () => {
  it('passes for admin + google when oauth.google=true and credentials present', async () => {
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    mockHasPlatformCredentials.mockResolvedValue(true)
    const ctx = ctxFor({
      path: '/oauth2/callback/:providerId',
      providerParam: 'google',
      userId: 'user_1',
      email: 'a@external.com',
      token: 'tok',
    })
    await handleCallbackPolicyCleanup(ctx, tenantSettings({ googleEnabled: true }))
    expect(ctx.redirect).not.toHaveBeenCalled()
    expect(mockSessionDeleteWhere).not.toHaveBeenCalled()
  })

  it('revokes for admin + google when oauth.google is disabled', async () => {
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    mockUserFindFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 5 * 60 * 60_000),
    })
    const ctx = ctxFor({
      path: '/oauth2/callback/:providerId',
      providerParam: 'google',
      userId: 'user_1',
      email: 'a@external.com',
      token: 'tok',
    })

    await expect(
      handleCallbackPolicyCleanup(ctx, tenantSettings({ googleEnabled: false }))
    ).rejects.toThrow(/\/admin\/login\?error=oauth_method_not_allowed/)

    expect(mockSessionDeleteWhere).toHaveBeenCalled()
    expect(mockDeleteSessionCookie).toHaveBeenCalled()
  })

  it('revokes for admin + google when credentials are missing even though oauth.google=true', async () => {
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    mockHasPlatformCredentials.mockResolvedValue(false)
    const ctx = ctxFor({
      path: '/oauth2/callback/:providerId',
      providerParam: 'google',
      userId: 'user_1',
      email: 'a@external.com',
      token: 'tok',
    })

    await expect(
      handleCallbackPolicyCleanup(ctx, tenantSettings({ googleEnabled: true }))
    ).rejects.toThrow(/oauth_method_not_allowed/)
  })

  it('passes for portal user + google when portalConfig.oauth.google=true', async () => {
    mockPrincipalFindFirst.mockResolvedValue({ role: 'user' })
    mockGetPublicPortalConfig.mockResolvedValue({
      oauth: { password: true, magicLink: false, google: true },
    })
    const ctx = ctxFor({
      path: '/oauth2/callback/:providerId',
      providerParam: 'google',
      userId: 'user_1',
      email: 'a@external.com',
      token: 'tok',
    })
    await handleCallbackPolicyCleanup(ctx, tenantSettings({}))
    expect(ctx.redirect).not.toHaveBeenCalled()
  })

  it('revokes for portal user + google when not enabled in portal config', async () => {
    mockPrincipalFindFirst.mockResolvedValue({ role: 'user' })
    mockGetPublicPortalConfig.mockResolvedValue({
      oauth: { password: true, magicLink: false },
    })
    const ctx = ctxFor({
      path: '/oauth2/callback/:providerId',
      providerParam: 'google',
      userId: 'user_1',
      email: 'a@external.com',
      token: 'tok',
    })

    await expect(handleCallbackPolicyCleanup(ctx, tenantSettings({}))).rejects.toThrow(
      /\/auth\/login\?error=oauth_method_not_allowed/
    )
  })

  it('wipes brand-new shells when a method-blocked OAuth callback revokes a freshly-created user', async () => {
    mockPrincipalFindFirst.mockResolvedValue({ role: 'user' })
    mockUserFindFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 5_000) })
    mockGetPublicPortalConfig.mockResolvedValue({
      oauth: { password: true, magicLink: false /* google not enabled */ },
    })
    const ctx = ctxFor({
      path: '/oauth2/callback/:providerId',
      providerParam: 'google',
      userId: 'user_brandnew',
      email: 'a@external.com',
      token: 'tok',
    })

    await expect(handleCallbackPolicyCleanup(ctx, tenantSettings({}))).rejects.toThrow(
      /oauth_method_not_allowed/
    )

    expect(mockSessionDeleteWhere).toHaveBeenCalled()
    // Brand-new sign-up via google was blocked — its shell rows
    // (user / account / principal) should be wiped to match the
    // hard-binding branch's behavior; otherwise blocked first-time
    // OAuth sign-ups leak orphan rows.
    expect(mockUserDeleteWhere).toHaveBeenCalled()
    expect(mockAccountDeleteWhere).toHaveBeenCalled()
    expect(mockPrincipalDeleteWhere).toHaveBeenCalled()
  })

  it('does NOT wipe shells for an existing user (>60s) whose OAuth method just got disabled', async () => {
    mockPrincipalFindFirst.mockResolvedValue({ role: 'user' })
    mockUserFindFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 60 * 60_000) })
    mockGetPublicPortalConfig.mockResolvedValue({
      oauth: { password: true, magicLink: false },
    })
    const ctx = ctxFor({
      path: '/oauth2/callback/:providerId',
      providerParam: 'google',
      userId: 'user_existing',
      email: 'a@external.com',
      token: 'tok',
    })

    await expect(handleCallbackPolicyCleanup(ctx, tenantSettings({}))).rejects.toThrow(
      /oauth_method_not_allowed/
    )

    expect(mockSessionDeleteWhere).toHaveBeenCalled()
    expect(mockUserDeleteWhere).not.toHaveBeenCalled()
    expect(mockAccountDeleteWhere).not.toHaveBeenCalled()
    expect(mockPrincipalDeleteWhere).not.toHaveBeenCalled()
  })
})

// ============================================================
// Hard-binding branch — only fires for credential / magic-link
//
// The only realistic way to enter this branch via a session-creating
// callback path is `/sign-in/social` carrying body.provider='credential'
// or 'magic-link', which Better-Auth's idToken-direct flow shouldn't
// emit. Tested defensively here because the code wipes shells on hit.
// ============================================================

describe('handleCallbackPolicyCleanup — hard-binding branch (defensive)', () => {
  it('revokes + wipes shells when brand-new user lands via /sign-in/social with credential at enforced domain', async () => {
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    mockUserFindFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 5_000) })

    const ctx = ctxFor({
      path: '/sign-in/social',
      bodyProvider: 'credential',
      userId: 'user_brandnew',
      email: 'a@acme.com',
      token: 'tok',
    })

    await expect(
      handleCallbackPolicyCleanup(
        ctx,
        tenantSettings({ verifiedDomains: [makeVerifiedDomain('acme.com', true)] })
      )
    ).rejects.toThrow(/\/admin\/login\?error=verified_domain_requires_sso/)

    expect(mockSessionDeleteWhere).toHaveBeenCalled()
    expect(mockUserDeleteWhere).toHaveBeenCalled()
    expect(mockAccountDeleteWhere).toHaveBeenCalled()
    expect(mockPrincipalDeleteWhere).toHaveBeenCalled()
    expect(mockDeleteSessionCookie).toHaveBeenCalled()
  })

  it('revokes WITHOUT wiping shells when the user existed before this attempt (>60s)', async () => {
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    mockUserFindFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 60 * 60_000) })

    const ctx = ctxFor({
      path: '/sign-in/social',
      bodyProvider: 'credential',
      userId: 'user_existing',
      email: 'a@acme.com',
      token: 'tok',
    })

    await expect(
      handleCallbackPolicyCleanup(
        ctx,
        tenantSettings({ verifiedDomains: [makeVerifiedDomain('acme.com', true)] })
      )
    ).rejects.toThrow(/verified_domain_requires_sso/)

    expect(mockSessionDeleteWhere).toHaveBeenCalled()
    expect(mockUserDeleteWhere).not.toHaveBeenCalled()
    expect(mockAccountDeleteWhere).not.toHaveBeenCalled()
    expect(mockPrincipalDeleteWhere).not.toHaveBeenCalled()
  })

  it('uses sso_required code when workspace-required fires for team without a verified-domain match', async () => {
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    mockUserFindFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 60 * 60_000) })

    const ctx = ctxFor({
      path: '/sign-in/social',
      bodyProvider: 'magic-link',
      userId: 'user_1',
      email: 'a@somewhere.com',
      token: 'tok',
    })

    await expect(
      handleCallbackPolicyCleanup(ctx, tenantSettings({ required: true }))
    ).rejects.toThrow(/\/admin\/login\?error=sso_required/)
  })

  it('does not fire hard-binding branch for portal user under workspace-required (workspace-wide is team-only)', async () => {
    mockPrincipalFindFirst.mockResolvedValue({ role: 'user' })
    mockUserFindFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 60 * 60_000) })
    mockGetPublicPortalConfig.mockResolvedValue({
      oauth: { password: true, magicLink: true },
    })

    const ctx = ctxFor({
      path: '/sign-in/social',
      bodyProvider: 'magic-link',
      userId: 'user_1',
      email: 'a@somewhere.com',
      token: 'tok',
    })

    await handleCallbackPolicyCleanup(ctx, tenantSettings({ required: true }))
    expect(ctx.redirect).not.toHaveBeenCalled()
  })
})
