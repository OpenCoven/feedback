import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  __resetOAuthRegistrationRateLimitForTests,
  checkOAuthRegistrationRateLimit,
} from '../oauth-registration-rate-limit'

function registrationRequest(ip: string): Request {
  return new Request('https://example.com/api/auth/oauth2/register', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
  })
}

describe('checkOAuthRegistrationRateLimit', () => {
  beforeEach(() => {
    __resetOAuthRegistrationRateLimitForTests()
  })

  afterEach(() => {
    __resetOAuthRegistrationRateLimitForTests()
  })

  it('limits repeated registration attempts for one client key', () => {
    for (let i = 0; i < 10; i++) {
      expect(checkOAuthRegistrationRateLimit(registrationRequest('203.0.113.10'), 0).limited).toBe(
        false
      )
    }

    expect(checkOAuthRegistrationRateLimit(registrationRequest('203.0.113.10'), 0)).toMatchObject({
      limited: true,
      retryAfter: 3600,
    })
  })

  it('does not allow spoofed forwarding headers to bypass the process-wide cap', () => {
    for (let i = 0; i < 10; i++) {
      expect(
        checkOAuthRegistrationRateLimit(registrationRequest(`203.0.113.${i}`), 0).limited
      ).toBe(false)
    }

    expect(checkOAuthRegistrationRateLimit(registrationRequest('203.0.113.250'), 0)).toMatchObject({
      limited: true,
      retryAfter: 3600,
    })
  })

  it('resets limits after the registration window expires', () => {
    for (let i = 0; i < 10; i++) {
      expect(
        checkOAuthRegistrationRateLimit(registrationRequest(`203.0.113.${i}`), 0).limited
      ).toBe(false)
    }

    expect(
      checkOAuthRegistrationRateLimit(registrationRequest('203.0.113.250'), 60 * 60 * 1000 + 1)
        .limited
    ).toBe(false)
  })
})
