import { createFileRoute } from '@tanstack/react-router'
import type { StatusId } from '@opencoven-feedback/ids'
import { generateId } from '@opencoven-feedback/ids'
import { db, settings, principal, postStatuses, eq, and, DEFAULT_STATUSES } from '@/lib/server/db'
import type { SetupState } from '@/lib/server/db'
import { getAuth } from '@/lib/server/auth'
import { mintMagicLinkUrl } from '@/lib/server/auth/magic-link-mint'
import { invalidateSettingsCache } from '@/lib/server/domains/settings/settings.helpers'
import { DEFAULT_AUTH_CONFIG, DEFAULT_PORTAL_CONFIG } from '@/lib/server/domains/settings'
import { slugify } from '@/lib/shared/utils'

const CLAIM_EXPIRES_IN_DAYS = 7
const CLAIM_EXPIRES_IN_SECONDS = CLAIM_EXPIRES_IN_DAYS * 24 * 60 * 60

/**
 * Control-plane bootstrap for externally provisioned tenants.
 *
 * Self-hosted instances do not set CLOUD_BOOTSTRAP_TOKEN, so this
 * endpoint returns 404 there. Managed/external provisioners can set a
 * per-tenant token and call this once with the intended owner email to
 * bind first-admin claim to that email instead of leaving the public
 * onboarding form as first-user-wins.
 */
export async function handleCloudBootstrap({ request }: { request: Request }): Promise<Response> {
  const expected = process.env.CLOUD_BOOTSTRAP_TOKEN
  if (!expected) return new Response('Not Found', { status: 404 })

  const provided = request.headers.get('authorization')
  if (provided !== `Bearer ${expected}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = parseBody(body)
  if (!parsed) {
    return Response.json(
      { error: 'Missing required fields: email, workspaceName' },
      { status: 400 }
    )
  }

  const { email, workspaceName } = parsed
  const slug = slugify(workspaceName)
  if (slug.length < 2) {
    return Response.json(
      { error: 'workspaceName must produce a slug of at least 2 characters' },
      { status: 400 }
    )
  }

  const adminUserId = await ensureAdminUser({ email, workspaceName, request })
  if (adminUserId === 'CONFLICT') {
    return Response.json({ error: 'A different admin is already configured' }, { status: 409 })
  }

  await Promise.all([ensureCompleteSettings(workspaceName, slug), ensureDefaultStatuses()])
  await invalidateSettingsCache()

  const claimUrl = await mintMagicLinkUrl({
    email,
    portalUrl: workspacePortalUrl(request),
    callbackPath: '/admin/feedback',
    errorCallbackPath: '/admin/login',
    expiresInSeconds: CLAIM_EXPIRES_IN_SECONDS,
  })

  return Response.json({ claimUrl, expiresInDays: CLAIM_EXPIRES_IN_DAYS, userId: adminUserId })
}

interface ParsedBody {
  email: string
  workspaceName: string
}

function parseBody(body: unknown): ParsedBody | null {
  if (!body || typeof body !== 'object') return null
  const input = body as Record<string, unknown>
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  const workspaceName = typeof input.workspaceName === 'string' ? input.workspaceName.trim() : ''
  if (!email || !workspaceName) return null
  return { email, workspaceName }
}

async function ensureAdminUser({
  email,
  workspaceName,
  request,
}: {
  email: string
  workspaceName: string
  request: Request
}): Promise<string | 'CONFLICT'> {
  const existingAdmin = await db.query.principal.findFirst({
    where: and(eq(principal.role, 'admin'), eq(principal.type, 'user')),
    with: { user: { columns: { email: true, id: true } } },
  })

  if (existingAdmin) {
    if (existingAdmin.user?.email?.toLowerCase() === email) return existingAdmin.user.id
    return 'CONFLICT'
  }

  const auth = await getAuth()
  const throwawayPassword = `${crypto.randomUUID()}${crypto.randomUUID()}`
  const signedUp = await auth.api.signUpEmail({
    body: { email, name: workspaceName, password: throwawayPassword },
    headers: request.headers,
  })

  await db
    .update(principal)
    .set({ role: 'admin' })
    .where(eq(principal.userId, signedUp.user.id as never))

  return signedUp.user.id
}

async function ensureCompleteSettings(workspaceName: string, slug: string): Promise<void> {
  const existing = await db.query.settings.findFirst()
  const completeSetup: SetupState = {
    version: 1,
    steps: { core: true, workspace: true, boards: true },
    completedAt: new Date().toISOString(),
  }
  const portalConfigDefault = JSON.stringify(DEFAULT_PORTAL_CONFIG)
  const authConfigDefault = JSON.stringify({
    ...DEFAULT_AUTH_CONFIG,
    oauth: { ...DEFAULT_AUTH_CONFIG.oauth, password: false, magicLink: true },
    openSignup: false,
  })

  if (existing) {
    await db
      .update(settings)
      .set({
        name: workspaceName,
        slug,
        setupState: JSON.stringify(completeSetup),
        portalConfig: existing.portalConfig ?? portalConfigDefault,
        authConfig: existing.authConfig ?? authConfigDefault,
      })
      .where(eq(settings.id, existing.id))
    return
  }

  await db.insert(settings).values({
    id: generateId('workspace'),
    name: workspaceName,
    slug,
    createdAt: new Date(),
    setupState: JSON.stringify(completeSetup),
    portalConfig: portalConfigDefault,
    authConfig: authConfigDefault,
  })
}

async function ensureDefaultStatuses(): Promise<void> {
  const existing = await db.query.postStatuses.findFirst()
  if (existing) return
  await db.insert(postStatuses).values(
    DEFAULT_STATUSES.map((status) => ({
      id: generateId('status') as StatusId,
      ...status,
      createdAt: new Date(),
    }))
  )
}

function workspacePortalUrl(request: Request): string {
  const url = new URL(request.url)
  return `https://${url.host}`
}

export const Route = createFileRoute('/api/cloud/bootstrap')({
  server: {
    handlers: {
      POST: handleCloudBootstrap,
    },
  },
})
