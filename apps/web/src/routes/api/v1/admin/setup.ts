import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db, settings, USE_CASE_TYPES } from '@/lib/server/db'
import type { SetupState, UseCaseType } from '@/lib/server/db'
import { invalidateTierLimitsCache } from '@/lib/server/domains/settings/tier-limits.service'
import { resetAuth } from '@/lib/server/auth/index'
import { authenticateAdminToken } from '@/lib/server/domains/api-keys/admin-token-auth'

/**
 * POST /api/v1/admin/setup
 *
 * One-shot provisioning seed. An admin tool calls this right after
 * the pod becomes healthy to populate the workspace name + use case
 * + tier limits in a single hit, so the user lands in the onboarding
 * wizard past whatever steps the tool already answered on its own
 * signup form. Whatever isn't pre-stamped here still has to be
 * filled in via the wizard.
 *
 * Body:
 *   {
 *     workspaceName: string         // required, 1-200 chars
 *     workspaceSlug?: string        // optional override; derived from name if absent
 *     useCase?: 'saas' | 'consumer' | 'marketplace' | 'internal'
 *     tierLimits?: TierLimits       // optional; same shape as /admin/tier-limits POST
 *   }
 *
 * The `admin: {email, name}` payload is intentionally absent — user
 * provisioning is the responsibility of whatever sign-in path the
 * operator wires up (e.g. the env-baked SSO_OIDC_* OAuth provider).
 *
 * Idempotent: re-running with the same payload is a no-op-ish
 * overwrite. Workspace name/slug + useCase only seed on the first
 * call (preserves user-customized state); tier limits always
 * overwrite (Stripe webhook plan changes flow through here).
 */
export const Route = createFileRoute('/api/v1/admin/setup')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateAdminToken(request)
        if (auth) return auth

        let payload: unknown
        try {
          payload = await request.json()
        } catch {
          return errJson('invalid_json', 400)
        }
        const parsed = parseBody(payload)
        if ('error' in parsed) return errJson(parsed.error, 400)

        const slug = parsed.workspaceSlug ?? slugify(parsed.workspaceName)

        // Read the (singleton) existing settings row first. If the user
        // has already completed the workspace step (renamed their
        // workspace, set a custom slug, etc.), we MUST NOT overwrite
        // their state on a re-run — the orchestrator may legitimately
        // call /admin/setup again later for a tier-limits push and
        // would clobber whatever the user did in the UI otherwise.
        const existing = await db
          .select({ id: settings.id, setupState: settings.setupState })
          .from(settings)
          .limit(1)

        const existingSetupState = parseSetupState(existing[0]?.setupState ?? null)
        const userHasCustomized = existingSetupState?.steps?.workspace === true
        const tierLimitsJson = parsed.tierLimits ? JSON.stringify(parsed.tierLimits) : undefined

        if (existing[0]) {
          const setClause: Record<string, unknown> = {}
          // Workspace fields: only seed on the FIRST call (when the
          // user hasn't already moved past the workspace step).
          if (!userHasCustomized) {
            setClause.name = parsed.workspaceName
            setClause.slug = slug
            setClause.setupState = JSON.stringify(
              mergeSetupState(existingSetupState, parsed.useCase)
            )
          }
          // Tier limits: always overwrite if provided. Plan changes
          // from Stripe webhooks come through here too.
          if (tierLimitsJson) setClause.tierLimits = tierLimitsJson
          if (Object.keys(setClause).length > 0) {
            await db.update(settings).set(setClause).where(eq(settings.id, existing[0].id))
          }
        } else {
          await db
            .insert(settings)
            .values({
              name: parsed.workspaceName,
              slug,
              createdAt: new Date(),
              setupState: JSON.stringify(mergeSetupState(null, parsed.useCase)),
              tierLimits: tierLimitsJson ?? null,
            })
            .onConflictDoNothing({ target: settings.slug })
        }

        invalidateTierLimitsCache()
        if (tierLimitsJson) {
          // Same rationale as /admin/tier-limits: auth caches features
          // at build time; reset so e.g. SSO toggles take effect now.
          resetAuth()
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    },
  },
})

type ParsedBody = {
  workspaceName: string
  workspaceSlug?: string
  useCase?: UseCaseType
  tierLimits?: Record<string, unknown>
}

function parseBody(payload: unknown): ParsedBody | { error: string } {
  if (!payload || typeof payload !== 'object') return { error: 'invalid_body' }
  const o = payload as Record<string, unknown>
  if (
    typeof o.workspaceName !== 'string' ||
    o.workspaceName.length < 1 ||
    o.workspaceName.length > 200
  ) {
    return { error: 'workspace_name_required' }
  }
  if (o.workspaceSlug !== undefined && typeof o.workspaceSlug !== 'string') {
    return { error: 'workspace_slug_invalid' }
  }
  if (o.useCase !== undefined && !USE_CASE_TYPES.includes(o.useCase as UseCaseType)) {
    return { error: 'use_case_invalid' }
  }
  if (o.tierLimits !== undefined && (typeof o.tierLimits !== 'object' || o.tierLimits === null)) {
    return { error: 'tier_limits_invalid' }
  }
  return {
    workspaceName: o.workspaceName,
    workspaceSlug: o.workspaceSlug as string | undefined,
    useCase: o.useCase as UseCaseType | undefined,
    tierLimits: o.tierLimits as Record<string, unknown> | undefined,
  }
}

function parseSetupState(s: string | null): Partial<SetupState> | null {
  if (!s) return null
  try {
    return JSON.parse(s) as SetupState
  } catch {
    return null
  }
}

function mergeSetupState(
  existing: Partial<SetupState> | null,
  useCase: UseCaseType | undefined
): SetupState {
  return {
    version: 1,
    steps: {
      core: true,
      workspace: true,
      boards: existing?.steps?.boards ?? false,
    },
    completedAt: existing?.completedAt,
    useCase: useCase ?? existing?.useCase,
  }
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'workspace'
  )
}

function errJson(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
