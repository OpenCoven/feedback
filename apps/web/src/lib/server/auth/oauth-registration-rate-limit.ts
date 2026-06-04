/**
 * In-memory limiter for unauthenticated OAuth dynamic client registration.
 *
 * Registration is intentionally public so MCP clients can self-register, which
 * means client-supplied proxy headers cannot be the only throttle: attackers can
 * spoof a new header value per request. Keep the per-client courtesy limit, but
 * also enforce a process-wide cap and bound the key store so spoofed values
 * cannot create unbounded memory or database growth.
 */
interface RegistrationAttemptEntry {
  count: number
  windowStart: number
}

interface RegistrationRateLimitResult {
  limited: boolean
  retryAfter: number
}

const registrationAttempts = new Map<string, RegistrationAttemptEntry>()
let globalRegistrationAttempts: RegistrationAttemptEntry = { count: 0, windowStart: 0 }
let lastCleanup = 0

const REG_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const REG_MAX = 10
const REG_MAX_CLIENT_KEYS = 1_000
const REG_CLEANUP_INTERVAL_MS = 60_000

function retryAfterSeconds(windowStart: number, now: number): number {
  return Math.max(1, Math.ceil((windowStart + REG_WINDOW_MS - now) / 1000))
}

function cleanupExpiredRegistrationAttempts(now: number): void {
  if (
    now - lastCleanup < REG_CLEANUP_INTERVAL_MS &&
    registrationAttempts.size < REG_MAX_CLIENT_KEYS
  ) {
    return
  }

  for (const [key, entry] of registrationAttempts.entries()) {
    if (now - entry.windowStart > REG_WINDOW_MS) {
      registrationAttempts.delete(key)
    }
  }
  lastCleanup = now
}

function getRegistrationClientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return (
    request.headers.get('cf-connecting-ip')?.trim() ||
    forwarded ||
    request.headers.get('x-real-ip')?.trim() ||
    'unknown'
  )
}

export function checkOAuthRegistrationRateLimit(
  request: Request,
  now = Date.now()
): RegistrationRateLimitResult {
  if (now - globalRegistrationAttempts.windowStart > REG_WINDOW_MS) {
    globalRegistrationAttempts = { count: 0, windowStart: now }
  }

  if (globalRegistrationAttempts.count >= REG_MAX) {
    return {
      limited: true,
      retryAfter: retryAfterSeconds(globalRegistrationAttempts.windowStart, now),
    }
  }

  cleanupExpiredRegistrationAttempts(now)

  const key = getRegistrationClientKey(request)
  const entry = registrationAttempts.get(key)

  if (!entry || now - entry.windowStart > REG_WINDOW_MS) {
    if (!entry && registrationAttempts.size >= REG_MAX_CLIENT_KEYS) {
      return { limited: true, retryAfter: retryAfterSeconds(now, now) }
    }

    registrationAttempts.set(key, { count: 1, windowStart: now })
    globalRegistrationAttempts.count++
    return { limited: false, retryAfter: 0 }
  }

  entry.count++
  if (entry.count > REG_MAX) {
    return { limited: true, retryAfter: retryAfterSeconds(entry.windowStart, now) }
  }

  globalRegistrationAttempts.count++
  return { limited: false, retryAfter: 0 }
}

export function __resetOAuthRegistrationRateLimitForTests(): void {
  registrationAttempts.clear()
  globalRegistrationAttempts = { count: 0, windowStart: 0 }
  lastCleanup = 0
}
