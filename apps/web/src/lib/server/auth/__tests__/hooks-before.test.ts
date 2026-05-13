/**
 * Layer B pre-session gate (`handleSignInPreCheck`) — comprehensive
 * scenario matrix.
 *
 * This is the request-time policy oracle for password / magic-link /
 * email-OTP sign-in attempts. It runs BEFORE Better-Auth verifies the
 * credential, so a block here means the redirect lands without any
 * password check ever happening. OAuth callback paths are gated by
 * Layer A (registration filter) and Layer C (post-session cleanup)
 * instead — those paths land in `NO_EMAIL_BEFORE_PATHS` and exit
 * early here.
 *
 * Matrix dimensions exercised:
 *   - provider: credential / magic-link / sso / non-listed
 *   - path: gated / NO_EMAIL_BEFORE_PATH / unrecognised
 *   - email: present / missing
 *   - workspace: ssoOidc.required true|false × allowMagicLinkUnderRequired true|false
 *   - per-domain: verified-enforced / verified-routing-only / none
 *   - principal: admin / member / user / missing (brand-new sign-up)
 *   - oauth toggles: password on/off / magic-link on/off
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { makeAuthConfig, makeTenant, makeVerifiedDomain } from './_helpers'

const mockUserFindFirst = vi.fn()
const mockPrincipalFindFirst = vi.fn()
const mockGetTenantSettings = vi.fn()
const mockGetPublicPortalConfig = vi.fn()

vi.mock('@/lib/server/db', () => ({
  db: {
    query: {
      user: { findFirst: (...a: unknown[]) => mockUserFindFirst(...a) },
      principal: { findFirst: (...a: unknown[]) => mockPrincipalFindFirst(...a) },
    },
  },
  user: { id: 'user_id', email: 'user_email' },
  principal: { userId: 'principal_userId', role: 'role' },
  eq: vi.fn(),
}))

vi.mock('@/lib/server/domains/settings/settings.service', () => ({
  getTenantSettings: (...a: unknown[]) => mockGetTenantSettings(...a),
  getPublicPortalConfig: (...a: unknown[]) => mockGetPublicPortalConfig(...a),
}))

// Default mirrors the production conditions: registered iff the admin
// has SSO enabled (so existing enforcement tests see the same blocking
// behavior). Tests for tier-downgrade / missing-secret override this.
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

// auth-restrictions stays unmocked — we want the real predicates to
// run so we test the integration, not just the wiring.

const { handleSignInPreCheck } = await import('../hooks')

type Ctx = Parameters<typeof handleSignInPreCheck>[0]
type Knobs = {
  ssoEnabled?: boolean
  required?: boolean
  allowMagicLinkUnderRequired?: boolean
  passwordEnabled?: boolean
  magicLinkEnabled?: boolean
  verifiedDomains?: ReturnType<typeof makeVerifiedDomain>[]
}

const tenant = (k: Knobs = {}) =>
  makeTenant({
    authConfig: makeAuthConfig({
      oauth: { password: k.passwordEnabled, magicLink: k.magicLinkEnabled },
      ssoOidc: {
        // `enabled` defaults to true so existing tests exercising
        // workspace-required / per-domain enforcement keep their semantics.
        // Tests that need a disabled-SSO workspace pass `ssoEnabled: false`.
        enabled: k.ssoEnabled ?? true,
        required: k.required,
        allowMagicLinkUnderRequired: k.allowMagicLinkUnderRequired,
      },
    }),
    verifiedDomains: k.verifiedDomains ?? [],
  })

const ctxFor = (path: string, body?: Record<string, unknown>): Ctx => ({
  path,
  body,
  redirect: vi.fn((url: string) => new Error(`REDIRECT:${url}`)),
})

beforeEach(() => {
  vi.clearAllMocks()
  mockUserFindFirst.mockResolvedValue(null)
  mockPrincipalFindFirst.mockResolvedValue(null)
  mockGetTenantSettings.mockResolvedValue(tenant())
  mockGetPublicPortalConfig.mockResolvedValue({
    oauth: { password: true, magicLink: false },
  })
  // Default mock returns true when sso.enabled is true (mirrors prod).
  // Tier-downgrade / missing-secret tests override with mockResolvedValue.
  mockIsSsoActuallyRegistered.mockImplementation(async (sso) => sso?.enabled === true)
})

// ============================================================
// Early-exit guards
// ============================================================

describe('handleSignInPreCheck — early exits', () => {
  it('skips when path is unrecognised (no provider inferred)', async () => {
    const ctx = ctxFor('/some/unknown/path', { email: 'a@b.com' })
    await handleSignInPreCheck(ctx)
    expect(mockGetTenantSettings).not.toHaveBeenCalled()
    expect(ctx.redirect).not.toHaveBeenCalled()
  })

  it('skips when path is in NO_EMAIL_BEFORE_PATHS (e.g. /sign-in/social)', async () => {
    const ctx = ctxFor('/sign-in/social', { email: 'a@b.com', provider: 'google' })
    await handleSignInPreCheck(ctx)
    expect(mockGetTenantSettings).not.toHaveBeenCalled()
    expect(ctx.redirect).not.toHaveBeenCalled()
  })

  it('skips when path is /oauth2/callback/:providerId (Layer C handles those)', async () => {
    const ctx = ctxFor('/oauth2/callback/:providerId', { email: 'a@b.com' })
    ctx.params = { providerId: 'sso' }
    await handleSignInPreCheck(ctx)
    expect(mockGetTenantSettings).not.toHaveBeenCalled()
  })

  it('skips when ctx.body.email is missing (magic-link verify path)', async () => {
    const ctx = ctxFor('/magic-link/verify', { token: 'xyz' })
    await handleSignInPreCheck(ctx)
    expect(mockGetTenantSettings).not.toHaveBeenCalled()
  })

  it('lower-cases and trims email before checking', async () => {
    const ctx = ctxFor('/sign-in/email', { email: '  Foo@Acme.COM  ' })
    mockGetTenantSettings.mockResolvedValue(
      tenant({ verifiedDomains: [makeVerifiedDomain('acme.com', true)] })
    )
    mockUserFindFirst.mockResolvedValue({ id: 'user_1' })
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })

    await expect(handleSignInPreCheck(ctx)).rejects.toThrow(/verified_domain_requires_sso/)
  })
})

// ============================================================
// Per-domain hard-binding (enforced verified domain)
// ============================================================

describe('handleSignInPreCheck — per-domain enforced', () => {
  beforeEach(() => {
    mockGetTenantSettings.mockResolvedValue(
      tenant({
        verifiedDomains: [makeVerifiedDomain('acme.com', true)],
      })
    )
  })

  it('blocks password sign-in for admin at enforced verified domain', async () => {
    mockUserFindFirst.mockResolvedValue({ id: 'user_1' })
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    const ctx = ctxFor('/sign-in/email', { email: 'a@acme.com' })

    await expect(handleSignInPreCheck(ctx)).rejects.toThrow(
      'REDIRECT:/admin/login?error=verified_domain_requires_sso'
    )
  })

  it('blocks password sign-in for member at enforced verified domain', async () => {
    mockUserFindFirst.mockResolvedValue({ id: 'user_1' })
    mockPrincipalFindFirst.mockResolvedValue({ role: 'member' })
    const ctx = ctxFor('/sign-in/email', { email: 'a@acme.com' })

    await expect(handleSignInPreCheck(ctx)).rejects.toThrow(/verified_domain_requires_sso/)
  })

  it('blocks password sign-in for portal user at enforced verified domain (domain branch is role-blind)', async () => {
    mockUserFindFirst.mockResolvedValue({ id: 'user_1' })
    mockPrincipalFindFirst.mockResolvedValue({ role: 'user' })
    const ctx = ctxFor('/sign-in/email', { email: 'a@acme.com' })

    await expect(handleSignInPreCheck(ctx)).rejects.toThrow(/verified_domain_requires_sso/)
  })

  it('blocks brand-new sign-ups (no principal yet) at enforced verified domain', async () => {
    mockUserFindFirst.mockResolvedValue(null)
    mockPrincipalFindFirst.mockResolvedValue(null)
    const ctx = ctxFor('/sign-up/email', { email: 'newhire@acme.com' })

    await expect(handleSignInPreCheck(ctx)).rejects.toThrow(/verified_domain_requires_sso/)
  })

  it('blocks magic-link send for enforced-domain email', async () => {
    mockUserFindFirst.mockResolvedValue({ id: 'user_1' })
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    const ctx = ctxFor('/sign-in/magic-link', { email: 'a@acme.com' })

    await expect(handleSignInPreCheck(ctx)).rejects.toThrow(/verified_domain_requires_sso/)
  })

  it('does NOT block when the verified-domain row has enforced=false (routing-only)', async () => {
    mockGetTenantSettings.mockResolvedValue(
      tenant({
        verifiedDomains: [makeVerifiedDomain('acme.com', false)],
      })
    )
    mockUserFindFirst.mockResolvedValue({ id: 'user_1' })
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    const ctx = ctxFor('/sign-in/email', { email: 'a@acme.com' })

    await handleSignInPreCheck(ctx)
    expect(ctx.redirect).not.toHaveBeenCalled()
  })

  it('does not match a different domain (no enforce on example.com when acme.com is enforced)', async () => {
    mockUserFindFirst.mockResolvedValue({ id: 'user_1' })
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    const ctx = ctxFor('/sign-in/email', { email: 'a@example.com' })

    await handleSignInPreCheck(ctx)
    expect(ctx.redirect).not.toHaveBeenCalled()
  })
})

// ============================================================
// Workspace-wide hard-binding (ssoOidc.required)
// ============================================================

describe('handleSignInPreCheck — workspace required=true', () => {
  beforeEach(() => {
    mockGetTenantSettings.mockResolvedValue(tenant({ required: true }))
  })

  it('blocks password sign-in for admin with sso_required error code', async () => {
    mockUserFindFirst.mockResolvedValue({ id: 'user_1' })
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    const ctx = ctxFor('/sign-in/email', { email: 'a@anywhere.com' })

    await expect(handleSignInPreCheck(ctx)).rejects.toThrow(
      'REDIRECT:/admin/login?error=sso_required'
    )
  })

  it('blocks password sign-in for member with sso_required', async () => {
    mockUserFindFirst.mockResolvedValue({ id: 'user_1' })
    mockPrincipalFindFirst.mockResolvedValue({ role: 'member' })
    const ctx = ctxFor('/sign-in/email', { email: 'a@anywhere.com' })

    await expect(handleSignInPreCheck(ctx)).rejects.toThrow(/sso_required/)
  })

  it('does NOT block portal users (role=user) — workspace-wide binds team only', async () => {
    mockUserFindFirst.mockResolvedValue({ id: 'user_1' })
    mockPrincipalFindFirst.mockResolvedValue({ role: 'user' })
    const ctx = ctxFor('/sign-in/email', { email: 'a@anywhere.com' })

    await handleSignInPreCheck(ctx)
    expect(ctx.redirect).not.toHaveBeenCalled()
  })

  it('does NOT block brand-new sign-ups (default role=user; portal branch)', async () => {
    mockUserFindFirst.mockResolvedValue(null)
    mockPrincipalFindFirst.mockResolvedValue(null)
    const ctx = ctxFor('/sign-up/email', { email: 'newhire@example.com' })

    await handleSignInPreCheck(ctx)
    expect(ctx.redirect).not.toHaveBeenCalled()
  })

  it('blocks magic-link for admin without escape hatch', async () => {
    mockUserFindFirst.mockResolvedValue({ id: 'user_1' })
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    const ctx = ctxFor('/sign-in/magic-link', { email: 'a@anywhere.com' })

    await expect(handleSignInPreCheck(ctx)).rejects.toThrow(/sso_required/)
  })

  it('allows magic-link for admin when allowMagicLinkUnderRequired=true', async () => {
    mockGetTenantSettings.mockResolvedValue(
      tenant({ required: true, allowMagicLinkUnderRequired: true })
    )
    mockUserFindFirst.mockResolvedValue({ id: 'user_1' })
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    const ctx = ctxFor('/sign-in/magic-link', { email: 'a@anywhere.com' })

    await handleSignInPreCheck(ctx)
    expect(ctx.redirect).not.toHaveBeenCalled()
  })

  it('still blocks magic-link with escape if email is at an enforced verified domain (per-domain bites)', async () => {
    mockGetTenantSettings.mockResolvedValue(
      tenant({
        required: true,
        allowMagicLinkUnderRequired: true,
        verifiedDomains: [makeVerifiedDomain('acme.com', true)],
      })
    )
    mockUserFindFirst.mockResolvedValue({ id: 'user_1' })
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    const ctx = ctxFor('/sign-in/magic-link', { email: 'a@acme.com' })

    await expect(handleSignInPreCheck(ctx)).rejects.toThrow(/verified_domain_requires_sso/)
  })
})

// ============================================================
// Method-allowed fall-through (toggles)
// ============================================================

describe('handleSignInPreCheck — isAuthMethodAllowed gate', () => {
  it('blocks credential when oauth.password is explicitly false for team', async () => {
    mockGetTenantSettings.mockResolvedValue(tenant({ passwordEnabled: false }))
    mockUserFindFirst.mockResolvedValue({ id: 'user_1' })
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    const ctx = ctxFor('/sign-in/email', { email: 'a@anywhere.com' })

    await expect(handleSignInPreCheck(ctx)).rejects.toThrow(/password_method_not_allowed/)
  })

  it('allows credential when oauth.password is undefined (defaults to true for team)', async () => {
    mockGetTenantSettings.mockResolvedValue(tenant({})) // no passwordEnabled
    mockUserFindFirst.mockResolvedValue({ id: 'user_1' })
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    const ctx = ctxFor('/sign-in/email', { email: 'a@anywhere.com' })

    await handleSignInPreCheck(ctx)
    expect(ctx.redirect).not.toHaveBeenCalled()
  })

  it('redirects team-role blocks to /admin/login', async () => {
    mockGetTenantSettings.mockResolvedValue(tenant({ passwordEnabled: false }))
    mockUserFindFirst.mockResolvedValue({ id: 'user_1' })
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    const ctx = ctxFor('/sign-in/email', { email: 'a@anywhere.com' })

    await expect(handleSignInPreCheck(ctx)).rejects.toThrow(
      /\/admin\/login\?error=password_method_not_allowed/
    )
  })

  it('returns silently when no principal exists (sign-up path) and provider is allowed', async () => {
    mockGetTenantSettings.mockResolvedValue(tenant({}))
    mockUserFindFirst.mockResolvedValue(null)
    mockPrincipalFindFirst.mockResolvedValue(null)
    const ctx = ctxFor('/sign-up/email', { email: 'brand@new.com' })

    await handleSignInPreCheck(ctx)
    expect(ctx.redirect).not.toHaveBeenCalled()
  })

  it('magic-link is always allowed for team regardless of oauth.magicLink toggle (verified-domain check separately gates)', async () => {
    // Per the `isAuthMethodAllowed` code: magic-link unconditionally
    // returns allowed=true for team. The portal branch is what gates
    // it; for team, only hard-binding can block magic-link.
    mockGetTenantSettings.mockResolvedValue(tenant({ magicLinkEnabled: false }))
    mockUserFindFirst.mockResolvedValue({ id: 'user_1' })
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    const ctx = ctxFor('/sign-in/magic-link', { email: 'a@anywhere.com' })

    await handleSignInPreCheck(ctx)
    expect(ctx.redirect).not.toHaveBeenCalled()
  })
})

// ============================================================
// Master switch: ssoOidc.enabled=false makes all enforcement dormant
// ============================================================

describe('handleSignInPreCheck — ssoOidc.enabled=false (workspace SSO disabled)', () => {
  it('does NOT block admin password sign-in even with stale enforced verified-domain row', async () => {
    mockGetTenantSettings.mockResolvedValue(
      tenant({
        ssoEnabled: false,
        verifiedDomains: [makeVerifiedDomain('acme.com', true)],
      })
    )
    mockUserFindFirst.mockResolvedValue({ id: 'user_1' })
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    const ctx = ctxFor('/sign-in/email', { email: 'a@acme.com' })

    await handleSignInPreCheck(ctx)
    expect(ctx.redirect).not.toHaveBeenCalled()
  })

  it('does NOT block admin magic-link with stale enforced verified-domain row', async () => {
    mockGetTenantSettings.mockResolvedValue(
      tenant({
        ssoEnabled: false,
        verifiedDomains: [makeVerifiedDomain('acme.com', true)],
      })
    )
    mockUserFindFirst.mockResolvedValue({ id: 'user_1' })
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    const ctx = ctxFor('/sign-in/magic-link', { email: 'a@acme.com' })

    await handleSignInPreCheck(ctx)
    expect(ctx.redirect).not.toHaveBeenCalled()
  })

  it('does NOT block admin password sign-in even with stale workspace required=true', async () => {
    mockGetTenantSettings.mockResolvedValue(tenant({ ssoEnabled: false, required: true }))
    mockUserFindFirst.mockResolvedValue({ id: 'user_1' })
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    const ctx = ctxFor('/sign-in/email', { email: 'a@anywhere.com' })

    await handleSignInPreCheck(ctx)
    expect(ctx.redirect).not.toHaveBeenCalled()
  })

  it('still gates by method-allowed (password disabled → still blocks)', async () => {
    // The master SSO switch only affects SSO enforcement. Other policy
    // (oauth.password=false) keeps working independently.
    mockGetTenantSettings.mockResolvedValue(tenant({ ssoEnabled: false, passwordEnabled: false }))
    mockUserFindFirst.mockResolvedValue({ id: 'user_1' })
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    const ctx = ctxFor('/sign-in/email', { email: 'a@anywhere.com' })

    await expect(handleSignInPreCheck(ctx)).rejects.toThrow(/password_method_not_allowed/)
  })
})

// ============================================================
// Runtime fail-open — SSO is admin-configured but not viable
// ============================================================

describe('handleSignInPreCheck — tier-downgrade / missing-secret fail-open', () => {
  // Admin has SSO enabled and required=true, but the runtime can't
  // actually use it: tier was downgraded or the secret got rotated and
  // cleared. Layer A has already unregistered the SSO provider, so
  // there's no SSO button. Without fail-open, password sign-in would
  // also be blocked → total lockout. The runtime check undoes the
  // enforcement until the operator fixes things.
  it('allows admin password sign-in when SSO is required but not registered (tier downgrade)', async () => {
    mockGetTenantSettings.mockResolvedValue(tenant({ ssoEnabled: true, required: true }))
    mockIsSsoActuallyRegistered.mockResolvedValue(false)
    mockUserFindFirst.mockResolvedValue({ id: 'user_1' })
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    const ctx = ctxFor('/sign-in/email', { email: 'a@anywhere.com' })

    await handleSignInPreCheck(ctx)
    expect(ctx.redirect).not.toHaveBeenCalled()
  })

  it('allows admin password sign-in at enforced verified domain when SSO not registered', async () => {
    mockGetTenantSettings.mockResolvedValue(
      tenant({
        ssoEnabled: true,
        verifiedDomains: [makeVerifiedDomain('acme.com', true)],
      })
    )
    mockIsSsoActuallyRegistered.mockResolvedValue(false)
    mockUserFindFirst.mockResolvedValue({ id: 'user_1' })
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    const ctx = ctxFor('/sign-in/email', { email: 'a@acme.com' })

    await handleSignInPreCheck(ctx)
    expect(ctx.redirect).not.toHaveBeenCalled()
  })

  it('allows admin magic-link too when SSO not registered', async () => {
    mockGetTenantSettings.mockResolvedValue(
      tenant({
        ssoEnabled: true,
        required: true,
        verifiedDomains: [makeVerifiedDomain('acme.com', true)],
      })
    )
    mockIsSsoActuallyRegistered.mockResolvedValue(false)
    mockUserFindFirst.mockResolvedValue({ id: 'user_1' })
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    const ctx = ctxFor('/sign-in/magic-link', { email: 'a@acme.com' })

    await handleSignInPreCheck(ctx)
    expect(ctx.redirect).not.toHaveBeenCalled()
  })

  it('still blocks when ssoRegistered=true and enforcement says so (regression)', async () => {
    // Sanity: the fail-open must not invert. Same input as the
    // "blocks password sign-in for admin at enforced verified domain"
    // test in the per-domain suite — should still block.
    mockGetTenantSettings.mockResolvedValue(
      tenant({
        ssoEnabled: true,
        verifiedDomains: [makeVerifiedDomain('acme.com', true)],
      })
    )
    mockIsSsoActuallyRegistered.mockResolvedValue(true)
    mockUserFindFirst.mockResolvedValue({ id: 'user_1' })
    mockPrincipalFindFirst.mockResolvedValue({ role: 'admin' })
    const ctx = ctxFor('/sign-in/email', { email: 'a@acme.com' })

    await expect(handleSignInPreCheck(ctx)).rejects.toThrow(/verified_domain_requires_sso/)
  })
})
