import { checkUrlSafety, safeFetch, SsrfError } from '@/lib/server/content/ssrf-guard'

export type OidcDiscoveryValidationResult =
  | { ok: true; issuer: string }
  | { ok: false; error: string }

const REQUIRED_DISCOVERY_FIELDS = [
  'issuer',
  'authorization_endpoint',
  'token_endpoint',
  'jwks_uri',
] as const

const SERVER_FETCHED_ENDPOINTS = ['token_endpoint', 'jwks_uri'] as const

/**
 * Validate an OIDC discovery document before it is handed to server-side OAuth code.
 *
 * `safeFetch` protects the discovery URL itself. The metadata can point Better Auth at
 * additional server-fetched URLs, so validate those endpoint URLs too before persisting
 * or accepting the discovery document as healthy.
 */
export async function validateOidcDiscoveryForServerRuntime(
  discoveryUrl: string
): Promise<OidcDiscoveryValidationResult> {
  let res: Response
  try {
    res = await safeFetch(discoveryUrl, {
      headers: { Accept: 'application/json' },
      timeoutMs: 5000,
      maxResponseBytes: 64 * 1024,
    })
  } catch (err) {
    if (err instanceof SsrfError) {
      const code =
        err.reason === 'scheme-rejected'
          ? 'invalid_url'
          : err.reason === 'ssrf-rejected'
            ? 'private_address'
            : 'dns_error'
      return { ok: false, error: code }
    }
    const code = (err as Error).name === 'TimeoutError' ? 'timeout' : 'fetch_error'
    return { ok: false, error: code }
  }
  if (res.status >= 300 && res.status < 400) {
    return { ok: false, error: 'redirected' }
  }
  if (!res.ok) {
    // Surface the IdP's own error text so misconfigurations are self-diagnosable.
    // safeFetch already capped the body size.
    const errBody = await res.text()
    let detail = ''
    try {
      const j = JSON.parse(errBody) as Record<string, unknown>
      const desc = j.error_description ?? j.errorSummary ?? j.error ?? j.message
      if (typeof desc === 'string' && desc.length > 0) detail = `: ${desc.slice(0, 200)}`
    } catch {
      const stripped = errBody
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (stripped) detail = `: ${stripped.slice(0, 200)}`
    }
    return { ok: false, error: `http_${res.status}${detail}` }
  }
  const ct = res.headers.get('content-type') ?? ''
  if (!ct.includes('application/json')) {
    return { ok: false, error: 'wrong_content_type' }
  }
  const text = await res.text()
  if (text.length === 0) {
    return { ok: false, error: 'empty_body' }
  }
  let json: Record<string, unknown>
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, error: 'invalid_json' }
  }
  for (const field of REQUIRED_DISCOVERY_FIELDS) {
    const v = json[field]
    if (typeof v !== 'string' || v.length === 0) {
      return { ok: false, error: `missing_field:${field}` }
    }
    try {
      // Accept any URL — the IdP may legitimately use a different origin for endpoints.
      new URL(v)
    } catch {
      return { ok: false, error: `invalid_url_field:${field}` }
    }
  }

  // authorization_endpoint is a browser redirect. token_endpoint and jwks_uri are fetched
  // by our process at runtime, so they must be public server-fetchable URLs.
  const safeties = await Promise.all(
    SERVER_FETCHED_ENDPOINTS.map((field) => checkUrlSafety(json[field] as string))
  )
  const unsafeIndex = safeties.findIndex((s) => !s.safe)
  if (unsafeIndex !== -1) {
    return { ok: false, error: `unsafe_endpoint:${SERVER_FETCHED_ENDPOINTS[unsafeIndex]}` }
  }

  return { ok: true, issuer: json.issuer as string }
}
