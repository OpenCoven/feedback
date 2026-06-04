/**
 * Return a copy of request headers that can only authenticate with cookies.
 *
 * Better Auth's bearer plugin is enabled for widget-only flows, but dashboard
 * and portal authorization must not accept raw session tokens from
 * Authorization headers.
 */
export function withoutAuthorizationHeader(headers: Headers): Headers {
  const cookieOnlyHeaders = new Headers(headers)
  cookieOnlyHeaders.delete('authorization')
  return cookieOnlyHeaders
}
