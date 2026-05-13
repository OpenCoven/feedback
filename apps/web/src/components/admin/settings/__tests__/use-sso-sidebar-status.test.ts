/**
 * useSsoSidebarStatus — pure mapper from query results + tier flag to
 * sidebar chip. The hook itself reads via useQuery; we test the underlying
 * pure mapper `computeSsoSidebarStatus` to keep the matrix readable.
 */
import { describe, it, expect } from 'vitest'
import { computeSsoSidebarStatus } from '../use-sso-sidebar-status'
import type { AuthConfig, VerifiedDomain } from '@/lib/shared/types/settings'
import type { SsoStatus } from '@/lib/server/functions/sso'

const baseAuthConfig: AuthConfig = { oauth: {}, openSignup: false }
const baseSsoStatus: SsoStatus = {
  lastSignInAt: null,
  secretConfigured: true,
  discoveryReachable: true,
  bootstrapEligible: false,
  redirectUri: 'https://example.com/api/auth/oauth2/callback/sso',
}
const verifiedDomain = (overrides: Partial<VerifiedDomain> = {}): VerifiedDomain => ({
  id: 'domain_acme' as `domain_${string}`,
  name: 'acme.com',
  verificationToken: 'tok',
  verifiedAt: '2026-05-01T00:00:00.000Z',
  enforced: false,
  createdAt: '2026-05-01T00:00:00.000Z',
  ...overrides,
})

describe('computeSsoSidebarStatus', () => {
  it('returns "Upgrade required" when tier flag is false (overrides everything)', () => {
    expect(
      computeSsoSidebarStatus({
        tierOk: false,
        authConfig: {
          ...baseAuthConfig,
          ssoOidc: {
            enabled: true,
            discoveryUrl: 'https://idp/.well-known/openid-configuration',
            clientId: 'cid',
            autoCreateUsers: false,
          },
        },
        ssoStatus: baseSsoStatus,
        verifiedDomains: [verifiedDomain()],
      })
    ).toEqual({ text: 'Upgrade required', tone: 'muted' })
  })

  it('returns "Not configured" when ssoOidc.enabled is not true', () => {
    expect(
      computeSsoSidebarStatus({
        tierOk: true,
        authConfig: baseAuthConfig,
        ssoStatus: baseSsoStatus,
        verifiedDomains: [],
      })
    ).toEqual({ text: 'Not configured', tone: 'muted' })
  })

  it('returns "Needs secret" when enabled but secretConfigured=false', () => {
    expect(
      computeSsoSidebarStatus({
        tierOk: true,
        authConfig: {
          ...baseAuthConfig,
          ssoOidc: {
            enabled: true,
            discoveryUrl: 'https://idp/.well-known/openid-configuration',
            clientId: 'cid',
            autoCreateUsers: false,
          },
        },
        ssoStatus: { ...baseSsoStatus, secretConfigured: false },
        verifiedDomains: [],
      })
    ).toEqual({ text: 'Needs secret', tone: 'warn' })
  })

  it('returns "No domains" when enabled, secret OK, but zero verified domains', () => {
    expect(
      computeSsoSidebarStatus({
        tierOk: true,
        authConfig: {
          ...baseAuthConfig,
          ssoOidc: {
            enabled: true,
            discoveryUrl: 'https://idp/.well-known/openid-configuration',
            clientId: 'cid',
            autoCreateUsers: false,
          },
        },
        ssoStatus: baseSsoStatus,
        verifiedDomains: [verifiedDomain({ verifiedAt: null })], // pending
      })
    ).toEqual({ text: 'No domains', tone: 'warn' })
  })

  it('returns "1 domain" when exactly one verified domain', () => {
    expect(
      computeSsoSidebarStatus({
        tierOk: true,
        authConfig: {
          ...baseAuthConfig,
          ssoOidc: {
            enabled: true,
            discoveryUrl: 'https://idp/.well-known/openid-configuration',
            clientId: 'cid',
            autoCreateUsers: false,
          },
        },
        ssoStatus: baseSsoStatus,
        verifiedDomains: [verifiedDomain()],
      })
    ).toEqual({ text: '1 domain', tone: 'ok' })
  })

  it('returns "3 domains" when multiple verified domains', () => {
    expect(
      computeSsoSidebarStatus({
        tierOk: true,
        authConfig: {
          ...baseAuthConfig,
          ssoOidc: {
            enabled: true,
            discoveryUrl: 'https://idp/.well-known/openid-configuration',
            clientId: 'cid',
            autoCreateUsers: false,
          },
        },
        ssoStatus: baseSsoStatus,
        verifiedDomains: [
          verifiedDomain({ name: 'acme.com' }),
          verifiedDomain({ name: 'beta.com' }),
          verifiedDomain({ name: 'gamma.com' }),
        ],
      })
    ).toEqual({ text: '3 domains', tone: 'ok' })
  })

  it('returns null when any input is undefined (loading state)', () => {
    expect(
      computeSsoSidebarStatus({
        tierOk: true,
        authConfig: undefined,
        ssoStatus: baseSsoStatus,
        verifiedDomains: [],
      })
    ).toBeNull()
    expect(
      computeSsoSidebarStatus({
        tierOk: true,
        authConfig: baseAuthConfig,
        ssoStatus: undefined,
        verifiedDomains: [],
      })
    ).toBeNull()
    expect(
      computeSsoSidebarStatus({
        tierOk: true,
        authConfig: baseAuthConfig,
        ssoStatus: baseSsoStatus,
        verifiedDomains: undefined,
      })
    ).toBeNull()
  })
})
