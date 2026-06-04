import { describe, expect, it } from 'vitest'
import { withoutAuthorizationHeader } from '../session-headers'

describe('withoutAuthorizationHeader', () => {
  it('preserves cookies while stripping bearer credentials', () => {
    const headers = new Headers({
      authorization: 'Bearer raw-session-token',
      cookie: 'better-auth.session_token=signed-token; other=value',
      'user-agent': 'vitest',
    })

    const result = withoutAuthorizationHeader(headers)

    expect(result.get('authorization')).toBeNull()
    expect(result.get('cookie')).toBe('better-auth.session_token=signed-token; other=value')
    expect(result.get('user-agent')).toBe('vitest')
    expect(headers.get('authorization')).toBe('Bearer raw-session-token')
  })
})
