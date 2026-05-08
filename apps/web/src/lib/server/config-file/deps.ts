import { db, settings, eq } from '@/lib/server/db'
import { invalidateSettingsCache } from '@/lib/server/domains/settings/settings.helpers'
import { invalidateTierLimitsCache } from '@/lib/server/domains/settings/tier-limits.service'
import { resetAuth } from '@/lib/server/auth/index'
import type { ReconcileDeps, SettingsRow, SettingsUpdate } from './reconciler'

/** Production wiring of `ReconcileDeps`. The reconciler is db-agnostic
 *  to keep its tests fast; this module is the only place that touches
 *  Drizzle + Redis. */
export function makeReconcileDeps(): ReconcileDeps {
  return {
    readSettings: async () => {
      const row = await db.query.settings.findFirst()
      if (!row) return null
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        setupState: row.setupState,
        tierLimits: row.tierLimits,
        featureFlags: row.featureFlags,
        authConfig: row.authConfig ?? null,
        managedFieldPaths: (row.managedFieldPaths as string[] | null) ?? [],
        state: (row.state as 'active' | 'suspended' | 'deleting' | null) ?? 'active',
      } satisfies SettingsRow
    },
    updateSettings: async (update: SettingsUpdate) => {
      const row = await db.query.settings.findFirst({ columns: { id: true } })
      if (!row) return
      await db.update(settings).set(update).where(eq(settings.id, row.id))
    },
    invalidateSettingsCache: async () => {
      await invalidateSettingsCache()
    },
    invalidateTierLimitsCache: async () => {
      invalidateTierLimitsCache()
    },
    resetAuth: async () => {
      resetAuth()
    },
  }
}
