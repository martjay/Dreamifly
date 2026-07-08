CREATE TABLE IF NOT EXISTS "model_alert_rules" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "model_names" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "model_types" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "failure_rate_threshold" integer NOT NULL,
  "sample_size" integer NOT NULL DEFAULT 20,
  "min_calls" integer NOT NULL DEFAULT 10,
  "cooldown_minutes" integer NOT NULL DEFAULT 30,
  "emails" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "is_enabled" boolean NOT NULL DEFAULT true,
  "last_triggered_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_model_alert_rules_enabled"
ON "model_alert_rules" ("is_enabled");

CREATE INDEX IF NOT EXISTS "idx_model_alert_rules_last_triggered"
ON "model_alert_rules" ("last_triggered_at");
