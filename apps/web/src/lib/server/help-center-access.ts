import { getOptionalAuth } from '@/lib/server/functions/auth-helpers'
import type { HelpCenterConfig } from '@/lib/server/domains/settings'
import type { FeatureFlags } from '@/lib/server/domains/settings/settings.types'
import { NotFoundError, UnauthorizedError } from '@/lib/shared/errors'

type HelpCenterAccessConfig = HelpCenterConfig & {
  access?: 'public' | 'authenticated'
}

export function requiresHelpCenterAuthentication(config: HelpCenterConfig | undefined): boolean {
  return (config as HelpCenterAccessConfig | undefined)?.access === 'authenticated'
}

export async function requirePublicHelpCenterAccess(): Promise<void> {
  const { getTenantSettings } = await import('@/lib/server/domains/settings/settings.service')
  const settings = await getTenantSettings()
  const flags = settings?.featureFlags as FeatureFlags | undefined
  const helpCenterConfig = settings?.helpCenterConfig as HelpCenterConfig | undefined

  if (!flags?.helpCenter || !helpCenterConfig?.enabled) {
    throw new NotFoundError('HELP_CENTER_NOT_FOUND', 'Help center is not available')
  }

  if (requiresHelpCenterAuthentication(helpCenterConfig) && !(await getOptionalAuth())) {
    throw new UnauthorizedError('Authentication required')
  }
}
