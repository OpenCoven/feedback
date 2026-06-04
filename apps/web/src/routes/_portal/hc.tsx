import { createFileRoute, notFound, Outlet, redirect } from '@tanstack/react-router'
import type { FeatureFlags, HelpCenterConfig } from '@/lib/shared/types/settings'

type HelpCenterAccessConfig = HelpCenterConfig & {
  access?: 'public' | 'authenticated'
}

function requiresAuthentication(config: HelpCenterConfig | undefined): boolean {
  return (config as HelpCenterAccessConfig | undefined)?.access === 'authenticated'
}

export const Route = createFileRoute('/_portal/hc')({
  beforeLoad: ({ context }) => {
    const { settings } = context

    const flags = settings?.featureFlags as FeatureFlags | undefined
    if (!flags?.helpCenter) throw notFound()

    const helpCenterConfig = settings?.helpCenterConfig as HelpCenterConfig | undefined
    if (!helpCenterConfig?.enabled) throw notFound()

    if (requiresAuthentication(helpCenterConfig) && !context.session?.user) {
      throw redirect({ to: '/auth/login' })
    }
  },
  loader: async ({ context }) => {
    const { settings } = context
    const helpCenterConfig = (settings?.helpCenterConfig as HelpCenterConfig | null) ?? null
    return { helpCenterConfig }
  },
  head: ({ loaderData }) => {
    const helpCenterConfig = loaderData?.helpCenterConfig ?? undefined
    return {
      meta: requiresAuthentication(helpCenterConfig)
        ? [{ name: 'robots', content: 'noindex, nofollow' }]
        : [],
    }
  },
  component: HelpCenterLayoutRoute,
})

function HelpCenterLayoutRoute() {
  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  )
}
