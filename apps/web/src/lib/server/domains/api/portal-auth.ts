import type { PrincipalId, UserId } from '@opencoven-feedback/ids'
import { generateId } from '@opencoven-feedback/ids'
import type { Role } from '@/lib/server/auth'
import { db, session, principal, eq, and, gt } from '@/lib/server/db'
import { UnauthorizedError } from '@/lib/shared/errors'

export interface PortalSession {
  user: { id: UserId; email: string; name: string; image: string | null }
  principal: { id: PrincipalId; role: Role; type: string }
}

/** Resolves a portal session from an `Authorization: Bearer <token>` header. Returns null if absent/invalid/expired. */
export async function optionalPortalSession(request: Request): Promise<PortalSession | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  if (!token) return null

  const row = await db.query.session.findFirst({
    where: and(eq(session.token, token), gt(session.expiresAt, new Date())),
    with: { user: true },
  })

  if (!row?.user) return null
  if (!row.user.email) return null

  const userId = row.userId as UserId

  let principalRecord = await db.query.principal.findFirst({
    where: eq(principal.userId, userId),
  })

  if (!principalRecord) {
    const [created] = await db
      .insert(principal)
      .values({
        id: generateId('principal'),
        userId,
        role: 'user',
        displayName: row.user.name,
        avatarUrl: row.user.image ?? null,
        createdAt: new Date(),
      })
      .returning()
    if (!created) return null
    principalRecord = created
  }

  return {
    user: {
      id: userId,
      email: row.user.email,
      name: row.user.name,
      image: row.user.image ?? null,
    },
    principal: {
      id: principalRecord.id as PrincipalId,
      role: principalRecord.role as Role,
      type: principalRecord.type ?? 'user',
    },
  }
}

/** Same as `optionalPortalSession` but throws `UnauthorizedError` when there is no valid session. */
export async function requirePortalSession(request: Request): Promise<PortalSession> {
  const portalSession = await optionalPortalSession(request)
  if (!portalSession) {
    throw new UnauthorizedError(
      'Authentication required. Provide a valid session token in the Authorization header: Bearer <token>'
    )
  }
  return portalSession
}
