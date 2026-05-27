-- Raw event stream from embedded feedback widgets (web, iOS, future RN).
--
-- One row per widget lifecycle signal: init, identify, launcher_show, open,
-- close. Distinct from analytics_daily_stats (pre-aggregated post/vote/comment
-- counts) — widget_events captures the upstream impression and engagement
-- signals that an aggregator job can later roll up by day and platform.
--
-- principal_id is set when the embedding app called identify() with a verified
-- SSO token; null for anonymous widget sessions, and ON DELETE SET NULL so
-- principal deletions don't blow away historical engagement records.
--
-- session_id correlates events from the same widget instance (browser tab or
-- native app run). platform distinguishes the embedding surface so per-platform
-- usage is queryable without parsing user_agent or joining metadata.
--
-- Indexes:
--   - created_at DESC for time-window scans
--   - (event_type, created_at DESC) for "opens in the last 24h" style queries
--   - (principal_id, created_at DESC) for per-user engagement lookup
--   - (platform, created_at DESC) for per-platform breakdowns

CREATE TABLE "widget_events" (
  "id" uuid PRIMARY KEY,
  "event_type" text NOT NULL,
  "platform" text NOT NULL,
  "session_id" text,
  "principal_id" uuid REFERENCES "principal"("id") ON DELETE SET NULL,
  "user_agent" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "widget_events_created_idx"
  ON "widget_events" ("created_at" DESC);

CREATE INDEX "widget_events_type_created_idx"
  ON "widget_events" ("event_type", "created_at" DESC);

CREATE INDEX "widget_events_principal_created_idx"
  ON "widget_events" ("principal_id", "created_at" DESC);

CREATE INDEX "widget_events_platform_created_idx"
  ON "widget_events" ("platform", "created_at" DESC);
