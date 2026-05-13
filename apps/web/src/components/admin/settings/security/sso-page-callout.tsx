import { Link } from '@tanstack/react-router'
import { ShieldCheckIcon } from '@heroicons/react/24/solid'
import type { AuthConfig, VerifiedDomain } from '@/lib/shared/types/settings'

interface SsoPageCalloutProps {
  authConfig: AuthConfig
  verifiedDomains: VerifiedDomain[]
}

/**
 * Small card surfaced at the bottom of the team auth methods tab when
 * the tenant has touched SSO (either enabled the master switch or added
 * a verified domain). Teaches the new /sso location organically without
 * cluttering the page for tenants who never use SSO.
 */
export function SsoPageCallout({ authConfig, verifiedDomains }: SsoPageCalloutProps) {
  const hasSso = authConfig.ssoOidc?.enabled === true || verifiedDomains.length > 0
  if (!hasSso) return null

  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-4 flex items-start gap-3">
      <ShieldCheckIcon className="size-5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">Single sign-on is set up for this workspace</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Manage your IdP, verified domains, attribute mapping, and recovery codes on the SSO page.
        </p>
      </div>
      <Link
        to="/admin/settings/security/sso"
        className="text-sm font-medium text-primary hover:underline shrink-0"
      >
        Configure SSO →
      </Link>
    </div>
  )
}
