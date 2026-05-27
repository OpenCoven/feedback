import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { typeIdWithDefault, typeIdColumnNullable } from '@opencoven-feedback/ids/drizzle'
import { principal } from './auth'

/**
 * Raw event stream from embedded feedback widgets (web, iOS, future RN).
 *
 * One row per widget lifecycle signal: init, identify, launcher_show, open,
 * close. Distinct from `analyticsDailyStats` — that table stores pre-aggregated
 * daily snapshots driven by post/vote/comment activity; widget_events captures
 * the upstream signals (impression, engagement) the aggregator can later roll up.
 *
 * principalId is set when the embedding app passed a verified SSO token via
 * `identify()`; null for anonymous widget sessions. sessionId correlates events
 * from the same widget instance across its lifetime (browser tab or app run).
 * platform distinguishes the embedding surface ('web' / 'ios' / future 'rn' /
 * 'android') so per-platform engagement is queryable without joining metadata.
 */
export const widgetEvents = pgTable(
  'widget_events',
  {
    id: typeIdWithDefault('widget_event')('id').primaryKey(),
    /** Lifecycle signal: 'init' | 'identify' | 'launcher_show' | 'open' | 'close' */
    eventType: text('event_type').notNull(),
    /** Embedding surface: 'web' | 'ios' | 'rn' | 'android' */
    platform: text('platform').notNull(),
    /** Correlates events from the same widget instance (browser tab / app run) */
    sessionId: text('session_id'),
    /** Identified user, when the embedding app called identify() with an SSO token */
    principalId: typeIdColumnNullable('principal')('principal_id').references(() => principal.id, {
      onDelete: 'set null',
    }),
    /** UA string for web; device model + OS for native */
    userAgent: text('user_agent'),
    /** Event-specific payload (e.g., theme, locale, custom fields) */
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('widget_events_created_idx').on(t.createdAt.desc()),
    index('widget_events_type_created_idx').on(t.eventType, t.createdAt.desc()),
    index('widget_events_principal_created_idx').on(t.principalId, t.createdAt.desc()),
    index('widget_events_platform_created_idx').on(t.platform, t.createdAt.desc()),
  ]
)

export const widgetEventsRelations = relations(widgetEvents, ({ one }) => ({
  principal: one(principal, {
    fields: [widgetEvents.principalId],
    references: [principal.id],
  }),
}))

export type WidgetEvent = typeof widgetEvents.$inferSelect
export type NewWidgetEvent = typeof widgetEvents.$inferInsert
