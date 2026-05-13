import { useQuery } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import { settingsQueries } from '@/lib/client/queries/settings'
import { adminQueries } from '@/lib/client/queries/admin'
import type { AuthConfig, VerifiedDomain } from '@/lib/shared/types/settings'
import type { SsoStatus } from '@/lib/server/functions/sso'

export type SsoSidebarTone = 'muted' | 'warn' | 'ok'
export interface SsoSidebarStatus {
  text: string
  tone: SsoSidebarTone
}

interface ComputeInput {
  tierOk: boolean
  authConfig: AuthConfig | undefined
  ssoStatus: SsoStatus | undefined
  verifiedDomains: VerifiedDomain[] | undefined
}

/** Pure mapper — exported for unit testing. The order of branches is
 *  the precedence rule from the spec; first match wins. */
export function computeSsoSidebarStatus(input: ComputeInput): SsoSidebarStatus | null {
  if (!input.tierOk) return { text: 'Upgrade required', tone: 'muted' }
  if (
    input.authConfig === undefined ||
    input.ssoStatus === undefined ||
    input.verifiedDomains === undefined
  ) {
    return null
  }
  if (input.authConfig.ssoOidc?.enabled !== true) return { text: 'Not configured', tone: 'muted' }
  if (input.ssoStatus.secretConfigured === false) return { text: 'Needs secret', tone: 'warn' }
  const verified = input.verifiedDomains.filter((d) => d.verifiedAt !== null).length
  if (verified === 0) return { text: 'No domains', tone: 'warn' }
  return { text: `${verified} domain${verified === 1 ? '' : 's'}`, tone: 'ok' }
}

/** Reads three cached queries with `staleTime: Infinity` so the sidebar
 *  never refetches. Mutations on connect/disconnect, domain CRUD, and
 *  recovery-code generate already invalidate these keys. */
export function useSsoSidebarStatus(): SsoSidebarStatus | null {
  const ctx = useRouteContext({ from: '__root__' }) as {
    tierLimits?: { features?: { customOidcProvider?: boolean } }
  }
  const tierOk = ctx?.tierLimits?.features?.customOidcProvider !== false

  // Pin staleTime: Infinity — we want cache-only reads in the nav.
  const authConfig = useQuery({ ...settingsQueries.authConfig(), staleTime: Infinity })
  const ssoStatus = useQuery({ ...adminQueries.ssoStatus(), staleTime: Infinity })
  const verifiedDomains = useQuery({ ...settingsQueries.verifiedDomains(), staleTime: Infinity })

  return computeSsoSidebarStatus({
    tierOk,
    authConfig: authConfig.data,
    ssoStatus: ssoStatus.data,
    verifiedDomains: verifiedDomains.data,
  })
}
