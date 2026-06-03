import { createFileRoute } from '@tanstack/react-router'
import { checkOAuthRegistrationRateLimit } from '@/lib/server/auth/oauth-registration-rate-limit'
import { SSO_OAUTH_CALLBACK_PATH } from '@/lib/shared/sso-test-keys'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      /**
       * GET /api/auth/* — Better-Auth catch-all. Intercepts the SSO
       * callback for admin Test sign-in (state-keyed dispatch in
       * `handleSsoTestCallback`); everything else delegates.
       */
      GET: async ({ request }) => {
        const url = new URL(request.url)
        if (url.pathname === SSO_OAUTH_CALLBACK_PATH) {
          const { handleSsoTestCallback, renderSsoTestCallbackHtml } =
            await import('@/lib/server/auth/sso-test-callback')
          const handled = await handleSsoTestCallback({
            state: url.searchParams.get('state'),
            code: url.searchParams.get('code'),
            error: url.searchParams.get('error'),
            errorDescription: url.searchParams.get('error_description'),
          })
          if (handled) {
            return renderSsoTestCallbackHtml({
              testId: handled.testId,
              result: handled.result,
              origin: url.origin,
              identityMatched: handled.identityMatched,
            })
          }
        }

        const { auth } = await import('@/lib/server/auth/index')
        return await auth.handler(request)
      },

      /**
       * POST /api/auth/*
       * Better-auth catch-all route handler
       */
      POST: async ({ request }) => {
        const url = new URL(request.url)

        // Rate-limit OAuth dynamic client registration to prevent spam/phishing
        if (url.pathname.endsWith('/oauth2/register')) {
          const rateLimit = checkOAuthRegistrationRateLimit(request)
          if (rateLimit.limited) {
            return Response.json(
              { error: 'Too many client registrations. Try again later.' },
              {
                status: 429,
                headers: { 'Retry-After': String(rateLimit.retryAfter) },
              }
            )
          }
        }

        // Ensure `resource` is present in token exchange requests.
        // Without it, better-auth issues opaque tokens instead of JWTs,
        // breaking `verifyAccessToken` in the MCP handler.
        // Reading the body consumes the stream, so we always reconstruct
        // the request to avoid passing a consumed body to better-auth.
        if (url.pathname.endsWith('/oauth2/token')) {
          const contentType = request.headers.get('content-type') ?? ''
          if (contentType.includes('application/x-www-form-urlencoded')) {
            const body = await request.text()
            const params = new URLSearchParams(body)
            if (!params.has('resource')) {
              const { config } = await import('@/lib/server/config')
              params.set('resource', `${config.baseUrl}/api/mcp`)
            }
            request = new Request(request.url, {
              method: request.method,
              headers: request.headers,
              body: params.toString(),
            })
          }
        }

        const { auth } = await import('@/lib/server/auth/index')
        return await auth.handler(request)
      },
    },
  },
})
