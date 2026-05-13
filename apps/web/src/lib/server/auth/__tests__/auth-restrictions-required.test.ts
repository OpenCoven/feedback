/**
 * isHardBound — policy predicate combining the per-domain enforced
 * branch with the workspace-wide ssoOidc.required branch.
 *
 *  - Workspace-wide branch fires for admin/member when
 *    authConfig.ssoOidc.required === true
 *  - Magic-link escapes when allowMagicLinkUnderRequired === true
 *  - Portal users (role='user') never hard-bound by workspace-wide
 *  - Per-domain branch still works when workspace-wide is off
 *  - OR semantics: either branch true means hard-bound
 *  - Master switch `ssoOidc.enabled=false` disables both branches
 *  - Runtime fail-open: callers pass `ssoActuallyRegistered`; when
 *    false (tier downgrade, missing secret) both branches are dormant
 *    to prevent self-lockout
 */
import { describe, it, expect } from 'vitest'
import { isHardBound, isSsoConfigured, type AuthProvider } from '../auth-restrictions'
import type { AuthConfig, VerifiedDomain } from '@/lib/server/domains/settings/settings.types'

const baseConfig: AuthConfig = {
  oauth: { password: true },
  openSignup: false,
}

/** Defaults for the SSO sub-tree — `enabled: true` so policy fires. */
const baseSso = {
  enabled: true,
  discoveryUrl: 'https://idp.example/.well-known/openid-configuration',
  clientId: 'cid',
  autoCreateUsers: false,
} as const

const configWithSso = (overrides: Record<string, unknown> = {}): AuthConfig => ({
  ...baseConfig,
  ssoOidc: { ...baseSso, ...overrides } as never,
})

const enforcedDomain: VerifiedDomain = {
  id: 'domain_acme' as `domain_${string}`,
  name: 'acme.com',
  verificationToken: 'tok',
  verifiedAt: '2026-05-01T00:00:00.000Z',
  enforced: true,
  createdAt: '2026-05-01T00:00:00.000Z',
}

const verifiedDomain: VerifiedDomain = { ...enforcedDomain, enforced: false }

/**
 * Thin wrapper that defaults the new `ssoActuallyRegistered` argument
 * to `true` so existing tests describe the admin-intent semantics
 * without restating "runtime is viable" on every line. Tests that
 * exercise the fail-open path override the last arg.
 */
const callIsHardBound = (
  provider: AuthProvider | string,
  email: string | null | undefined,
  role: 'admin' | 'member' | 'user',
  authConfig: AuthConfig | undefined,
  verifiedDomains: readonly VerifiedDomain[] | undefined,
  ssoRegistered = true
) => isHardBound(provider, email, role, authConfig, verifiedDomains, ssoRegistered)

describe('isSsoConfigured — Layer 1 master-switch helper', () => {
  it('returns true when ssoOidc.enabled === true', () => {
    expect(isSsoConfigured(baseSso)).toBe(true)
  })

  it('returns false when ssoOidc.enabled === false', () => {
    expect(isSsoConfigured({ ...baseSso, enabled: false })).toBe(false)
  })

  it('returns false when ssoOidc is undefined (never configured)', () => {
    expect(isSsoConfigured(undefined)).toBe(false)
  })
})

describe('isHardBound — workspace-wide branch', () => {
  it('blocks credential for admin when ssoOidc.required=true', () => {
    expect(
      callIsHardBound(
        'credential',
        'foo@example.com',
        'admin',
        configWithSso({ required: true }),
        []
      )
    ).toBe(true)
  })

  it('blocks magic-link for member when ssoOidc.required=true', () => {
    expect(
      callIsHardBound(
        'magic-link',
        'foo@example.com',
        'member',
        configWithSso({ required: true }),
        []
      )
    ).toBe(true)
  })

  it('still allows magic-link when allowMagicLinkUnderRequired=true', () => {
    expect(
      callIsHardBound(
        'magic-link',
        'foo@example.com',
        'admin',
        configWithSso({ required: true, allowMagicLinkUnderRequired: true }),
        []
      )
    ).toBe(false)
  })

  it('does NOT bind portal user (role=user) when required=true', () => {
    expect(
      callIsHardBound(
        'credential',
        'foo@example.com',
        'user',
        configWithSso({ required: true }),
        []
      )
    ).toBe(false)
  })

  it('does nothing when required=false / undefined', () => {
    expect(
      callIsHardBound(
        'credential',
        'foo@example.com',
        'admin',
        configWithSso({ required: false }),
        []
      )
    ).toBe(false)
    expect(callIsHardBound('credential', 'foo@example.com', 'admin', baseConfig, [])).toBe(false)
  })
})

describe('isHardBound — per-domain branch (regression)', () => {
  it('still blocks emails at enforced verified domains', () => {
    expect(
      callIsHardBound('credential', 'a@acme.com', 'admin', configWithSso(), [enforcedDomain])
    ).toBe(true)
  })

  it('does NOT block when verified domain has enforced=false', () => {
    expect(
      callIsHardBound('credential', 'a@acme.com', 'admin', configWithSso(), [verifiedDomain])
    ).toBe(false)
  })
})

describe('isHardBound — OR semantics', () => {
  it('returns true when both branches would block', () => {
    expect(
      callIsHardBound('credential', 'a@acme.com', 'admin', configWithSso({ required: true }), [
        enforcedDomain,
      ])
    ).toBe(true)
  })

  it('returns true when only the workspace-wide branch blocks', () => {
    expect(
      callIsHardBound('credential', 'a@example.com', 'admin', configWithSso({ required: true }), [])
    ).toBe(true)
  })

  it('returns true when only the per-domain branch blocks', () => {
    expect(
      callIsHardBound('credential', 'a@acme.com', 'admin', configWithSso(), [enforcedDomain])
    ).toBe(true)
  })
})

describe('isHardBound — non-hard-bound providers', () => {
  it('returns false for sso', () => {
    expect(
      callIsHardBound('sso', 'a@example.com', 'admin', configWithSso({ required: true }), [])
    ).toBe(false)
  })

  it('returns false for google', () => {
    expect(
      callIsHardBound('google', 'a@example.com', 'admin', configWithSso({ required: true }), [])
    ).toBe(false)
  })
})

describe('isHardBound — runtime fail-open (ssoActuallyRegistered=false)', () => {
  // The "actually registered" gate prevents self-lockout when SSO is
  // admin-configured to be on but isn't viable at runtime (cloud tier
  // downgrade, secret rotated and not yet replaced, etc.). The Layer A
  // registration filter has already unregistered the provider, so the
  // SSO button is gone — refusing password sign-in too would lock every
  // team admin out. Recovery codes remain as the documented break-glass
  // either way.
  it('fails open even with required=true (workspace-wide branch suppressed)', () => {
    expect(
      callIsHardBound(
        'credential',
        'a@example.com',
        'admin',
        configWithSso({ required: true }),
        [],
        /* ssoRegistered */ false
      )
    ).toBe(false)
  })

  it('fails open even with an enforced verified-domain row (per-domain branch suppressed)', () => {
    expect(
      callIsHardBound(
        'credential',
        'a@acme.com',
        'admin',
        configWithSso(),
        [enforcedDomain],
        /* ssoRegistered */ false
      )
    ).toBe(false)
  })

  it('fails open for magic-link too (mirrors credential)', () => {
    expect(
      callIsHardBound(
        'magic-link',
        'a@acme.com',
        'admin',
        configWithSso({ required: true }),
        [enforcedDomain],
        /* ssoRegistered */ false
      )
    ).toBe(false)
  })

  it('fails open for portal users at enforced domains (per-domain branch suppressed)', () => {
    expect(
      callIsHardBound(
        'credential',
        'a@acme.com',
        'user',
        configWithSso(),
        [enforcedDomain],
        /* ssoRegistered */ false
      )
    ).toBe(false)
  })

  it('still blocks when registered=true and policy says so (regression: param does not invert)', () => {
    expect(
      callIsHardBound(
        'credential',
        'a@acme.com',
        'admin',
        configWithSso(),
        [enforcedDomain],
        /* ssoRegistered */ true
      )
    ).toBe(true)
  })
})

describe('isHardBound — master switch (ssoOidc.enabled)', () => {
  // The workspace `enabled` toggle is the admin-intent master switch.
  // Callers normally derive `ssoRegistered` from `isSsoActuallyRegistered`,
  // which already returns false when `enabled=false`. These tests
  // simulate the "caller did the right thing" path.
  it('returns false when ssoOidc is absent (never configured) and registered=false', () => {
    expect(
      callIsHardBound(
        'credential',
        'a@acme.com',
        'admin',
        baseConfig,
        [enforcedDomain],
        /* ssoRegistered */ false
      )
    ).toBe(false)
  })

  it('returns false when ssoOidc.enabled=false and registered=false (stale enforced row)', () => {
    expect(
      callIsHardBound(
        'credential',
        'a@acme.com',
        'admin',
        configWithSso({ enabled: false }),
        [enforcedDomain],
        /* ssoRegistered */ false
      )
    ).toBe(false)
  })

  it('returns false when ssoOidc.enabled=false and registered=false (stale required=true)', () => {
    expect(
      callIsHardBound(
        'credential',
        'a@example.com',
        'admin',
        configWithSso({ enabled: false, required: true }),
        [],
        /* ssoRegistered */ false
      )
    ).toBe(false)
  })
})
